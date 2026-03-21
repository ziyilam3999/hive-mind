import type { Story } from "../types/execution-plan.js";
import { getSourceFilePaths } from "../types/execution-plan.js";
import type { StoryCheckpoint } from "../types/checkpoint.js";
import { writeFileAtomic } from "../utils/file-io.js";
import { isoTimestamp } from "../utils/timestamp.js";
import { spawnAgentWithRetry } from "../agents/spawner.js";
import { getAgentRules, buildRoleReportContents } from "../agents/prompts.js";
import { readMemory } from "../memory/memory-manager.js";
import { readFileSafe, ensureDir } from "../utils/file-io.js";
import { getReportPath } from "../reports/templates.js";
import type { HiveMindConfig } from "../config/schema.js";
import type { CostTracker } from "../utils/cost-tracker.js";
import type { PipelineDirs } from "../types/pipeline-dirs.js";
import { join, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface SubTaskScope {
  sourceFiles: string[];
  title: string;
}

export async function runBuild(
  story: Story,
  dirs: PipelineDirs,
  config: HiveMindConfig,
  costTracker?: CostTracker,
  roleReportsDir?: string,
  subTaskScope?: SubTaskScope,
  moduleCwd?: string,
): Promise<{ implReportPath: string; refactorReportPath: string }> {
  const reportsDir = join(dirs.workingDir, getReportPath(story.id, ""));
  ensureDir(reportsDir);

  const memoryPath = join(dirs.knowledgeDir, "memory.md");
  const memoryContent = readMemory(memoryPath);

  const stepFilePath = join(dirs.workingDir, story.stepFile);
  const stepFileContent = readFileSafe(stepFilePath);
  if (!stepFileContent) {
    throw new Error(`Step file not found: ${stepFilePath}`);
  }

  // E.1: Implementer — receives ONLY step file + memory (P16: self-contained)
  const implReportPath = join(dirs.workingDir, getReportPath(story.id, "impl-report.md"));
  console.log(`E.1: Running implementer for ${story.id}...`);

  const implRoleContents = roleReportsDir
    ? buildRoleReportContents("implementer", story.rolesUsed, roleReportsDir)
    : undefined;

  const implResult = await spawnAgentWithRetry({
    type: "implementer",
    model: "opus",
    inputFiles: [stepFilePath],
    outputFile: implReportPath,
    rules: getAgentRules("implementer"),
    memoryContent,
    roleReportContents: implRoleContents,
    cwd: moduleCwd,
  }, config);
  costTracker?.recordAgentCost(story.id, "implementer", implResult.costUsd, implResult.durationMs);

  // E.2: Refactorer — receives source code + impl-report + memory
  const refactorReportPath = join(dirs.workingDir, getReportPath(story.id, "refactor-report.md"));
  console.log(`E.2: Running refactorer for ${story.id}...`);

  const effectiveSourceFiles = subTaskScope ? subTaskScope.sourceFiles : story.sourceFiles;
  const sourceFiles = getSourceFilePaths(effectiveSourceFiles).map((f) => join(moduleCwd ?? dirs.workingDir, f));
  const refactorRoleContents = roleReportsDir
    ? buildRoleReportContents("refactorer", story.rolesUsed, roleReportsDir)
    : undefined;

  const refactorResult = await spawnAgentWithRetry({
    type: "refactorer",
    model: "sonnet",
    inputFiles: [...sourceFiles, implReportPath],
    outputFile: refactorReportPath,
    rules: getAgentRules("refactorer"),
    memoryContent,
    roleReportContents: refactorRoleContents,
    cwd: moduleCwd,
  }, config);
  costTracker?.recordAgentCost(story.id, "refactorer", refactorResult.costUsd, refactorResult.durationMs);

  // Fix 1: Post-BUILD file existence gate — verify all sourceFiles exist on disk
  // This gate means "BUILD didn't complete" so it must run BEFORE the checkpoint.
  const effectiveSourceFilePaths = getSourceFilePaths(effectiveSourceFiles);
  const targetDir = moduleCwd ?? dirs.workingDir;

  if (effectiveSourceFilePaths.length === 0) {
    console.warn(`[${story.id}] Warning: sourceFiles is empty — skipping file existence check`);
  } else {
    const missingFiles = effectiveSourceFilePaths.filter(
      (f) => !existsSync(resolve(targetDir, f)),
    );
    if (missingFiles.length > 0) {
      console.warn(`[${story.id}] BUILD file existence check failed. Missing files: ${missingFiles.join(", ")}`);
      throw new Error(`BUILD file existence check failed: missing files: ${missingFiles.join(", ")}`);
    }
  }

  // RD-07: Write mid-story checkpoint after file existence gate passes.
  // Positioned after file gate (missing files = BUILD incomplete, must re-run)
  // but before tsc gate (type errors = BUILD ran, just needs tsc retry).
  const checkpoint: StoryCheckpoint = {
    storyId: story.id,
    lastCompletedSubStage: "BUILD",
    completedSubStages: ["BUILD"],
    timestamp: isoTimestamp(),
  };
  const checkpointPath = join(dirs.workingDir, getReportPath(story.id, "checkpoint.json"));
  writeFileAtomic(checkpointPath, JSON.stringify(checkpoint, null, 2) + "\n");

  // Fix 2: Pipeline-level tsc gate — catch type errors before VERIFY (async)
  const pkgJsonPath = resolve(targetDir, "package.json");
  let hasTsc = false;
  if (existsSync(pkgJsonPath)) {
    try {
      const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
      hasTsc = !!(pkgJson.dependencies?.typescript || pkgJson.devDependencies?.typescript);
    } catch {
      console.debug(`[${story.id}] Could not parse package.json for tsc gate check, skipping`);
    }
  }
  if (hasTsc) {
    try {
      await execFileAsync("npx", ["tsc", "--noEmit"], {
        cwd: targetDir,
        timeout: 120_000,
        shell: process.platform === "win32",
      });
    } catch (err: unknown) {
      const execErr = err as { killed?: boolean; signal?: string; code?: number; stdout?: string; stderr?: string };
      if (execErr.killed || execErr.signal) {
        console.debug(`[${story.id}] tsc gate skipped (timeout/signal): ${execErr.signal}`);
      } else {
        const tscOutput = (execErr.stdout || execErr.stderr || "").slice(0, 2000);
        console.warn(`[${story.id}] tsc --noEmit failed after BUILD:\n${tscOutput}`);
        throw new Error(`BUILD type-check gate failed:\n${tscOutput}`);
      }
    }
  } else if (existsSync(pkgJsonPath)) {
    console.debug(`[${story.id}] Target project has no typescript dependency, skipping tsc gate`);
  }

  return { implReportPath, refactorReportPath };
}
