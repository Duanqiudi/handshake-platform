import type { HandshakeView, Recommendation } from "../api";

export function StatusBadge({ status }: { status: HandshakeView["status"] }) {
  const details: Record<HandshakeView["status"], { label: string; tone: string }> = {
    SCREENING: { label: "AI 了解中", tone: "blue" },
    WAITING_OWNER: { label: "等待主人确认", tone: "amber" },
    CLARIFYING: { label: "补充信息中", tone: "blue" },
    PROPOSAL: { label: "建议已生成", tone: "violet" },
    WAITING_DUAL_CONSENT: { label: "等待双重同意", tone: "amber" },
    REVEALED: { label: "已建立联系", tone: "green" },
    DECLINED: { label: "已结束", tone: "gray" },
    EXPIRED: { label: "已过期", tone: "gray" },
  };
  return (
    <span className={`status-badge status-badge--${details[status].tone}`}>
      {details[status].label}
    </span>
  );
}

export function RecommendationBadge({ value }: { value: Recommendation }) {
  const details: Record<Recommendation, { label: string; tone: string }> = {
    continue: { label: "值得继续了解", tone: "green" },
    needs_info: { label: "需要补充信息", tone: "amber" },
    conflict: { label: "当前不太合适", tone: "gray" },
  };
  return (
    <span className={`status-badge status-badge--${details[value].tone}`}>
      {details[value].label}
    </span>
  );
}
