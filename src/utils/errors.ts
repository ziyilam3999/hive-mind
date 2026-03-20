/**
 * User-facing errors (bad args, missing files, invalid config).
 * Distinguishes intentional error conditions from unexpected bugs.
 */
export class HiveMindError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "HiveMindError";
    this.exitCode = exitCode;
  }
}
