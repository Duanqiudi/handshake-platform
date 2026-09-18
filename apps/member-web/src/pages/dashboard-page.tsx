import { useEffect } from "react";
import { type DashboardData, memberApi } from "../api";
import { Link } from "../app/routing";
import { useResource } from "../app/use-resource";
import { JourneyRail, PageHeader } from "../components/app-shell";
import { EmptyState, ErrorState, LoadingState } from "../components/feedback";
import { Icon } from "../components/icons";
import { ProviderMark } from "../components/provider";
import { StatusBadge } from "../components/status";

export function DashboardPage({ onOwner }: { onOwner(name: string): void }) {
  const resource = useResource((signal) => memberApi.getDashboard(signal));
  const ownerName = resource.data?.owner.displayName;
  useEffect(() => {
    if (ownerName !== undefined) onOwner(ownerName);
  }, [onOwner, ownerName]);
  if (resource.loading && resource.data === null)
    return <LoadingState label="正在整理今天最重要的事…" />;
  if (resource.error !== null && resource.data === null)
    return <ErrorState message={resource.error} onRetry={resource.reload} />;
  const dashboard = resource.data;
  if (dashboard === null) return null;
  const next = findNextAction(dashboard);
  const activeStep = journeyStep(dashboard);
  const activeHandshake = dashboard.handshakes.find(
    (item) => !["DECLINED", "EXPIRED"].includes(item.status),
  );

  return (
    <>
      <PageHeader
        eyebrow="你的组队驾驶舱"
        title={`下午好，${dashboard.owner.displayName}`}
        description="今天只推进一件最重要的事。AI 负责整理，你负责决定。"
        action={
          <span className="community-pill">
            <span />
            portfolio-builders
          </span>
        }
      />
      <JourneyRail active={activeStep} />

      <section className="next-action-card">
        <div className="next-action-card__number">{String(activeStep).padStart(2, "0")}</div>
        <div className="next-action-card__content">
          <p className="eyebrow">下一步 · 约 {next.minutes} 分钟</p>
          <h2>{next.title}</h2>
          <p>{next.description}</p>
          <Link className="button button--accent" to={next.path}>
            {next.action}
            <Icon name="arrow" size={18} />
          </Link>
        </div>
        <div className="next-action-card__art" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="panel dashboard-ai">
          <div className="panel__header">
            <div>
              <p className="eyebrow">我的代表</p>
              <h2>你的 AI 已准备好</h2>
            </div>
            <Link className="text-link" to="/connect">
              管理
            </Link>
          </div>
          {dashboard.connections.length === 0 ? (
            <EmptyState
              title="还没有连接 AI"
              description="连接后，它可以为当前任务生成 Capsule。"
              action={
                <Link className="button button--small button--outline" to="/connect">
                  去连接
                </Link>
              }
            />
          ) : (
            dashboard.connections.slice(0, 1).map((connection) => (
              <div className="ai-summary" key={connection.id}>
                <ProviderMark provider={connection.provider} compact />
                <div>
                  <strong>{connection.displayName}</strong>
                  <p>
                    {connection.mode === "mcp"
                      ? "可在当前会话中调用 Handshake 工具"
                      : "通过标准 Capsule 安全导入"}
                  </p>
                </div>
                <span className="live-status">
                  <i />
                  已连接
                </span>
              </div>
            ))
          )}
          <div className="boundary-note">
            <Icon name="lock" size={17} />
            <span>
              <strong>边界正常：</strong>平台从未请求完整聊天记录或 Memory。
            </span>
          </div>
        </section>

        <section className="panel dashboard-intent">
          <div className="panel__header">
            <div>
              <p className="eyebrow">本轮目标</p>
              <h2>7 天项目意图</h2>
            </div>
            <Link className="text-link" to="/intent">
              编辑
            </Link>
          </div>
          {dashboard.intents.length === 0 ? (
            <EmptyState
              title="还没有项目意图"
              description="写清楚 7 天后想展示什么，匹配才有方向。"
            />
          ) : (
            <div className="intent-summary">
              <span className="intent-summary__icon">
                <Icon name="intent" />
              </span>
              <h3>{dashboard.intents[0]?.title}</h3>
              <p>{dashboard.intents[0]?.desiredArtifact}</p>
              <div className="meta-row">
                <span>
                  <Icon name="clock" size={15} />7 天冲刺
                </span>
                <span className="status-badge status-badge--green">发现中</span>
              </div>
            </div>
          )}
        </section>

        <section className="panel dashboard-handshake">
          <div className="panel__header">
            <div>
              <p className="eyebrow">正在进行</p>
              <h2>AI 了解进度</h2>
            </div>
            <Link className="text-link" to="/handshakes">
              查看全部
            </Link>
          </div>
          {activeHandshake === undefined ? (
            <EmptyState
              title="还没有 Handshake"
              description="发现合适的候选后，可以让双方 AI 先做有限了解。"
              action={
                <Link className="button button--small button--outline" to="/discover">
                  发现搭档
                </Link>
              }
            />
          ) : (
            <div className="handshake-summary">
              <div className="participant-stack">
                {activeHandshake.participants.map((person) => (
                  <span key={person.ownerId} title={person.displayName}>
                    {person.displayName.slice(0, 1)}
                  </span>
                ))}
              </div>
              <div>
                <StatusBadge status={activeHandshake.status} />
                <h3>{activeHandshake.participants.map((item) => item.displayName).join(" × ")}</h3>
                <p>{activeHandshake.statusLabel}</p>
              </div>
              <Link
                className="circle-link"
                to={`/handshakes/${activeHandshake.id}`}
                aria-label="查看 Handshake"
              >
                <Icon name="arrow" />
              </Link>
            </div>
          )}
        </section>

        <section className="panel dashboard-privacy">
          <div className="privacy-score">
            <span>
              <Icon name="shield" size={26} />
            </span>
            <div>
              <p className="eyebrow">本轮数据足迹</p>
              <strong>
                {dashboard.receipts?.filter((item) => item.status === "active").length ?? 0}{" "}
                条有效授权
              </strong>
            </div>
          </div>
          <p>每次信息披露都能说清楚“给谁、为什么、到什么时候”。</p>
          <Link className="text-link" to="/privacy">
            查看隐私收据 <Icon name="arrow" size={15} />
          </Link>
        </section>
      </div>
    </>
  );
}

