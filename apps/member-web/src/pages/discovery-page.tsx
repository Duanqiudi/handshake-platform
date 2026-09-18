import { useMemo, useState } from "react";
import { type Candidate, memberApi, type Recommendation } from "../api";
import { navigate } from "../app/routing";
import { useResource } from "../app/use-resource";
import { PageHeader } from "../components/app-shell";
import { EmptyState, ErrorState, friendlyError, LoadingState } from "../components/feedback";
import { Icon } from "../components/icons";
import { ConnectionModeBadge, ProviderMark } from "../components/provider";
import { RecommendationBadge } from "../components/status";

type Filter = "all" | Recommendation;

export function DiscoveryPage() {
  const resource = useResource((signal) => memberApi.listCandidates(signal));
  const [filter, setFilter] = useState<Filter>("all");
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const candidates = useMemo(
    () => resource.data?.filter((item) => filter === "all" || item.recommendation === filter) ?? [],
    [resource.data, filter],
  );

  const start = async (ownerId: string) => {
    setStarting(ownerId);
    setError(null);
    try {
      const handshake = await memberApi.createHandshake(ownerId);
      navigate(`/handshakes/${handshake.id}`);
    } catch (reason) {
      setError(friendlyError(reason));
      setStarting(null);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="第 4 步 · Explainable discovery"
        title="不是“最像你”的人，而是能补齐你的人"
        description="先过滤硬条件，再展示互补理由、仍未知的信息和可能冲突。这里没有虚假的 97% 匹配分。"
        action={
          <button className="button button--outline" type="button" onClick={resource.reload}>
            <span className={resource.loading ? "spin" : ""}>↻</span>重新查看
          </button>
        }
      />

      <div className="discovery-toolbar">
        <div className="filter-tabs" role="tablist" aria-label="候选筛选">
          {(
            [
              ["all", "全部"],
              ["continue", "值得了解"],
              ["needs_info", "需要信息"],
              ["conflict", "当前不合适"],
            ] as const
          ).map(([value, label]) => (
            <button
              type="button"
              role="tab"
              aria-selected={filter === value}
              key={value}
              onClick={() => setFilter(value)}
            >
              {label}
              <span>
                {resource.data?.filter((item) => value === "all" || item.recommendation === value)
                  .length ?? 0}
              </span>
            </button>
          ))}
        </div>
        <div className="explain-pill">
          <Icon name="spark" size={16} />
          理由来自双方已批准的 Capsule
        </div>
      </div>
      {resource.loading && resource.data === null ? (
        <LoadingState label="AI 正在寻找能力互补的搭档…" />
      ) : null}
      {resource.error !== null && resource.data === null ? (
        <ErrorState message={resource.error} onRetry={resource.reload} />
      ) : null}
      {error === null ? null : (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!resource.loading && resource.data?.length === 0 ? (
        <EmptyState
          title="暂时没有符合硬条件的人"
          description="可以稍后再来，或回到项目意图缩小方向、调整交付范围。平台不会为了填满列表而推荐明显不合适的人。"
        />
      ) : null}
      {resource.data !== null && candidates.length === 0 && resource.data.length > 0 ? (
        <EmptyState title="这个筛选下没有候选" description="换一个筛选条件看看其他候选。" />
      ) : null}

      <div className="candidate-grid">
        {candidates.map((candidate, index) => (
          <CandidateCard
            key={candidate.ownerId}
            candidate={candidate}
            index={index + 1}
            busy={starting === candidate.ownerId}
            onStart={() => start(candidate.ownerId)}
          />
        ))}
      </div>

      {resource.data !== null && resource.data.length > 0 ? (
        <div className="ranking-explainer">
          <div>
            <span className="ranking-explainer__number">?</span>
            <div>
              <strong>为什么没有匹配百分比？</strong>
              <p>
                早期、稀疏的资料不适合压成一个看似精确的数字。Handshake
                展示可以被你判断的理由、缺口和硬条件结果。
              </p>
            </div>
          </div>
          <div className="ranking-legend">
            <span>
              <i className="dot dot--green" />
              证据支持
            </span>
            <span>
              <i className="dot dot--amber" />
              仍需确认
            </span>
            <span>
              <i className="dot dot--gray" />
              存在冲突
            </span>
          </div>
        </div>
      ) : null}
    </>
  );
}

function CandidateCard({
  candidate,
  index,
  busy,
  onStart,
}: {
  candidate: Candidate;
  index: number;
  busy: boolean;
  onStart(): void;
}) {
  const [expanded, setExpanded] = useState(false);
  const fields = candidate.capsule.fields;
  return (
    <article className={`candidate-card candidate-card--${candidate.recommendation}`}>
      <div className="candidate-card__number">{String(index).padStart(2, "0")}</div>
      <header>
        <span className="portrait">{candidate.displayName.slice(0, 1)}</span>
        <div>
          <h2>{candidate.displayName}</h2>
          <p>{candidate.headline ?? "7 天作品集项目候选"}</p>
        </div>
        <ProviderMark provider={candidate.provider} compact />
      </header>
      <div className="candidate-card__badges">
        <RecommendationBadge value={candidate.recommendation} />
        <ConnectionModeBadge mode={candidate.connectionMode} />
      </div>
      <div className="candidate-card__project">
        <small>对方想做</small>
        <strong>{candidate.intentTitle ?? fields?.goal ?? "作品集项目"}</strong>
      </div>
      <div className="reason-list">
        <h3>
          <Icon name="spark" size={17} />
          为什么排在这里
        </h3>
        <ul>
          {candidate.reasons.map((reason) => (
            <li key={reason}>
              <Icon name="check" size={15} />
              {reason}
            </li>
          ))}
        </ul>
      </div>
      {candidate.matchedOffers.length > 0 ? (
        <div className="skill-match">
          <small>对方可以补齐</small>
          <div className="chip-row">
            {candidate.matchedOffers.map((skill) => (
              <span className="skill-chip" key={skill}>
                + {skill}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {candidate.gaps.length > 0 ? (
        <div className="gap-list">
          <small>还需要确认</small>
          {candidate.gaps.map((gap) => (
            <p key={gap}>
              <span>?</span>
              {gap}
            </p>
          ))}
        </div>
      ) : null}
      {expanded && fields !== undefined ? (
        <div className="candidate-details">
          <div>
            <small>可投入时间</small>
            <p>{fields.availability}</p>
          </div>
          <div>
            <small>协作偏好</small>
            <p>{fields.collaborationStyles.join(" · ")}</p>
          </div>
          <div>
            <small>项目兴趣</small>
            <p>{fields.projectInterests.join(" · ")}</p>
          </div>
        </div>
      ) : null}
      <footer>
        <button
          className="text-button"
          type="button"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "收起公开资料" : "查看公开资料"}
        </button>
        {candidate.recommendation === "conflict" ? (
          <span className="muted-label">建议先看其他候选</span>
        ) : (
          <button
            className="button button--dark button--small"
            type="button"
            disabled={busy}
            onClick={onStart}
          >
            {busy ? "正在建立…" : "让双方 AI 先聊聊"}
            <Icon name="arrow" size={15} />
          </button>
        )}
      </footer>
    </article>
  );
}
