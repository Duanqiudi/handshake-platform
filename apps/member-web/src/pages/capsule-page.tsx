import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  type AiConnection,
  type CapsuleFieldName,
  type CapsuleFields,
  type MemoryCapsule,
  memberApi,
} from "../api";
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
import { capsuleFieldLabels, FieldApproval } from "../components/field-approval";
import { Icon } from "../components/icons";
import { ProviderMark } from "../components/provider";

interface CapsuleData {
  connections: AiConnection[];
  capsules: MemoryCapsule[];
}

const sampleFields: CapsuleFields = {
  goal: "7 天内做出一个可以在面试中演示的 AI 求职助手",
  offers: ["产品设计", "用户研究", "原型表达"],
  seeks: ["TypeScript", "LLM 集成", "前端实现"],
  availability: "工作日晚间，周末共 8 小时",
  collaborationStyles: ["异步优先", "每日 15 分钟同步", "先做可演示闭环"],
  projectInterests: ["AI 求职", "个人效率", "开发者工具"],
  location: "远程 / 东八区",
  languages: ["中文", "英文文档"],
};

export function CapsulePage() {
  const resource = useResource<CapsuleData>(async (signal) => {
    const [connections, capsules] = await Promise.all([
      memberApi.listConnections(signal),
      memberApi.listCapsules(signal),
    ]);
    return { connections, capsules };
  });
  const [showImport, setShowImport] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedId === null && resource.data?.capsules[0] !== undefined) {
      setSelectedId(resource.data.capsules[0].id);
    }
  }, [resource.data, selectedId]);

  const selected = resource.data?.capsules.find((item) => item.id === selectedId) ?? null;
  const capsuleCount = resource.data?.capsules.length ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="第 2 步 · Task-scoped memory"
        title="只带上这次任务需要的你"
        description="Capsule 是一张任务专用资料卡，不是完整个人档案。先检查内容，再逐字段批准。默认什么都不公开。"
        action={
          (resource.data?.connections.length ?? 0) === 0 ? undefined : (
            <button
              className="button button--dark"
              type="button"
              onClick={() => setShowImport((value) => !value)}
            >
              <Icon name={showImport ? "close" : "plus"} size={17} />
              {showImport ? "取消导入" : "导入新版本"}
            </button>
          )
        }
      />
      <div className="privacy-principles">
        <span>
          <Icon name="lock" size={17} />
          <strong>完整 Memory 留在原 AI</strong>
        </span>
        <span>
          <Icon name="shield" size={17} />
          <strong>每个字段单独批准</strong>
        </span>
        <span>
          <Icon name="clock" size={17} />
          <strong>到期自动退出发现</strong>
        </span>
      </div>

      {resource.loading && resource.data === null ? (
        <LoadingState label="正在读取你的 Capsule…" />
      ) : null}
      {resource.error !== null && resource.data === null ? (
        <ErrorState message={resource.error} onRetry={resource.reload} />
      ) : null}

      {resource.data?.connections.length === 0 ? (
        <EmptyState
          eyebrow="先完成第 1 步"
          title="需要先连接一个 AI"
          description="Capsule 必须标明来源。它可以来自 MCP 当前会话，也可以由任何 AI 生成后手动导入。"
          action={
            <Link className="button button--accent" to="/connect">
              连接我的 AI
              <Icon name="arrow" size={17} />
            </Link>
          }
        />
      ) : null}

      {showImport && resource.data !== null ? (
        <ImportCapsule
          connections={resource.data.connections}
          onImported={(capsule) => {
            setSelectedId(capsule.id);
            setShowImport(false);
            resource.reload();
          }}
        />
      ) : null}

      {resource.data !== null &&
      resource.data.connections.length > 0 &&
      resource.data.capsules.length === 0 &&
      !showImport ? (
        <EmptyState
          title="让你的 AI 先生成一张资料草稿"
          description="复制我们的提示词给 ChatGPT、Kimi 或豆包，再把它返回的 JSON 粘贴回来。"
          action={
            <button
              className="button button--accent"
              type="button"
              onClick={() => setShowImport(true)}
            >
              导入第一张 Capsule
            </button>
          }
        />
      ) : null}

      {resource.data !== null && resource.data.capsules.length > 0 ? (
        <div className="capsule-layout">
          <aside className="capsule-versions">
            <p className="eyebrow">资料版本</p>
            {resource.data.capsules.map((capsule, index) => (
              <button
                key={capsule.id}
                type="button"
                className={selectedId === capsule.id ? "is-active" : ""}
                onClick={() => setSelectedId(capsule.id)}
              >
                <span>V{capsuleCount === 1 ? 1 : capsuleCount - index}</span>
                <div>
                  <strong>{capsule.fields.goal || "未命名资料"}</strong>
                  <small>
                    {capsule.status === "published"
                      ? "已发布"
                      : capsule.status === "draft"
                        ? "待确认"
                        : "已撤销"}
                  </small>
                </div>
              </button>
            ))}
          </aside>
          {selected === null ? null : (
            <CapsuleEditor key={selected.id} capsule={selected} onChanged={resource.reload} />
          )}
        </div>
      ) : null}
    </>
  );
}

