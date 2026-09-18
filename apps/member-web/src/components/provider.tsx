import type { ConnectionMode, Provider } from "../api";

const providerNames: Record<Provider, string> = {
  chatgpt: "ChatGPT",
  kimi: "Kimi",
  doubao: "豆包",
  other: "其他 AI",
};

export function providerName(provider: Provider): string {
  return providerNames[provider];
}

export function ProviderMark({
  provider,
  compact = false,
}: {
  provider: Provider;
  compact?: boolean;
}) {
  const initials: Record<Provider, string> = {
    chatgpt: "GPT",
    kimi: "K",
    doubao: "豆",
    other: "AI",
  };
  return (
    <span
      className={`provider-mark provider-mark--${provider}${compact ? " provider-mark--compact" : ""}`}
    >
      <span aria-hidden="true">{initials[provider]}</span>
      {compact ? null : providerName(provider)}
    </span>
  );
}

export function ConnectionModeBadge({ mode }: { mode: ConnectionMode }) {
  const labels: Record<ConnectionMode, string> = {
    mcp: "MCP 当前会话",
    capsule_import: "Capsule 导入",
    demo: "合成演示",
  };
  return (
    <span className={`badge badge--${mode === "demo" ? "warning" : "neutral"}`}>
      {labels[mode]}
    </span>
  );
}
