/**
 * Error taxonomy. Every one of these renders to the player as
 * "THE FORGE RESISTS…" — the distinctions exist for retry policy and
 * the debug route, never for the cinematic.
 */
export class MeshyError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
  /** Whether the orchestrator should try again. */
  get retryable(): boolean {
    return false;
  }
}

/** 401/403 — fail fast, never retry. A bad key will not fix itself. */
export class MeshyAuthError extends MeshyError {}

/** 400 — our payload is wrong. Retrying sends the same wrong payload. */
export class MeshyValidationError extends MeshyError {}

/** 429 — back off and retry. */
export class MeshyRateLimitError extends MeshyError {
  override get retryable() {
    return true;
  }
  constructor(
    message: string,
    status: number | undefined,
    body: unknown,
    readonly retryAfterMs: number,
  ) {
    super(message, status, body);
  }
}

/** 5xx or network fault. */
export class MeshyServerError extends MeshyError {
  override get retryable() {
    return true;
  }
}

/** Task reached status FAILED. */
export class MeshyTaskFailed extends MeshyError {
  override get retryable() {
    return true;
  }
}

/** Stream stalled past the deadline. */
export class MeshyTimeout extends MeshyError {
  override get retryable() {
    return true;
  }
}

/** Below CREDIT_FLOOR — refuse before spending. */
export class InsufficientCredits extends MeshyError {}
