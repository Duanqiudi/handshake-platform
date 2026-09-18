import { type FormEvent, useMemo, useState } from "react";
import { memberApi, type PortfolioProject } from "../api";
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

const PROJECT_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export function ProjectsPage() {
  const resource = useResource((signal) => memberApi.listProjects(signal));
  return (
    <>
      <PageHeader
        eyebrow="From match to making"
        title="把匹配结果变成一个作品"
        description="联系解锁不是终点。每个空间都带着 7 天计划、每日小结、作品链接和合作反馈。"
      />
      {resource.loading && resource.data === null ? (
        <LoadingState label="正在打开项目空间…" />
      ) : null}
      {resource.error !== null && resource.data === null ? (
        <ErrorState message={resource.error} onRetry={resource.reload} />
      ) : null}
      {resource.data?.length === 0 ? (
        <EmptyState
          title="还没有 7 天项目"
          description="双方对同一版披露摘要都选择继续后，平台才会创建项目空间。"
          action={
            <Link className="button button--accent" to="/handshakes">
              查看 Handshake
            </Link>
          }
        />
      ) : null}
      <div className="project-card-grid">
        {resource.data?.map((project) => {
          const completedDays = new Set(project.checkIns.map((item) => item.day)).size;
          return (
            <article className="project-card" key={project.id}>
              <div className="project-card__top">
                <span
                  className={`status-badge status-badge--${project.status === "completed" ? "green" : "blue"}`}
                >
                  {project.status === "completed" ? "已完成" : `第 ${project.day} 天`}
                </span>
                <span>{formatRange(project.startsAt, project.endsAt)}</span>
              </div>
              <h2>{project.title}</h2>
              <div className="project-members">
                {project.members.map((member) => (
                  <span key={member.ownerId} title={`${member.displayName} · ${member.role}`}>
                    {member.displayName.slice(0, 1)}
                  </span>
                ))}
                <p>{project.members.map((item) => item.displayName).join(" × ")}</p>
              </div>
              <div
                className="project-progress"
                role="progressbar"
                aria-label="项目打卡进度"
                aria-valuemin={0}
                aria-valuemax={7}
                aria-valuenow={completedDays}
              >
                <div>
                  <i style={{ width: `${(completedDays / 7) * 100}%` }} />
                </div>
                <span>{completedDays}/7 天有记录</span>
              </div>
              <div className="project-card__stats">
                <span>
                  <strong>{project.artifacts.length}</strong>作品链接
                </span>
                <span>
                  <strong>{project.feedback.length}</strong>/2 合作反馈
                </span>
              </div>
              <Link className="button button--dark button--block" to={`/projects/${project.id}`}>
                进入项目空间
                <Icon name="arrow" size={16} />
              </Link>
            </article>
          );
        })}
      </div>
    </>
  );
}

