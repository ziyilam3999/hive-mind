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
