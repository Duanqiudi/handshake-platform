import { canRevealContacts } from "./consent.js";
import {
  AI_PROVIDERS,
  type AiConnection,
  CAPSULE_FIELD_NAMES,
  type Candidate,
  type CapsuleFields,
  type Claim,
  CONNECTION_CAPABILITIES,
  CONNECTION_SOURCE_MODES,
  type Consent,
  type HandshakeDisclosureContent,
  type MatchRecommendation,
  type MemoryCapsule,
  type Owner,
  type PortfolioProject,
  PRODUCT_HANDSHAKE_STATUSES,
  type PrivacyReceipt,
  type ProductHandshake,
  type ProductQuestion,
  type ProjectCheckIn,
  type ProjectIntent,
  TEAMUP_PURPOSE,
  type ValidationIssue,
  type ValidationResult,
} from "./types.js";

type UnknownRecord = Record<string, unknown>;

export function validateOwner(value: unknown): ValidationResult<Owner> {
  return validateEntity(
    value,
    ["id", "communityId", "displayName", "contact", "status", "createdAt"],
    (object, issues) => {
      requiredStrings(object, ["id", "communityId", "displayName"], "", issues);
      oneOf(object.status, ["active", "suspended", "deleted"], "status", issues);
      isoDateTime(object.createdAt, "createdAt", issues);
      validateContact(object.contact, "contact", issues);
    },
  );
}

export function validateAiConnection(value: unknown): ValidationResult<AiConnection> {
  return validateEntity(
    value,
    [
      "id",
      "ownerId",
      "provider",
      "label",
      "sourceMode",
      "capabilities",
      "status",
      "isDemo",
      "createdAt",
      "updatedAt",
    ],
    (object, issues) => {
      requiredStrings(object, ["id", "ownerId", "label"], "", issues);
      oneOf(object.provider, AI_PROVIDERS, "provider", issues);
      oneOf(object.sourceMode, CONNECTION_SOURCE_MODES, "sourceMode", issues);
      stringArray(object.capabilities, "capabilities", issues, {
        allowed: CONNECTION_CAPABILITIES,
        allowEmpty: false,
      });
      oneOf(object.status, ["active", "disconnected"], "status", issues);
      booleanValue(object.isDemo, "isDemo", issues);
      isoDateTime(object.createdAt, "createdAt", issues);
      isoDateTime(object.updatedAt, "updatedAt", issues);

      if (
        object.sourceMode === "mcp" &&
        Array.isArray(object.capabilities) &&
        !object.capabilities.includes("interactive_tool")
      ) {
        add(
          issues,
          "capabilities",
          "invariant_violation",
          "MCP connections must declare interactive_tool.",
        );
      }
    },
  );
}

export function validateCapsuleFields(value: unknown): ValidationResult<CapsuleFields> {
  return validateEntity(value, CAPSULE_FIELD_NAMES, (object, issues) => {
    optionalNonBlankString(object.goal, "goal", issues);
    optionalStringArray(object.offers, "offers", issues);
    optionalStringArray(object.seeks, "seeks", issues);
    optionalNonBlankString(object.availability, "availability", issues);
    optionalStringArray(object.collaborationStyles, "collaborationStyles", issues);
    optionalStringArray(object.projectInterests, "projectInterests", issues);
    optionalNonBlankString(object.location, "location", issues);
    optionalStringArray(object.languages, "languages", issues);
  });
}

