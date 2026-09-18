import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type HandshakeView, memberApi } from "../api";
import { HandshakeDetailPage } from "./handshake-pages";

const baseHandshake: HandshakeView = {
  id: "handshake_test",
  status: "WAITING_DUAL_CONSENT",
  statusLabel: "等待双方主人决定",
  participants: [
    { ownerId: "owner_a", displayName: "林然", provider: "chatgpt", isCurrentOwner: true },
    { ownerId: "owner_b", displayName: "陈默", provider: "kimi" },
  ],
  timeline: [],
  pendingQuestions: [],
  recommendations: [],
  decisions: [],
  contactReveal: null,
  projectId: null,
  disclosureSummary: { version: "consent_abc", items: ["任务资料"] },
  roundsUsed: 1,
  maxRounds: 3,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Handshake contact privacy", () => {
  it("offers valid screening fields and the first AI recommendation", async () => {
    vi.spyOn(memberApi, "getHandshake").mockResolvedValue({
      ...baseHandshake,
      status: "SCREENING",
      statusLabel: "双方 AI 正在了解",
      roundsUsed: 0,
    });

    render(<HandshakeDetailPage id="handshake_test" />);

    expect(await screen.findByRole("combobox", { name: "想确认的判断条件" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "可投入时间与档期" }).getAttribute("value")).toBe(
      "availability",
    );
    expect(screen.getByRole("button", { name: "建议继续" })).toBeTruthy();
  });

  it("does not offer another question while waiting for the partner", async () => {
    vi.spyOn(memberApi, "getHandshake").mockResolvedValue({
      ...baseHandshake,
      status: "WAITING_OWNER",
      statusLabel: "等待对方主人确认回答",
    });

    render(<HandshakeDetailPage id="handshake_test" />);

    expect(await screen.findByText("正在等对方确认回答")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "发送结构化问题" })).toBeNull();
  });

  it("does not render contact values before both owners consent", async () => {
    vi.spyOn(memberApi, "getHandshake").mockResolvedValue(baseHandshake);

    render(<HandshakeDetailPage id="handshake_test" />);

    expect(await screen.findByText("联系方式仍被锁定")).toBeTruthy();
    expect(screen.queryByText("chen.mo@example.test")).toBeNull();
    expect(screen.queryByText("demo-linran")).toBeNull();
  });

  it("renders contacts after the server marks the handshake revealed", async () => {
    vi.spyOn(memberApi, "getHandshake").mockResolvedValue({
      ...baseHandshake,
      status: "REVEALED",
      statusLabel: "联系方式已解锁",
      contactReveal: {
        consentVersion: "consent_abc",
        revealedAt: "2026-09-17T08:00:00.000Z",
        contacts: [
          { ownerId: "owner_a", displayName: "林然", channel: "微信", value: "demo-linran" },
          {
            ownerId: "owner_b",
            displayName: "陈默",
            channel: "邮箱",
            value: "chen.mo@example.test",
          },
        ],
      },
      projectId: "project_1",
    });

    render(<HandshakeDetailPage id="handshake_test" />);

    expect(await screen.findByText("chen.mo@example.test")).toBeTruthy();
    expect(screen.getByText("demo-linran")).toBeTruthy();
    expect(screen.getByRole("link", { name: /进入 7 天项目空间/ }).getAttribute("href")).toBe(
      "#/projects/project_1",
    );
  });
});
