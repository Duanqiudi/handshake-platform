import { describe, expect, it } from "vitest";
import { ProductApplicationService, type ProductRuntime } from "../src/index.js";
import { FakeProductStore } from "./fake-product-store.js";

function runtime(): ProductRuntime {
  let sequence = 0;
  const nextSequence = (): number => {
    sequence += 1;
    return sequence;
  };
  return {
    now: () => new Date("2026-09-17T08:00:00.000Z"),
    createId: (prefix) => `${prefix}_test_${nextSequence()}`,
    createToken: () => `hs_test_${nextSequence()}`,
  };
}

describe("ProductApplicationService", () => {
  it("completes discovery, controlled questions, dual consent and project creation", async () => {
    const store = new FakeProductStore();
    const service = new ProductApplicationService({ store, runtime: runtime() });
    const demo = await service.resetDemo();
    const lin = await service.authenticate(demo.owners[0]?.token ?? "");
    const chen = await service.authenticate(demo.owners[1]?.token ?? "");

    const candidates = await service.listCandidates(lin.id);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ ownerId: chen.id, recommendation: "continue" });

    let linView = await service.startHandshake(lin.id, { candidateOwnerId: chen.id });
    expect(linView.status).toBe("SCREENING");
    expect(linView.currentOwnerId).toBe(lin.id);
    expect(linView.participants.filter((participant) => participant.isCurrentOwner)).toEqual([
      expect.objectContaining({ id: lin.id }),
    ]);
    expect(linView.roundsUsed).toBe(0);
    expect(linView.maxRounds).toBe(3);
    expect(linView.contactReveal).toBeNull();
    expect(JSON.stringify(linView)).not.toContain("chenmo-demo");

    linView = await service.askQuestion(lin.id, linView.id, {
      toOwnerId: chen.id,
      predicate: "availability",
      prompt: "能否每天晚上异步更新一次进度？",
    });
    expect(linView.status).toBe("WAITING_OWNER");
    expect(linView.roundsUsed).toBe(1);
    expect(linView.pendingQuestions).toHaveLength(0);
    const chenView = await service.getHandshakeView(chen.id, linView.id);
    expect(chenView.currentOwnerId).toBe(chen.id);
    expect(chenView.participants.filter((participant) => participant.isCurrentOwner)).toEqual([
      expect.objectContaining({ id: chen.id }),
    ]);
    expect(chenView.pendingQuestions).toHaveLength(1);
    expect(chenView.pendingQuestions[0]?.round).toBe(1);

    await service.answerQuestion(chen.id, linView.id, chenView.pendingQuestions[0]?.id ?? "", {
      answer: "可以，每晚 9 点前更新进度和阻塞项。",
      ownerConfirmed: true,
    });
    await service.submitRecommendation(lin.id, linView.id, {
      recommendation: "continue",
      summary: "技能互补且时间匹配",
    });
    const readyForConsent = await service.submitRecommendation(chen.id, linView.id, {
      recommendation: "continue",
      summary: "产品和工程能力互补",
    });
    expect(readyForConsent.status).toBe("WAITING_DUAL_CONSENT");

    const firstConsent = await service.submitDecision(lin.id, linView.id, {
      decision: "continue",
      consentVersion: readyForConsent.consentVersion,
    });
    expect(firstConsent.contactReveal).toBeNull();
    expect(JSON.stringify(firstConsent)).not.toContain("chenmo-demo");

    const latestForChen = await service.getHandshakeView(chen.id, linView.id);
    const introduced = await service.submitDecision(chen.id, linView.id, {
      decision: "continue",
      consentVersion: latestForChen.consentVersion,
    });
    expect(introduced.status).toBe("INTRODUCED");
    expect(introduced.contactReveal?.contacts).toHaveLength(2);
    expect(introduced.projectId).toMatch(/^project_/);

    const projects = await service.listProjects(lin.id);
    expect(projects).toHaveLength(1);
    expect(projects[0]?.plan).toHaveLength(7);

    const projectId = projects[0]?.id ?? "";
    const checkedIn = await service.addCheckIn(lin.id, projectId, {
      day: 1,
      summary: "已经确定最小用户流程。",
      nextStep: "完成可点击原型。",
    });
    expect(checkedIn.checkIns).toHaveLength(1);

    const withArtifact = await service.addArtifact(chen.id, projectId, {
      title: "AI 求职助手演示",
      url: "https://demo.example.test/portfolio-assistant",
    });
    expect(withArtifact.artifacts).toHaveLength(1);

    const firstFeedback = await service.addFeedback(lin.id, projectId, {
      completed: true,
      rating: 5,
      wouldCollaborateAgain: true,
      comment: "工程推进很可靠。",
    });
    expect(firstFeedback.status).toBe("active");

    const completed = await service.addFeedback(chen.id, projectId, {
      completed: true,
      rating: 5,
      wouldCollaborateAgain: true,
      comment: "产品范围控制得很好。",
    });
    expect(completed.status).toBe("completed");

    const completedHandshake = await service.getHandshakeView(lin.id, linView.id);
    expect(completedHandshake.status).toBe("FEEDBACK_COMPLETE");
    expect(completedHandshake.contactReveal?.contacts).toHaveLength(2);

    await expect(
      service.addFeedback(lin.id, projectId, {
        rating: 6,
        wouldCollaborateAgain: true,
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("rejects feedback ratings outside the one-to-five range", async () => {
    const store = new FakeProductStore();
    const service = new ProductApplicationService({ store, runtime: runtime() });
    const demo = await service.resetDemo();
    const lin = await service.authenticate(demo.owners[0]?.token ?? "");
    const chen = await service.authenticate(demo.owners[1]?.token ?? "");
    const handshake = await service.startHandshake(lin.id, { candidateOwnerId: chen.id });
    await service.submitRecommendation(lin.id, handshake.id, {
      recommendation: "continue",
      summary: "适合继续",
    });
    const ready = await service.submitRecommendation(chen.id, handshake.id, {
      recommendation: "continue",
      summary: "适合继续",
    });
    await service.submitDecision(lin.id, handshake.id, {
      decision: "continue",
      consentVersion: ready.consentVersion,
    });
    const latest = await service.getHandshakeView(chen.id, handshake.id);
    const introduced = await service.submitDecision(chen.id, handshake.id, {
      decision: "continue",
      consentVersion: latest.consentVersion,
    });

    await expect(
      service.addFeedback(lin.id, introduced.projectId ?? "", {
        rating: 6,
        wouldCollaborateAgain: true,
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("removes a revoked Capsule and its intent from discovery", async () => {
    const service = new ProductApplicationService({
      store: new FakeProductStore(),
      runtime: runtime(),
    });
    const demo = await service.resetDemo();
    const lin = demo.owners[0]?.owner;
    const chen = demo.owners[1]?.owner;
    if (lin === undefined || chen === undefined) throw new Error("Demo owners missing");

    const chenCapsule = (await service.listCapsules(chen.id))[0];
    if (chenCapsule === undefined) throw new Error("Demo Capsule missing");
    await service.revokeCapsule(chen.id, chenCapsule.id);

    await expect(service.listCandidates(lin.id)).resolves.toEqual([]);
  });

  it("removes a disconnected AI connection from discovery", async () => {
    const service = new ProductApplicationService({
      store: new FakeProductStore(),
      runtime: runtime(),
    });
    const demo = await service.resetDemo();
    const lin = demo.owners[0]?.owner;
    const chen = demo.owners[1]?.owner;
    if (lin === undefined || chen === undefined) throw new Error("Demo owners missing");

    const chenConnection = (await service.listConnections(chen.id))[0];
    if (chenConnection === undefined) throw new Error("Demo connection missing");
    const disconnected = await service.updateConnection(chen.id, chenConnection.id, {
      status: "disconnected",
    });

    expect(disconnected.status).toBe("disconnected");
    await expect(service.listCandidates(lin.id)).resolves.toEqual([]);
  });

  it("persists only token digests", async () => {
    const store = new FakeProductStore();
    const service = new ProductApplicationService({ store, runtime: runtime() });

    const onboarded = await service.onboard({
      displayName: "测试用户",
      contact: { kind: "email", value: "owner@example.test" },
    });

    expect(JSON.stringify(store.snapshot())).not.toContain(onboarded.token);
    await expect(service.authenticate(onboarded.token)).resolves.toMatchObject({
      id: onboarded.owner.id,
    });
  });

  it("does not publish an already expired Capsule", async () => {
    const service = new ProductApplicationService({
      store: new FakeProductStore(),
      runtime: runtime(),
    });
    const onboarded = await service.onboard({
      displayName: "过期测试用户",
      contact: { kind: "email", value: "expired@example.test" },
    });
    const connection = await service.createConnection(onboarded.owner.id, {
      provider: "other",
      mode: "import",
      label: "手动导入",
    });
    const capsule = await service.importCapsule(onboarded.owner.id, {
      connectionId: connection.id,
      fields: {
        goal: "做一个项目",
        offers: ["产品"],
        seeks: ["开发"],
        availability: "每周 5 小时",
        collaborationStyles: ["异步"],
        projectInterests: ["AI"],
        location: "远程",
        languages: ["中文"],
      },
      approvedFields: [
        "goal",
        "offers",
        "seeks",
        "availability",
        "collaborationStyles",
        "projectInterests",
        "location",
        "languages",
      ],
      expiresAt: "2026-09-16T08:00:00.000Z",
    });

    await expect(service.publishCapsule(onboarded.owner.id, capsule.id)).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
  });
});
