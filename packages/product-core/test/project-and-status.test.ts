import { describe, expect, it } from "vitest";
import { createSevenDayPlan, handshakeStatusLabel } from "../src/index.js";

describe("seven-day project defaults", () => {
  it("creates seven dated, interview-friendly milestones", () => {
    const plan = createSevenDayPlan("2026-09-17");

    expect(plan).toHaveLength(7);
    expect(plan.map((item) => item.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(plan.map((item) => item.date)).toEqual([
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
    ]);
    expect(plan[0]?.title).toBe("对齐问题与分工");
    expect(plan[6]?.deliverables).toContain("可直接演示的最终版本");
  });

  it("rejects an invalid start date", () => {
    expect(() => createSevenDayPlan("not-a-date")).toThrowError(/start date/i);
  });
});

describe("user-facing handshake copy", () => {
  it.each([
    ["SCREENING", "双方 AI 正在了解"],
    ["WAITING_OWNER", "等待你确认回答"],
    ["WAITING_DUAL_CONSENT", "等待双方确认是否交换联系方式"],
    ["REVEALED", "双方已同意交换联系方式"],
    ["NO_MATCH", "本次暂不继续"],
    ["POLICY_BLOCKED", "为保护隐私，本次交流已停止"],
  ] as const)("maps %s to clear copy", (status, expected) => {
    expect(handshakeStatusLabel(status)).toBe(expected);
  });
});
