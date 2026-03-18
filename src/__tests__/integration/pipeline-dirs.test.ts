import { describe, it, expect } from "vitest";
import { resolvePipelineDirs } from "../../config/loader.js";
import { getDefaultConfig } from "../../config/loader.js";
import { resolve, join } from "node:path";

describe("integration: pipeline-dirs three-folder separation", () => {
  const cwd = "/project/root";

  it("resolvePipelineDirs with defaults produces three distinct paths", () => {
    const config = getDefaultConfig();
    const dirs = resolvePipelineDirs(config, cwd);

    expect(dirs.workingDir).toBe(resolve(cwd, ".hive-mind-working"));
    expect(dirs.knowledgeDir).toBe(resolve(cwd, "../.hive-mind-persist"));
    expect(dirs.labDir).toBe(resolve(cwd, ".hive-mind-lab"));

    // All three are distinct
    const unique = new Set([dirs.workingDir, dirs.knowledgeDir, dirs.labDir]);
    expect(unique.size).toBe(3);
  });

  it("resolvePipelineDirs with custom config overrides all three dirs", () => {
    const config = {
      ...getDefaultConfig(),
      workingDir: "/custom/working",
      knowledgeDir: "/custom/knowledge",
      labDir: "/custom/lab",
    };
    const dirs = resolvePipelineDirs(config, cwd);

    expect(dirs.workingDir).toBe("/custom/working");
    expect(dirs.knowledgeDir).toBe("/custom/knowledge");
    expect(dirs.labDir).toBe("/custom/lab");
  });

  it("resolvePipelineDirs resolves relative paths against cwd", () => {
    const config = {
      ...getDefaultConfig(),
      workingDir: "my-working",
      knowledgeDir: "../shared-knowledge",
      labDir: "tmp/lab",
    };
    const dirs = resolvePipelineDirs(config, cwd);

    expect(dirs.workingDir).toBe(resolve(cwd, "my-working"));
    expect(dirs.knowledgeDir).toBe(resolve(cwd, "../shared-knowledge"));
    expect(dirs.labDir).toBe(resolve(cwd, "tmp/lab"));
  });

  it("knowledge paths resolve under knowledgeDir", () => {
    const config = getDefaultConfig();
    const dirs = resolvePipelineDirs(config, cwd);

    const memoryPath = join(dirs.knowledgeDir, "memory.md");
    const kbPath = join(dirs.knowledgeDir, "knowledge-base");
    const constitutionPath = join(dirs.knowledgeDir, "constitution.md");

    expect(memoryPath).toContain(dirs.knowledgeDir);
    expect(kbPath).toContain(dirs.knowledgeDir);
    expect(constitutionPath).toContain(dirs.knowledgeDir);

    // None of these should be under workingDir
    expect(memoryPath).not.toContain(".hive-mind-working");
    expect(kbPath).not.toContain(".hive-mind-working");
    expect(constitutionPath).not.toContain(".hive-mind-working");
  });

  it("pipeline output paths resolve under workingDir", () => {
    const config = getDefaultConfig();
    const dirs = resolvePipelineDirs(config, cwd);

    const specPath = join(dirs.workingDir, "spec");
    const plansPath = join(dirs.workingDir, "plans");
    const reportsPath = join(dirs.workingDir, "reports");

    expect(specPath).toContain(dirs.workingDir);
    expect(plansPath).toContain(dirs.workingDir);
    expect(reportsPath).toContain(dirs.workingDir);

    // None of these should be under knowledgeDir
    expect(specPath).not.toContain(".hive-mind-persist");
    expect(plansPath).not.toContain(".hive-mind-persist");
    expect(reportsPath).not.toContain(".hive-mind-persist");
  });

  it("partial override: only workingDir set, others use defaults", () => {
    const config = {
      ...getDefaultConfig(),
      workingDir: "/custom/output",
    };
    const dirs = resolvePipelineDirs(config, cwd);

    expect(dirs.workingDir).toBe("/custom/output");
    expect(dirs.knowledgeDir).toBe(resolve(cwd, "../.hive-mind-persist"));
    expect(dirs.labDir).toBe(resolve(cwd, ".hive-mind-lab"));
  });
});
