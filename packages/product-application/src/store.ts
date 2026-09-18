import type { Handshake } from "@handshake/domain";
import type {
  AiConnection,
  Candidate,
  MemoryCapsule,
  Owner,
  PortfolioProject,
  PrivacyReceipt,
  ProductHandshake,
  ProjectIntent,
} from "@handshake/product-core";

export interface OwnerTokenRecord {
  readonly ownerId: string;
  readonly tokenDigest: string;
  readonly issuedAt: string;
  readonly revokedAt: string | null;
}

export interface ProductHandshakeRecord {
  readonly product: ProductHandshake;
  readonly protocol: Handshake;
  readonly intentIds: readonly [string, string];
  readonly match: Candidate;
}

export interface ProductCommunitySnapshot {
  readonly schemaVersion: "product-community-0.1";
  readonly communityId: string;
  readonly version: number;
  readonly owners: readonly Owner[];
  readonly ownerTokens: readonly OwnerTokenRecord[];
  readonly connections: readonly AiConnection[];
  readonly capsules: readonly MemoryCapsule[];
  readonly intents: readonly ProjectIntent[];
  readonly handshakes: readonly ProductHandshakeRecord[];
  readonly receipts: readonly PrivacyReceipt[];
  readonly projects: readonly PortfolioProject[];
}

export interface LoadProductCommunityInput {
  readonly communityId: string;
}

export interface SaveProductCommunityInput {
  readonly communityId: string;
  readonly expectedVersion: number;
  readonly snapshot: ProductCommunitySnapshot;
}

export type SaveProductCommunityResult = "APPLIED" | "CONCURRENT_MODIFICATION";

export interface ProductStore {
  load(input: LoadProductCommunityInput): Promise<ProductCommunitySnapshot | null>;
  save(input: SaveProductCommunityInput): Promise<SaveProductCommunityResult>;
  reset(snapshot: ProductCommunitySnapshot): Promise<void>;
  healthCheck?(): Promise<void>;
  close?(): void;
}

export function emptyProductSnapshot(communityId: string): ProductCommunitySnapshot {
  return {
    schemaVersion: "product-community-0.1",
    communityId,
    version: 0,
    owners: [],
    ownerTokens: [],
    connections: [],
    capsules: [],
    intents: [],
    handshakes: [],
    receipts: [],
    projects: [],
  };
}
