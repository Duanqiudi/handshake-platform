import { describe, expect, it } from "vitest";
import { approveCapsule, minimizeCapsule } from "../src/index.js";
import { capsule } from "./fixtures.js";

describe("Capsule field minimization and approval", () => {
  it("copies only the explicitly approved fields without mutating the draft", () => {
    const draft = capsule();

    const minimal = minimizeCapsule(draft, ["goal", "offers", "goal"]);

    expect(minimal.fields).toEqual({
      goal: draft.fields.goal,
      offers: draft.fields.offers,
    });
    expect(minimal.approvedFields).toEqual(["goal", "offers"]);
    expect(draft.fields.seeks).toEqual(["TypeScript", "LLM 集成"]);
  });

  it("publishes a minimized Capsule after owner approval", () => {
    const published = approveCapsule(capsule(), ["goal", "offers", "seeks"]);

    expect(published.status).toBe("published");
    expect(published.approvedFields).toEqual(["goal", "offers", "seeks"]);
    expect(Object.keys(published.fields)).toEqual(["goal", "offers", "seeks"]);
  });

  it("refuses approval when a requested field is missing", () => {
    expect(() =>
      approveCapsule(capsule(), [
        "goal",
        "location",
        "languages",
        "seeks",
        "offers",
        "availability",
        "collaborationStyles",
        "projectInterests",
        "location",
      ]),
    ).not.toThrow();
    expect(() =>
      approveCapsule({ ...capsule(), fields: { goal: "完成作品" } }, ["goal", "offers"]),
    ).toThrowError(/offers/);
  });
});
