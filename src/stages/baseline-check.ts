import type { HiveMindConfig } from "../config/schema.js";
import { runShell } from "../utils/shell.js";
import { HiveMindError } from "../utils/errors.js";

export interface BaselineResult {
  passed: boolean;
  buildOutput: string;
  testOutput: string;
}

export async function runBaselineCheck(
  config: HiveMindConfig,
): Promise<BaselineResult> {
  console.log("Running baseline check...");

  // Build
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

  // Test
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

  console.log("  Baseline check passed.");
  return {
    passed: true,
    buildOutput: buildResult.stdout,
    testOutput: testResult.stdout,
  };
}
