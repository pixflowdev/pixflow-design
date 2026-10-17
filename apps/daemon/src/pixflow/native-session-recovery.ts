/** Only adapters that have not submitted a turn may report this recoverable error. */
export class NativeSessionMissingError extends Error {
  readonly code = 'PIXFLOW_NATIVE_SESSION_MISSING';
  constructor() { super('The saved native agent session is no longer available.'); }
}

/** A missing session is distinct from an uncertain delivery, timeout or permission error. */
export function isNativeSessionMissing(error: unknown): error is NativeSessionMissingError {
  return error instanceof NativeSessionMissingError;
}
