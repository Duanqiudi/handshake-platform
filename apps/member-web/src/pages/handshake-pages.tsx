import { type FormEvent, useState } from "react";
import { type HandshakeView, memberApi, type ScreeningQuestion } from "../api";
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
import { ProviderMark } from "../components/provider";
import { RecommendationBadge, StatusBadge } from "../components/status";

const ROUND_MARKERS = ["round-1", "round-2", "round-3"] as const;
const QUESTION_FIELDS = [
  ["availability", "可投入时间与档期"],
  ["offers", "对方能提供的技能"],
  ["seeks", "对方希望补齐的技能"],
  ["collaborationStyles", "协作方式"],
  ["projectInterests", "项目兴趣"],
  ["goal", "本轮项目目标"],
  ["location", "地点与远程方式"],
  ["languages", "沟通语言"],
] as const;

export function HandshakesPage() {
  const resource = useResource((signal) => memberApi.listHandshakes(signal));
  return (
    <>
      <PageHeader
        eyebrow="AI-to-AI screening"
        title="每一次了解，都有明确边界"
        description="双方 AI 最多进行 3 轮结构化问答。问题、回答、建议和主人决定都进入同一条可审计时间线。"
      />
      {resource.loading && resource.data === null ? (
        <LoadingState label="正在整理 Handshake…" />
      ) : null}
      {resource.error !== null && resource.data === null ? (
        <ErrorState message={resource.error} onRetry={resource.reload} />
      ) : null}
      {resource.data?.length === 0 ? (
        <EmptyState
          title="还没有 Handshake"
          description="在发现页选择一位候选，双方 AI 就能围绕这个项目做有限了解。"
          action={
            <Link className="button button--accent" to="/discover">
              发现项目搭档
            </Link>
          }
        />
      ) : null}
      <div className="handshake-list">
        {resource.data?.map((handshake) => (
          <HandshakeListCard key={handshake.id} handshake={handshake} />
        ))}
      </div>
    </>
  );
}

function HandshakeListCard({ handshake }: { handshake: HandshakeView }) {
  const pending = handshake.pendingQuestions.filter((item) => item.status === "pending").length;
  return (
    <article className="handshake-list-card">
      <div className="participant-stack participant-stack--large">
        {handshake.participants.map((person) => (
          <span key={person.ownerId}>{person.displayName.slice(0, 1)}</span>
        ))}
      </div>
      <div className="handshake-list-card__main">
        <div>
          <StatusBadge status={handshake.status} />
          {pending === 0 ? null : (
            <span className="notification-badge">{pending} 个待处理问题</span>
          )}
        </div>
        <h2>{handshake.participants.map((item) => item.displayName).join(" × ")}</h2>
        <p>{handshake.statusLabel}</p>
      </div>
      <div className="round-meter">
        <small>对话轮次</small>
        <div>
          {ROUND_MARKERS.slice(0, handshake.maxRounds ?? 3).map((marker, index) => (
            <i className={index < (handshake.roundsUsed ?? 0) ? "is-used" : ""} key={marker} />
          ))}
        </div>
        <span>
          {handshake.roundsUsed ?? 0}/{handshake.maxRounds ?? 3}
        </span>
      </div>
      <Link className="button button--small button--outline" to={`/handshakes/${handshake.id}`}>
        {pending > 0 ? "查看并确认" : "查看详情"}
        <Icon name="arrow" size={15} />
      </Link>
    </article>
  );
}

