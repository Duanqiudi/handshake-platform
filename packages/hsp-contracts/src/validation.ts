import { Ajv, type AnySchema, type ErrorObject, type ValidateFunction } from "ajv";
import addFormatsModule, { type FormatsPlugin } from "ajv-formats";
import type { HspErrorBody } from "./errors.js";
import { HspProtocolError } from "./errors.js";
import type { HspMessage } from "./messages.js";
import type { AgentCard, AuthorizationReceipt, ClaimEnvelope, IntentCapsule } from "./models.js";
import { checkProtocolCompatibility } from "./protocol.js";
import {
  agentCardSchema,
  authorizationReceiptSchema,
  claimEnvelopeSchema,
  hspCommonSchema,
  hspErrorSchema,
  hspMessageSchema,
  intentCapsuleSchema,
} from "./schemas.js";

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: HspErrorBody };

export interface MessageValidationOptions {
  /** Reject messages whose expires_at is at or before this instant. */
  readonly now?: Date;
}

const addFormats = addFormatsModule as unknown as FormatsPlugin;

const ajv = new Ajv({
  allErrors: true,
  allowUnionTypes: true,
  strict: true,
});
addFormats(ajv);

ajv.addSchema(hspCommonSchema as AnySchema);
ajv.addSchema(authorizationReceiptSchema as AnySchema);
ajv.addSchema(claimEnvelopeSchema as AnySchema);

const validateAgentCardSchema = ajv.compile<AgentCard>(agentCardSchema as AnySchema);
const validateAuthorizationReceiptSchema = ajv.compile<AuthorizationReceipt>(
  authorizationReceiptSchema as AnySchema,
);
const validateClaimEnvelopeSchema = ajv.compile<ClaimEnvelope>(claimEnvelopeSchema as AnySchema);
const validateIntentCapsuleSchema = ajv.compile<IntentCapsule>(intentCapsuleSchema as AnySchema);
const validateMessageSchema = ajv.compile<HspMessage>(hspMessageSchema as AnySchema);
const validateErrorSchema = ajv.compile<HspErrorBody>(hspErrorSchema as AnySchema);

function validationDetails(errors: ErrorObject[] | null | undefined): Record<string, unknown> {
  return {
    violations: (errors ?? []).map((error) => ({
      path: error.instancePath,
      keyword: error.keyword,
      message: error.message ?? "Schema validation failed",
      params: error.params,
    })),
  };
}

function invalidSchema(errors: ErrorObject[] | null | undefined): ValidationResult<never> {
  return {
    ok: false,
    error: {
      code: "INVALID_SCHEMA",
      message: "Value does not conform to the HSP 0.2 contract",
      retryable: false,
      details: validationDetails(errors),
    },
  };
}

