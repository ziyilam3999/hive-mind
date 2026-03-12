import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { updateManifest } from "../../manifest/generator.js";

const TEST_DIR = join(import.meta.dirname, ".tmp-manifest-test");

function setup() {
  rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DIR, { recursive: true });
}

function teardown() {
  rmSync(TEST_DIR, { recursive: true, force: true });
}

describe("updateManifest", () => {
  beforeEach(setup);
  afterEach(teardown);

  it("creates MANIFEST.md with static template and inventory", async () => {
    mkdirSync(join(TEST_DIR, "spec"), { recursive: true });
    writeFileSync(join(TEST_DIR, "spec", "SPEC-v1.0.md"), "# Spec");

    await updateManifest(TEST_DIR);

    const content = readFileSync(join(TEST_DIR, "MANIFEST.md"), "utf-8");
    expect(content).toContain("# Hive Mind — Project Manifest");
    expect(content).toContain("## Artifact Inventory");
    expect(content).toContain("SPEC-v1.0.md");
  });

  it("categorizes spec files under Spec Artifacts", async () => {
    mkdirSync(join(TEST_DIR, "spec"), { recursive: true });
    writeFileSync(join(TEST_DIR, "spec", "test.md"), "content");

    await updateManifest(TEST_DIR);

    const content = readFileSync(join(TEST_DIR, "MANIFEST.md"), "utf-8");
    expect(content).toContain("### Spec Artifacts");
    expect(content).toContain("spec/test.md");
  });

  it("categorizes plan files under Plan Artifacts", async () => {
    mkdirSync(join(TEST_DIR, "plans"), { recursive: true });
    writeFileSync(join(TEST_DIR, "plans", "execution-plan.json"), "{}");

    await updateManifest(TEST_DIR);

    const content = readFileSync(join(TEST_DIR, "MANIFEST.md"), "utf-8");
    expect(content).toContain("### Plan Artifacts");
  });

  it("categorizes report files under Report Artifacts", async () => {
    mkdirSync(join(TEST_DIR, "reports"), { recursive: true });
    writeFileSync(join(TEST_DIR, "reports", "summary.md"), "report");

    await updateManifest(TEST_DIR);

    const content = readFileSync(join(TEST_DIR, "MANIFEST.md"), "utf-8");
    expect(content).toContain("### Report Artifacts");
  });

  it("preserves static content above inventory marker on re-run", async () => {
    mkdirSync(join(TEST_DIR, "spec"), { recursive: true });
    writeFileSync(join(TEST_DIR, "spec", "a.md"), "a");

    await updateManifest(TEST_DIR);

    // Manually edit static section
    const first = readFileSync(join(TEST_DIR, "MANIFEST.md"), "utf-8");
    const marker = "## Artifact Inventory";
    const markerIdx = first.indexOf(marker);
    const customStatic = first.slice(0, markerIdx).replace("Hive Mind v3", "Hive Mind v3 — Custom Edit");
    writeFileSync(join(TEST_DIR, "MANIFEST.md"), customStatic + first.slice(markerIdx));

    // Add another file and re-run
    writeFileSync(join(TEST_DIR, "spec", "b.md"), "b");
    await updateManifest(TEST_DIR);

    const updated = readFileSync(join(TEST_DIR, "MANIFEST.md"), "utf-8");
    expect(updated).toContain("Custom Edit");
    expect(updated).toContain("b.md");
  });

  it("excludes MANIFEST.md from inventory", async () => {
    writeFileSync(join(TEST_DIR, "memory.md"), "mem");
    await updateManifest(TEST_DIR);

    const content = readFileSync(join(TEST_DIR, "MANIFEST.md"), "utf-8");
    expect(content).not.toContain("| `MANIFEST.md`");
  });

  it("handles empty directory gracefully", async () => {
    await updateManifest(TEST_DIR);

    const content = readFileSync(join(TEST_DIR, "MANIFEST.md"), "utf-8");
    expect(content).toContain("# Hive Mind — Project Manifest");
    expect(content).toContain("## Artifact Inventory");
  });

  it("includes file size and modified date columns", async () => {
    mkdirSync(join(TEST_DIR, "spec"), { recursive: true });
    writeFileSync(join(TEST_DIR, "spec", "test.md"), "hello world");

    await updateManifest(TEST_DIR);

    const content = readFileSync(join(TEST_DIR, "MANIFEST.md"), "utf-8");
    expect(content).toContain("| File | Size | Modified |");
    expect(content).toMatch(/\d+(\.\d+)? KB/);
    expect(content).toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});