export function validateMemoryCapsule(value: unknown): ValidationResult<MemoryCapsule> {
  return validateEntity(
    value,
    [
      "id",
      "ownerId",
      "connectionId",
      "sourceProvider",
      "sourceMode",
      "status",
      "purpose",
      "fields",
      "approvedFields",
      "privateCategories",
      "expiresAt",
    ],
    (object, issues) => {
      requiredStrings(object, ["id", "ownerId", "connectionId", "sourceProvider"], "", issues);
      oneOf(object.sourceMode, CONNECTION_SOURCE_MODES, "sourceMode", issues);
      oneOf(object.status, ["draft", "published", "revoked"], "status", issues);
      literal(object.purpose, TEAMUP_PURPOSE, "purpose", issues);
      merge(issues, "fields", validateCapsuleFields(object.fields));
      stringArray(object.approvedFields, "approvedFields", issues, {
        allowed: CAPSULE_FIELD_NAMES,
        allowEmpty: object.status !== "published",
      });
      stringArray(object.privateCategories, "privateCategories", issues, { allowEmpty: true });
      isoDateTime(object.expiresAt, "expiresAt", issues);

      if (
        object.status === "published" &&
        isRecord(object.fields) &&
        Array.isArray(object.approvedFields)
      ) {
        const fieldKeys = Object.keys(object.fields).sort();
        const approvedKeys = [...new Set(object.approvedFields)].sort();
        if (!sameStringArray(fieldKeys, approvedKeys)) {
          add(
            issues,
            "approvedFields",
            "invariant_violation",
            "Published Capsule fields must exactly match approvedFields.",
          );
        }
      }
    },
  );
}

export function validateProjectIntent(value: unknown): ValidationResult<ProjectIntent> {
  return validateEntity(
    value,
    [
      "id",
      "ownerId",
      "communityId",
      "capsuleId",
      "startsOn",
      "title",
      "goal",
      "projectInterests",
      "offers",
      "seeks",
      "availability",
      "minimumPartnerWeeklyHours",
      "collaborationStyles",
      "locationMode",
      "location",
      "requiredLanguages",
      "status",
      "createdAt",
      "expiresAt",
    ],
    (object, issues) => {
      requiredStrings(
        object,
        ["id", "ownerId", "communityId", "capsuleId", "title", "goal"],
        "",
        issues,
      );
      calendarDate(object.startsOn, "startsOn", issues);
      stringArray(object.projectInterests, "projectInterests", issues, { allowEmpty: false });
      stringArray(object.offers, "offers", issues, { allowEmpty: false });
      stringArray(object.seeks, "seeks", issues, { allowEmpty: false });
      validateAvailability(object.availability, "availability", issues);
      optionalPositiveNumber(object.minimumPartnerWeeklyHours, "minimumPartnerWeeklyHours", issues);
      stringArray(object.collaborationStyles, "collaborationStyles", issues, { allowEmpty: false });
      oneOf(object.locationMode, ["remote", "hybrid", "onsite"], "locationMode", issues);
      optionalNonBlankString(object.location, "location", issues);
      stringArray(object.requiredLanguages, "requiredLanguages", issues, { allowEmpty: false });
      oneOf(object.status, ["active", "paused"], "status", issues);
      isoDateTime(object.createdAt, "createdAt", issues);
      isoDateTime(object.expiresAt, "expiresAt", issues);
      laterThan(object.createdAt, object.expiresAt, "expiresAt", issues);

      if (
        (object.locationMode === "hybrid" || object.locationMode === "onsite") &&
        !isNonBlank(object.location)
      ) {
        add(issues, "location", "missing_field", "Hybrid and onsite intents require a location.");
      }
    },
  );
}

export function validateCandidate(value: unknown): ValidationResult<Candidate> {
  return validateEntity(
    value,
    [
      "ownerId",
      "displayName",
      "provider",
      "connectionMode",
      "capsule",
      "recommendation",
      "reasons",
      "gaps",
      "conflicts",
      "matchedOffers",
      "matchedSeeks",
      "scheduleCompatible",
    ],
    (object, issues) => {
      requiredStrings(object, ["ownerId", "displayName"], "", issues);
      oneOf(object.provider, AI_PROVIDERS, "provider", issues);
      oneOf(object.connectionMode, CONNECTION_SOURCE_MODES, "connectionMode", issues);
      merge(issues, "capsule", validateMemoryCapsule(object.capsule));
      oneOf(
        object.recommendation,
        ["continue", "needs_info", "conflict"],
        "recommendation",
        issues,
      );
      for (const field of [
        "reasons",
        "gaps",
        "conflicts",
        "matchedOffers",
        "matchedSeeks",
      ] as const) {
        stringArray(object[field], field, issues, { allowEmpty: true });
      }
      booleanValue(object.scheduleCompatible, "scheduleCompatible", issues);
    },
  );
}

