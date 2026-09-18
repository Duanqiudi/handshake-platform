import { type FormEvent, useState } from "react";
import { isDemoMode, isLocalDemoMode, memberApi } from "../api";
import { useAuth } from "../app/auth";
import { Link, navigate } from "../app/routing";
import { friendlyError, InlineNotice } from "../components/feedback";
import { Icon } from "../components/icons";

type Mode = "token" | "onboarding";

export function LoginPage() {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>(isDemoMode ? "onboarding" : "token");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enterDemo = async (ownerIndex: 0 | 1) => {
    setBusy(true);
    setError(null);
    try {
      const result = await memberApi.resetDemo();
      const selectedOwner = result.demoOwners?.[ownerIndex] ?? result;
      if (result.demoOwners !== undefined) {
        window.localStorage.setItem("handshake.demoOwners", JSON.stringify(result.demoOwners));
      }
      auth.signIn(selectedOwner.token);
      navigate("/app");
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      setBusy(false);
    }
  };

  const loginWithToken = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const token = String(data.get("token") ?? "").trim();
    if (token === "") {
      setError("请输入邀请令牌。");
      return;
    }
    auth.signIn(token);
    navigate("/app");
  };

  const onboard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const result = await memberApi.onboarding({
        inviteCode: String(data.get("inviteCode") ?? ""),
        displayName: String(data.get("displayName") ?? ""),
        contactChannel: String(data.get("contactChannel") ?? "微信"),
        contactValue: String(data.get("contactValue") ?? ""),
      });
      auth.signIn(result.token);
      navigate("/app");
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-page__aside">
        <Link className="brand brand--light" to="/">
          <span className="brand__symbol">
            <i />
            <i />
          </span>
          Handshake
        </Link>
        <div>
          <p className="eyebrow">邀请制 V1</p>
          <h1>
            先让 AI 了解彼此，
            <br />
            再把选择交还给人。
          </h1>
          <p>你的完整 Memory 不会离开原来的 AI。平台只保存你为“7 天作品集组队”明确批准的字段。</p>
        </div>
        <ol className="auth-steps">
          <li>
            <span>1</span>
            <div>
              <strong>登记私密联系方式</strong>
              <small>双方同意之前绝不展示</small>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>带上你常用的 AI</strong>
              <small>MCP 或 Capsule 导入都可以</small>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>7 天交付一个作品</strong>
              <small>不是无限聊天，是明确行动</small>
            </div>
          </li>
        </ol>
      </div>
      <main className="auth-card-wrap">
        <div className="auth-card">
          <Link className="auth-card__back" to="/">
            ← 返回首页
          </Link>
          {isDemoMode ? (
            <>
              <span className="demo-chip">
                <span />
                安全演示环境
              </span>
              <h2>从一个完整案例开始</h2>
              <p className="auth-card__intro">
                我们准备了两位合成人物和一段等待确认的 AI 对话。大约 3 分钟可以走完整个闭环。
              </p>
              <InlineNotice title="这不是你的真实 AI Memory">
                页面中的姓名、能力和联系方式都是演示数据，邮箱使用不可投递的 .example.test 域名。
              </InlineNotice>
              {error === null ? null : (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <div className="demo-owner-options">
                <button
                  className="button button--accent button--block button--large"
                  type="button"
                  disabled={busy}
                  onClick={() => enterDemo(0)}
                >
                  {busy ? (
                    <>
                      <span className="button-loader" />
                      正在重置演示…
                    </>
                  ) : (
                    <>
                      以林然身份进入
                      <Icon name="arrow" />
                    </>
                  )}
                </button>
                {isLocalDemoMode ? null : (
                  <button
                    className="button button--outline button--block"
                    type="button"
                    disabled={busy}
                    onClick={() => enterDemo(1)}
                  >
                    以陈默身份进入
                  </button>
                )}
              </div>
              <p className="auth-fineprint">每次点击都会恢复初始合成数据，便于面试时重复演示。</p>
            </>
          ) : (
            <>
              <div className="auth-tabs" role="tablist" aria-label="登录方式">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "token"}
                  onClick={() => setMode("token")}
                >
                  已有令牌
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "onboarding"}
                  onClick={() => setMode("onboarding")}
                >
                  首次加入
                </button>
              </div>
              {mode === "token" ? (
                <form onSubmit={loginWithToken}>
                  <h2>欢迎回来</h2>
                  <p className="auth-card__intro">使用邀请令牌进入你的私密成员空间。</p>
                  <label className="field">
                    <span>邀请令牌</span>
                    <input
                      name="token"
                      type="password"
                      autoComplete="current-password"
                      placeholder="hs_owner_••••••"
                    />
                  </label>
                  {error === null ? null : (
                    <p className="form-error" role="alert">
                      {error}
                    </p>
                  )}
                  <button className="button button--dark button--block" type="submit">
                    进入成员空间
                    <Icon name="arrow" size={17} />
                  </button>
                </form>
              ) : (
                <form onSubmit={onboard}>
                  <h2>创建邀请账号</h2>
                  <p className="auth-card__intro">联系方式只为双方同意后的真实协作准备。</p>
                  <label className="field">
                    <span>邀请码（如社区要求）</span>
                    <input name="inviteCode" placeholder="未设置时可留空" />
                  </label>
                  <label className="field">
                    <span>怎么称呼你</span>
                    <input name="displayName" required placeholder="例如：林夏" />
                  </label>
                  <div className="field-row">
                    <label className="field">
                      <span>联系渠道</span>
                      <select name="contactChannel" defaultValue="微信">
                        <option>微信</option>
                        <option>邮箱</option>
                        <option>电话</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>联系方式</span>
                      <input name="contactValue" required placeholder="仅双重同意后展示" />
                    </label>
                  </div>
                  {error === null ? null : (
                    <p className="form-error" role="alert">
                      {error}
                    </p>
                  )}
                  <button
                    className="button button--dark button--block"
                    type="submit"
                    disabled={busy}
                  >
                    {busy ? "正在创建…" : "创建并继续"}
                    <Icon name="arrow" size={17} />
                  </button>
                </form>
              )}
            </>
          )}
        </div>
        <p className="auth-safe">
          <Icon name="shield" size={16} />
          Bearer 令牌只保存在当前浏览器中
        </p>
      </main>
    </div>
  );
}
