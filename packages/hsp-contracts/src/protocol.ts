import { HSP_PROTOCOL_VERSION } from "./constants.js";
import { HspProtocolError } from "./errors.js";

export interface ParsedProtocolVersion {
  readonly raw: string;
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease?: string;
}

export type ProtocolIncompatibilityReason =
  | "MALFORMED_VERSION"
  | "UNSUPPORTED_MAJOR"
  | "UNSUPPORTED_MINOR";

export type ProtocolCompatibility =
  | {
      readonly compatible: true;
      readonly local_version: string;
      readonly remote_version: string;
      readonly negotiated_version: string;
    }
  | {
      readonly compatible: false;
      readonly local_version: string;
      readonly remote_version: string;
      readonly reason: ProtocolIncompatibilityReason;
    };

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/;

export function parseProtocolVersion(version: string): ParsedProtocolVersion | undefined {
  const match = VERSION_PATTERN.exec(version);
  if (match === null) {
    return undefined;
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  const prerelease = match[4];

  return {
    raw: version,
    major,
    minor,
    patch,
    ...(prerelease === undefined ? {} : { prerelease }),
  };
}

/**
 * HSP 0.x minors are compatibility boundaries. Patches within the same 0.2 line
 * are wire-compatible; the lower patch is selected for the session.
 */
export function checkProtocolCompatibility(
  remoteVersion: string,
  localVersion = HSP_PROTOCOL_VERSION,
): ProtocolCompatibility {
  const local = parseProtocolVersion(localVersion);
  if (local === undefined) {
    throw new Error(`Invalid local HSP protocol version: ${localVersion}`);
  }

  const remote = parseProtocolVersion(remoteVersion);
  if (remote === undefined) {
    return {
      compatible: false,
      local_version: localVersion,
      remote_version: remoteVersion,
      reason: "MALFORMED_VERSION",
    };
  }

  if (remote.major !== local.major) {
    return {
      compatible: false,
      local_version: localVersion,
      remote_version: remoteVersion,
      reason: "UNSUPPORTED_MAJOR",
    };
  }

  if (remote.minor !== local.minor) {
    return {
      compatible: false,
      local_version: localVersion,
      remote_version: remoteVersion,
      reason: "UNSUPPORTED_MINOR",
    };
  }

  return {
    compatible: true,
    local_version: localVersion,
    remote_version: remoteVersion,
    negotiated_version: `${local.major}.${local.minor}.${Math.min(local.patch, remote.patch)}`,
  };
}

export function assertProtocolCompatible(
  remoteVersion: string,
  localVersion = HSP_PROTOCOL_VERSION,
): string {
  const result = checkProtocolCompatibility(remoteVersion, localVersion);
  if (!result.compatible) {
    throw new HspProtocolError({
      code: "UNSUPPORTED_PROTOCOL_VERSION",
      message: `HSP version ${remoteVersion} is not compatible with ${localVersion}`,
      retryable: false,
      details: {
        reason: result.reason,
        local_version: localVersion,
        remote_version: remoteVersion,
      },
    });
  }

  return result.negotiated_version;
}
