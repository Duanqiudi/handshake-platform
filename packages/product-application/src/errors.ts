export type ProductErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "OWNER_NOT_FOUND"
  | "CONNECTION_NOT_FOUND"
  | "CAPSULE_NOT_FOUND"
  | "INTENT_NOT_FOUND"
  | "CANDIDATE_NOT_FOUND"
  | "HANDSHAKE_NOT_FOUND"
  | "QUESTION_NOT_FOUND"
  | "PROJECT_NOT_FOUND"
  | "RECEIPT_NOT_FOUND"
  | "INVALID_INPUT"
  | "INVALID_STATE"
  | "FORBIDDEN"
  | "CONFLICT"
  | "DISCLOSURE_NOT_AUTHORIZED";

export class ProductError extends Error {
  public constructor(
    public readonly code: ProductErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "ProductError";
  }

  public toJSON(): Readonly<Record<string, unknown>> {
    return {
      code: this.code,
      message: this.message,
      retryable: this.status >= 500,
      ...(this.details === undefined ? {} : { details: this.details }),
    };
  }
}
