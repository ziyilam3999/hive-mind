import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { parseModules, resolveAndValidateModules } from "../../utils/module-parser.js";
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

describe("parseModules", () => {
  it("parses a valid modules table", () => {
    const content = `# SPEC

## Modules

| id | path | role | dependencies |
|----|------|------|-------------|
| shared-lib | ../shared-lib | producer | |
| web-app | ../web-app | consumer | shared-lib |
| api-server | ../api-server | consumer | shared-lib |

## Other Section
`;
    const modules = parseModules(content);
    expect(modules).toHaveLength(3);
    expect(modules[0]).toEqual({
      id: "shared-lib",
      path: "../shared-lib",
      role: "producer",
      dependencies: [],
    });
    expect(modules[1]).toEqual({
      id: "web-app",
      path: "../web-app",
      role: "consumer",
      dependencies: ["shared-lib"],
    });
    expect(modules[2]).toEqual({
      id: "api-server",
      path: "../api-server",
      role: "consumer",
      dependencies: ["shared-lib"],
    });
  });

  it("returns empty array when no ## Modules section exists", () => {
    const content = `# SPEC\n\n## Stories\n\nSome content`;
    expect(parseModules(content)).toEqual([]);
  });

  it("returns empty array for empty modules table", () => {
    const content = `# SPEC\n\n## Modules\n\n## Stories\n`;
    expect(parseModules(content)).toEqual([]);
  });

  it("parses multiple comma-separated dependencies", () => {
    const content = `## Modules

| id | path | role | dependencies |
|----|------|------|-------------|
| app | ./app | consumer | lib-a, lib-b, lib-c |
`;
    const modules = parseModules(content);
    expect(modules[0].dependencies).toEqual(["lib-a", "lib-b", "lib-c"]);
  });

  it("throws on missing id column", () => {
    const content = `## Modules

| id | path | role | dependencies |
|----|------|------|-------------|
| | ./path | producer | |
`;
    expect(() => parseModules(content)).toThrow("missing required fields");
  });

  it("throws on invalid role", () => {
    const content = `## Modules

| id | path | role | dependencies |
|----|------|------|-------------|
| bad | ./bad | invalid-role | |
`;
    expect(() => parseModules(content)).toThrow('invalid role "invalid-role"');
  });

  it("handles standalone role", () => {
    const content = `## Modules

| id | path | role | dependencies |
|----|------|------|-------------|
| tools | ./tools | standalone | |
`;
    const modules = parseModules(content);
    expect(modules[0].role).toBe("standalone");
  });

  it("handles table at end of content (no trailing section)", () => {
    const content = `## Modules

| id | path | role | dependencies |
|----|------|------|-------------|
| lib | ./lib | producer | |
`;
    const modules = parseModules(content);
    expect(modules).toHaveLength(1);
  });
});

describe("resolveAndValidateModules", () => {
  const testBase = join(process.cwd(), ".test-module-parser");

  beforeEach(() => {
    rmSync(testBase, { recursive: true, force: true });
    mkdirSync(join(testBase, "mod-a"), { recursive: true });
    mkdirSync(join(testBase, "mod-b"), { recursive: true });
  });

  afterAll(() => {
    rmSync(testBase, { recursive: true, force: true });
  });

  it("resolves relative paths to absolute", () => {
    const modules = [
      { id: "mod-a", path: "./mod-a", role: "producer" as const, dependencies: [] },
    ];
    const prdPath = join(testBase, "PRD.md");
    const result = resolveAndValidateModules(modules, prdPath);
    expect(result[0].path).toBe(resolve(testBase, "mod-a"));
  });

  it("throws on nonexistent path", () => {
    const modules = [
      { id: "missing", path: "./nonexistent", role: "producer" as const, dependencies: [] },
    ];
    const prdPath = join(testBase, "PRD.md");
    expect(() => resolveAndValidateModules(modules, prdPath)).toThrow("does not exist");
  });

  it("throws on duplicate paths", () => {
    const modules = [
      { id: "mod-a", path: "./mod-a", role: "producer" as const, dependencies: [] },
      { id: "mod-a2", path: "./mod-a", role: "consumer" as const, dependencies: [] },
    ];
    const prdPath = join(testBase, "PRD.md");
    expect(() => resolveAndValidateModules(modules, prdPath)).toThrow("same path");
  });

  it("returns empty array for empty modules", () => {
    const result = resolveAndValidateModules([], join(testBase, "PRD.md"));
    expect(result).toEqual([]);
  });
});