export function validateProductQuestion(value: unknown): ValidationResult<ProductQuestion> {
  return validateEntity(
    value,
    [
      "id",
      "handshakeId",
      "fromOwnerId",
      "toOwnerId",
      "round",
      "prompt",
      "requestedFields",
      "required",
      "purpose",
      "status",
      "createdAt",
      "expiresAt",
    ],
    (object, issues) => {
      requiredStrings(
        object,
        ["id", "handshakeId", "fromOwnerId", "toOwnerId", "prompt"],
        "",
        issues,
      );
      integerBetween(object.round, 1, 3, "round", issues);
      stringArray(object.requestedFields, "requestedFields", issues, {
        allowed: CAPSULE_FIELD_NAMES,
        allowEmpty: false,
        maximum: 3,
      });
      booleanValue(object.required, "required", issues);
      literal(object.purpose, TEAMUP_PURPOSE, "purpose", issues);
      oneOf(object.status, ["pending", "answered", "declined", "expired"], "status", issues);
      isoDateTime(object.createdAt, "createdAt", issues);
      isoDateTime(object.expiresAt, "expiresAt", issues);
      laterThan(object.createdAt, object.expiresAt, "expiresAt", issues);
      if (object.fromOwnerId === object.toOwnerId && isNonBlank(object.fromOwnerId)) {
        add(
          issues,
          "toOwnerId",
          "invariant_violation",
          "A question must be sent to the other owner.",
        );
      }
    },
  );
}

export function validateClaim(value: unknown): ValidationResult<Claim> {
  return validateEntity(
    value,
    [
      "id",
      "handshakeId",
      "questionId",
      "ownerId",
      "recipientOwnerId",
      "sourceConnectionId",
      "predicate",
      "value",
      "purpose",
      "approvedByOwner",
      "createdAt",
      "expiresAt",
    ],
    (object, issues) => {
      requiredStrings(
        object,
        ["id", "handshakeId", "questionId", "ownerId", "recipientOwnerId", "sourceConnectionId"],
        "",
        issues,
      );
      oneOf(object.predicate, CAPSULE_FIELD_NAMES, "predicate", issues);
      claimValue(object.value, "value", issues);
      literal(object.purpose, TEAMUP_PURPOSE, "purpose", issues);
      literal(object.approvedByOwner, true, "approvedByOwner", issues);
      isoDateTime(object.createdAt, "createdAt", issues);
      isoDateTime(object.expiresAt, "expiresAt", issues);
      laterThan(object.createdAt, object.expiresAt, "expiresAt", issues);
      if (object.ownerId === object.recipientOwnerId && isNonBlank(object.ownerId)) {
        add(
          issues,
          "recipientOwnerId",
          "invariant_violation",
          "A Claim must target the other owner.",
        );
      }
    },
  );
}

export function validateMatchRecommendation(value: unknown): ValidationResult<MatchRecommendation> {
  return validateEntity(
    value,
    ["ownerId", "connectionId", "recommendation", "reasons", "gaps", "createdAt"],
    (object, issues) => {
      requiredStrings(object, ["ownerId", "connectionId"], "", issues);
      oneOf(
        object.recommendation,
        ["continue", "needs_info", "conflict"],
        "recommendation",
        issues,
      );
      stringArray(object.reasons, "reasons", issues, { allowEmpty: true });
      stringArray(object.gaps, "gaps", issues, { allowEmpty: true });
      isoDateTime(object.createdAt, "createdAt", issues);
    },
  );
}

export function validateConsent(value: unknown): ValidationResult<Consent> {
  return validateEntity(
    value,
    ["ownerId", "decision", "consentVersion", "decidedAt"],
    (object, issues) => {
      requiredStrings(object, ["ownerId", "consentVersion"], "", issues);
      oneOf(object.decision, ["continue", "decline", "needs_info"], "decision", issues);
      isoDateTime(object.decidedAt, "decidedAt", issues);
    },
  );
}

export const validateOwnerDecision = validateConsent;

