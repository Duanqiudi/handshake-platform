import type {
  ProductCommunitySnapshot,
  ProductStore,
  SaveProductCommunityInput,
  SaveProductCommunityResult,
} from "../src/index.js";

export class FakeProductStore implements ProductStore {
  #snapshot: ProductCommunitySnapshot | null = null;

  public async load(): Promise<ProductCommunitySnapshot | null> {
    return this.#snapshot === null ? null : structuredClone(this.#snapshot);
  }

  public async save(input: SaveProductCommunityInput): Promise<SaveProductCommunityResult> {
    const currentVersion = this.#snapshot?.version ?? 0;
    if (currentVersion !== input.expectedVersion) return "CONCURRENT_MODIFICATION";
    this.#snapshot = structuredClone(input.snapshot);
    return "APPLIED";
  }

  public async reset(snapshot: ProductCommunitySnapshot): Promise<void> {
    this.#snapshot = structuredClone(snapshot);
  }

  public snapshot(): ProductCommunitySnapshot | null {
    return this.#snapshot === null ? null : structuredClone(this.#snapshot);
  }
}
