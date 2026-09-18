import { type FormEvent, useState } from "react";
import { type MemoryCapsule, memberApi, type ProjectIntent } from "../api";
import { Link } from "../app/routing";
import { useResource } from "../app/use-resource";
import { PageHeader } from "../components/app-shell";
import {
  EmptyState,
  ErrorState,
  friendlyError,
  InlineNotice,
  LoadingState,
} from "../components/feedback";
import { Icon } from "../components/icons";

interface IntentData {
  capsules: MemoryCapsule[];
  intents: ProjectIntent[];
}

export function IntentPage() {
  const resource = useResource<IntentData>(async (signal) => {
    const [capsules, intents] = await Promise.all([
      memberApi.listCapsules(signal),
      memberApi.listIntents(signal),
    ]);
    return { capsules, intents };
  });
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const published = resource.data?.capsules.filter((item) => item.status === "published") ?? [];

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const startsOn = String(data.get("startsOn") ?? "").trim();
      await memberApi.createIntent({
        capsuleId: String(data.get("capsuleId") ?? ""),
        title: String(data.get("title") ?? ""),
        summary: String(data.get("summary") ?? ""),
        desiredArtifact: String(data.get("desiredArtifact") ?? ""),
        ...(startsOn === "" ? {} : { startsOn }),
      });
      setShowForm(false);
      resource.reload();
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      setBusy(false);
    }
  };

  const pause = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await memberApi.pauseIntent(id);
      resource.reload();
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="第 3 步 · 7-day intent"
        title="7 天后，你们要展示什么？"
        description="不是“找一个聊得来的人”，而是围绕一个清楚、够小、可展示的结果找互补搭档。"
        action={
          <button
            className="button button--dark"
            type="button"
            disabled={published.length === 0}
            onClick={() => setShowForm((value) => !value)}
          >
            <Icon name={showForm ? "close" : "plus"} size={17} />
            {showForm ? "取消" : "发布新意图"}
          </button>
        }
      />
      {resource.loading && resource.data === null ? (
        <LoadingState label="正在读取项目意图…" />
      ) : null}
      {resource.error !== null && resource.data === null ? (
        <ErrorState message={resource.error} onRetry={resource.reload} />
      ) : null}
      {published.length === 0 && !resource.loading ? (
        <EmptyState
          eyebrow="发布前的必要条件"
          title="先发布一张 Capsule"
          description="候选人需要先知道你的目标、能力和时间边界，项目意图才可以进入发现。"
          action={
            <Link className="button button--accent" to="/capsule">
              检查并发布 Capsule
            </Link>
          }
        />
      ) : null}

      {showForm && published.length > 0 ? (
        <section className="panel intent-form-panel">
          <div className="panel__header">
            <div>
              <p className="eyebrow">新项目意图</p>
              <h2>把范围缩小到 7 天能完成</h2>
            </div>
            <span className="seven-day-stamp">
              <strong>7</strong>DAYS
            </span>
          </div>
          <form onSubmit={create}>
            <label className="field">
              <span>使用哪张公开资料</span>
              <select name="capsuleId" defaultValue={published[0]?.id}>
                {published.map((capsule) => (
                  <option key={capsule.id} value={capsule.id}>
                    {capsule.fields.goal}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>项目名称</span>
              <input name="title" required maxLength={60} placeholder="例如：AI 求职材料共创助手" />
            </label>
            <label className="field field--full">
              <span>要解决的小问题</span>
              <textarea
                name="summary"
                required
                rows={3}
                maxLength={300}
                placeholder="为正在转行的人，把零散经历整理成一个岗位相关的作品集案例。"
              />
            </label>
            <label className="field field--full">
              <span>第 7 天可以打开或展示的东西</span>
              <textarea
                name="desiredArtifact"
                required
                rows={2}
                maxLength={200}
                placeholder="一个可在线演示的 Web Demo + 3 分钟讲解稿"
              />
            </label>
            <label className="field">
              <span>希望哪天开始</span>
              <input
                name="startsOn"
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                defaultValue={tomorrow()}
              />
            </label>
            <InlineNotice tone="warning" title="合适的范围长这样">
              一个核心用户、一个关键任务、一条跑通的主流程。不要在 7
              天意图里写“完整平台”“商业化系统”或十几个功能。
            </InlineNotice>
            {error === null ? null : (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="button button--accent" type="submit" disabled={busy}>
              {busy ? "正在发布…" : "发布并开始发现搭档"}
              <Icon name="arrow" size={17} />
            </button>
          </form>
        </section>
      ) : null}

      {resource.data !== null && resource.data.intents.length > 0 ? (
        <section className="section-stack">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">我的项目意图</p>
              <h2>正在寻找互补搭档</h2>
            </div>
            <span className="count-label">
              {resource.data.intents.filter((item) => item.status === "active").length} 个进行中
            </span>
          </div>
          <div className="intent-list">
            {resource.data.intents.map((intent) => (
              <article
                className={`intent-card${intent.status === "paused" ? " intent-card--paused" : ""}`}
                key={intent.id}
              >
                <div className="intent-card__index">
                  <span>7</span>
                  <small>DAYS</small>
                </div>
                <div className="intent-card__main">
                  <div className="chip-row">
                    <span
                      className={`status-badge status-badge--${intent.status === "active" ? "green" : "gray"}`}
                    >
                      {intent.status === "active" ? "发现中" : "已暂停"}
                    </span>
                    {intent.startsOn === undefined ? null : (
                      <span className="mini-chip">{formatDate(intent.startsOn)} 开始</span>
                    )}
                  </div>
                  <h3>{intent.title}</h3>
                  <p>{intent.summary}</p>
                  <div className="deliverable">
                    <Icon name="project" size={17} />
                    <span>
                      <small>目标作品</small>
                      <strong>{intent.desiredArtifact}</strong>
                    </span>
                  </div>
                </div>
                <div className="intent-card__actions">
                  {intent.status === "active" ? (
                    <>
                      <Link className="button button--small button--dark" to="/discover">
                        查看匹配
                        <Icon name="arrow" size={15} />
                      </Link>
                      <button
                        className="text-button"
                        type="button"
                        disabled={busy}
                        onClick={() => pause(intent.id)}
                      >
                        暂停发现
                      </button>
                    </>
                  ) : (
                    <span className="muted-label">不会出现在新匹配中</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : !resource.loading && published.length > 0 && !showForm ? (
        <EmptyState
          title="还没有项目意图"
          description="先定义第 7 天的可见成果，再让 AI 开始寻找搭档。"
          action={
            <button
              className="button button--accent"
              type="button"
              onClick={() => setShowForm(true)}
            >
              创建第一个意图
            </button>
          }
        />
      ) : null}
      {error === null || showForm ? null : (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function tomorrow(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}
function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(
    new Date(value),
  );
}
