import { emptyProductSnapshot } from "@handshake/product-application";
import { describe, expect, it } from "vitest";
import { SqliteProductStore } from "../src/index.js";

describe("SqliteProductStore", () => {
  it("creates, reloads and compare-and-swaps a product community snapshot", async () => {
    const store = new SqliteProductStore({ path: ":memory:" });
    const base = emptyProductSnapshot("portfolio-builders");
    const versionOne = { ...base, version: 1 };

    await expect(
      store.save({
        communityId: base.communityId,
        expectedVersion: 0,
        snapshot: versionOne,
      }),
    ).resolves.toBe("APPLIED");
    await expect(store.load({ communityId: base.communityId })).resolves.toEqual(versionOne);

    await expect(
      store.save({
        communityId: base.communityId,
        expectedVersion: 0,
        snapshot: versionOne,
      }),
    ).resolves.toBe("CONCURRENT_MODIFICATION");
    store.close();
  });

  it("resets the demo snapshot deterministically", async () => {
    const store = new SqliteProductStore({ path: ":memory:" });
    const snapshot = { ...emptyProductSnapshot("portfolio-builders"), version: 7 };

    await store.reset(snapshot);

    await expect(store.load({ communityId: snapshot.communityId })).resolves.toEqual(snapshot);
    store.close();
  });
});
