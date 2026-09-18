import type { HspErrorCode, HspProtocolError } from "@handshake/hsp-contracts";

export const GATEWAY_APPLICATION_ERROR_CODES = [
  "INVALID_CREATE_INPUT",
  "HANDSHAKE_ALREADY_EXISTS",
  "HANDSHAKE_NOT_FOUND",
  "ROUTE_MISMATCH",
  "COMMUNITY_SCOPE_VIOLATION",
  "PARTICIPANT_SCOPE_VIOLATION",
  "UNSUPPORTED_MESSAGE_TYPE",
  "DOMAIN_COMMAND_REJECTED",
] as const;

export type GatewayApplicationErrorCode = (typeof GATEWAY_APPLICATION_ERROR_CODES)[number];
export type ApplicationErrorCode = GatewayApplicationErrorCode | HspErrorCode;

export interface ApplicationErrorInput {
  readonly code: ApplicationErrorCode;
  readonly message: string;
  readonly retryable?: boolean;
  readonly messageId?: string;
  readonly handshakeId?: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly cause?: unknown;
}

export interface ApplicationErrorBody {
  readonly code: ApplicationErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly message_id?: string;
  readonly handshake_id?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

/** A stable error boundary suitable for later HTTP/RPC adapters. */
export class ApplicationError extends Error {
  public readonly code: ApplicationErrorCode;
  public readonly retryable: boolean;
  public readonly messageId: string | undefined;
  public readonly handshakeId: string | undefined;
  public readonly details: Readonly<Record<string, unknown>> | undefined;

  public constructor(input: ApplicationErrorInput) {
    super(input.message, input.cause === undefined ? undefined : { cause: input.cause });
    this.name = "ApplicationError";
    this.code = input.code;
    this.retryable = input.retryable ?? false;
    this.messageId = input.messageId;
    this.handshakeId = input.handshakeId;
    this.details = input.details;
  }

  public static fromHsp(error: HspProtocolError): ApplicationError {
    return new ApplicationError({
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(error.messageId === undefined ? {} : { messageId: error.messageId }),
      ...(error.handshakeId === undefined ? {} : { handshakeId: error.handshakeId }),
      ...(error.details === undefined ? {} : { details: error.details }),
      cause: error,
    });
  }

  public toJSON(): ApplicationErrorBody {
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
