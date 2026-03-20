import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { collectProjectFileListing } from "../../utils/file-listing.js";

describe("collectProjectFileListing", () => {
  const testDir = join(process.cwd(), ".test-file-listing");

  function setup() {
    mkdirSync(join(testDir, "src"), { recursive: true });
    mkdirSync(join(testDir, "node_modules", "pkg"), { recursive: true });
    mkdirSync(join(testDir, ".git"), { recursive: true });
    writeFileSync(join(testDir, "src", "index.ts"), 'export function main() {}');
    writeFileSync(join(testDir, "src", "util.ts"), '// Utility helpers\nexport const x = 1;');
    writeFileSync(join(testDir, "package.json"), '{"name": "test"}');
    writeFileSync(join(testDir, "node_modules", "pkg", "index.js"), 'module.exports = {}');
    writeFileSync(join(testDir, ".git", "HEAD"), 'ref: refs/heads/main');
  }

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("lists files with first-line summaries", () => {
    setup();
    const result = collectProjectFileListing({ root: testDir });
    expect(result).toContain("src/index.ts");
    expect(result).toContain("export function main()");
    expect(result).toContain("package.json");
  });

  it("ignores default directories (node_modules, .git)", () => {
    setup();
    const result = collectProjectFileListing({ root: testDir });
    expect(result).not.toContain("node_modules");
    expect(result).not.toContain(".git");
  });

  it("ignores .hive-mind-* directories", () => {
    setup();
    mkdirSync(join(testDir, ".hive-mind-run1"), { recursive: true });
    writeFileSync(join(testDir, ".hive-mind-run1", "data.json"), '{}');
    const result = collectProjectFileListing({ root: testDir });
    expect(result).not.toContain(".hive-mind-run1");
  });

  it("respects custom ignoreDirs", () => {
    setup();
    const result = collectProjectFileListing({ root: testDir, ignoreDirs: ["src"] });
    expect(result).not.toContain("src/index.ts");
    expect(result).toContain("package.json");
  });

  it("truncates at maxFiles", () => {
    setup();
    const result = collectProjectFileListing({ root: testDir, maxFiles: 1 });
    const lines = result.split("\n").filter((l) => l.includes("  -- "));
    expect(lines.length).toBe(1);
    expect(result).toContain("truncated at 1 files");
  });

  it("empty file does not crash", () => {
    setup();
    writeFileSync(join(testDir, "empty.txt"), "");
    const result = collectProjectFileListing({ root: testDir });
    expect(result).toContain("empty.txt");
  });

  it("handles binary files", () => {
    setup();
    writeFileSync(join(testDir, "binary.bin"), Buffer.from([0x00, 0x01, 0x02]));
    const result = collectProjectFileListing({ root: testDir });
    expect(result).toContain("binary.bin");
    expect(result).toContain("(binary)");
  });
});
