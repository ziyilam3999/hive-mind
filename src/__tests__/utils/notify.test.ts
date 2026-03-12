import { describe, it, expect, vi, beforeEach } from "vitest";
import { notifyCheckpoint } from "../../utils/notify.js";

describe("notifyCheckpoint", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("writes BEL character when not silent", () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    notifyCheckpoint(false);
    expect(writeSpy).toHaveBeenCalledWith("\x07");
  });

  it("does not write BEL character when silent", () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    notifyCheckpoint(true);
    expect(writeSpy).not.toHaveBeenCalled();
  });
});
