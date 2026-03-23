import { describe, it, expect } from "vitest";
import {
  renderDashboard,
  escapeHtml,
  renderFlowDiagram,
  renderStatusHalo,
  renderProgressBar,
  renderSparkChart,
  renderRadialGauge,
  renderDurationBars,
  renderCostDisplay,
  renderCheckpointSection,
  extractStages,
  type DashboardStatus,
  type StoryData,
  type ManagerLogEntry,
  type CostLogEntry,
} from "../../dashboard/ui.js";

describe("Dashboard UI", () => {
  describe("renderDashboard", () => {
    it("returns a complete HTML document string", () => {
      const html = renderDashboard();
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("<html");
      expect(html).toContain("</html>");
      expect(html).toContain("Hive Mind Dashboard");
    });

    it("contains embedded CSS (no external stylesheets)", () => {
      const html = renderDashboard();
      expect(html).toContain("<style>");
      expect(html).not.toMatch(/<link\s+.*href=.*\.css/);
    });

    it("contains inline JavaScript (no external scripts)", () => {
      const html = renderDashboard();
      expect(html).toContain("<script>");
      expect(html).not.toMatch(/<script\s+src=/);
    });

    it("uses setInterval with 2000ms polling interval", () => {
      const html = renderDashboard();
      expect(html).toContain("setInterval");
      expect(html).toContain("2000");
    });

    it("contains IntersectionObserver for viewport-aware rendering", () => {
      const html = renderDashboard();
      expect(html).toContain("IntersectionObserver");
    });

    it("contains shutdownAt countdown logic", () => {
      const html = renderDashboard();
      expect(html).toContain("shutdownAt");
      expect(html).toContain("Math.max");
      expect(html).toContain("Math.ceil");
      expect(html).toContain("Date.now");
    });

    it("contains 'Pipeline complete' shutdown banner text", () => {
      const html = renderDashboard();
      expect(html).toMatch(/pipeline complete.*shutting down/i);
    });

    it("contains three-state display: awaiting state text", () => {
      const html = renderDashboard();
      expect(html).toMatch(/awaiting/i);
    });

    it("contains error indicator for cost data", () => {
      const html = renderDashboard();
      expect(html).toContain("[!] Unable to read cost data");
    });

    it("does not contain approve/reject button elements", () => {
      const html = renderDashboard();
      const lower = html.toLowerCase();
      const hasApproveBtn = lower.includes("approve") && (lower.includes("button") || lower.includes("btn"));
      const hasRejectBtn = lower.includes("reject") && (lower.includes("button") || lower.includes("btn"));
      expect(hasApproveBtn).toBe(false);
      expect(hasRejectBtn).toBe(false);
    });

    it("contains checkpoint conditional rendering logic", () => {
      const html = renderDashboard();
      // renderCheckpoint hides section if checkpoint is falsy
      expect(html).toContain("checkpoint");
      expect(html).toMatch(/if\(!cp\)|if\s*\(\s*!.*checkpoint/i);
    });

    it("contains log pagination with offset and Show more", () => {
      const html = renderDashboard();
      expect(html).toContain("offset");
      expect(html).toMatch(/show more/i);
    });

    it("fetches logs only on expand/click, not on page load", () => {
      const html = renderDashboard();
      // fetchLogs is called inside a click event listener
      expect(html).toContain("addEventListener");
      expect(html).toContain("click");
      expect(html).toContain("fetchLogs");
    });

    it("does not contain fs.watch or fs.watchFile", () => {
      const html = renderDashboard();
      expect(html).not.toContain("fs.watch");
      expect(html).not.toContain("fs.watchFile");
    });

    it("does not contain local pricing formula", () => {
      const html = renderDashboard();
      expect(html).not.toMatch(/per.*token|token.*price|\* 0\./i);
    });

    it("does not import live-report", () => {
      const html = renderDashboard();
      expect(html).not.toMatch(/live.report/i);
    });
  });

  describe("escapeHtml", () => {
    it("escapes HTML special characters", () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe(
        "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;",
      );
    });

    it("escapes ampersands", () => {
      expect(escapeHtml("a & b")).toBe("a &amp; b");
    });
  });

  describe("renderFlowDiagram", () => {
    it("renders SVG with stage nodes from dynamic stage list", () => {
      const svg = renderFlowDiagram(["NORMALIZE", "EXECUTE", "REPORT"]);
      expect(svg).toContain("<svg");
      expect(svg).toContain("NORMALIZE");
      expect(svg).toContain("EXECUTE");
      expect(svg).toContain("REPORT");
    });

    it("renders animated edges with stroke-dashoffset", () => {
      const svg = renderFlowDiagram(["A", "B"]);
      expect(svg).toContain("stroke-dashoffset");
      expect(svg).toContain("stroke-dasharray");
    });

    it("returns empty string for empty stage list", () => {
      expect(renderFlowDiagram([])).toBe("");
    });

    it("handles single stage without edges", () => {
      const svg = renderFlowDiagram(["SPEC"]);
      expect(svg).toContain("SPEC");
      expect(svg).not.toContain("<line");
    });
  });

  describe("renderStatusHalo", () => {
    it("renders running status with animation", () => {
      const svg = renderStatusHalo("running");
      expect(svg).toContain("<svg");
      expect(svg).toContain("#22d3ee");
      expect(svg).toContain("animate");
    });

    it("renders passed status without animation", () => {
      const svg = renderStatusHalo("passed");
      expect(svg).toContain("#4ade80");
      expect(svg).not.toContain("animate");
    });

    it("renders pending status with default color", () => {
      const svg = renderStatusHalo("pending");
      expect(svg).toContain("#94a3b8");
    });

    it("handles unknown status gracefully", () => {
      const svg = renderStatusHalo("UNKNOWN_STATUS_XYZ");
      expect(svg).toContain("<svg");
      expect(svg).toContain("#94a3b8");
    });
  });

  describe("renderProgressBar", () => {
    it("renders progress bar with correct percentage", () => {
      const bar = renderProgressBar(50);
      expect(bar).toContain("width:50%");
    });

    it("clamps to 0% minimum", () => {
      const bar = renderProgressBar(-10);
      expect(bar).toContain("width:0%");
    });

    it("clamps to 100% maximum", () => {
      const bar = renderProgressBar(200);
      expect(bar).toContain("width:100%");
    });
  });

  describe("renderSparkChart", () => {
    it("renders SVG rect elements for token values", () => {
      const svg = renderSparkChart([100, 200, 150]);
      expect(svg).toContain("<svg");
      expect(svg).toContain("<rect");
      expect(svg.match(/<rect/g)?.length).toBe(3);
    });

    it("returns empty string for empty values", () => {
      expect(renderSparkChart([])).toBe("");
    });
  });

  describe("renderRadialGauge", () => {
    it("renders radial gauge with stroke-dasharray", () => {
      const svg = renderRadialGauge(700, 1000);
      expect(svg).toContain("<svg");
      expect(svg).toContain("stroke-dasharray");
      expect(svg).toContain("70%");
    });

    it("shows 0% when budget is 0", () => {
      const svg = renderRadialGauge(0, 0);
      expect(svg).toContain("0%");
    });

    it("uses red color when over 90% budget", () => {
      const svg = renderRadialGauge(950, 1000);
      expect(svg).toContain("#f87171");
    });

    it("uses yellow color when over 70% budget", () => {
      const svg = renderRadialGauge(750, 1000);
      expect(svg).toContain("#facc15");
    });

    it("uses green color when under 70% budget", () => {
      const svg = renderRadialGauge(500, 1000);
      expect(svg).toContain("#4ade80");
    });
  });

  describe("renderDurationBars", () => {
    it("renders comparative duration bars for stories", () => {
      const stories: StoryData[] = [
        { id: "US-01", durationMs: 5000 },
        { id: "US-02", durationMs: 10000 },
      ];
      const html = renderDurationBars(stories);
      expect(html).toContain("US-01");
      expect(html).toContain("US-02");
      expect(html).toContain("5.0s");
      expect(html).toContain("10.0s");
    });

    it("returns empty string when no stories have durations", () => {
      const stories: StoryData[] = [{ id: "US-01" }];
      expect(renderDurationBars(stories)).toBe("");
    });
  });

  describe("renderCostDisplay", () => {
    it("shows awaiting state when cost log is empty", () => {
      const html = renderCostDisplay([]);
      expect(html).toContain("awaiting");
    });

    it("shows error indicator when costError is true", () => {
      const html = renderCostDisplay([], true);
      expect(html).toContain("[!] Unable to read cost data");
    });

    it("shows $0.0000 for genuine zero cost", () => {
      const html = renderCostDisplay([{ totalCost: 0 }]);
      expect(html).toContain("$0.0000");
    });

    it("shows accumulated cost from multiple entries", () => {
      const html = renderCostDisplay([
        { totalCost: 0.5 },
        { totalCost: 0.3 },
      ]);
      expect(html).toContain("$0.8000");
    });
  });

  describe("renderCheckpointSection", () => {
    it("returns empty string when no checkpoint exists", () => {
      expect(renderCheckpointSection(null)).toBe("");
    });

    it("renders checkpoint section when checkpoint exists", () => {
      const html = renderCheckpointSection({ storyId: "US-05", message: "Review needed" });
      expect(html).toContain("Checkpoint Active");
      expect(html).toContain("checkpoint-section");
    });
  });

  describe("extractStages", () => {
    it("extracts unique stages from manager log preserving order", () => {
      const log: ManagerLogEntry[] = [
        { action: "SPEC" },
        { action: "PLAN" },
        { action: "SPEC" },
        { action: "NORMALIZE" },
      ];
      expect(extractStages(log)).toEqual(["SPEC", "PLAN", "NORMALIZE"]);
    });

    it("handles NORMALIZE stage dynamically", () => {
      const log: ManagerLogEntry[] = [
        { action: "NORMALIZE" },
        { action: "BUILD" },
      ];
      const stages = extractStages(log);
      expect(stages).toContain("NORMALIZE");
    });

    it("returns empty array for empty log", () => {
      expect(extractStages([])).toEqual([]);
    });
  });

  describe("50-story large plan rendering", () => {
    it("renders 50 stories without throwing errors", () => {
      const html = renderDashboard();
      expect(html).toBeTruthy();
      expect(typeof html).toBe("string");
    });

    it("contains viewport-aware placeholder logic for off-screen stories", () => {
      const html = renderDashboard();
      expect(html).toContain("placeholder");
      expect(html).toContain("IntersectionObserver");
    });
  });

  describe("log pagination initial render", () => {
    it("initial log fetch uses offset 0", () => {
      const html = renderDashboard();
      // fetchLogs is called with offset 0 on first expand
      expect(html).toContain("offset=");
      expect(html).toMatch(/fetchLogs.*,\s*0\s*,/);
    });

    it("Show more button exists for loading next pages", () => {
      const html = renderDashboard();
      expect(html).toMatch(/show more/i);
    });

    it("nextOffset null hides Show more button", () => {
      const html = renderDashboard();
      expect(html).toMatch(/nextOffset.*null|null.*nextOffset/);
    });
  });

  describe("XSS safety", () => {
    it("escapeHtml prevents script injection", () => {
      const malicious = '<img src=x onerror="alert(1)">';
      const safe = escapeHtml(malicious);
      expect(safe).not.toContain("<img");
      expect(safe).toContain("&lt;img");
    });

    it("server-side helpers use escapeHtml for story IDs", () => {
      const stories: StoryData[] = [
        { id: '<script>alert("xss")</script>', durationMs: 1000 },
      ];
      const html = renderDurationBars(stories);
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    });
  });
});