export function validateHandshakeDisclosureContent(
  value: unknown,
): ValidationResult<HandshakeDisclosureContent> {
  return validateEntity(
    value,
    ["handshakeId", "participantOwnerIds", "capsules", "claims", "recommendations"],
    (object, issues) => {
      nonBlankString(object.handshakeId, "handshakeId", issues);
      participantTuple(object.participantOwnerIds, "participantOwnerIds", issues);
      objectArray(object.capsules, "capsules", issues, (item, path) =>
        validateDisclosureCapsule(item, path, issues),
      );
      objectArray(object.claims, "claims", issues, (item, path) =>
        validateDisclosureClaim(item, path, issues),
      );
      objectArray(object.recommendations, "recommendations", issues, (item, path) =>
        validateDisclosureRecommendation(item, path, issues),
      );
    },
  );
}

export function validateProductHandshake(value: unknown): ValidationResult<ProductHandshake> {
  return validateEntity(
    value,
    [
      "id",
      "communityId",
      "participantOwnerIds",
      "status",
      "questions",
      "claims",
      "recommendations",
      "decisions",
      "disclosureContent",
      "contactReveal",
      "projectId",
      "createdAt",
      "updatedAt",
    ],
    (object, issues) => {
      requiredStrings(object, ["id", "communityId"], "", issues);
      participantTuple(object.participantOwnerIds, "participantOwnerIds", issues);
      oneOf(object.status, PRODUCT_HANDSHAKE_STATUSES, "status", issues);
      validatedArray(object.questions, "questions", issues, validateProductQuestion);
      validatedArray(object.claims, "claims", issues, validateClaim);
      validatedArray(
        object.recommendations,
        "recommendations",
        issues,
        validateMatchRecommendation,
      );
      validatedArray(object.decisions, "decisions", issues, validateConsent);
      merge(
        issues,
        "disclosureContent",
        validateHandshakeDisclosureContent(object.disclosureContent),
      );
      nullableNonBlankString(object.projectId, "projectId", issues);
      isoDateTime(object.createdAt, "createdAt", issues);
      isoDateTime(object.updatedAt, "updatedAt", issues);
      validateContactReveal(object.contactReveal, "contactReveal", issues);

      if (isRecord(object.disclosureContent)) {
        if (object.disclosureContent.handshakeId !== object.id) {
          add(
            issues,
            "disclosureContent.handshakeId",
            "invariant_violation",
            "Disclosure content must belong to this handshake.",
          );
        }
        if (
          Array.isArray(object.participantOwnerIds) &&
          Array.isArray(object.disclosureContent.participantOwnerIds) &&
          !sameStringArray(
            object.participantOwnerIds as string[],
            object.disclosureContent.participantOwnerIds as string[],
          )
        ) {
          add(
            issues,
            "disclosureContent.participantOwnerIds",
            "invariant_violation",
            "Disclosure participants must match the handshake in the same order.",
          );
        }
      }

      if (object.contactReveal !== null && object.contactReveal !== undefined) {
        const guardInput = value as ProductHandshake;
        if (!canRevealContacts(guardInput)) {
          add(
            issues,
            "contactReveal",
            "invariant_violation",
            "Contacts require both owners to continue on the current consent version.",
          );
        }
        if (
          object.status !== "REVEALED" &&
          object.status !== "INTRODUCED" &&
          object.status !== "FEEDBACK_COMPLETE"
        ) {
          add(
            issues,
            "contactReveal",
            "invariant_violation",
            "Contacts may only exist after reveal.",
          );
        }
      }
    },
  );
}

