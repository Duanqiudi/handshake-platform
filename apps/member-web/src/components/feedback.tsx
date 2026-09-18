import type { ReactNode } from "react";
import { ApiError } from "../api";

export function friendlyError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message.trim() !== "") return error.message;
  return "发生了一个意外问题，请稍后再试。";
}

export function LoadingState({ label = "正在准备你的空间…" }: { label?: string }) {
  return (
    <div className="state-panel state-panel--loading" role="status" aria-live="polite">
      <span className="loader" aria-hidden="true" />
      <div>
        <strong>{label}</strong>
        <p>只会读取本页需要的信息。</p>
      </div>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state-panel state-panel--error" role="alert">
      <span className="state-icon" aria-hidden="true">
        !
      </span>
      <div>
        <strong>这一步没有完成</strong>
        <p>{message}</p>
        {onRetry === undefined ? null : (
          <button className="button button--small button--outline" type="button" onClick={onRetry}>
            再试一次
          </button>
        )}
      </div>
    </div>
  );
}

export function EmptyState({
  eyebrow = "还没有内容",
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-orbit" aria-hidden="true">
        <span />
      </div>
      <p className="eyebrow">{eyebrow}</p>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function InlineNotice({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "success" | "warning";
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={`notice notice--${tone}`} role="status">
      <span className="notice__dot" aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </div>
  );
}
