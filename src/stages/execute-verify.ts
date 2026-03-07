import type { Story } from "../types/execution-plan.js";
import type { ExecutionPlan } from "../types/execution-plan.js";
import { spawnAgentWithRetry } from "../agents/spawner.js";
import { getAgentRules } from "../agents/prompts.js";
import { readMemory } from "../memory/memory-manager.js";
import { readFileSafe, ensureDir, fileExists } from "../utils/file-io.js";
import { getReportPath } from "../reports/templates.js";
import { parseTestReport, parseEvalReport } from "../reports/parser.js";
import { incrementAttempts, saveExecutionPlan } from "../state/execution-plan.js";
import { join } from "node:path";

export interface VerifyResult {
  passed: boolean;
  attempts: number;
  testReportPath: string;
  evalReportPath: string;
}

export async function runVerify(
  story: Story,
  hiveMindDir: string,
  planPath: string,
): Promise<VerifyResult> {
  const reportsDir = join(hiveMindDir, getReportPath(story.id, ""));
  ensureDir(reportsDir);

  const memoryPath = join(hiveMindDir, "memory.md");
  const memoryContent = readMemory(memoryPath);

  const stepFilePath = join(hiveMindDir, story.stepFile);
  const maxAttempts = story.maxAttempts;

  let attempt = 0;
  let plan: ExecutionPlan | undefined;
  const testReportPath = join(hiveMindDir, getReportPath(story.id, "test-report.md"));
  const evalReportPath = join(hiveMindDir, getReportPath(story.id, "eval-report.md"));

  while (attempt < maxAttempts) {
    attempt++;

    // Increment attempt counter in execution-plan.json
    if (fileExists(planPath)) {
      const { loadExecutionPlan } = await import("../state/execution-plan.js");
      plan = incrementAttempts(
        plan ?? loadExecutionPlan(planPath),
        story.id,
      );
      saveExecutionPlan(planPath, plan);
    }

    // E.3: Tester — runs ACs via Bash
    console.log(`E.3: Running tester for ${story.id} (attempt ${attempt})...`);
    const priorFixReports = collectPriorReports(hiveMindDir, story.id, "fix-report", attempt);
    const priorDiagReports = collectPriorReports(hiveMindDir, story.id, "diagnosis-report", attempt);

    await spawnAgentWithRetry({
      type: "tester-exec",
      model: "haiku",
      inputFiles: [stepFilePath, ...priorFixReports, ...priorDiagReports],
      outputFile: testReportPath,
      rules: getAgentRules("tester-exec"),
      memoryContent,
    });

    const testContent = readFileSafe(testReportPath) ?? "";
    const testResult = parseTestReport(testContent);

    if (testResult.status === "FAIL") {
      if (attempt >= maxAttempts) break; // exhausted

      // E.4 / E.4a+E.4b: Fix AC failures
      await runFixPipeline(story, hiveMindDir, attempt, "ac", memoryContent);
      continue; // re-VERIFY from E.3
    }

    // E.5: Evaluator — runs ECs via shell
    console.log(`E.5: Running evaluator for ${story.id} (attempt ${attempt})...`);
    await spawnAgentWithRetry({
      type: "evaluator",
      model: "haiku",
      inputFiles: [stepFilePath],
      outputFile: evalReportPath,
      rules: getAgentRules("evaluator"),
      memoryContent,
    });

    const evalContent = readFileSafe(evalReportPath) ?? "";
    const evalResult = parseEvalReport(evalContent);

    if (evalResult.verdict === "FAIL") {
      if (attempt >= maxAttempts) break; // exhausted

      // E.6 / E.6a+E.6b: Fix EC failures
      await runFixPipeline(story, hiveMindDir, attempt, "ec", memoryContent);
      continue; // re-VERIFY from E.3
    }

    // Both passed
    return { passed: true, attempts: attempt, testReportPath, evalReportPath };
  }

  // Exhausted attempts
  return { passed: false, attempts: attempt, testReportPath, evalReportPath };
}

async function runFixPipeline(
  story: Story,
  hiveMindDir: string,
  attempt: number,
  failureType: "ac" | "ec",
  memoryContent: string,
): Promise<void> {
  const reportsDir = join(hiveMindDir, getReportPath(story.id, ""));

  const failReportPath = failureType === "ac"
    ? join(reportsDir, "test-report.md")
    : join(reportsDir, "eval-report.md");

  const priorFixReports = collectPriorReports(hiveMindDir, story.id, "fix-report", attempt + 1);
  const priorDiagReports = collectPriorReports(hiveMindDir, story.id, "diagnosis-report", attempt + 1);

  if (attempt === 1) {
    // Fast path: fixer only
    console.log(`E.${failureType === "ac" ? "4" : "6"}: Running fixer (fast path) for ${story.id}...`);
    const fixReportPath = join(reportsDir, `fix-report-${attempt}.md`);
    await spawnAgentWithRetry({
      type: "fixer",
      model: "sonnet",
      inputFiles: [failReportPath, ...priorFixReports],
      outputFile: fixReportPath,
      rules: getAgentRules("fixer"),
      memoryContent,
    });
  } else {
    // Escalated: diagnostician → fixer
    console.log(`E.${failureType === "ac" ? "4a" : "6a"}: Running diagnostician for ${story.id} (attempt ${attempt})...`);
    const diagReportPath = join(reportsDir, `diagnosis-report-${attempt}.md`);
    await spawnAgentWithRetry({
      type: "diagnostician",
      model: "sonnet",
      inputFiles: [failReportPath, ...priorFixReports, ...priorDiagReports],
      outputFile: diagReportPath,
      rules: getAgentRules("diagnostician"),
      memoryContent,
    });

    // Verify diagnosis file exists before spawning fixer (P11/F11)
    if (!fileExists(diagReportPath)) {
      console.error(`Diagnosis report not found: ${diagReportPath}`);
    }

    console.log(`E.${failureType === "ac" ? "4b" : "6b"}: Running fixer (escalated) for ${story.id} (attempt ${attempt})...`);
    const fixReportPath = join(reportsDir, `fix-report-${attempt}.md`);
    await spawnAgentWithRetry({
      type: "fixer",
      model: "sonnet",
      inputFiles: [diagReportPath, failReportPath, ...priorFixReports, ...priorDiagReports],
      outputFile: fixReportPath,
      rules: getAgentRules("fixer"),
      memoryContent,
    });
  }
}

function collectPriorReports(
  hiveMindDir: string,
  storyId: string,
  prefix: string,
  upToAttempt: number,
): string[] {
  const paths: string[] = [];
  for (let i = 1; i < upToAttempt; i++) {
    const path = join(hiveMindDir, getReportPath(storyId, `${prefix}-${i}.md`));
    if (fileExists(path)) {
      paths.push(path);
    }
  }
  return paths;
}
