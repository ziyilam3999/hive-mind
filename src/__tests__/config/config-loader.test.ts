import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig, getDefaultConfig, validateConfig } from "../../config/loader.js";
import { DEFAULT_CONFIG } from "../../config/schema.js";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("getDefaultConfig", () => {
  it("returns all default values", () => {
    const config = getDefaultConfig();
    expect(config.agentTimeout).toBe(600_000);
    expect(config.shellTimeout).toBe(120_000);
    expect(config.toolingDetectTimeout).toBe(30_000);
    expect(config.maxRetries).toBe(1);
    expect(config.maxAttempts).toBe(3);
    expect(config.maxConcurrency).toBe(3);
    expect(config.memoryWordCap).toBe(400);
    expect(config.memoryGraduationThreshold).toBe(300);
    expect(config.graduationMinDates).toBe(1);
    expect(config.graduationMinStoryRefs).toBe(2);
    expect(config.kbSizeWarningWords).toBe(5000);
    expect(config.reportExcerptLength).toBe(200);
    expect(config.modelAssignments.critic).toBe("sonnet");
    expect(config.modelAssignments.implementer).toBe("opus");
    expect(config.stageTimeouts.preplan).toBe(7_200_000);
    expect(config.stageTimeouts.hardCap).toBe(172_800_000);
  });

  it("returns a fresh copy each time", () => {
    const a = getDefaultConfig();
    const b = getDefaultConfig();
    a.agentTimeout = 999;
    expect(b.agentTimeout).toBe(600_000);
  });
});