export function validatePrivacyReceipt(value: unknown): ValidationResult<PrivacyReceipt> {
  return validateEntity(
    value,
    [
      "id",
      "ownerId",
      "handshakeId",
      "kind",
      "purpose",
      "recipientOwnerId",
      "subjectDigest",
      "consentVersion",
      "issuedAt",
      "expiresAt",
      "revokedAt",
    ],
    (object, issues) => {
      requiredStrings(object, ["id", "ownerId", "subjectDigest"], "", issues);
      nullableNonBlankString(object.handshakeId, "handshakeId", issues);
      oneOf(object.kind, ["capsule_publish", "claim_disclosure", "contact_reveal"], "kind", issues);
      literal(object.purpose, TEAMUP_PURPOSE, "purpose", issues);
      nullableNonBlankString(object.recipientOwnerId, "recipientOwnerId", issues);
      nullableNonBlankString(object.consentVersion, "consentVersion", issues);
      isoDateTime(object.issuedAt, "issuedAt", issues);
      isoDateTime(object.expiresAt, "expiresAt", issues);
      nullableIsoDateTime(object.revokedAt, "revokedAt", issues);
      laterThan(object.issuedAt, object.expiresAt, "expiresAt", issues);

      if (
        (object.kind === "claim_disclosure" || object.kind === "contact_reveal") &&
        (!isNonBlank(object.handshakeId) ||
          !isNonBlank(object.recipientOwnerId) ||
          !isNonBlank(object.consentVersion))
      ) {
        add(
          issues,
          "kind",
          "invariant_violation",
          "Disclosure receipts require handshake, recipient, and consent version.",
        );
      }
    },
  );
}

export const validateReceipt = validatePrivacyReceipt;

export function validateProjectCheckIn(value: unknown): ValidationResult<ProjectCheckIn> {
  return validateEntity(
    value,
    ["id", "ownerId", "day", "summary", "blockers", "nextStep", "createdAt"],
    (object, issues) => {
      requiredStrings(object, ["id", "ownerId", "summary", "nextStep"], "", issues);
      integerBetween(object.day, 1, 7, "day", issues);
      stringArray(object.blockers, "blockers", issues, { allowEmpty: true });
      isoDateTime(object.createdAt, "createdAt", issues);
    },
  );
}

export function validatePortfolioProject(value: unknown): ValidationResult<PortfolioProject> {
  return validateEntity(
    value,
    [
      "id",
      "handshakeId",
      "participantOwnerIds",
      "title",
      "status",
      "startsAt",
      "endsAt",
      "plan",
      "checkIns",
      "artifacts",
      "feedback",
      "createdAt",
      "updatedAt",
    ],
    (object, issues) => {
      requiredStrings(object, ["id", "handshakeId", "title"], "", issues);
      participantTuple(object.participantOwnerIds, "participantOwnerIds", issues);
      oneOf(object.status, ["active", "completed", "cancelled"], "status", issues);
      calendarDate(object.startsAt, "startsAt", issues);
      calendarDate(object.endsAt, "endsAt", issues);
      validatePlan(object.plan, "plan", issues);
      validatedArray(object.checkIns, "checkIns", issues, validateProjectCheckIn);
      objectArray(object.artifacts, "artifacts", issues, (item, path) =>
        validateArtifact(item, path, issues),
      );
      objectArray(object.feedback, "feedback", issues, (item, path) =>
        validateFeedback(item, path, issues),
      );
      isoDateTime(object.createdAt, "createdAt", issues);
      isoDateTime(object.updatedAt, "updatedAt", issues);

      if (isCalendarDate(object.startsAt) && isCalendarDate(object.endsAt)) {
        const expectedEnd = addCalendarDays(object.startsAt, 6);
        if (object.endsAt !== expectedEnd) {
          add(
            issues,
            "endsAt",
            "invariant_violation",
            "A V1 project must span exactly seven days.",
          );
        }
      }
    },
  );
}

export const validateProject = validatePortfolioProject;

function validateEntity<T>(
  value: unknown,
  allowedKeys: readonly string[],
  validate: (object: UnknownRecord, issues: ValidationIssue[]) => void,
): ValidationResult<T> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return {
      success: false,
      issues: [{ path: "", code: "invalid_type", message: "Expected an object." }],
    };
  }

  exactKeys(value, allowedKeys, "", issues);
  validate(value, issues);
  return issues.length === 0 ? { success: true, data: value as T } : { success: false, issues };
}

function validateContact(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    add(issues, path, "invalid_type", "Contact must be an object.");
    return;
  }
  exactKeys(value, ["kind", "value"], path, issues);
  oneOf(value.kind, ["email", "phone", "wechat"], join(path, "kind"), issues);
  nonBlankString(value.value, join(path, "value"), issues);
}

