import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { rmSync, existsSync } from "node:fs";
import { readMemory } from "../../memory/memory-manager.js";

describe("memory first run init", () => {
  const testDir = join(process.cwd(), ".test-memory-init");
  const memoryPath = join(testDir, "memory.md");

  it("creates memory.md from template when missing", () => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
    const content = readMemory(memoryPath);
    expect(content).toContain("## PATTERNS");
    expect(content).toContain("## MISTAKES");
    expect(content).toContain("## DISCOVERIES");
    expect(content).toContain("## GRADUATION LOG");
    expect(existsSync(memoryPath)).toBe(true);
    rmSync(testDir, { recursive: true });
  });
});