export function HandshakeDetailPage({ id }: { id: string }) {
  const resource = useResource((signal) => memberApi.getHandshake(id, signal));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (resource.loading && resource.data === null)
    return <LoadingState label="正在加载这次 Handshake…" />;
  if (resource.error !== null && resource.data === null)
    return <ErrorState message={resource.error} onRetry={resource.reload} />;
  const handshake = resource.data;
  if (handshake === null) return null;
  const me =
    handshake.participants.find((person) => person.isCurrentOwner) ?? handshake.participants[0];
  const other = handshake.participants.find((person) => person.ownerId !== me?.ownerId);
  const incoming = handshake.pendingQuestions.filter(
    (question) => question.status === "pending" && question.askedBy !== me?.ownerId,
  );
  const hasMyRecommendation = handshake.recommendations.some(
    (item) => item.ownerId === me?.ownerId,
  );
  const hasPendingQuestion = handshake.timeline.some(
    (item) => item.type === "question" && item.status === "pending",
  );
  const canSubmitRecommendation =
    !hasMyRecommendation &&
    !hasPendingQuestion &&
    (handshake.status === "SCREENING" || handshake.status === "PROPOSAL");
  const showRecommendationPanel = handshake.recommendations.length > 0 || canSubmitRecommendation;

  const mutate = async (operation: () => Promise<HandshakeView>) => {
    setBusy(true);
    setError(null);
    try {
      const next = await operation();
      resource.setData(next);
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="detail-back">
        <Link to="/handshakes">← 返回全部 Handshake</Link>
      </div>
      <header className="handshake-hero">
        <div className="handshake-hero__people">
          {handshake.participants.map((person, index) => (
            <div className="handshake-person" key={person.ownerId}>
              <span className={`portrait ${index === 0 ? "portrait--lime" : "portrait--coral"}`}>
                {person.displayName.slice(0, 1)}
              </span>
              <div>
                <strong>
                  {person.displayName}
                  {person.isCurrentOwner ? "（你）" : ""}
                </strong>
                <ProviderMark provider={person.provider} />
              </div>
            </div>
          ))}
          <div className="handshake-link-art" aria-hidden="true">
            <i />
            <Icon name="handshake" />
            <i />
          </div>
        </div>
        <div className="handshake-hero__status">
          <StatusBadge status={handshake.status} />
          <h1>{handshake.statusLabel}</h1>
          <p>
            问题只围绕当前项目，最多 {handshake.maxRounds ?? 3} 轮。任何回答都要先经过主人确认。
          </p>
        </div>
        <div className="round-counter">
          <strong>{handshake.roundsUsed ?? 0}</strong>
          <span>
            / {handshake.maxRounds ?? 3}
            <small>已用轮次</small>
          </span>
        </div>
      </header>
      {error === null ? null : (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="handshake-detail-grid">
        <div className="handshake-main-column">
          {incoming.map((question) => (
            <AnswerQuestionCard
              key={question.id}
              question={question}
              otherName={other?.displayName ?? "对方"}
              busy={busy}
              onSubmit={(input) =>
                mutate(() => memberApi.answerQuestion(handshake.id, question.id, input))
              }
            />
          ))}

          {(handshake.status === "SCREENING" || handshake.status === "CLARIFYING") &&
          incoming.length === 0 &&
          !hasPendingQuestion &&
          other !== undefined ? (
            <AskQuestionCard
              handshake={handshake}
              otherId={other.ownerId}
              otherName={other.displayName}
              busy={busy}
              onSubmit={(input) => mutate(() => memberApi.askQuestion(handshake.id, input))}
            />
          ) : null}

          {handshake.status === "WAITING_OWNER" && incoming.length === 0 ? (
            <InlineNotice title="正在等对方确认回答">
              问题已经安全送达。对方主人确认最小回答前，你不能继续提问，也看不到对方的私密信息。
            </InlineNotice>
          ) : null}

          {showRecommendationPanel ? (
            <section className="panel recommendation-panel">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">双方 AI 的独立建议</p>
                  <h2>建议是参考，不替你做决定</h2>
                </div>
                <Icon name="spark" size={24} />
              </div>
              <div className="recommendation-cards">
                {handshake.recommendations.map((recommendation) => {
                  const person = handshake.participants.find(
                    (item) => item.ownerId === recommendation.ownerId,
                  );
                  return (
                    <article key={recommendation.ownerId}>
                      <div>
                        <span className="mini-avatar">{person?.displayName.slice(0, 1)}</span>
                        <strong>{person?.displayName} 的 AI</strong>
                        <RecommendationBadge value={recommendation.recommendation} />
                      </div>
                      <p>{recommendation.summary}</p>
                      <ul>
                        {recommendation.reasons.map((reason) => (
                          <li key={reason}>
                            <Icon name="check" size={14} />
                            {reason}
                          </li>
                        ))}
                      </ul>
                    </article>
                  );
                })}
                {canSubmitRecommendation ? (
                  <article className="recommendation-placeholder">
                    <Icon name="spark" size={22} />
                    <strong>你的 AI 可以给出独立建议</strong>
                    <p>如果信息已经足够，可以进入主人决定；也可以先继续提问。</p>
                  </article>
                ) : null}
              </div>
              {canSubmitRecommendation ? (
                <div className="recommendation-actions">
                  <button
                    className="button button--accent"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      mutate(() =>
                        memberApi.submitRecommendation(handshake.id, {
                          recommendation: "continue",
                          summary: "技能、目标与协作时间互补，建议由主人做最终确认。",
                          reasons: ["技能互补", "交付目标一致", "时间安排兼容"],
                        }),
                      )
                    }
                  >
                    建议继续
                  </button>
                  <button
                    className="button button--outline"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      mutate(() =>
                        memberApi.submitRecommendation(handshake.id, {
                          recommendation: "owner_review",
                          summary: "仍有信息需要主人判断。",
                          reasons: ["有一个非硬性信息尚不明确"],
                        }),
                      )
                    }
                  >
                    转人工复核
                  </button>
                  <button
                    className="text-button text-button--danger"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      mutate(() =>
                        memberApi.submitRecommendation(handshake.id, {
                          recommendation: "decline",
                          summary: "当前项目条件存在明显冲突。",
                        }),
                      )
                    }
                  >
                    建议结束
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}

          {handshake.status === "WAITING_DUAL_CONSENT" ? (
            <ConsentCard
              handshake={handshake}
              myOwnerId={me?.ownerId ?? ""}
              busy={busy}
              onDecide={(decision, consentVersion) =>
                mutate(() => memberApi.submitDecision(handshake.id, { decision, consentVersion }))
              }
            />
          ) : null}

          {handshake.status === "REVEALED" ? <ContactRevealCard handshake={handshake} /> : null}
          {handshake.status === "DECLINED" ? (
            <InlineNotice title="这次匹配已经结束">
              双方不会交换联系方式。历史披露仍可在隐私收据中查看，资料来源可在公开资料页停用。
            </InlineNotice>
          ) : null}
        </div>

        <aside className="handshake-aside">
          <section className="panel timeline-panel">
            <div className="panel__header">
              <div>
                <p className="eyebrow">可审计记录</p>
                <h2>时间线</h2>
              </div>
            </div>
            <ol className="timeline">
              {handshake.timeline.map((item) => (
                <li key={item.id} className={`timeline__item timeline__item--${item.type}`}>
                  <span>
                    <Icon name={timelineIcon(item.type)} size={15} />
                  </span>
                  <div>
                    <time>{formatTime(item.createdAt)}</time>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <section className="panel guardrail-panel">
            <Icon name="shield" size={23} />
            <h3>本轮安全边界</h3>
            <ul>
              <li>最多 {handshake.maxRounds ?? 3} 轮</li>
              <li>每轮最多 3 个问题</li>
              <li>不发送原始聊天记录</li>
              <li>主人确认后才发送 Claim</li>
              <li>双重同意前无联系方式</li>
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}

function AnswerQuestionCard({
  question,
  otherName,
  busy,
  onSubmit,
}: {
  question: ScreeningQuestion;
  otherName: string;
  busy: boolean;
  onSubmit(input: {
    answer: string;
    ownerConfirmed: true;
    sourceType?: string;
    confidence?: number;
    expiresAt?: string;
  }): void;
}) {
  const [answer, setAnswer] = useState(
    "可以。周日 20:00–21:00 我可以参加 30 分钟录制，并提前准备产品部分讲解。",
  );
  const [confirmed, setConfirmed] = useState(false);
  const [expiresAt, setExpiresAt] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return date.toISOString().slice(0, 10);
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!confirmed) return;
    onSubmit({
      answer,
      ownerConfirmed: true,
      sourceType: "owner_confirmed_ai_draft",
      confidence: 1,
      expiresAt: new Date(`${expiresAt}T23:59:59.000Z`).toISOString(),
    });
  };
  return (
    <section className="panel question-card question-card--incoming">
      <div className="question-card__badge">
        <span className="pulse-dot" />
        等待你确认
      </div>
      <p className="eyebrow">
        {otherName} 的 AI · 第 {question.round} 轮
      </p>
      <h2>“{question.prompt}”</h2>
      <p className="question-purpose">
        <Icon name="intent" size={16} />
        <span>
          <strong>提问用途：</strong>
          {question.purpose}
        </span>
      </p>
      <form onSubmit={submit}>
        <label className="field">
          <span>你的 AI 准备的最小回答</span>
          <textarea rows={4} value={answer} onChange={(event) => setAnswer(event.target.value)} />
        </label>
        <div className="answer-controls">
          <label className="field">
            <span>这条回答保留到</span>
            <input
              type="date"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
            />
          </label>
          <div className="answer-scope">
            <Icon name="lock" size={17} />
            <span>
              <strong>只会发送上方文字</strong>
              <small>不会附带推理过程或原始 Memory</small>
            </span>
          </div>
        </div>
        <label className="confirmation-check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>
            <i>{confirmed ? <Icon name="check" size={13} /> : null}</i>
            <strong>我已阅读并允许把这条回答发给 {otherName}</strong>
            <small>用途仅限本次 7 天项目搭档筛选</small>
          </span>
        </label>
        <button
          className="button button--accent"
          type="submit"
          disabled={!confirmed || busy || answer.trim() === ""}
        >
          {busy ? "正在安全发送…" : "确认并发送这条回答"}
          <Icon name="arrow" size={17} />
        </button>
      </form>
    </section>
  );
}

function AskQuestionCard({
  handshake,
  otherId,
  otherName,
  busy,
  onSubmit,
}: {
  handshake: HandshakeView;
  otherId: string;
  otherName: string;
  busy: boolean;
  onSubmit(input: {
    toOwnerId: string;
    predicate: string;
    prompt: string;
    required?: boolean;
  }): void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSubmit({
      toOwnerId: otherId,
      predicate: String(data.get("predicate") ?? ""),
      prompt: String(data.get("prompt") ?? ""),
      required: data.get("required") === "on",
    });
  };
  const exhausted = (handshake.roundsUsed ?? 0) >= (handshake.maxRounds ?? 3);
  return (
    <section className="panel ask-card">
      <div className="panel__header">
        <div>
          <p className="eyebrow">还缺一条关键信息？</p>
          <h2>让你的 AI 问 {otherName}</h2>
        </div>
        <span className="round-label">
          剩余 {(handshake.maxRounds ?? 3) - (handshake.roundsUsed ?? 0)} 轮
        </span>
      </div>
      {exhausted ? (
        <InlineNotice tone="warning" title="提问预算已用完">
          有限轮次可以避免 AI 陷入没有结果的无限对话。请基于现有信息做决定。
        </InlineNotice>
      ) : (
        <form onSubmit={submit}>
          <label className="field">
            <span>想确认的判断条件</span>
            <select name="predicate" defaultValue="availability" required>
              {QUESTION_FIELDS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>发给对方 AI 的问题</span>
            <textarea
              name="prompt"
              rows={3}
              required
              placeholder="例如：你能否在周日晚上参加 30 分钟最终演示？"
            />
          </label>
          <label className="plain-check">
            <input name="required" type="checkbox" />
            这是继续匹配的硬条件
          </label>
          <button className="button button--dark" type="submit" disabled={busy}>
            {busy ? "正在发送…" : "发送结构化问题"}
          </button>
        </form>
      )}
    </section>
  );
}

function ConsentCard({
  handshake,
  myOwnerId,
  busy,
  onDecide,
}: {
  handshake: HandshakeView;
  myOwnerId: string;
  busy: boolean;
  onDecide(decision: "continue" | "decline" | "more_info", version: string): void;
}) {
  const summary = handshake.disclosureSummary ?? { version: "consent-v1", items: [] };
  const mine = handshake.decisions.find((item) => item.ownerId === myOwnerId);
  return (
    <section className="panel consent-card">
      <div className="consent-card__icon">
        <Icon name="handshake" size={28} />
      </div>
      <p className="eyebrow">Human decision checkpoint</p>
      <h2>AI 的工作到这里，接下来由你决定</h2>
      <p>如果继续，你和对方将基于下面同一版摘要交换联系方式，并自动建立一个 7 天项目空间。</p>
      <div className="disclosure-summary">
        <div>
          <strong>披露摘要</strong>
          <span>版本 {summary.version}</span>
        </div>
        <ul>
          {summary.items.map((item) => (
            <li key={item}>
              <Icon name="check" size={15} />
              {item}
            </li>
          ))}
        </ul>
      </div>
      <div className="decision-progress">
        {handshake.participants.map((person) => {
          const decision = handshake.decisions.find((item) => item.ownerId === person.ownerId);
          return (
            <div key={person.ownerId}>
              <span className={decision?.decision === "continue" ? "is-done" : ""}>
                {decision?.decision === "continue" ? (
                  <Icon name="check" size={14} />
                ) : (
                  person.displayName.slice(0, 1)
                )}
              </span>
              <div>
                <strong>
                  {person.displayName}
                  {person.ownerId === myOwnerId ? "（你）" : ""}
                </strong>
                <small>
                  {decision === undefined
                    ? "等待决定"
                    : decision.decision === "continue"
                      ? "已同意继续"
                      : "已拒绝"}
                </small>
              </div>
            </div>
          );
        })}
      </div>
      {mine !== undefined ? (
        <InlineNotice tone="success" title="你的决定已提交">
          正在等待另一位主人对同一版本做出决定。联系方式仍然锁定。
        </InlineNotice>
      ) : (
        <>
          <div className="contact-locked">
            <Icon name="lock" />
            <span>
              <strong>联系方式仍被锁定</strong>
              <small>只有两位主人都选择继续，服务端才会返回联系方式。</small>
            </span>
          </div>
          <div className="consent-actions">
            <button
              className="button button--accent button--large"
              type="button"
              disabled={busy}
              onClick={() => onDecide("continue", summary.version)}
            >
              我愿意交换联系并开工
              <Icon name="arrow" />
            </button>
            <button
              className="button button--outline"
              type="button"
              disabled={busy}
              onClick={() => onDecide("more_info", summary.version)}
            >
              我还想了解
            </button>
            <button
              className="text-button text-button--danger"
              type="button"
              disabled={busy}
              onClick={() => onDecide("decline", summary.version)}
            >
              礼貌结束
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function ContactRevealCard({ handshake }: { handshake: HandshakeView }) {
  if (handshake.contactReveal === null) return null;
  return (
    <section className="panel reveal-card">
      <div className="reveal-card__burst" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <span className="reveal-card__check">
        <Icon name="check" size={25} />
      </span>
      <p className="eyebrow">Mutual consent complete</p>
      <h2>你们可以正式认识了</h2>
      <p>
        双方都同意了版本 {handshake.contactReveal.consentVersion}。下面的信息此前从未进入本页面。
      </p>
      <div className="contact-cards">
        {handshake.contactReveal.contacts.map((contact) => (
          <div key={contact.ownerId}>
            <span className="portrait">{contact.displayName.slice(0, 1)}</span>
            <div>
              <strong>{contact.displayName}</strong>
              <small>{contact.channel}</small>
              <code>{contact.value}</code>
            </div>
            <button
              className="button button--small button--outline"
              type="button"
              onClick={() => navigator.clipboard.writeText(contact.value)}
            >
              复制
            </button>
          </div>
        ))}
      </div>
      {handshake.projectId === null ? null : (
        <Link
          className="button button--accent button--large"
          to={`/projects/${handshake.projectId}`}
        >
          进入 7 天项目空间
          <Icon name="arrow" />
        </Link>
      )}
    </section>
  );
}

function timelineIcon(
  type: HandshakeView["timeline"][number]["type"],
): "plus" | "discover" | "check" | "spark" | "handshake" {
  if (type === "created") return "plus";
  if (type === "question") return "discover";
  if (type === "answer" || type === "decision") return "check";
  if (type === "revealed") return "handshake";
  return "spark";
}
function formatTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