function validateAvailability(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    add(issues, path, "invalid_type", "Availability must be an object.");
    return;
  }
  exactKeys(value, ["weeklyHours", "timezone", "slots"], path, issues);
  positiveNumber(value.weeklyHours, join(path, "weeklyHours"), issues);
  nonBlankString(value.timezone, join(path, "timezone"), issues);
  stringArray(value.slots, join(path, "slots"), issues, { allowEmpty: true });
}

function validateDisclosureCapsule(
  value: UnknownRecord,
  path: string,
  issues: ValidationIssue[],
): void {
  exactKeys(value, ["ownerId", "capsuleId", "fields"], path, issues);
  nonBlankString(value.ownerId, join(path, "ownerId"), issues);
  nonBlankString(value.capsuleId, join(path, "capsuleId"), issues);
  merge(issues, join(path, "fields"), validateCapsuleFields(value.fields));
}

function validateDisclosureClaim(
  value: UnknownRecord,
  path: string,
  issues: ValidationIssue[],
): void {
  exactKeys(value, ["id", "ownerId", "recipientOwnerId", "predicate", "value"], path, issues);
  requiredStrings(value, ["id", "ownerId", "recipientOwnerId"], path, issues);
  oneOf(value.predicate, CAPSULE_FIELD_NAMES, join(path, "predicate"), issues);
  claimValue(value.value, join(path, "value"), issues);
}

function validateDisclosureRecommendation(
  value: UnknownRecord,
  path: string,
  issues: ValidationIssue[],
): void {
  exactKeys(value, ["ownerId", "recommendation", "reasons", "gaps"], path, issues);
  nonBlankString(value.ownerId, join(path, "ownerId"), issues);
  oneOf(
    value.recommendation,
    ["continue", "needs_info", "conflict"],
    join(path, "recommendation"),
    issues,
  );
  stringArray(value.reasons, join(path, "reasons"), issues, { allowEmpty: true });
  stringArray(value.gaps, join(path, "gaps"), issues, { allowEmpty: true });
}

function validateContactReveal(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value === null) {
    return;
  }
  if (!isRecord(value)) {
    add(issues, path, "invalid_type", "Contact reveal must be null or an object.");
    return;
  }
  exactKeys(value, ["revealedAt", "contacts"], path, issues);
  isoDateTime(value.revealedAt, join(path, "revealedAt"), issues);
  if (!Array.isArray(value.contacts) || value.contacts.length !== 2) {
    add(
      issues,
      join(path, "contacts"),
      "invalid_value",
      "Contact reveal requires exactly two contacts.",
    );
    return;
  }
  for (const [index, contact] of value.contacts.entries()) {
    const itemPath = `${path}.contacts.${index}`;
    if (!isRecord(contact)) {
      add(issues, itemPath, "invalid_type", "Revealed contact must be an object.");
      continue;
    }
    exactKeys(contact, ["ownerId", "kind", "value"], itemPath, issues);
    nonBlankString(contact.ownerId, join(itemPath, "ownerId"), issues);
    oneOf(contact.kind, ["email", "phone", "wechat"], join(itemPath, "kind"), issues);
    nonBlankString(contact.value, join(itemPath, "value"), issues);
  }
}

function validatePlan(value: unknown, path: string, issues: ValidationIssue[]): void {
  objectArray(value, path, issues, (item, itemPath) => {
    exactKeys(item, ["day", "date", "title", "objective", "deliverables"], itemPath, issues);
    integerBetween(item.day, 1, 7, join(itemPath, "day"), issues);
    calendarDate(item.date, join(itemPath, "date"), issues);
    nonBlankString(item.title, join(itemPath, "title"), issues);
    nonBlankString(item.objective, join(itemPath, "objective"), issues);
    stringArray(item.deliverables, join(itemPath, "deliverables"), issues, { allowEmpty: false });
  });

  if (Array.isArray(value) && value.length !== 0 && value.length !== 7) {
    add(issues, path, "invariant_violation", "A populated V1 plan must contain all seven days.");
  }
}

