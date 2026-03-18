import type { HiveMindConfig } from "../config/schema.js";
import { runShell } from "../utils/shell.js";
import { readFileSafe } from "../utils/file-io.js";
import { HiveMindError } from "../utils/errors.js";
import { join } from "node:path";

export interface BaselineResult {
  passed: boolean;
  buildOutput: string;
  testOutput: string;
}

/** Extract script name from "npm run <name>" or "npm test". Returns null for non-npm commands. */
export function extractNpmScript(command: string): string | null {
  const runMatch = command.match(/^npm\s+run\s+(\S+)$/);
  if (runMatch) return runMatch[1];
  if (/^npm\s+test$/.test(command)) return "test";
  return null;
}

export function npmScriptExists(scriptName: string): boolean {
  const pkg = readFileSafe(join(process.cwd(), "package.json"));
  if (!pkg) return false;
  try {
    const parsed = JSON.parse(pkg);
    return !!parsed.scripts?.[scriptName];
  } catch {
    return false;
  }
}

export async function runBaselineCheck(
  config: HiveMindConfig,
): Promise<BaselineResult> {
  console.log("Running baseline check...");

  let buildOutput = "";
  let testOutput = "";

  // Build
  const buildScript = extractNpmScript(config.baselineBuildCommand);
  if (buildScript && !npmScriptExists(buildScript)) {
    console.log(`  Build: skipped (no "${buildScript}" script in package.json)`);
  } else {
    console.log(`  Build: ${config.baselineBuildCommand}`);
    const buildResult = await runShell(config.baselineBuildCommand, {
      timeout: config.shellTimeout,
    });

    if (buildResult.exitCode !== 0) {
      throw new HiveMindError(
        `Baseline build failed. Fix existing build errors before running Hive Mind.\n` +
        `Command: ${config.baselineBuildCommand}\n` +
        `Output: ${(buildResult.stderr || buildResult.stdout).slice(0, 500)}`,
      );
    }
    buildOutput = buildResult.stdout;
  }

  // Test
  const testScript = extractNpmScript(config.baselineTestCommand);
  if (testScript && !npmScriptExists(testScript)) {
    console.log(`  Test: skipped (no "${testScript}" script in package.json)`);
  } else {
    console.log(`  Test: ${config.baselineTestCommand}`);
    const testResult = await runShell(config.baselineTestCommand, {
      timeout: config.shellTimeout,
    });

    if (testResult.exitCode !== 0) {
      throw new HiveMindError(
        `Baseline tests failed. Fix existing test failures before running Hive Mind.\n` +
        `Command: ${config.baselineTestCommand}\n` +
        `Output: ${(testResult.stderr || testResult.stdout).slice(0, 500)}`,
      );
    }
    testOutput = testResult.stdout;
  }

  console.log("  Baseline check passed.");
  return {
    passed: true,
    buildOutput,
    testOutput,
  };
}
