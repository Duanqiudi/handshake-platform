import type { DisclosedCapsule, LocalProfile, PublicCapsule } from "./types.js";

/**
 * Produces a new object containing only fields explicitly permitted by the profile's local policy.
 * Private memory is not an input to this function and therefore cannot be emitted accidentally.
 */
export function discloseAllowedCapsule(profile: LocalProfile): DisclosedCapsule {
  const allowed = new Set(profile.disclosurePolicy.allowedFields);
  const disclosed: { -readonly [K in keyof PublicCapsule]?: PublicCapsule[K] } = {};

  if (allowed.has("collaborationGoal")) {
    disclosed.collaborationGoal = profile.publicCapsule.collaborationGoal;
  }
  if (allowed.has("offers")) {
    disclosed.offers = [...profile.publicCapsule.offers];
  }
  if (allowed.has("seeks")) {
    disclosed.seeks = [...profile.publicCapsule.seeks];
  }
  if (allowed.has("availability")) {
    disclosed.availability = profile.publicCapsule.availability;
  }
  return disclosed;
}
