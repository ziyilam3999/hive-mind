import type {
  ImplReport,
  RefactorReport,
  TestReport,
  EvalReport,
  DiagnosisReport,
  FixReport,
  LearningReport,
  RoleReport,
  ResearchReport,
  CritiqueReport,
  ConsolidatedReport,
  RetrospectiveReport,
} from "../types/reports.js";

export function getReportPath(storyId: string, reportName: string): string {
  return `reports/${storyId}/${reportName}`;
}

export function implReportTemplate(data: ImplReport): string {
  const filesTable = data.filesCreated
    .map((f) => `| ${f.file} | ${f.lines} | ${f.exports.join(", ")} |`)
    .join("\n");
  const decisions = data.designDecisions
    .map((d) => `- Decision: ${d.decision} Rationale: ${d.rationale}`)
    .join("\n");
  const contracts = data.outputContractVerification
    .map((c) => `| ${c.requiredExport} | ${c.present ? "YES" : "NO"} | ${c.location} |`)
    .join("\n");
  return `# Implementation Report: ${data.storyId}

## STATUS: ${data.status}
## FILES CREATED
| File | Lines | Exports |
|------|:-----:|---------|
${filesTable}

## DESIGN DECISIONS
${decisions}

## OUTPUT CONTRACT VERIFICATION
| Required Export | Present | Location |
|----------------|:-------:|----------|
${contracts}

## TIMESTAMP
${data.timestamp}
`;
}

export function refactorReportTemplate(data: RefactorReport): string {
  const changes = data.changes
    .map((c) => `| ${c.file} | ${c.change} | ${c.rationale} |`)
    .join("\n");
  const improvements = data.qualityImprovements
    .map((q) => `- Before: ${q.before} After: ${q.after}`)
    .join("\n");
  return `# Refactor Report: ${data.storyId}

## STATUS: ${data.status}
## CHANGES
| File | Change | Rationale |
|------|--------|-----------|
${changes}

## QUALITY IMPROVEMENTS
${improvements}

## TIMESTAMP
${data.timestamp}
`;
}

export function testReportTemplate(data: TestReport): string {
  const results = data.results
    .map((r) => `| ${r.acId} | ${r.description} | ${r.command} | ${r.output} | ${r.result} |`)
    .join("\n");
  return `# Test Report: ${data.storyId}

## STATUS: ${data.status}
## RESULTS
| AC ID | Description | Command | Output | Result |
|-------|-------------|---------|--------|:------:|
${results}

## SUMMARY
Total: ${data.summary.total} | Passed: ${data.summary.passed} | Failed: ${data.summary.failed}

## TIMESTAMP
${data.timestamp}
`;
}

export function evalReportTemplate(data: EvalReport): string {
  const results = data.results
    .map((r) => `| ${r.ecId} | ${r.description} | ${r.specRef} | ${r.command} | ${r.output} | ${r.result} |`)
    .join("\n");
  const blocking = data.blockingIssues
    .map((b) => `| ${b.ec} | ${b.issue} | ${b.specViolation} |`)
    .join("\n");
  return `# Evaluation Report: ${data.storyId}

## VERDICT: ${data.verdict}
## RESULTS
| EC ID | Description | SPEC Ref | Command | Output | Result |
|-------|-------------|----------|---------|--------|:------:|
${results}

## SUMMARY
Total: ${data.summary.total} | Passed: ${data.summary.passed} | Failed: ${data.summary.failed}

## BLOCKING ISSUES (if FAIL)
| EC | Issue | SPEC Violation |
|----|-------|---------------|
${blocking}

## TIMESTAMP
${data.timestamp}
`;
}

export function diagnosisReportTemplate(data: DiagnosisReport): string {
  const failingAcs = data.failingACs
    .map((a) => `| ${a.acId} | ${a.description} | ${a.observedOutput} |`)
    .join("\n");
  const prevAttempts = data.previousAttempts
    .map((p) => `| ${p.attempt} | ${p.whatWasTried} | ${p.whyItFailed} |`)
    .join("\n");
  return `# Diagnosis Report: ${data.storyId} (Attempt ${data.attempt})

## FAILING ACs
| AC ID | Description | Observed Output |
|-------|-------------|-----------------|
${failingAcs}

## ROOT CAUSE ANALYSIS
- Symptom: ${data.rootCause.symptom}
- Root cause: ${data.rootCause.cause}
- Evidence: ${data.rootCause.evidence}

## PREVIOUS ATTEMPTS (if any)
| Attempt | What Was Tried | Why It Didn't Work |
|:-------:|----------------|-------------------|
${prevAttempts}

## RECOMMENDED FIX
- File(s): ${data.recommendedFix.files.join(", ")}
- Change: ${data.recommendedFix.change}
- Risk: ${data.recommendedFix.risk}

## TIMESTAMP
${data.timestamp}
`;
}

