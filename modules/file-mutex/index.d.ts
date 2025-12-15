// index.d.ts
/**
 * File-based mutex with soft/hard locking using native file locking.
 */

/**
 * Error thrown when file mtime does not match expected value (context is stale).
 */
export class StaleContext extends Error {
  constructor();
}

/**
 * FileMutex provides file-based locking using native OS primitives.
 * - `hardLock`: exclusive lock + update mtime
 * - `softLock`: shared lock + read mtime
 * - `freeLock`: unlock and close
 * - `testTime`: check mtime
 */
export class FileMutex {
  /**
   * Creates a new FileMutex for the given file path.
   * @param path - Path to the file used as a lock
   */
  constructor(path: string);

  /**
   * Acquires an exclusive lock:
   * - Opens file
   * - Locks exclusively
   * - Checks if mtime changed (throws StaleContext if yes)
   * - Updates mtime to current time
   */
  hardLock(): void;

  /**
   * Acquires a shared lock:
   * - Opens file
   * - Locks shared
   * - Reads current mtime
   */
  softLock(): void;

  /**
   * Unlocks and closes the file.
   * Safe to call multiple times.
   */
  freeLock(): void;

  /**
   * Checks if the file mtime is not changed.
   */
  testTime(): boolean;
}