function journeyStep(data: DashboardData): number {
  if (data.projects.some((item) => item.status === "active")) return 5;
  if (data.handshakes.some((item) => !["DECLINED", "EXPIRED"].includes(item.status))) return 4;
  if (data.intents.some((item) => item.status === "active")) return 4;
  if (data.capsules.some((item) => item.status === "published")) return 3;
  if (data.connections.length > 0) return 2;
  return 1;
}

function findNextAction(data: DashboardData): {
  title: string;
  description: string;
  path: string;
  action: string;
  minutes: number;
} {
  const pending = data.handshakes.find((item) =>
    item.pendingQuestions.some(
      (question) => question.status === "pending" && question.askedBy !== data.owner.id,
    ),
  );
  if (pending !== undefined)
    return {
      title: "确认一条 AI 准备发送的回答",
      description: "陈默的 AI 想确认最终演示时间。回答不会自动发出，先由你检查。",
      path: `/handshakes/${pending.id}`,
      action: "查看并确认",
      minutes: 2,
    };
  const consent = data.handshakes.find((item) => item.status === "WAITING_DUAL_CONSENT");
  if (consent !== undefined)
    return {
      title: "决定是否与这位搭档交换联系",
      description: "双方 AI 已完成了解。请基于同一版披露摘要做最终决定。",
      path: `/handshakes/${consent.id}`,
      action: "做出决定",
      minutes: 2,
    };
  const project = data.projects.find((item) => item.status === "active");
  if (project !== undefined)
    return {
      title: `记录第 ${project.day} 天的项目进度`,
      description: "用一句话告诉搭档今天完成了什么、下一步是什么。",
      path: `/projects/${project.id}`,
      action: "进入项目空间",
      minutes: 3,
    };
  if (data.connections.length === 0)
    return {
      title: "连接你常用的 AI",
      description: "不用交出 API Key。通过 MCP 或标准 Capsule，把 AI 带进这次任务。",
      path: "/connect",
      action: "选择连接方式",
      minutes: 3,
    };
  if (!data.capsules.some((item) => item.status === "published"))
    return {
      title: "检查并发布任务资料",
      description: "逐字段决定本次寻找搭档时，哪些信息可以被看到。",
      path: "/capsule",
      action: "检查资料",
      minutes: 4,
    };
  if (!data.intents.some((item) => item.status === "active"))
    return {
      title: "说清楚 7 天后要交付什么",
      description: "项目越具体，AI 越容易找到真正互补的搭档。",
      path: "/intent",
      action: "创建项目意图",
      minutes: 4,
    };
  return {
    title: "看看 AI 找到了哪些互补搭档",
    description: "匹配不使用虚假百分比，只展示能够被解释的理由和待确认信息。",
    path: "/discover",
    action: "查看候选",
    minutes: 3,
  };
}
