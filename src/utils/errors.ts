/**
 * User-facing errors (bad args, missing files, invalid config).
 * Distinguishes intentional error conditions from unexpected bugs.
 */
export class HiveMindError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HiveMindError";
  }
}

export type BuildPipelineErrorKind = "existence" | "typecheck";

export class BuildPipelineError extends HiveMindError {
  readonly kind: BuildPipelineErrorKind;
  constructor(kind: BuildPipelineErrorKind, message: string) {
    super(message);
    this.name = "BuildPipelineError";
    this.kind = kind;
  }
}
