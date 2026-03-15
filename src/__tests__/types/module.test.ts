import { describe, it, expect } from "vitest";
import type { Module, ModuleRole } from "../../types/module.js";

describe("Module type", () => {
  it("accepts valid module with all fields", () => {
    const mod: Module = {
      id: "shared-lib",
      path: "/abs/path/shared-lib",
      role: "producer",
      dependencies: [],
    };
    expect(mod.id).toBe("shared-lib");
    expect(mod.role).toBe("producer");
    expect(mod.dependencies).toEqual([]);
  });

  it("accepts module with dependencies", () => {
    const mod: Module = {
      id: "web-app",
      path: "/abs/path/web-app",
      role: "consumer",
      dependencies: ["shared-lib", "api-server"],
    };
    expect(mod.dependencies).toEqual(["shared-lib", "api-server"]);
  });

  it("accepts all valid role types", () => {
    const roles: ModuleRole[] = ["producer", "consumer", "standalone"];
    for (const role of roles) {
      const mod: Module = { id: "test", path: "/test", role, dependencies: [] };
      expect(mod.role).toBe(role);
    }
  });

  it("empty modules array is valid for single-repo", () => {
    const modules: Module[] = [];
    expect(modules).toEqual([]);
    expect(modules.length).toBe(0);
  });
});
