import {
  CAPSULE_FIELD_NAMES,
  type CapsuleFieldName,
  type CapsuleFields,
  type MemoryCapsule,
} from "./types.js";

const capsuleFieldNameSet = new Set<string>(CAPSULE_FIELD_NAMES);

/**
 * Produces the only Capsule shape that may cross the platform boundary: explicitly approved
 * fields, with duplicates removed in owner-selected order. The input object is never mutated.
 */
export function minimizeCapsule(
  capsule: MemoryCapsule,
  approvedFields: readonly CapsuleFieldName[] = capsule.approvedFields,
): MemoryCapsule {
  const uniqueFields = [...new Set(approvedFields)];
  const fields: CapsuleFields = {};

  for (const field of uniqueFields) {
    if (!capsuleFieldNameSet.has(field)) {
      throw new Error(`Unknown Capsule field: ${String(field)}`);
    }

    const value = capsule.fields[field];
    if (value === undefined) {
      throw new Error(`Cannot approve missing Capsule field: ${field}`);
    }

    assignCapsuleField(fields, field, value);
  }

  return {
    ...capsule,
    fields,
    approvedFields: uniqueFields,
    privateCategories: [...capsule.privateCategories],
  };
}

/** Owner approval both minimizes the payload and changes the discoverability state. */
export function approveCapsule(
  capsule: MemoryCapsule,
  approvedFields: readonly CapsuleFieldName[],
): MemoryCapsule {
  if (capsule.status === "revoked") {
    throw new Error("A revoked Capsule cannot be approved again.");
  }
  if (approvedFields.length === 0) {
    throw new Error("At least one Capsule field must be approved before publishing.");
  }

  return { ...minimizeCapsule(capsule, approvedFields), status: "published" };
}

function assignCapsuleField(
  target: CapsuleFields,
  field: CapsuleFieldName,
  value: NonNullable<CapsuleFields[CapsuleFieldName]>,
): void {
  switch (field) {
    case "goal":
    case "availability":
    case "location":
      target[field] = value as string;
      return;
    case "offers":
    case "seeks":
    case "collaborationStyles":
    case "projectInterests":
    case "languages":
      target[field] = [...(value as readonly string[])];
      return;
  }
}