export function ProjectDetailPage({ id }: { id: string }) {
  const resource = useResource((signal) => memberApi.getProject(id, signal));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<"checkin" | "artifact" | "feedback" | null>(null);

  const mutate = async (operation: () => Promise<PortfolioProject>) => {
    setBusy(true);
    setError(null);
    try {
      const next = await operation();
      resource.setData(next);
      setPanel(null);
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      setBusy(false);
    }
  };

  if (resource.loading && resource.data === null)
    return <LoadingState label="正在准备 7 天工作台…" />;
  if (resource.error !== null && resource.data === null)
    return <ErrorState message={resource.error} onRetry={resource.reload} />;
  const project = resource.data;
  if (project === null) return null;
  const completed = project.status === "completed";
  const completedDays = new Set(project.checkIns.map((item) => item.day));
  const defaultDay = Math.min(
    7,
    Math.max(1, ...project.checkIns.map((item) => item.day + 1), project.day),
  );

  return (
    <>
      <div className="detail-back">
        <Link to="/projects">← 返回全部项目</Link>
      </div>
      <header className="project-hero">
        <div>
          <p className="eyebrow">7-day portfolio sprint</p>
          <h1>{project.title}</h1>
          <div className="project-hero__meta">
            <span>
              <Icon name="clock" size={16} />
              {formatRange(project.startsAt, project.endsAt)}
            </span>
            <span>{project.members.map((item) => item.displayName).join(" × ")}</span>
            <span
              className={`status-badge status-badge--${project.status === "completed" ? "green" : "blue"}`}
            >
              {project.status === "completed" ? "已完成并互评" : "协作中"}
            </span>
          </div>
        </div>
        <div className="project-hero__day">
          <strong>{completedDays.size}</strong>
          <span>
            / 7<small>有进度记录</small>
          </span>
        </div>
      </header>

      {error === null ? null : (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {completed ? (
        <InlineNotice tone="success" title="这个 7 天项目已经完成">
          已沉淀 {completedDays.size} 天进度、{project.artifacts.length} 个作品链接和双方合作反馈。
          项目空间现已转为只读，历史记录会继续保留，方便面试展示与复盘。
        </InlineNotice>
      ) : null}
      <div className="project-workspace">
        <main className="project-workspace__main">
          <section className="panel sprint-plan">
            <div className="panel__header">
              <div>
                <p className="eyebrow">共同路线图</p>
                <h2>7 天冲刺计划</h2>
              </div>
              <span className="count-label">{completedDays.size}/7</span>
            </div>
            <ol>
              {project.plan.map((item) => (
                <li
                  className={
                    item.done || completedDays.has(item.day)
                      ? "is-done"
                      : item.day === defaultDay
                        ? "is-current"
                        : ""
                  }
                  key={item.day}
                >
                  <span>
                    {item.done || completedDays.has(item.day) ? (
                      <Icon name="check" size={15} />
                    ) : (
                      item.day
                    )}
                  </span>
                  <div>
                    <small>DAY {item.day}</small>
                    <strong>{item.title}</strong>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="panel checkin-feed">
            <div className="panel__header">
              <div>
                <p className="eyebrow">异步站会</p>
                <h2>每日进度</h2>
              </div>
              {completed ? (
                <span className="status-badge status-badge--green">只读记录</span>
              ) : (
                <button
                  className="button button--small button--dark"
                  type="button"
                  onClick={() => setPanel(panel === "checkin" ? null : "checkin")}
                >
                  <Icon name="plus" size={15} />
                  记录今天
                </button>
              )}
            </div>
            {!completed && panel === "checkin" ? (
              <CheckInForm
                day={defaultDay}
                busy={busy}
                onSubmit={(input) => mutate(() => memberApi.addCheckIn(project.id, input))}
              />
            ) : null}
            {project.checkIns.length === 0 ? (
              <EmptyState
                title="还没有进度记录"
                description="用三句话同步：完成了什么、卡在哪里、下一步做什么。"
              />
            ) : (
              <ol className="checkin-list">
                {[...project.checkIns]
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .map((item) => (
                    <li key={item.id}>
                      <span className="day-dot">D{item.day}</span>
                      <div>
                        <div>
                          <strong>
                            {project.members.find((member) => member.ownerId === item.ownerId)
                              ?.displayName ?? "项目成员"}
                          </strong>
                          <time>{formatDateTime(item.createdAt)}</time>
                        </div>
                        <p>{item.summary}</p>
                        {item.blocker === undefined ? null : (
                          <small className="blocker">阻塞：{item.blocker}</small>
                        )}
                        {item.nextStep === undefined ? null : (
                          <small>下一步：{item.nextStep}</small>
                        )}
                      </div>
                    </li>
                  ))}
              </ol>
            )}
          </section>
        </main>

        <aside className="project-workspace__aside">
          <section className="panel artifact-panel">
            <div className="panel__header">
              <div>
                <p className="eyebrow">可展示成果</p>
                <h2>作品链接</h2>
              </div>
              {completed ? null : (
                <button
                  className="icon-button"
                  type="button"
                  aria-label="添加作品"
                  onClick={() => setPanel(panel === "artifact" ? null : "artifact")}
                >
                  <Icon name="plus" />
                </button>
              )}
            </div>
            {!completed && panel === "artifact" ? (
              <ArtifactForm
                busy={busy}
                onSubmit={(input) => mutate(() => memberApi.addArtifact(project.id, input))}
              />
            ) : null}
            {project.artifacts.length === 0 ? (
              <p className="panel-placeholder">部署地址、GitHub、演示视频都可以放在这里。</p>
            ) : (
              <div className="artifact-list">
                {project.artifacts.map((item) => (
                  <a href={item.url} target="_blank" rel="noreferrer" key={item.id}>
                    <span>
                      <Icon name="project" size={17} />
                    </span>
                    <div>
                      <strong>{item.title}</strong>
                      <small>{new URL(item.url).hostname}</small>
                    </div>
                    <Icon name="arrow" size={15} />
                  </a>
                ))}
              </div>
            )}
          </section>

          <section className="panel team-panel">
            <p className="eyebrow">项目小队</p>
            <h2>各自负责，也共同交付</h2>
            {project.members.map((member, index) => (
              <div className="team-member" key={member.ownerId}>
                <span
                  className={index === 0 ? "portrait portrait--lime" : "portrait portrait--coral"}
                >
                  {member.displayName.slice(0, 1)}
                </span>
                <div>
                  <strong>{member.displayName}</strong>
                  <small>{member.role}</small>
                </div>
              </div>
            ))}
          </section>

          <section className="panel feedback-panel">
            <p className="eyebrow">完成闭环</p>
            <h2>项目互评</h2>
            <p>反馈只在项目结束时使用，不会改变历史匹配解释。</p>
            <div className="feedback-count">
              <strong>{project.feedback.length}</strong>
              <span>/ 2 人已提交</span>
            </div>
            {completed ? (
              <InlineNotice tone="success" title="双方互评已完成">
                这次合作已正式收口。反馈与作品记录保留为项目成果，不再接受修改。
              </InlineNotice>
            ) : project.feedback.length > 0 ? (
              <InlineNotice tone="success" title="已有合作反馈">
                另一位成员的反馈要等双方都提交后再用于展示。
              </InlineNotice>
            ) : null}
            {completed ? null : (
              <>
                <button
                  className="button button--outline button--block"
                  type="button"
                  onClick={() => setPanel(panel === "feedback" ? null : "feedback")}
                >
                  填写我的反馈
                </button>
                {panel === "feedback" ? (
                  <FeedbackForm
                    busy={busy}
                    onSubmit={(input) => mutate(() => memberApi.addFeedback(project.id, input))}
                  />
                ) : null}
              </>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}

function CheckInForm({
  day,
  busy,
  onSubmit,
}: {
  day: number;
  busy: boolean;
  onSubmit(input: { day: number; summary: string; blocker?: string; nextStep: string }): void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const blocker = String(data.get("blocker") ?? "").trim();
    onSubmit({
      day: Number(data.get("day")),
      summary: String(data.get("summary") ?? ""),
      nextStep: String(data.get("nextStep") ?? ""),
      ...(blocker === "" ? {} : { blocker }),
    });
  };
  return (
    <form className="inline-form" onSubmit={submit}>
      <label className="field">
        <span>第几天</span>
        <select name="day" defaultValue={day}>
          {PROJECT_DAYS.map((projectDay) => (
            <option value={projectDay} key={`day-${projectDay}`}>
              第 {projectDay} 天
            </option>
          ))}
        </select>
      </label>
      <label className="field field--full">
        <span>今天完成了什么</span>
        <textarea
          name="summary"
          rows={2}
          required
          placeholder="例如：完成主流程低保真原型，并确认 3 个成功标准。"
        />
      </label>
      <label className="field">
        <span>当前阻塞（可选）</span>
        <input name="blocker" placeholder="没有可以留空" />
      </label>
      <label className="field">
        <span>明确的下一步</span>
        <input name="nextStep" required placeholder="明晚前跑通模型调用" />
      </label>
      <button className="button button--accent" disabled={busy} type="submit">
        {busy ? "正在保存…" : "发布进度"}
      </button>
    </form>
  );
}

function ArtifactForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit(input: { title: string; url: string }): void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSubmit({ title: String(data.get("title") ?? ""), url: String(data.get("url") ?? "") });
  };
  return (
    <form className="mini-form" onSubmit={submit}>
      <label className="field">
        <span>作品名称</span>
        <input name="title" required placeholder="在线 Demo" />
      </label>
      <label className="field">
        <span>公开链接</span>
        <input name="url" type="url" required placeholder="https://…" />
      </label>
      <button className="button button--accent button--block" disabled={busy} type="submit">
        保存作品
      </button>
    </form>
  );
}

function FeedbackForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit(input: {
    completed: boolean;
    rating: number;
    wouldCollaborateAgain: boolean;
    comment?: string;
  }): void;
}) {
  const [rating, setRating] = useState(5);
  const [again, setAgain] = useState(true);
  const labels = useMemo(
    () => ["", "需要改进", "勉强完成", "符合预期", "合作顺畅", "非常推荐"],
    [],
  );
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const comment = String(data.get("comment") ?? "").trim();
    onSubmit({
      completed: data.get("completed") === "on",
      rating,
      wouldCollaborateAgain: again,
      ...(comment === "" ? {} : { comment }),
    });
  };
  return (
    <form className="feedback-form" onSubmit={submit}>
      <div className="rating-row">
        <span>合作评分</span>
        <div>
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              type="button"
              aria-label={`${value} 分`}
              className={value <= rating ? "is-active" : ""}
              onClick={() => setRating(value)}
              key={value}
            >
              ★
            </button>
          ))}
        </div>
        <small>{labels[rating]}</small>
      </div>
      <label className="plain-check">
        <input type="checkbox" name="completed" defaultChecked />
        我们完成了一个可以展示的作品
      </label>
      <fieldset>
        <legend>以后愿意再次合作吗？</legend>
        <label>
          <input type="radio" checked={again} onChange={() => setAgain(true)} />
          愿意
        </label>
        <label>
          <input type="radio" checked={!again} onChange={() => setAgain(false)} />
          暂时不会
        </label>
      </fieldset>
      <label className="field">
        <span>给这次合作的一句话</span>
        <textarea name="comment" rows={3} placeholder="哪些方式值得保留？" />
      </label>
      <button className="button button--dark button--block" disabled={busy} type="submit">
        提交合作反馈
      </button>
    </form>
  );
}

function formatRange(start: string, end: string): string {
  const formatter = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" });
  return `${formatter.format(new Date(start))} — ${formatter.format(new Date(end))}`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