function runSchema<T>(validator: ValidateFunction<T>, value: unknown): ValidationResult<T> {
  return validator(value) ? { ok: true, value } : invalidSchema(validator.errors);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function temporalError(field: string): ValidationResult<never> {
  return {
    ok: false,
    error: {
      code: "INVALID_SCHEMA",
      message: "HSP temporal window is invalid",
      retryable: false,
      details: { field },
    },
  };
}

function validateTemporalWindow(value: {
  readonly issued_at: string;
  readonly expires_at: string;
}): ValidationResult<true> {
  if (Date.parse(value.expires_at) <= Date.parse(value.issued_at)) {
    return temporalError("expires_at");
  }
  return { ok: true, value: true };
}

export function validateAgentCard(value: unknown): ValidationResult<AgentCard> {
  const result = runSchema(validateAgentCardSchema, value);
  if (!result.ok) {
    return result;
  }
  const temporal = validateTemporalWindow(result.value);
  return temporal.ok ? result : temporal;
}

export function validateAuthorizationReceipt(
  value: unknown,
): ValidationResult<AuthorizationReceipt> {
  const result = runSchema(validateAuthorizationReceiptSchema, value);
  if (!result.ok) {
    return result;
  }
  const temporal = validateTemporalWindow(result.value);
  return temporal.ok ? result : temporal;
}

export function validateClaimEnvelope(value: unknown): ValidationResult<ClaimEnvelope> {
  const result = runSchema(validateClaimEnvelopeSchema, value);
  if (!result.ok) {
    return result;
  }

  const { authorization_receipt: authorization } = result.value;
  const temporal = validateTemporalWindow(authorization);
  if (!temporal.ok) {
    return temporal;
  }

  if (authorization.revoked) {
    return {
      ok: false,
      error: {
        code: "PERMISSION_DENIED",
        message: "Claim authorization has been revoked",
        retryable: false,
        details: { receipt_id: authorization.receipt_id },
      },
    };
  }

  if (
    authorization.purpose !== result.value.purpose ||
    authorization.scene !== result.value.scene ||
    authorization.recipient_endpoint_id !== result.value.recipient_endpoint_id
  ) {
    return {
      ok: false,
      error: {
        code: "PERMISSION_DENIED",
        message: "Claim authorization scope does not match the envelope",
        retryable: false,
        details: { receipt_id: authorization.receipt_id },
      },
    };
  }

  const purposeMismatch = result.value.claims.find(
    (claim) => !claim.purposes.includes(result.value.purpose),
  );
  if (purposeMismatch !== undefined) {
    return {
      ok: false,
      error: {
        code: "PERMISSION_DENIED",
        message: "Claim purpose does not authorize the envelope purpose",
        retryable: false,
        details: {
          claim_id: purposeMismatch.claim_id,
          required_purpose: result.value.purpose,
        },
      },
    };
  }

  const audienceMismatch = result.value.claims.find(
    (claim) => !claim.audiences.includes(result.value.recipient_endpoint_id),
  );
  if (audienceMismatch !== undefined) {
    return {
      ok: false,
      error: {
        code: "PERMISSION_DENIED",
        message: "Claim audience does not authorize the envelope recipient",
        retryable: false,
        details: {
          claim_id: audienceMismatch.claim_id,
          required_audience: result.value.recipient_endpoint_id,
        },
      },
    };
  }

  const prohibitedClaim = result.value.claims.find((claim) => claim.sensitivity === "prohibited");
  if (prohibitedClaim !== undefined) {
    return {
      ok: false,
      error: {
        code: "POLICY_BLOCKED",
        message: "Prohibited claims cannot be placed on the HSP wire",
        retryable: false,
        details: { claim_id: prohibitedClaim.claim_id },
      },
    };
  }

  return result;
}

export function validateIntentCapsule(value: unknown): ValidationResult<IntentCapsule> {
  const result = runSchema(validateIntentCapsuleSchema, value);
  if (!result.ok) {
    return result;
  }
  if (Date.parse(result.value.expires_at) <= Date.parse(result.value.created_at)) {
    return temporalError("expires_at");
  }
  return result;
}

export function validateHspMessage(
  value: unknown,
  options: MessageValidationOptions = {},
): ValidationResult<HspMessage> {
  if (isRecord(value) && typeof value.protocol_version === "string") {
    const compatibility = checkProtocolCompatibility(value.protocol_version);
    if (!compatibility.compatible) {
      return {
        ok: false,
        error: {
          code: "UNSUPPORTED_PROTOCOL_VERSION",
          message: `Unsupported HSP protocol version: ${value.protocol_version}`,
          retryable: false,
          details: { reason: compatibility.reason },
        },
      };
    }
  }

  const result = runSchema(validateMessageSchema, value);
  if (!result.ok) {
    return result;
  }

  const temporal = validateTemporalWindow(result.value);
  if (!temporal.ok) {
    return temporal;
  }

  if (options.now !== undefined && Date.parse(result.value.expires_at) <= options.now.getTime()) {
    return {
      ok: false,
      error: {
        code: "MESSAGE_EXPIRED",
        message: "HSP message TTL has expired",
        retryable: false,
        message_id: result.value.message_id,
        handshake_id: result.value.handshake_id,
        details: { expires_at: result.value.expires_at },
      },
    };
  }

  if (result.value.type === "CLAIM_RESPONSE" && result.value.payload.claim_envelope !== undefined) {
    const claimResult = validateClaimEnvelope(result.value.payload.claim_envelope);
    if (!claimResult.ok) {
      return claimResult;
    }
    if (claimResult.value.recipient_endpoint_id !== result.value.recipient_endpoint_id) {
      return {
        ok: false,
        error: {
          code: "PERMISSION_DENIED",
          message: "Claim recipient does not match the message recipient",
          retryable: false,
          message_id: result.value.message_id,
          handshake_id: result.value.handshake_id,
        },
      };
    }

    const authorization = claimResult.value.authorization_receipt;
    if (
      Date.parse(authorization.issued_at) > Date.parse(result.value.issued_at) ||
      Date.parse(authorization.expires_at) < Date.parse(result.value.expires_at)
    ) {
      return {
        ok: false,
        error: {
          code: "PERMISSION_DENIED",
          message: "Claim authorization window does not cover the message window",
          retryable: false,
          message_id: result.value.message_id,
          handshake_id: result.value.handshake_id,
          details: {
            receipt_id: authorization.receipt_id,
            authorization_issued_at: authorization.issued_at,
            authorization_expires_at: authorization.expires_at,
            message_issued_at: result.value.issued_at,
            message_expires_at: result.value.expires_at,
          },
        },
      };
    }
  }

  return result;
}

export function validateHspError(value: unknown): ValidationResult<HspErrorBody> {
  return runSchema(validateErrorSchema, value);
}

export function assertHspMessage(value: unknown, options?: MessageValidationOptions): HspMessage {
  const result = validateHspMessage(value, options);
  if (!result.ok) {
    throw new HspProtocolError(result.error);
  }
  return result.value;
}
