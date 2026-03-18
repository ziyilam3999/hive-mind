/**
 * Directories used by the pipeline, split by purpose:
 * - workingDir: project-specific pipeline artifacts (specs, plans, reports)
 * - knowledgeDir: shared knowledge (memory.md, knowledge-base/, constitution.md)
 * - labDir: throwaway test/experiment output (smoke tests, tmp files)
 */
export interface PipelineDirs {
  workingDir: string;
  knowledgeDir: string;
  labDir: string;
}
