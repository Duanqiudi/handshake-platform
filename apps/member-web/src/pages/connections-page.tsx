import { type FormEvent, useState } from "react";
import { type AiConnection, memberApi, type Provider } from "../api";
import { useAuth } from "../app/auth";
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
import { ConnectionModeBadge, ProviderMark, providerName } from "../components/provider";

const providers: Array<{ id: Provider; description: string; recommended?: boolean }> = [
  {
    id: "chatgpt",
    description: "客户端支持本地 stdio MCP 时，可在当前会话生成和发布 Capsule",
    recommended: true,
  },
  { id: "kimi", description: "客户端支持 MCP 时可调用工具，否则使用 Capsule 导入" },
  { id: "doubao", description: "先使用 Capsule 导入，不承诺后台唤醒" },
  { id: "other", description: "任何能输出标准 JSON 的个人 AI" },
];

const MCP_STDIO_CONFIG_TEMPLATE = `{
  "mcpServers": {
    "handshake": {
      "command": "node",
      "args": ["<ABSOLUTE_REPO_PATH>/apps/handshake-mcp/dist/main.js"],
      "env": {
        "HANDSHAKE_API_BASE_URL": "http://127.0.0.1:3220",
        "HANDSHAKE_OWNER_TOKEN": "<YOUR_OWNER_TOKEN>"
      }
    }
  }
}`;

