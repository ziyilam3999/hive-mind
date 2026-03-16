import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateExecutionPlan,
  autoUpgradeModuleFields,
  getModuleCwd,
  filterNonOverlapping,
  getReadyStories,
  validateDependencies,
  topologicalSort,
} from "../../state/execution-plan.js";
import type { ExecutionPlan, Story } from "../../types/execution-plan.js";
import type { Module } from "../../types/module.js";

function makeStory(overrides: Partial<Story> & { id: string }): Story {
  return {
    title: overrides.id,
    specSections: [],
    dependencies: [],
    sourceFiles: [],
    complexity: "low",
    rolesUsed: [],
    stepFile: `steps/${overrides.id}.md`,
    status: "not-started",
    attempts: 0,
    maxAttempts: 3,
    committed: false,
    commitHash: null,
    ...overrides,
  };
}

function makePlan(
  stories: Story[],
  modules?: Module[],
): ExecutionPlan {
  return {
    schemaVersion: "2.0.0",
    prdPath: "/prd.md",
    specPath: "/spec.md",
    stories,
    ...(modules !== undefined ? { modules } : {}),
  };
}

describe("validateExecutionPlan with module fields", () => {
  it("accepts plan without modules (backward compat)", () => {
    const plan = {
      schemaVersion: "2.0.0",
      prdPath: "/prd.md",
      specPath: "/spec.md",
      stories: [
        {
          id: "US-01", title: "Test", specSections: [], dependencies: [],
          sourceFiles: [], complexity: "low", rolesUsed: [], stepFile: "s.md",
          status: "not-started", attempts: 0, maxAttempts: 3,
          committed: false, commitHash: null,
        },
      ],
    };
    expect(validateExecutionPlan(plan)).toBe(true);
  });

  it("accepts plan with empty modules array", () => {
    const plan = {
      schemaVersion: "2.0.0",
      prdPath: "/prd.md",
      specPath: "/spec.md",
      stories: [],
      modules: [],
    };
    expect(validateExecutionPlan(plan)).toBe(true);
  });

  it("accepts plan with valid modules", () => {
    const plan = {
      schemaVersion: "2.0.0",
      prdPath: "/prd.md",
      specPath: "/spec.md",
      stories: [],
      modules: [
        { id: "shared-lib", path: "/shared-lib", role: "producer", dependencies: [] },
        { id: "web-app", path: "/web-app", role: "consumer", dependencies: ["shared-lib"] },
      ],
    };
    expect(validateExecutionPlan(plan)).toBe(true);
  });

  it("rejects plan with invalid module role", () => {
    const plan = {
      schemaVersion: "2.0.0",
      prdPath: "/prd.md",
      specPath: "/spec.md",
      stories: [],
      modules: [
        { id: "bad", path: "/bad", role: "invalid-role", dependencies: [] },
      ],
    };
    expect(validateExecutionPlan(plan)).toBe(false);
  });

  it("rejects plan with module missing id", () => {
    const plan = {
      schemaVersion: "2.0.0",
      prdPath: "/prd.md",
      specPath: "/spec.md",
      stories: [],
      modules: [
        { path: "/bad", role: "producer", dependencies: [] },
      ],
    };
    expect(validateExecutionPlan(plan)).toBe(false);
  });

  it("rejects plan with modules as non-array", () => {
    const plan = {
      schemaVersion: "2.0.0",
      prdPath: "/prd.md",
      specPath: "/spec.md",
      stories: [],
      modules: "not-an-array",
    };
    expect(validateExecutionPlan(plan)).toBe(false);
  });

  it("accepts story with moduleId", () => {
    const plan = {
      schemaVersion: "2.0.0",
      prdPath: "/prd.md",
      specPath: "/spec.md",
      stories: [
        {
          id: "US-01", title: "Test", specSections: [], dependencies: [],
          sourceFiles: [], complexity: "low", rolesUsed: [], stepFile: "s.md",
          status: "not-started", attempts: 0, maxAttempts: 3,
          committed: false, commitHash: null, moduleId: "shared-lib",
        },
      ],
    };
    expect(validateExecutionPlan(plan)).toBe(true);
  });

  it("rejects story with non-string moduleId", () => {
    const plan = {
      schemaVersion: "2.0.0",
      prdPath: "/prd.md",
      specPath: "/spec.md",
      stories: [
        {
          id: "US-01", title: "Test", specSections: [], dependencies: [],
          sourceFiles: [], complexity: "low", rolesUsed: [], stepFile: "s.md",
          status: "not-started", attempts: 0, maxAttempts: 3,
          committed: false, commitHash: null, moduleId: 123,
        },
      ],
    };
    expect(validateExecutionPlan(plan)).toBe(false);
  });
});

