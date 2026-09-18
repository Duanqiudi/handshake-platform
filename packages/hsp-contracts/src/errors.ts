export const HSP_ERROR_CODES = [
  "INVALID_SCHEMA",
  "UNSUPPORTED_PROTOCOL_VERSION",
  "INVALID_SIGNATURE",
  "MESSAGE_EXPIRED",
  "REPLAY_DETECTED",
  "INVALID_STATE",
  "CONCURRENT_MODIFICATION",
  "BUDGET_EXHAUSTED",
  "POLICY_BLOCKED",
  "OWNER_AUTHORIZATION_REQUIRED",
  "ENDPOINT_UNAVAILABLE",
  "AUTHENTICATION_FAILED",
  "PERMISSION_DENIED",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
] as const;

export type HspErrorCode = (typeof HSP_ERROR_CODES)[number];

export interface HspErrorBody {
  readonly code: HspErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly message_id?: string;
  readonly handshake_id?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export class HspProtocolError extends Error {
  readonly code: HspErrorCode;
  readonly retryable: boolean;
  readonly messageId: string | undefined;
  readonly handshakeId: string | undefined;
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(error: HspErrorBody, options?: ErrorOptions) {
    super(error.message, options);
    this.name = "HspProtocolError";
    this.code = error.code;
    this.retryable = error.retryable;
    this.messageId = error.message_id;
    this.handshakeId = error.handshake_id;
    this.details = error.details;
  }

  toJSON(): HspErrorBody {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.messageId === undefined ? {} : { message_id: this.messageId }),
      ...(this.handshakeId === undefined ? {} : { handshake_id: this.handshakeId }),
      ...(this.details === undefined ? {} : { details: this.details }),
    };
  }
}