function ImportCapsule({
  connections,
  onImported,
}: {
  connections: AiConnection[];
  onImported(capsule: MemoryCapsule): void;
}) {
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const prompt =
    "请根据你在当前会话中已经知道、且适合公开的信息，为我生成一份 7 天作品集组队 Capsule。只输出 JSON，字段为 goal、offers、seeks、availability、collaborationStyles、projectInterests、location、languages。不要包含原始聊天、联系方式、地址、账号、密码或你不确定的推断。";

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  const importData = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    let fields: CapsuleFields;
    try {
      fields = parseCapsule(raw);
    } catch (reason) {
      setError(friendlyError(reason));
      return;
    }
    const data = new FormData(event.currentTarget);
    const connectionId = String(data.get("connectionId") ?? "");
    const connection = connections.find((item) => item.id === connectionId);
    if (connection === undefined) {
      setError("请选择资料来自哪个 AI。");
      return;
    }
    setBusy(true);
    try {
      const capsule = await memberApi.importCapsule({
        connectionId,
        sourceProvider: connection.provider,
        sourceMode:
          connection.mode === "mcp" ? "mcp" : connection.mode === "demo" ? "demo" : "import",
        purpose: "seven_day_portfolio_teamup",
        fields,
        approvedFields: [],
        expiresAt: defaultExpiry(),
      });
      onImported(capsule);
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel import-panel">
      <div className="panel__header">
        <div>
          <p className="eyebrow">从原 AI 导入</p>
          <h2>把这段提示词发给你的 AI</h2>
        </div>
        <button type="button" className="button button--small button--outline" onClick={copyPrompt}>
          {copied ? "已复制" : "复制提示词"}
        </button>
      </div>
      <blockquote>{prompt}</blockquote>
      <form onSubmit={importData}>
        <label className="field">
          <span>资料来源</span>
          <select name="connectionId" defaultValue={connections[0]?.id}>
            {connections.map((connection) => (
              <option value={connection.id} key={connection.id}>
                {connection.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>粘贴 AI 返回的 JSON</span>
          <textarea
            rows={10}
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            placeholder={
              '{\n  "goal": "7 天完成…",\n  "offers": ["产品设计"],\n  "seeks": ["TypeScript"]\n}'
            }
          />
        </label>
        <div className="import-actions">
          <button
            type="button"
            className="text-link"
            onClick={() => setRaw(JSON.stringify(sampleFields, null, 2))}
          >
            填入安全示例
          </button>
          <span>导入后仍不会自动公开</span>
        </div>
        {error === null ? null : (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button button--dark" type="submit" disabled={busy || raw.trim() === ""}>
          {busy ? "正在创建草稿…" : "创建待确认草稿"}
          <Icon name="arrow" size={17} />
        </button>
      </form>
    </section>
  );
}

function CapsuleEditor({ capsule, onChanged }: { capsule: MemoryCapsule; onChanged(): void }) {
  const [fields, setFields] = useState(() => structuredClone(capsule.fields));
  const [approved, setApproved] = useState<CapsuleFieldName[]>(() => [...capsule.approvedFields]);
  const [expiresAt, setExpiresAt] = useState(() => capsule.expiresAt.slice(0, 10));
  const [tab, setTab] = useState<"content" | "approval">(
    capsule.status === "draft" ? "approval" : "content",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editable = capsule.status === "draft";
  const approvedSet = useMemo(() => new Set(approved), [approved]);

  const updateText = (name: "goal" | "availability" | "location", value: string) =>
    setFields((current) => ({ ...current, [name]: value }));
  const updateList = (
    name: Exclude<CapsuleFieldName, "goal" | "availability" | "location">,
    value: string,
  ) =>
    setFields((current) => ({
      ...current,
      [name]: value
        .split(/[，,\n]/)
        .map((item) => item.trim())
        .filter(Boolean),
    }));
  const save = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await memberApi.updateCapsule(capsule.id, {
        fields,
        approvedFields: approved,
        expiresAt: new Date(`${expiresAt}T23:59:59.000Z`).toISOString(),
      });
      setMessage("草稿和授权选择已保存。");
      onChanged();
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      setBusy(false);
    }
  };
  const publish = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await memberApi.updateCapsule(capsule.id, {
        fields,
        approvedFields: approved,
        expiresAt: new Date(`${expiresAt}T23:59:59.000Z`).toISOString(),
      });
      await memberApi.publishCapsule(capsule.id);
      setMessage("Capsule 已发布，现在可以用于候选匹配。");
      onChanged();
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      setBusy(false);
    }
  };
  const revoke = async () => {
    setBusy(true);
    setError(null);
    try {
      await memberApi.revokeCapsule(capsule.id);
      setMessage("Capsule 已撤销，并从发现结果中移除。");
      onChanged();
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel capsule-editor">
      <div className="capsule-editor__head">
        <div className="capsule-source">
          <ProviderMark provider={capsule.sourceProvider} compact />
          <div>
            <p className="eyebrow">来源已标记</p>
            <strong>
              {capsule.sourceMode === "mcp"
                ? "MCP 当前会话"
                : capsule.sourceMode === "demo"
                  ? "合成演示数据"
                  : "用户主动导入"}
            </strong>
          </div>
        </div>
        <span
          className={`status-badge status-badge--${capsule.status === "published" ? "green" : capsule.status === "draft" ? "amber" : "gray"}`}
        >
          {capsule.status === "published"
            ? "正在发现中"
            : capsule.status === "draft"
              ? "待主人确认"
              : "已撤销"}
        </span>
      </div>
      <div className="tab-bar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "content"}
          onClick={() => setTab("content")}
        >
          1. 检查内容
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "approval"}
          onClick={() => setTab("approval")}
        >
          2. 逐字段授权 <span>{approved.length}/8</span>
        </button>
      </div>

      {tab === "content" ? (
        <div className="capsule-fields">
          <label className="field field--full">
            <span>{capsuleFieldLabels.goal.label}</span>
            <textarea
              rows={3}
              value={fields.goal}
              disabled={!editable}
              onChange={(event) => updateText("goal", event.target.value)}
            />
          </label>
          <ListField
            label="我能提供"
            value={fields.offers}
            disabled={!editable}
            onChange={(value) => updateList("offers", value)}
          />
          <ListField
            label="我在寻找"
            value={fields.seeks}
            disabled={!editable}
            onChange={(value) => updateList("seeks", value)}
          />
          <label className="field">
            <span>可投入时间</span>
            <input
              value={fields.availability}
              disabled={!editable}
              onChange={(event) => updateText("availability", event.target.value)}
            />
          </label>
          <ListField
            label="协作偏好"
            value={fields.collaborationStyles}
            disabled={!editable}
            onChange={(value) => updateList("collaborationStyles", value)}
          />
          <ListField
            label="项目兴趣"
            value={fields.projectInterests}
            disabled={!editable}
            onChange={(value) => updateList("projectInterests", value)}
          />
          <label className="field">
            <span>协作地点</span>
            <input
              value={fields.location}
              disabled={!editable}
              onChange={(event) => updateText("location", event.target.value)}
            />
          </label>
          <ListField
            label="工作语言"
            value={fields.languages}
            disabled={!editable}
            onChange={(value) => updateList("languages", value)}
          />
        </div>
      ) : (
        <>
          <InlineNotice tone="warning" title="开关默认关闭，空字段不会被批准">
            批准表示该字段可以用于候选筛选和本轮 Handshake；不代表可以被用于广告、训练或其他目的。
          </InlineNotice>
          <FieldApproval
            fields={fields}
            approved={approved}
            onChange={setApproved}
            disabled={!editable}
          />
          <label className="field expiry-field">
            <span>授权到期日</span>
            <input
              type="date"
              min={new Date().toISOString().slice(0, 10)}
              value={expiresAt}
              disabled={!editable}
              onChange={(event) => setExpiresAt(event.target.value)}
            />
            <small>到期后自动退出发现，不再建立新的 Handshake。</small>
          </label>
        </>
      )}

      <div className="excluded-box">
        <Icon name="lock" />
        <div>
          <strong>始终排除</strong>
          <p>{capsule.privateCategories.map((item) => privateLabel(item)).join("、")}</p>
        </div>
      </div>
      {error === null ? null : (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message === null ? null : (
        <p className="form-success" role="status">
          <Icon name="check" size={15} />
          {message}
        </p>
      )}
      <div className="capsule-editor__footer">
        <p>
          {editable ? (
            <>
              将公开 <strong>{approvedSet.size}</strong> 个字段，其余字段不会发送。
            </>
          ) : (
            <>
              授权将于 <strong>{formatDate(capsule.expiresAt)}</strong> 到期。
            </>
          )}
        </p>
        <div>
          {editable ? (
            <>
              <button
                className="button button--outline"
                type="button"
                disabled={busy}
                onClick={save}
              >
                保存草稿
              </button>
              <button
                className="button button--accent"
                type="button"
                disabled={busy || approved.length === 0}
                onClick={publish}
              >
                {busy ? "正在发布…" : "确认并发布"}
                <Icon name="arrow" size={17} />
              </button>
            </>
          ) : null}
          {capsule.status === "published" ? (
            <button
              className="button button--danger-ghost"
              type="button"
              disabled={busy}
              onClick={revoke}
            >
              撤销公开
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ListField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string[];
  disabled: boolean;
  onChange(value: string): void;
}) {
  return (
    <label className="field">
      <span>
        {label}
        <small>用逗号分隔</small>
      </span>
      <input
        value={value.join("，")}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function parseCapsule(raw: string): CapsuleFields {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("这段内容不是有效 JSON。可以让 AI 只输出 JSON 后再试。");
  }
  if (!isRecord(value)) throw new Error("Capsule 必须是一个 JSON 对象。");
  const source = isRecord(value.fields) ? value.fields : value;
  const fields: CapsuleFields = {
    goal: readString(source.goal),
    offers: readList(source.offers),
    seeks: readList(source.seeks),
    availability: readString(source.availability),
    collaborationStyles: readList(source.collaborationStyles),
    projectInterests: readList(source.projectInterests),
    location: readString(source.location),
    languages: readList(source.languages),
  };
  if (fields.goal === "" || fields.offers.length === 0 || fields.seeks.length === 0)
    throw new Error("至少需要 goal、offers 和 seeks，才能开始检查。");
  return fields;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function readList(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function defaultExpiry(): string {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString();
}
function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}
function privateLabel(value: string): string {
  return (
    { raw_chat_history: "原始聊天记录", contact_details: "联系方式", credentials: "账号与密码" }[
      value
    ] ?? value
  );
}

export { parseCapsule };
