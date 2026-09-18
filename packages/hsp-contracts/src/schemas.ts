import agentCardSchema from "../schemas/agent-card.schema.json" with { type: "json" };
import authorizationReceiptSchema from "../schemas/authorization-receipt.schema.json" with {
  type: "json",
};
import claimEnvelopeSchema from "../schemas/claim-envelope.schema.json" with { type: "json" };
import hspCommonSchema from "../schemas/hsp-common.schema.json" with { type: "json" };
import hspErrorSchema from "../schemas/hsp-error.schema.json" with { type: "json" };
import hspMessageSchema from "../schemas/hsp-message.schema.json" with { type: "json" };
import intentCapsuleSchema from "../schemas/intent-capsule.schema.json" with { type: "json" };

export {
  agentCardSchema,
  authorizationReceiptSchema,
  claimEnvelopeSchema,
  hspCommonSchema,
  hspErrorSchema,
  hspMessageSchema,
  intentCapsuleSchema,
};

export const HSP_SCHEMAS = [
  hspCommonSchema,
  authorizationReceiptSchema,
  claimEnvelopeSchema,
  agentCardSchema,
  intentCapsuleSchema,
  hspMessageSchema,
  hspErrorSchema,
] as const;