export function ConnectionsPage() {
  const auth = useAuth();
  const resource = useResource((signal) => memberApi.listConnections(signal));
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<Provider>("chatgpt");
  const [mode, setMode] = useState<"mcp" | "capsule_import">("mcp");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await memberApi.createConnection({
        provider: selected,
        label: String(data.get("label") ?? `我的 ${providerName(selected)}`),
        mode,
      });
      setShowAdd(false);
      resource.reload();
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      setBusy(false);
    }
  };

  const copyMcpConfig = async () => {
    if (auth.token === null) {
      setError("当前会话没有 owner token，请重新登录后再复制配置。");
      return;
    }
    try {
      await navigator.clipboard.writeText(
        MCP_STDIO_CONFIG_TEMPLATE.replace("<YOUR_OWNER_TOKEN>", auth.token),
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (reason) {
      setError(friendlyError(reason));
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="第 1 步 · Bring your AI"
        title="连接你真正用过的 AI"
        description="连接不是读取账号 Memory。宿主 AI 根据它当前可用的上下文生成参数，Handshake 只收到你允许发布的内容。"
        action={
          <button
            className="button button--dark"
            type="button"
            onClick={() => setShowAdd((value) => !value)}
          >
            <Icon name={showAdd ? "close" : "plus"} size={17} />
            {showAdd ? "取消" : "添加 AI"}
          </button>
        }
      />

      <InlineNotice title="为什么这里不让你填写模型 API Key？">
        API Key 只能调用模型，不是你个人 ChatGPT、Kimi 或豆包 Memory 的钥匙。我们使用 MCP
        当前会话或由你亲自导入 Capsule。
      </InlineNotice>

      {showAdd ? (
        <section className="panel connection-builder">
          <div className="panel__header">
            <div>
              <p className="eyebrow">新连接</p>
              <h2>选择你的 AI 和连接方式</h2>
            </div>
          </div>
          <form onSubmit={create}>
            <div className="provider-options">
              {providers.map((provider) => (
                <button
                  key={provider.id}
                  className={`provider-option${selected === provider.id ? " provider-option--selected" : ""}`}
                  type="button"
                  onClick={() => {
                    setSelected(provider.id);
                    if (provider.id === "doubao" || provider.id === "other")
                      setMode("capsule_import");
                  }}
                >
                  <ProviderMark provider={provider.id} compact />
                  <span>
                    <strong>
                      {providerName(provider.id)}
                      {provider.recommended ? <small>推荐首选</small> : null}
                    </strong>
                    <p>{provider.description}</p>
                  </span>
                  <i className="radio-dot" />
                </button>
              ))}
            </div>
            <div className="mode-switch" role="radiogroup" aria-label="连接方式">
              <label className={mode === "mcp" ? "is-selected" : ""}>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "mcp"}
                  disabled={selected === "doubao" || selected === "other"}
                  onChange={() => setMode("mcp")}
                />
                <span>
                  <Icon name="spark" />
                  <strong>MCP 当前会话</strong>
                  <small>AI 可以主动调用工具；仍不读取底层 Memory</small>
                </span>
              </label>
              <label className={mode === "capsule_import" ? "is-selected" : ""}>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "capsule_import"}
                  onChange={() => setMode("capsule_import")}
                />
                <span>
                  <Icon name="capsule" />
                  <strong>标准 Capsule 导入</strong>
                  <small>复制 AI 生成的 JSON；支持所有主流 AI</small>
                </span>
              </label>
            </div>
            {mode === "mcp" ? (
              <div className="mcp-setup">
                <div>
                  <span className="step-number">1</span>
                  <p>
                    <strong>先启动本地 API，并构建 Handshake MCP Adapter</strong>
                    <small>
                      API 使用 http://127.0.0.1:3220；在仓库中运行 pnpm --filter
                      @handshake/mcp-adapter build。
                    </small>
                  </p>
                </div>
                <div>
                  <span className="step-number">2</span>
                  <p>
                    <strong>把本地 stdio Server 配置加入支持 MCP 的客户端</strong>
                    <small>
                      把仓库路径和 owner token 替换成你本机的值。仅支持远程 Connector
                      的网页端不能直接运行这段本地配置。
                    </small>
                  </p>
                </div>
                <div className="mcp-config-box">
                  <pre>
                    <code>{MCP_STDIO_CONFIG_TEMPLATE}</code>
                  </pre>
                  <button type="button" onClick={copyMcpConfig} disabled={auth.token === null}>
                    {copied ? "当前账号配置已复制" : "复制当前账号配置"}
                  </button>
                </div>
                <small className="form-hint">
                  页面不会显示完整令牌；复制时会把当前登录令牌写入剪贴板。请像密码一样保管，不要放进
                  Git。
                </small>
                <div>
                  <span className="step-number">3</span>
                  <p>
                    <strong>确认客户端列出 Handshake 工具后，再在 AI 中发起任务</strong>
                    <small>
                      “请为 7 天作品集组队准备
                      Capsule，发送前让我逐项确认。”看到工具列表并成功调用，才代表真实连通。
                    </small>
                  </p>
                </div>
                <InlineNotice tone="warning" title="本页面不会探测你的 MCP 客户端">
                  下方保存操作只登记连接来源和能力元数据，不会启动本地进程，也不会把“已登记”冒充成“已连通”。
                </InlineNotice>
              </div>
            ) : (
              <div className="mcp-setup">
                <div>
                  <span className="step-number">1</span>
                  <p>
                    <strong>让你的 AI 生成标准资料</strong>
                    <small>下一页会提供可复制的完整提示词和 JSON 模板。</small>
                  </p>
                </div>
                <div>
                  <span className="step-number">2</span>
                  <p>
                    <strong>粘贴并逐字段批准</strong>
                    <small>不要粘贴原始聊天、地址、证件或密码。</small>
                  </p>
                </div>
              </div>
            )}
            <label className="field">
              <span>给这个连接起个名字</span>
              <input name="label" defaultValue={`我的 ${providerName(selected)}`} required />
              <small>
                {mode === "mcp"
                  ? "这里只登记连接信息；真实可用性以 MCP 客户端成功列出工具为准。"
                  : "这里只登记 Capsule 的来源，不会登录或读取你的 AI 账号。"}
              </small>
            </label>
            {error === null ? null : (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button className="button button--dark" type="submit" disabled={busy}>
                {busy ? "正在登记…" : "登记连接信息"}
                <Icon name="arrow" size={17} />
              </button>
              <span>
                <Icon name="shield" size={16} />
                不会要求 AI 账号密码，也不会校验客户端在线状态
              </span>
            </div>
          </form>
        </section>
      ) : null}

      <section className="section-stack">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">当前连接</p>
            <h2>AI 代表</h2>
          </div>
          <span className="count-label">{resource.data?.length ?? 0} 个</span>
        </div>
        {resource.loading && resource.data === null ? (
          <LoadingState label="正在检查 AI 连接…" />
        ) : null}
        {resource.error !== null && resource.data === null ? (
          <ErrorState message={resource.error} onRetry={resource.reload} />
        ) : null}
        {resource.data?.length === 0 ? (
          <EmptyState
            title="还没有连接任何 AI"
            description="先选择一个你平时真正使用的 AI。即使它不支持 MCP，也可以导入 Capsule。"
            action={
              <button
                className="button button--accent"
                type="button"
                onClick={() => setShowAdd(true)}
              >
                添加第一个 AI
              </button>
            }
          />
        ) : (
          <div className="connection-list">
            {resource.data?.map((connection) => (
              <ConnectionCard key={connection.id} connection={connection} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function ConnectionCard({ connection }: { connection: AiConnection }) {
  const registrationLabel =
    connection.status === "disconnected"
      ? "已停用"
      : connection.isSynthetic
        ? "合成演示"
        : "连接信息已登记";
  return (
    <article className="connection-card">
      <ProviderMark provider={connection.provider} compact />
      <div className="connection-card__main">
        <div>
          <h3>{connection.displayName}</h3>
          <span
            className={`live-status${connection.status !== "connected" ? " live-status--muted" : ""}`}
          >
            <i />
            {registrationLabel}
          </span>
        </div>
        <p>
          {connection.isSynthetic
            ? "这是合成演示记录，不代表外部 AI 客户端已经连接。"
            : connection.mode === "mcp"
              ? "登记为本地 stdio MCP 来源；是否连通请以客户端成功列出工具为准。"
              : "登记为手动 Capsule 导入来源，不会读取 AI 账号。"}
        </p>
        <div className="chip-row">
          {connection.capabilities.map((ability) => (
            <span className="mini-chip" key={ability}>
              {ability === "interactive_tool"
                ? "交互工具"
                : ability === "background_callback"
                  ? "后台回调"
                  : "资料导入"}
            </span>
          ))}
        </div>
      </div>
      <div className="connection-card__aside">
        <ConnectionModeBadge mode={connection.mode} />
        {connection.isSynthetic ? <span className="synthetic-label">演示数据</span> : null}
        <Link className="text-link" to="/capsule">
          准备 Capsule <Icon name="arrow" size={15} />
        </Link>
      </div>
    </article>
  );
}