export function fixReportTemplate(data: FixReport): string {
  const fixes = data.fixesApplied
    .map((f) => `| ${f.index} | ${f.file} | ${f.description} |`)
    .join("\n");
  const acMapping = data.acFixMapping
    .map((a) => `| ${a.ac} | ${a.issue} | ${a.fix} |`)
    .join("\n");
  const prevAttempts = data.previousAttempts
    .map((p) => `| ${p.attempt} | ${p.fixApplied} | ${p.result} |`)
    .join("\n");
  return `# Fix Report: ${data.storyId} (Attempt ${data.attempt})

## ATTEMPT: ${data.attempt} of 3
## ESCALATED: ${data.escalated ? "YES" : "NO"} (diagnostician used)

## FIXES APPLIED
| # | File | Description |
|---|------|-------------|
${fixes}

## AC FIX MAPPING
| AC | Issue | Fix |
|----|-------|-----|
${acMapping}

## DIAGNOSIS REFERENCE (if escalated)
Root cause from diagnosis-report: ${data.diagnosisReference ?? "N/A"}

## PREVIOUS ATTEMPTS (if retry)
| Attempt | Fix Applied | Result |
|:-------:|-------------|--------|
${prevAttempts}

## TSC OUTPUT (diagnostic only -- does NOT replace full re-UAT)
${data.tscOutput}

## TIMESTAMP
${data.timestamp}
`;
}

export function learningReportTemplate(data: LearningReport): string {
  const worked = data.whatWorked.map((w) => `- ${w}`).join("\n");
  const failed = data.whatFailed.map((f) => `- ${f}`).join("\n");
  const surprising = data.whatWasSurprising.map((s) => `- ${s}`).join("\n");
  const different = data.whatToDoDifferently.map((d) => `- ${d}`).join("\n");
  return `# Learning Report: ${data.storyId}

## WHAT WORKED
${worked}

## WHAT FAILED
${failed}

## WHAT WAS SURPRISING
${surprising}

## WHAT TO DO DIFFERENTLY
${different}

## ELI5 SUMMARY
${data.eli5Summary}

## TIMESTAMP
${data.timestamp}
`;
}

export function roleReportTemplate(data: RoleReport): string {
  const findings = data.findings.map((f) => `- ${f}`).join("\n");
  const recommendations = data.recommendations.map((r) => `- ${r}`).join("\n");
  const risks = data.risksIdentified
    .map((r) => `| ${r.risk} | ${r.severity} | ${r.mitigation} |`)
    .join("\n");
  return `# Role Report: ${data.role}

## FINDINGS
${findings}

## RECOMMENDATIONS
${recommendations}

## RISKS
| Risk | Severity | Mitigation |
|------|----------|------------|
${risks}

## TIMESTAMP
${data.timestamp}
`;
}

export function researchReportTemplate(data: ResearchReport): string {
  const keyReqs = data.prdAnalysis.keyRequirements.map((r) => `- ${r}`).join("\n");
  const implItems = data.prdAnalysis.implementationItems.map((i) => `- ${i}`).join("\n");
  const relevantFiles = data.codebaseAnalysis.relevantFiles.map((f) => `- ${f}`).join("\n");
  const patterns = data.codebaseAnalysis.existingPatterns.map((p) => `- ${p}`).join("\n");
  const deps = data.codebaseAnalysis.dependencies.map((d) => `- ${d}`).join("\n");
  const proven = data.designEvidence.provenPatterns.map((p) => `- ${p}`).join("\n");
  const anti = data.designEvidence.antiPatterns.map((a) => `- ${a}`).join("\n");
  const constraints = data.designEvidence.designConstraints.map((c) => `- ${c}`).join("\n");
  const tiers = data.designEvidence.enforcementTiers.map((t) => `- ${t}`).join("\n");
  const gaps = data.gapsAndRisks.map((g) => `- ${g}`).join("\n");
  return `# Research Report

## PRD ANALYSIS
### Key Requirements
${keyReqs}
### Implementation Items
${implItems}

## CODEBASE ANALYSIS
### Relevant Files
${relevantFiles}
### Existing Patterns
${patterns}
### Dependencies
${deps}

## DESIGN EVIDENCE
### Proven Patterns
${proven}
### Anti-Patterns
${anti}
### Design Constraints
${constraints}
### Enforcement Tiers
${tiers}

## GAPS AND RISKS
${gaps}

## TIMESTAMP
${data.timestamp}
`;
}

