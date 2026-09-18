import { useMemo, useState } from "react";
import { memberApi, type PrivacyReceipt } from "../api";
import { useResource } from "../app/use-resource";
import { PageHeader } from "../components/app-shell";
import { EmptyState, ErrorState, InlineNotice, LoadingState } from "../components/feedback";
import { Icon } from "../components/icons";

type Filter = "all" | PrivacyReceipt["status"];

export function PrivacyPage() {
  const resource = useResource((signal) => memberApi.listReceipts(signal));
  const [filter, setFilter] = useState<Filter>("all");
  const receipts = useMemo(
    () => resource.data?.filter((item) => filter === "all" || item.status === filter) ?? [],
    [filter, resource.data],
  );
  return (
    <>
      <PageHeader
        eyebrow="Privacy ledger"
        title="每一次披露，都有一张收据"
        description="不是笼统地勾选一次“同意”。你可以看到发了什么、为了什么、给谁、到什么时候，以及还能否撤销。"
      />
      <div className="privacy-summary-grid">
        <article>
          <span>
            <Icon name="shield" />
          </span>
          <div>
            <strong>{resource.data?.filter((item) => item.status === "active").length ?? 0}</strong>
            <small>条有效授权</small>
          </div>
        </article>
        <article>
          <span>
            <Icon name="clock" />
          </span>
          <div>
            <strong>
              {resource.data?.filter((item) => item.expiresAt !== undefined).length ?? 0}
            </strong>
            <small>条设置到期时间</small>
          </div>
        </article>
        <article>
          <span>
            <Icon name="lock" />
          </span>
          <div>
            <strong>0</strong>
            <small>条原始聊天披露</small>
          </div>
        </article>
      </div>
      <InlineNotice title="收据是不可篡改的历史，来源授权可以停用">
        已经发送给指定对象的信息无法从对方记忆中“远程删除”。若要停止今后的匹配使用，请在“公开资料”撤销
        Capsule；系统会暂停关联意图，并把对应收据标记为已撤销。
      </InlineNotice>
      <div className="receipt-toolbar">
        <div className="filter-tabs" role="tablist" aria-label="授权状态">
          {(
            [
              ["all", "全部"],
              ["active", "有效"],
              ["revoked", "已撤销"],
              ["expired", "已到期"],
            ] as const
          ).map(([value, label]) => (
            <button
              type="button"
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              key={value}
            >
              {label}
              <span>
                {resource.data?.filter((item) => value === "all" || item.status === value).length ??
                  0}
              </span>
            </button>
          ))}
        </div>
      </div>
      {resource.loading && resource.data === null ? (
        <LoadingState label="正在读取隐私收据…" />
      ) : null}
      {resource.error !== null && resource.data === null ? (
        <ErrorState message={resource.error} onRetry={resource.reload} />
      ) : null}
      {resource.data?.length === 0 ? (
        <EmptyState
          title="还没有产生披露"
          description="当你发布 Capsule、确认回答或双方同意交换联系方式时，这里会出现记录。"
        />
      ) : null}
      {resource.data !== null && receipts.length === 0 && resource.data.length > 0 ? (
        <EmptyState title="这个状态下没有收据" description="换一个状态查看其他披露记录。" />
      ) : null}
      <div className="receipt-list">
        {receipts.map((receipt) => (
          <ReceiptCard receipt={receipt} key={receipt.id} />
        ))}
      </div>
    </>
  );
}

function ReceiptCard({ receipt }: { receipt: PrivacyReceipt }) {
  return (
    <article className="receipt-card">
      <div className="receipt-card__icon">
        <Icon
          name={
            receipt.type === "contact_reveal"
              ? "handshake"
              : receipt.type === "capsule_publish"
                ? "capsule"
                : "shield"
          }
        />
      </div>
      <div className="receipt-card__main">
        <div>
          <span
            className={`status-badge status-badge--${receipt.status === "active" ? "green" : "gray"}`}
          >
            {receipt.status === "active"
              ? "有效"
              : receipt.status === "revoked"
                ? "已撤销"
                : "已到期"}
          </span>
          <time>{formatDate(receipt.createdAt)}</time>
        </div>
        <h2>{receipt.title}</h2>
        <dl>
          <div>
            <dt>用途</dt>
            <dd>{receipt.purpose}</dd>
          </div>
          <div>
            <dt>接收方</dt>
            <dd>{receipt.recipient}</dd>
          </div>
          <div>
            <dt>披露内容</dt>
            <dd>{receipt.fields.join("、")}</dd>
          </div>
          {receipt.expiresAt === undefined ? null : (
            <div>
              <dt>到期</dt>
              <dd>{formatDate(receipt.expiresAt)}</dd>
            </div>
          )}
        </dl>
      </div>
      <div className="receipt-card__actions">
        <span className="receipt-id">#{receipt.id.slice(-8)}</span>
        <span className="muted-label">
          {receipt.status === "revoked"
            ? "来源授权已停用"
            : receipt.type === "capsule_publish"
              ? "请在公开资料页管理来源"
              : "历史记录不可篡改"}
        </span>
      </div>
    </article>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