describe("validateConfig", () => {
  it("accepts an empty object", () => {
    const result = validateConfig({});
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects non-object input", () => {
    expect(validateConfig("string").valid).toBe(false);
    expect(validateConfig(null).valid).toBe(false);
    expect(validateConfig([]).valid).toBe(false);
  });

  it("rejects negative timeout", () => {
    const result = validateConfig({ agentTimeout: -1 });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("agentTimeout");
    expect(result.errors[0]).toContain("positive");
  });

  it("rejects negative maxConcurrency", () => {
    const result = validateConfig({ maxConcurrency: -1 });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("maxConcurrency");
    expect(result.errors[0]).toContain("positive");
  });

  it("rejects zero maxConcurrency", () => {
    const result = validateConfig({ maxConcurrency: 0 });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("maxConcurrency");
  });

  it("rejects non-integer maxRetries", () => {
    const result = validateConfig({ maxRetries: 1.5 });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("maxRetries");
  });

  it("warns on unknown keys", () => {
    const result = validateConfig({ unknownKey: true });
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("unknownKey");
  });

  it("rejects negative stageTimeouts values", () => {
    const result = validateConfig({ stageTimeouts: { preplan: -1 } });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("stageTimeouts.preplan");
    expect(result.errors[0]).toContain("positive");
  });

  it("rejects non-object stageTimeouts", () => {
    const result = validateConfig({ stageTimeouts: "fast" });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("stageTimeouts must be an object");
  });

  it("rejects array stageTimeouts", () => {
    const result = validateConfig({ stageTimeouts: [1, 2] });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("stageTimeouts must be an object");
  });

  it("accepts valid stageTimeouts override without error", () => {
    const result = validateConfig({ stageTimeouts: { preplan: 7200000 } });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("warns on unknown stageTimeouts sub-keys", () => {
    const result = validateConfig({ stageTimeouts: { preplan: 5000, bogusKey: 999 } });
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("bogusKey");
  });

  it("rejects zero stageTimeouts value", () => {
    const result = validateConfig({ stageTimeouts: { hardCap: 0 } });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("stageTimeouts.hardCap");
  });

  it("rejects Infinity stageTimeouts value", () => {
    const result = validateConfig({ stageTimeouts: { hardCap: Infinity } });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("stageTimeouts.hardCap");
  });

  it("rejects invalid model in modelAssignments", () => {
    const result = validateConfig({ modelAssignments: { critic: "gpt-4" } });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("critic");
  });

  it("rejects non-boolean skipNormalize", () => {
    const result = validateConfig({ skipNormalize: "yes" });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("skipNormalize");
    expect(result.errors[0]).toContain("boolean");
  });

  it("accepts boolean skipNormalize", () => {
    const result = validateConfig({ skipNormalize: true });
    expect(result.valid).toBe(true);
  });

  it("accepts valid partial config", () => {
    const result = validateConfig({
      agentTimeout: 300_000,
      maxRetries: 2,
      modelAssignments: { critic: "opus" },
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe("loadConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "hivemind-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns defaults when no config file exists", () => {
    const config = loadConfig(tmpDir);
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it("overrides specific keys from .hivemindrc.json", () => {
    writeFileSync(
      join(tmpDir, ".hivemindrc.json"),
      JSON.stringify({ agentTimeout: 300_000, maxRetries: 3 }),
    );
    const config = loadConfig(tmpDir);
    expect(config.agentTimeout).toBe(300_000);
    expect(config.maxRetries).toBe(3);
    // Other defaults preserved
    expect(config.shellTimeout).toBe(120_000);
    expect(config.memoryWordCap).toBe(400);
  });

  it("deep merges modelAssignments with defaults", () => {
    writeFileSync(
      join(tmpDir, ".hivemindrc.json"),
      JSON.stringify({ modelAssignments: { critic: "opus" } }),
    );
    const config = loadConfig(tmpDir);
    expect(config.modelAssignments.critic).toBe("opus");
    // Other model assignments preserved from defaults
    expect(config.modelAssignments.implementer).toBe("opus");
    expect(config.modelAssignments.reporter).toBe("haiku");
  });

  it("throws on invalid values", () => {
    writeFileSync(
      join(tmpDir, ".hivemindrc.json"),
      JSON.stringify({ agentTimeout: -5 }),
    );
    expect(() => loadConfig(tmpDir)).toThrow("agentTimeout");
  });

  it("throws on malformed JSON", () => {
    writeFileSync(join(tmpDir, ".hivemindrc.json"), "not json{");
    expect(() => loadConfig(tmpDir)).toThrow("Failed to parse");
  });

  it("loads skipNormalize from config file", () => {
    writeFileSync(
      join(tmpDir, ".hivemindrc.json"),
      JSON.stringify({ skipNormalize: true }),
    );
    const config = loadConfig(tmpDir);
    expect(config.skipNormalize).toBe(true);
  });

  it("defaults skipNormalize to false", () => {
    const config = loadConfig(tmpDir);
    expect(config.skipNormalize).toBe(false);
  });

  it("deep merges partial stageTimeouts with defaults", () => {
    writeFileSync(
      join(tmpDir, ".hivemindrc.json"),
      JSON.stringify({ stageTimeouts: { hardCap: 60000 } }),
    );
    const config = loadConfig(tmpDir);
    expect(config.stageTimeouts.hardCap).toBe(60000);
    // Other stageTimeouts sub-fields retain default values
    expect(config.stageTimeouts.preplan).toBe(7_200_000);
    expect(config.stageTimeouts.planDecompose).toBe(7_200_000);
    expect(config.stageTimeouts.postExecute).toBe(3_600_000);
  });

  it("returns default stageTimeouts when config omits stageTimeouts entirely", () => {
    writeFileSync(
      join(tmpDir, ".hivemindrc.json"),
      JSON.stringify({ agentTimeout: 300_000 }),
    );
    const config = loadConfig(tmpDir);
    expect(config.stageTimeouts.preplan).toBe(7_200_000);
    expect(config.stageTimeouts.planDecompose).toBe(7_200_000);
    expect(config.stageTimeouts.postExecute).toBe(3_600_000);
    expect(config.stageTimeouts.hardCap).toBe(172_800_000);
  });

  it("accepts full valid config", () => {
    const fullConfig = {
      agentTimeout: 900_000,
      shellTimeout: 60_000,
      toolingDetectTimeout: 15_000,
      maxRetries: 2,
      maxAttempts: 5,
      memoryWordCap: 500,
      memoryGraduationThreshold: 400,
      graduationMinDates: 2,
      graduationMinStoryRefs: 3,
      kbSizeWarningWords: 8000,
      reportExcerptLength: 300,
      modelAssignments: { critic: "opus", reporter: "sonnet" },
    };
    writeFileSync(join(tmpDir, ".hivemindrc.json"), JSON.stringify(fullConfig));
    const config = loadConfig(tmpDir);
    expect(config.agentTimeout).toBe(900_000);
    expect(config.maxAttempts).toBe(5);
    expect(config.modelAssignments.critic).toBe("opus");
    expect(config.modelAssignments.reporter).toBe("sonnet");
    // Deep-merged: unspecified agents keep defaults
    expect(config.modelAssignments.implementer).toBe("opus");
  });
});