describe("autoUpgradeModuleFields", () => {
  beforeEach(() => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("returns plan unchanged when module fields present", () => {
    const plan = makePlan(
      [makeStory({ id: "US-01", moduleId: "default" })],
      [],
    );
    const result = autoUpgradeModuleFields(plan);
    expect(result).toBe(plan); // same reference, no copy
  });

  it("adds modules: [] when missing", () => {
    const plan = makePlan([makeStory({ id: "US-01", moduleId: "default" })]);
    delete (plan as unknown as Record<string, unknown>).modules;
    const result = autoUpgradeModuleFields(plan);
    expect(result.modules).toEqual([]);
  });

  it("sets moduleId to 'default' on stories missing it", () => {
    const plan = makePlan([makeStory({ id: "US-01" }), makeStory({ id: "US-02" })]);
    const result = autoUpgradeModuleFields(plan);
    expect(result.stories[0].moduleId).toBe("default");
    expect(result.stories[1].moduleId).toBe("default");
  });

  it("preserves existing moduleId on stories that have it", () => {
    const plan = makePlan([
      makeStory({ id: "US-01", moduleId: "shared-lib" }),
      makeStory({ id: "US-02" }),
    ]);
    const result = autoUpgradeModuleFields(plan);
    expect(result.stories[0].moduleId).toBe("shared-lib");
    expect(result.stories[1].moduleId).toBe("default");
  });

  it("logs at debug level for single-repo plans (no modules section)", () => {
    const plan = makePlan([makeStory({ id: "US-01" })]);
    autoUpgradeModuleFields(plan, false);
    expect(console.debug).toHaveBeenCalledWith(
      expect.stringContaining("Auto-upgrading plan"),
    );
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("logs at warn level when modules section exists but stories lack moduleId", () => {
    const plan = makePlan([makeStory({ id: "US-01" }), makeStory({ id: "US-02" })]);
    autoUpgradeModuleFields(plan, true);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("2 stories lack moduleId"),
    );
  });
});

describe("getModuleCwd", () => {
  it("returns undefined for undefined moduleId", () => {
    const plan = makePlan([], []);
    expect(getModuleCwd(plan, undefined)).toBeUndefined();
  });

  it("returns undefined for 'default' moduleId", () => {
    const plan = makePlan([], []);
    expect(getModuleCwd(plan, "default")).toBeUndefined();
  });

  it("returns module path for matching moduleId", () => {
    const plan = makePlan([], [
      { id: "shared-lib", path: "/abs/shared-lib", role: "producer", dependencies: [] },
      { id: "web-app", path: "/abs/web-app", role: "consumer", dependencies: ["shared-lib"] },
    ]);
    expect(getModuleCwd(plan, "shared-lib")).toBe("/abs/shared-lib");
    expect(getModuleCwd(plan, "web-app")).toBe("/abs/web-app");
  });

  it("returns undefined for non-existent moduleId", () => {
    const plan = makePlan([], [
      { id: "shared-lib", path: "/abs/shared-lib", role: "producer", dependencies: [] },
    ]);
    expect(getModuleCwd(plan, "nonexistent")).toBeUndefined();
  });

  it("returns undefined when plan has no modules array", () => {
    const plan = makePlan([]);
    expect(getModuleCwd(plan, "shared-lib")).toBeUndefined();
  });
});

describe("filterNonOverlapping with cross-module paths", () => {
  it("same relative paths in different modules are NOT treated as overlapping", () => {
    const plan = makePlan(
      [
        makeStory({ id: "US-01", moduleId: "shared-lib", sourceFiles: ["src/index.ts"] }),
        makeStory({ id: "US-02", moduleId: "web-app", sourceFiles: ["src/index.ts"] }),
      ],
      [
        { id: "shared-lib", path: "/abs/shared-lib", role: "producer", dependencies: [] },
        { id: "web-app", path: "/abs/web-app", role: "consumer", dependencies: [] },
      ],
    );
    const result = filterNonOverlapping(plan.stories, plan);
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.id)).toEqual(["US-01", "US-02"]);
  });

  it("same absolute paths (same module) ARE treated as overlapping", () => {
    const plan = makePlan(
      [
        makeStory({ id: "US-01", moduleId: "shared-lib", sourceFiles: ["src/index.ts"] }),
        makeStory({ id: "US-02", moduleId: "shared-lib", sourceFiles: ["src/index.ts"] }),
      ],
      [
        { id: "shared-lib", path: "/abs/shared-lib", role: "producer", dependencies: [] },
      ],
    );
    const result = filterNonOverlapping(plan.stories, plan);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("US-01");
  });

  it("single-repo (no modules) behaves as before", () => {
    const stories = [
      makeStory({ id: "US-01", sourceFiles: ["src/a.ts"] }),
      makeStory({ id: "US-02", sourceFiles: ["src/b.ts"] }),
      makeStory({ id: "US-03", sourceFiles: ["src/a.ts"] }),
    ];
    const result = filterNonOverlapping(stories);
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.id)).toEqual(["US-01", "US-02"]);
  });
});

