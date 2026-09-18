import type { ProductHandshakeStatus } from "./types.js";

const STATUS_LABELS = {
  DRAFT: "正在准备匹配资料",
  READY: "匹配资料已准备好",
  DISCOVERING: "正在寻找合适搭档",
  CANDIDATE_FOUND: "已找到一位候选搭档",
  OWNER_AUTHORIZED: "已获得你的交流许可",
  SCREENING: "双方 AI 正在了解",
  WAITING_OWNER: "等待你确认回答",
  CLARIFYING: "双方 AI 正在补充了解",
  REJECTED: "本次匹配存在明确冲突",
  PROPOSAL: "AI 建议双方进一步认识",
  WAITING_DUAL_CONSENT: "等待双方确认是否交换联系方式",
  NO_MATCH: "本次暂不继续",
  REVEALED: "双方已同意交换联系方式",
  INTRODUCED: "已建立联系，可以开始项目",
  FEEDBACK_COMPLETE: "7 天项目与合作反馈已完成",
  CANCELLED: "本次匹配已取消",
  EXPIRED: "本次匹配已过期",
  POLICY_BLOCKED: "为保护隐私，本次交流已停止",
  FAILED: "本次交流暂时无法完成",
  DISPUTED: "本次合作正在处理争议",
} as const satisfies Readonly<Record<ProductHandshakeStatus, string>>;

export function handshakeStatusLabel(status: ProductHandshakeStatus): string {
  return STATUS_LABELS[status];
}
