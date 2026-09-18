import { describe, expect, it } from "vitest";
import { matchCandidate } from "../src/index.js";
import { profile } from "./fixtures.js";

describe("explainable matching", () => {
  it("continues when both people offer what the other seeks and schedules overlap", () => {
    const alice = profile();
    const bob = profile("owner_bob", "kimi");
    bob.capsule.fields.offers = ["TypeScript", "LLM 集成"];
    bob.capsule.fields.seeks = ["产品设计"];
    bob.intent.offers = ["TypeScript", "LLM 集成"];
    bob.intent.seeks = ["产品设计"];

    const candidate = matchCandidate(alice, bob);

    expect(candidate.recommendation).toBe("continue");
    expect(candidate.matchedOffers).toEqual(["TypeScript"]);
    expect(candidate.matchedSeeks).toEqual(["产品设计"]);
    expect(candidate.scheduleCompatible).toBe(true);
    expect(candidate.reasons).toContain("你需要的 TypeScript 正是对方可提供的能力");
    expect(candidate).not.toHaveProperty("score");
    expect(candidate).not.toHaveProperty("percentage");
  });

  it("asks for information rather than inventing precision when evidence is incomplete", () => {
    const alice = profile();
    const bob = profile("owner_bob", "doubao");
    bob.intent.availability.slots = [];
    bob.intent.offers = [];
    bob.capsule.fields.offers = [];

    const candidate = matchCandidate(alice, bob);

    expect(candidate.recommendation).toBe("needs_info");
    expect(candidate.gaps).toEqual(
      expect.arrayContaining([
        "尚未确认双方可共同投入的时间段",
        "尚未找到对方能够补足你需求的明确能力",
      ]),
    );
  });

  it("reports hard conflicts with concrete reasons", () => {
    const alice = profile();
    const bob = profile("owner_bob", "kimi");
    alice.intent.locationMode = "onsite";
    alice.intent.location = "上海";
    bob.intent.locationMode = "onsite";
    bob.intent.location = "北京";
    bob.capsule.fields.languages = ["English"];

    const candidate = matchCandidate(alice, bob);

    expect(candidate.recommendation).toBe("conflict");
    expect(candidate.conflicts).toEqual(
      expect.arrayContaining([
        "双方均要求线下协作，但地点不同",
        "对方不满足你要求的协作语言：中文",
      ]),
    );
  });

  it("treats an explicitly flexible schedule as compatible instead of a hard conflict", () => {
    const alice = profile();
    const bob = profile("owner_bob", "kimi");
    alice.intent.availability.slots = ["flexible"];
    bob.intent.availability.slots = ["weekday-evening"];
    bob.intent.offers = ["TypeScript"];
    bob.intent.seeks = ["产品设计"];

    const candidate = matchCandidate(alice, bob);

    expect(candidate.scheduleCompatible).toBe(true);
    expect(candidate.conflicts).not.toContain("双方明确提供的可协作时间段没有重叠");
  });
});