describe("topologicalSort", () => {
  it("sorts nodes in dependency order", () => {
    const deps: Record<string, string[]> = {
      a: [],
      b: ["a"],
      c: ["b"],
    };
    const result = topologicalSort(["a", "b", "c"], (id) => deps[id] ?? []);
    expect(result.indexOf("a")).toBeLessThan(result.indexOf("b"));
    expect(result.indexOf("b")).toBeLessThan(result.indexOf("c"));
  });

  it("throws on circular dependency with cycle path", () => {
    const deps: Record<string, string[]> = {
      a: ["c"],
      b: ["a"],
      c: ["b"],
    };
    expect(() => topologicalSort(["a", "b", "c"], (id) => deps[id] ?? []))
      .toThrow(/Circular dependency/);
  });

  it("handles no dependencies", () => {
    const result = topologicalSort(["a", "b", "c"], () => []);
    expect(result).toHaveLength(3);
  });
});

describe("getReadyStories with module dependencies", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("blocks consumer module stories until producer stories are done", () => {
    const plan = makePlan(
      [
        makeStory({ id: "US-01", moduleId: "shared-lib", status: "not-started" }),
        makeStory({ id: "US-02", moduleId: "web-app", status: "not-started" }),
      ],
      [
        { id: "shared-lib", path: "/shared-lib", role: "producer", dependencies: [] },
        { id: "web-app", path: "/web-app", role: "consumer", dependencies: ["shared-lib"] },
      ],
    );
    const ready = getReadyStories(plan);
    expect(ready.map((s) => s.id)).toEqual(["US-01"]); // US-02 blocked
  });

  it("unblocks consumer stories when producer stories are done", () => {
    const plan = makePlan(
      [
        makeStory({ id: "US-01", moduleId: "shared-lib", status: "passed" }),
        makeStory({ id: "US-02", moduleId: "web-app", status: "not-started" }),
      ],
      [
        { id: "shared-lib", path: "/shared-lib", role: "producer", dependencies: [] },
        { id: "web-app", path: "/web-app", role: "consumer", dependencies: ["shared-lib"] },
      ],
    );
    const ready = getReadyStories(plan);
    expect(ready.map((s) => s.id)).toEqual(["US-02"]);
  });

  it("single-repo plan unchanged (no module blocking)", () => {
    const plan = makePlan([
      makeStory({ id: "US-01" }),
      makeStory({ id: "US-02" }),
    ]);
    const ready = getReadyStories(plan);
    expect(ready).toHaveLength(2);
  });

  it("zero-stories-in-module treated as vacuously satisfied with warning", () => {
    const plan = makePlan(
      [
        makeStory({ id: "US-01", moduleId: "web-app", status: "not-started" }),
      ],
      [
        { id: "shared-lib", path: "/shared-lib", role: "producer", dependencies: [] },
        { id: "web-app", path: "/web-app", role: "consumer", dependencies: ["shared-lib"] },
      ],
    );
    // shared-lib has no stories → vacuously satisfied
    const ready = getReadyStories(plan);
    expect(ready.map((s) => s.id)).toEqual(["US-01"]);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("no stories assigned"),
    );
  });
});

describe("validateDependencies with modules", () => {
  it("detects circular module dependencies", () => {
    const plan = makePlan(
      [],
      [
        { id: "a", path: "/a", role: "producer", dependencies: ["b"] },
        { id: "b", path: "/b", role: "consumer", dependencies: ["a"] },
      ],
    );
    expect(() => validateDependencies(plan)).toThrow(/Circular dependency/);
  });

  it("detects unknown module dependency", () => {
    const plan = makePlan(
      [],
      [
        { id: "a", path: "/a", role: "consumer", dependencies: ["nonexistent"] },
      ],
    );
    expect(() => validateDependencies(plan)).toThrow('unknown module: "nonexistent"');
  });

  it("passes for valid module dependency graph", () => {
    const plan = makePlan(
      [],
      [
        { id: "lib", path: "/lib", role: "producer", dependencies: [] },
        { id: "app", path: "/app", role: "consumer", dependencies: ["lib"] },
      ],
    );
    expect(() => validateDependencies(plan)).not.toThrow();
  });
});
