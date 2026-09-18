import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { memberApi } from "./api";
import { AuthProvider, useAuth } from "./app/auth";
import { Link, useRoute } from "./app/routing";
import { AppShell } from "./components/app-shell";
import { CapsulePage } from "./pages/capsule-page";
import { ConnectionsPage } from "./pages/connections-page";
import { DashboardPage } from "./pages/dashboard-page";
import { DiscoveryPage } from "./pages/discovery-page";
import { HandshakeDetailPage, HandshakesPage } from "./pages/handshake-pages";
import { IntentPage } from "./pages/intent-page";
import { LandingPage } from "./pages/landing-page";
import { LoginPage } from "./pages/login-page";
import { PrivacyPage } from "./pages/privacy-page";
import { ProjectDetailPage, ProjectsPage } from "./pages/project-pages";
import "./styles.css";

function App() {
  const path = useRoute();
  const auth = useAuth();
  const [ownerName, setOwnerName] = useState("我的空间");

  useEffect(() => {
    if (auth.token === null) {
      setOwnerName("我的空间");
      return;
    }
    const controller = new AbortController();
    void memberApi
      .getDashboard(controller.signal)
      .then((dashboard) => setOwnerName(dashboard.owner.displayName))
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setOwnerName("我的空间");
        }
      });
    return () => controller.abort();
  }, [auth.token]);

  if (path === "/") return <LandingPage />;
  if (path === "/login") return <LoginPage />;
  if (auth.token === null) {
    return (
      <div className="auth-required">
        <span className="brand">
          <span className="brand__symbol" aria-hidden="true">
            <i />
            <i />
          </span>
          Handshake
        </span>
        <h1>先进入你的成员空间</h1>
        <p>这个页面包含私密的 Capsule、Handshake 和项目进度。</p>
        <Link className="button button--accent" to="/login">
          去登录
        </Link>
      </div>
    );
  }

  return (
    <AppShell key={auth.token} path={path} ownerName={ownerName}>
      <RouteContent path={path} onOwner={setOwnerName} />
    </AppShell>
  );
}

function RouteContent({ path, onOwner }: { path: string; onOwner(name: string): void }) {
  if (path === "/app") return <DashboardPage onOwner={onOwner} />;
  if (path === "/connect") return <ConnectionsPage />;
  if (path === "/capsule") return <CapsulePage />;
  if (path === "/intent") return <IntentPage />;
  if (path === "/discover") return <DiscoveryPage />;
  if (path === "/handshakes") return <HandshakesPage />;
  if (path === "/projects") return <ProjectsPage />;
  if (path === "/privacy") return <PrivacyPage />;

  const handshake = /^\/handshakes\/([^/]+)$/.exec(path);
  if (handshake?.[1] !== undefined)
    return <HandshakeDetailPage id={decodeURIComponent(handshake[1])} />;
  const project = /^\/projects\/([^/]+)$/.exec(path);
  if (project?.[1] !== undefined) return <ProjectDetailPage id={decodeURIComponent(project[1])} />;

  return (
    <div className="not-found">
      <span>404</span>
      <h1>这里没有内容</h1>
      <p>地址可能已经变化，回到今天继续最重要的一步。</p>
      <Link className="button button--dark" to="/app">
        返回今天
      </Link>
    </div>
  );
}

const root = document.getElementById("root");
if (root === null) throw new Error("Missing #root element");

createRoot(root).render(
  <AuthProvider>
    <App />
  </AuthProvider>,
);