function validateArtifact(value: UnknownRecord, path: string, issues: ValidationIssue[]): void {
  exactKeys(value, ["id", "ownerId", "title", "url", "createdAt"], path, issues);
  requiredStrings(value, ["id", "ownerId", "title"], path, issues);
  httpUrl(value.url, join(path, "url"), issues);
  isoDateTime(value.createdAt, join(path, "createdAt"), issues);
}

function validateFeedback(value: UnknownRecord, path: string, issues: ValidationIssue[]): void {
  exactKeys(
    value,
    ["id", "ownerId", "partnerOwnerId", "summary", "wouldCollaborateAgain", "createdAt"],
    path,
    issues,
  );
  requiredStrings(value, ["id", "ownerId", "partnerOwnerId", "summary"], path, issues);
  booleanValue(value.wouldCollaborateAgain, join(path, "wouldCollaborateAgain"), issues);
  isoDateTime(value.createdAt, join(path, "createdAt"), issues);
}

function exactKeys(
  object: UnknownRecord,
  allowedKeys: readonly string[],
  path: string,
  issues: ValidationIssue[],
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) {
      add(issues, join(path, key), "unknown_field", "Unknown field is not allowed.");
    }
  }
}

function requiredStrings(
  object: UnknownRecord,
  fields: readonly string[],
  path: string,
  issues: ValidationIssue[],
): void {
  for (const field of fields) {
    nonBlankString(object[field], join(path, field), issues);
  }
}

function nonBlankString(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value === undefined) {
    add(issues, path, "missing_field", "Field is required.");
  } else if (!isNonBlank(value)) {
    add(issues, path, "invalid_type", "Expected a non-blank string.");
  }
}

function optionalNonBlankString(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value !== undefined) {
    nonBlankString(value, path, issues);
  }
}

function nullableNonBlankString(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value !== null) {
    nonBlankString(value, path, issues);
  }
}

function oneOf(
  value: unknown,
  allowed: readonly (string | number | boolean)[],
  path: string,
  issues: ValidationIssue[],
): void {
  if (value === undefined) {
    add(issues, path, "missing_field", "Field is required.");
  } else if (!allowed.includes(value as never)) {
    add(issues, path, "invalid_value", `Expected one of: ${allowed.join(", ")}.`);
  }
}

function literal(
  value: unknown,
  expected: string | number | boolean,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value !== expected) {
    add(
      issues,
      path,
      value === undefined ? "missing_field" : "invalid_value",
      `Expected ${String(expected)}.`,
    );
  }
}

function booleanValue(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value === undefined) {
    add(issues, path, "missing_field", "Field is required.");
  } else if (typeof value !== "boolean") {
    add(issues, path, "invalid_type", "Expected a boolean.");
  }
}

interface StringArrayOptions {
  readonly allowEmpty: boolean;
  readonly allowed?: readonly string[];
  readonly maximum?: number;
}

function stringArray(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  options: StringArrayOptions,
): void {
  if (!Array.isArray(value)) {
    add(
      issues,
      path,
      value === undefined ? "missing_field" : "invalid_type",
      "Expected an array of strings.",
    );
    return;
  }
  if (!options.allowEmpty && value.length === 0) {
    add(issues, path, "invalid_value", "Array must not be empty.");
  }
  if (options.maximum !== undefined && value.length > options.maximum) {
    add(issues, path, "invalid_value", `Array may contain at most ${options.maximum} items.`);
  }
  const allowed = options.allowed === undefined ? null : new Set(options.allowed);
  const seen = new Set<string>();
  for (const [index, item] of value.entries()) {
    if (!isNonBlank(item)) {
      add(issues, `${path}.${index}`, "invalid_type", "Expected a non-blank string.");
      continue;
    }
    if (allowed !== null && !allowed.has(item)) {
      add(issues, `${path}.${index}`, "invalid_value", "String is not an allowed value.");
    }
    if (seen.has(item)) {
      add(issues, `${path}.${index}`, "invalid_value", "Duplicate array value is not allowed.");
    }
    seen.add(item);
  }
}

