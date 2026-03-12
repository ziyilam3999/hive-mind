/**
 * Write BEL character to stdout to alert human at checkpoints.
 * Suppressed in silent mode (--silent flag, CI environments).
 */
export function notifyCheckpoint(silent: boolean): void {
  if (!silent) {
    process.stdout.write("\x07");
  }
}
