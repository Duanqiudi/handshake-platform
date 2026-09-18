import { type ReactNode, useEffect, useState } from "react";
import { isDemoMode } from "../api";
import { useAuth } from "../app/auth";
import { Link, navigate } from "../app/routing";
import { Icon, type IconName } from "./icons";

const navigation: Array<{ path: string; label: string; icon: IconName }> = [
  { path: "/app", label: "今天", icon: "home" },
  { path: "/connect", label: "我的 AI", icon: "spark" },
  { path: "/capsule", label: "公开资料", icon: "capsule" },
  { path: "/intent", label: "项目意图", icon: "intent" },
  { path: "/discover", label: "发现搭档", icon: "discover" },
  { path: "/handshakes", label: "Handshake", icon: "handshake" },
  { path: "/projects", label: "7 天项目", icon: "project" },
  { path: "/privacy", label: "隐私收据", icon: "shield" },
];

export function AppShell({
  path,
  ownerName,
  children,
}: {
  path: string;
  ownerName: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const auth = useAuth();
  const activePath = navigation.find(
    (item) => path === item.path || path.startsWith(`${item.path}/`),
  )?.path;
  const signOut = () => {
    auth.signOut();
    navigate("/");
  };
  const demoOwners = readDemoOwners();
  const switchDemoOwner = (token: string) => {
    auth.signIn(token);
    navigate("/app");
  };

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <div className="app-layout">
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <aside id="app-sidebar" className={`sidebar${open ? " sidebar--open" : ""}`}>
        <div className="sidebar__brand-row">
          <Link
            className="brand brand--app"
            to="/app"
            ariaCurrent={path === "/app" ? "page" : undefined}
            onNavigate={() => setOpen(false)}
          >
            <span className="brand__symbol" aria-hidden="true">
              <i />
              <i />
            </span>
            <span>Handshake</span>
          </Link>
          <button
            className="icon-button sidebar__close"
            type="button"
            aria-label="关闭菜单"
            aria-controls="app-sidebar"
            onClick={() => setOpen(false)}
          >
            <Icon name="close" />
          </button>
        </div>
        {isDemoMode ? (
          <>
            <div className="demo-ribbon">
              <span />
              演示模式 · 全部为合成数据
            </div>
            {demoOwners.length > 1 ? (
              <div className="demo-switcher">
                <small>切换主人，完成双方同意</small>
                <div>
                  {demoOwners.map((owner) => (
                    <button
                      className={owner.displayName === ownerName ? "is-active" : ""}
                      type="button"
                      onClick={() => switchDemoOwner(owner.token)}
                      key={owner.ownerId}
                    >
                      {owner.displayName}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
        <nav className="sidebar__nav" aria-label="主要导航">
          {navigation.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-item${activePath === item.path ? " nav-item--active" : ""}`}
              ariaCurrent={activePath === item.path ? "page" : undefined}
              onNavigate={() => setOpen(false)}
            >
              <Icon name={item.icon} size={19} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar__footer">
          <div className="privacy-mini">
            <Icon name="lock" size={16} />
            <span>完整 Memory 始终留在你的 AI</span>
          </div>
          <div className="account-row">
            <span className="avatar">{ownerName.slice(0, 1)}</span>
            <div>
              <strong>{ownerName}</strong>
              <small>作品集共创社区</small>
            </div>
            <button className="text-button" type="button" onClick={signOut}>
              退出
            </button>
          </div>
        </div>
      </aside>
      {open ? (
        <button
          className="sidebar-backdrop"
          aria-label="关闭菜单"
          type="button"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <div className="app-main-wrap">
        <header className="mobile-header">
          <button
            className="icon-button"
            type="button"
            aria-label="打开菜单"
            aria-controls="app-sidebar"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <Icon name="menu" />
          </button>
          <span className="brand">
            <span className="brand__symbol" aria-hidden="true">
              <i />
              <i />
            </span>
            Handshake
          </span>
          {isDemoMode ? <span className="badge badge--warning">演示</span> : <span />}
        </header>
        <main id="main-content" className="app-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}

function readDemoOwners(): Array<{ ownerId: string; displayName: string; token: string }> {
  try {
    const raw = window.localStorage.getItem("handshake.demoOwners");
    if (raw === null) return [];
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (typeof item !== "object" || item === null) return [];
      const source = item as Record<string, unknown>;
      const owner =
        typeof source.owner === "object" && source.owner !== null
          ? (source.owner as Record<string, unknown>)
          : {};
      return typeof owner.id === "string" &&
        typeof owner.displayName === "string" &&
        typeof source.token === "string"
        ? [{ ownerId: owner.id, displayName: owner.displayName, token: source.token }]
        : [];
    });
  } catch {
    return [];
  }
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-header__description">{description}</p>
      </div>
      {action === undefined ? null : <div className="page-header__action">{action}</div>}
    </header>
  );
}

export function JourneyRail({ active }: { active: number }) {
  const steps = ["连接 AI", "确认资料", "发布意图", "AI 了解", "共同开工"];
  return (
    <ol className="journey-rail" aria-label="组队进度">
      {steps.map((step, index) => {
        const number = index + 1;
        return (
          <li
            key={step}
            className={number < active ? "is-complete" : number === active ? "is-current" : ""}
          >
            <span>{number < active ? <Icon name="check" size={14} /> : number}</span>
            <small>{step}</small>
          </li>
        );
      })}
    </ol>
  );
}