function optionalStringArray(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value !== undefined) {
    stringArray(value, path, issues, { allowEmpty: true });
  }
}

function positiveNumber(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value === undefined) {
    add(issues, path, "missing_field", "Field is required.");
  } else if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    add(issues, path, "invalid_value", "Expected a positive finite number.");
  }
}

function optionalPositiveNumber(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value !== undefined) {
    positiveNumber(value, path, issues);
  }
}

function integerBetween(
  value: unknown,
  minimum: number,
  maximum: number,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    add(
      issues,
      path,
      value === undefined ? "missing_field" : "invalid_value",
      `Expected an integer from ${minimum} to ${maximum}.`,
    );
  }
}

function claimValue(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value === "string") {
    nonBlankString(value, path, issues);
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      add(issues, path, "invalid_value", "Claim number must be finite.");
    }
    return;
  }
  if (typeof value === "boolean") {
    return;
  }
  if (Array.isArray(value)) {
    stringArray(value, path, issues, { allowEmpty: false });
    return;
  }
  add(
    issues,
    path,
    value === undefined ? "missing_field" : "invalid_type",
    "Unsupported Claim value.",
  );
}

function participantTuple(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!Array.isArray(value) || value.length !== 2) {
    add(issues, path, "invalid_value", "Exactly two participant owner ids are required.");
    return;
  }
  stringArray(value, path, issues, { allowEmpty: false });
  if (value[0] === value[1]) {
    add(issues, path, "invariant_violation", "Participants must be distinct.");
  }
}

function validatedArray<T>(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  validator: (item: unknown) => ValidationResult<T>,
): void {
  if (!Array.isArray(value)) {
    add(issues, path, value === undefined ? "missing_field" : "invalid_type", "Expected an array.");
    return;
  }
  for (const [index, item] of value.entries()) {
    merge(issues, `${path}.${index}`, validator(item));
  }
}

function objectArray(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  validator: (item: UnknownRecord, path: string) => void,
): void {
  if (!Array.isArray(value)) {
    add(issues, path, value === undefined ? "missing_field" : "invalid_type", "Expected an array.");
    return;
  }
  for (const [index, item] of value.entries()) {
    const itemPath = `${path}.${index}`;
    if (!isRecord(item)) {
      add(issues, itemPath, "invalid_type", "Expected an object.");
    } else {
      validator(item, itemPath);
    }
  }
}

function isoDateTime(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isIsoDateTime(value)) {
    add(
      issues,
      path,
      value === undefined ? "missing_field" : "invalid_format",
      "Expected an ISO UTC date-time.",
    );
  }
}

function nullableIsoDateTime(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value !== null) {
    isoDateTime(value, path, issues);
  }
}

function calendarDate(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isCalendarDate(value)) {
    add(
      issues,
      path,
      value === undefined ? "missing_field" : "invalid_format",
      "Expected a valid YYYY-MM-DD date.",
    );
  }
}

function laterThan(
  earlier: unknown,
  later: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (isIsoDateTime(earlier) && isIsoDateTime(later) && Date.parse(later) <= Date.parse(earlier)) {
    add(issues, path, "invariant_violation", "Expiry must be later than creation.");
  }
}

function httpUrl(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isNonBlank(value)) {
    add(
      issues,
      path,
      value === undefined ? "missing_field" : "invalid_type",
      "Expected an HTTP(S) URL.",
    );
    return;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
  } catch {
    add(issues, path, "invalid_format", "Expected an HTTP(S) URL.");
  }
}

function merge<T>(issues: ValidationIssue[], prefix: string, result: ValidationResult<T>): void {
  if (result.success) {
    return;
  }
  for (const issue of result.issues) {
    issues.push({ ...issue, path: issue.path === "" ? prefix : join(prefix, issue.path) });
  }
}

function add(
  issues: ValidationIssue[],
  path: string,
  code: ValidationIssue["code"],
  message: string,
): void {
  issues.push({ path, code, message });
}

function join(parent: string, child: string): string {
  return parent === "" ? child : `${parent}.${child}`;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoDateTime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function addCalendarDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
