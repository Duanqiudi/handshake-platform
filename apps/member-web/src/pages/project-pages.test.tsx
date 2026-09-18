import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { memberApi, type PortfolioProject } from "../api";
import { ProjectDetailPage } from "./project-pages";

const completedProject: PortfolioProject = {
  id: "project_complete",
  handshakeId: "handshake_complete",
  title: "AI 求职助手",
  status: "completed",
  day: 7,
  startsAt: "2026-09-10T00:00:00.000Z",
  endsAt: "2026-09-16T23:59:59.000Z",
  members: [
    { ownerId: "owner_a", displayName: "林然", role: "产品" },
    { ownerId: "owner_b", displayName: "陈默", role: "开发" },
  ],
  plan: Array.from({ length: 7 }, (_, index) => ({
    day: index + 1,
    title: `第 ${index + 1} 天任务`,
    done: true,
  })),
  checkIns: [
    {
      id: "checkin_1",
      day: 1,
      ownerId: "owner_a",
      summary: "确认用户问题",
      nextStep: "开始制作",
      createdAt: "2026-09-10T12:00:00.000Z",
    },
  ],
  artifacts: [
    {
      id: "artifact_1",
      title: "在线 Demo",
      url: "https://demo.example.test",
      createdAt: "2026-09-16T12:00:00.000Z",
    },
  ],
  feedback: [
    {
      id: "feedback_a",
      ownerId: "owner_a",
      rating: 5,
      wouldCollaborateAgain: true,
      note: "配合顺畅",
      createdAt: "2026-09-16T13:00:00.000Z",
    },
    {
      id: "feedback_b",
      ownerId: "owner_b",
      rating: 5,
      wouldCollaborateAgain: true,
      note: "目标明确",
      createdAt: "2026-09-16T13:05:00.000Z",
    },
  ],
};

afterEach(() => vi.restoreAllMocks());

describe("Project completed state", () => {
  it("shows a read-only completion summary and hides mutation actions", async () => {
    vi.spyOn(memberApi, "getProject").mockResolvedValue(completedProject);

    render(<ProjectDetailPage id={completedProject.id} />);

    expect(await screen.findByText("这个 7 天项目已经完成")).toBeTruthy();
    expect(screen.getByText("双方互评已完成")).toBeTruthy();
    expect(screen.getByText("只读记录")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "记录今天" })).toBeNull();
    expect(screen.queryByRole("button", { name: "添加作品" })).toBeNull();
    expect(screen.queryByRole("button", { name: "填写我的反馈" })).toBeNull();
  });
});