export function critiqueReportTemplate(data: CritiqueReport): string {
  const strategic = data.strategicIssues
    .map((i) => `| ${i.index} | ${i.issue} | ${i.severity} | ${i.recommendation} |`)
    .join("\n");
  const tactical = data.tacticalIssues
    .map((i) => `| ${i.index} | ${i.issue} | ${i.severity} | ${i.recommendation} |`)
    .join("\n");
  const checks = data.structuralChecks;
  return `# Critique Report (Round ${data.round})

## STRATEGIC ISSUES
| # | Issue | Severity | Recommendation |
|---|-------|----------|----------------|
${strategic}

## TACTICAL ISSUES
| # | Issue | Severity | Recommendation |
|---|-------|----------|----------------|
${tactical}

## STRUCTURAL CHECKS
- Out of Scope exists: ${checks.outOfScopeExists ? "YES" : "NO"}
- Required tooling exists: ${checks.requiredToolingExists ? "YES" : "NO"}
- Traceability complete: ${checks.traceabilityComplete ? "YES" : "NO"}
- All decisions have rationale: ${checks.allDecisionsHaveRationale ? "YES" : "NO"}
- Contracts are exact: ${checks.contractsAreExact ? "YES" : "NO"}

## OVERALL ASSESSMENT
${data.overallAssessment}

## TIMESTAMP
${data.timestamp}
`;
}

export function consolidatedReportTemplate(data: ConsolidatedReport): string {
  const progress = data.progress
    .map((p) => `| ${p.status} | ${p.count} |`)
    .join("\n");
  const storyStatus = data.storyStatus
    .map((s) => `| ${s.id} | ${s.title} | ${s.status} | ${s.attempts} | ${s.committed} | ${s.verdict} |`)
    .join("\n");
  const verification = data.verificationSummary
    .map((v) => `| ${v.check} | ${v.result} |`)
    .join("\n");
  const fixLog = data.fixLog
    .map((f) => `| ${f.story} | ${f.attempt} | ${f.issue} | ${f.fix} |`)
    .join("\n");
  return `# Consolidated Report

## PROGRESS
| Status | Count |
|--------|:-----:|
${progress}

## STORY STATUS
| ID | Title | Status | Attempts | Committed | Verdict |
|----|-------|--------|:--------:|:---------:|---------|
${storyStatus}

## VERIFICATION SUMMARY
| Check | Result |
|-------|--------|
${verification}

## FIX LOG
| Story | Attempt | Issue | Fix |
|-------|:-------:|-------|-----|
${fixLog}

## ELI5 SUMMARY
${data.eli5Summary}

## TIMESTAMP
${data.timestamp}
`;
}

export function retrospectiveReportTemplate(data: RetrospectiveReport): string {
  const learnings = data.synthesizedLearnings.map((l) => `- ${l}`).join("\n");
  const patterns = data.patternsDetected
    .map((p) => `| ${p.pattern} | ${p.frequency} | ${p.stories.join(", ")} | ${p.action} |`)
    .join("\n");
  const mistakes = data.mistakesToAvoid.map((m) => `- ${m}`).join("\n");
  const worked = data.thingsThatWorkedWell.map((w) => `- ${w}`).join("\n");
  const insights = data.keyInsightsForMemory.map((i) => `- ${i}`).join("\n");
  return `# Retrospective Report

## SYNTHESIZED LEARNINGS
${learnings}

## PATTERNS DETECTED
| Pattern | Frequency | Stories | Action |
|---------|:---------:|---------|--------|
${patterns}

## MISTAKES TO AVOID
${mistakes}

## THINGS THAT WORKED WELL
${worked}

## KEY INSIGHTS FOR MEMORY
${insights}

## TIMESTAMP
${data.timestamp}
`;
}
