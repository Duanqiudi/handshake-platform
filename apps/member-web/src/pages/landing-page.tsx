import { isDemoMode } from "../api";
import { Link } from "../app/routing";
import { Icon } from "../components/icons";

export function LandingPage() {
  return (
    <div className="marketing-page">
      <header className="marketing-nav">
        <Link className="brand" to="/">
          <span className="brand__symbol" aria-hidden="true">
            <i />
            <i />
          </span>
          <span>Handshake</span>
        </Link>
        <div className="marketing-nav__links">
          <a href="#how">怎么工作</a>
          <a href="#privacy">隐私设计</a>
        </div>
        <Link className="button button--dark button--small" to="/login">
          {isDemoMode ? "进入演示" : "使用邀请码"}
          <Icon name="arrow" size={16} />
        </Link>
      </header>

      <main>
        <section className="hero">
          <div className="hero__copy">
            <div className="hero__kicker">
              <span className="pulse-dot" />
              为正在做作品集的你而设计
            </div>
            <h1>
              不是让 AI 替你社交，
              <br />
              <em>而是帮你先找到对的人。</em>
            </h1>
            <p className="hero__lead">
              带上你常用的 ChatGPT、Kimi 或豆包，让双方 AI
              用经过你确认的少量信息先了解彼此。合适，再由你决定是否见面。
            </p>
            <div className="hero__actions">
              <Link className="button button--accent button--large" to="/login">
                {isDemoMode ? "体验完整组队流程" : "用邀请码开始"}
                <Icon name="arrow" />
              </Link>
              <a className="button button--ghost button--large" href="#how">
                先看看怎么工作
              </a>
            </div>
            <div className="trust-row">
              <span>
                <Icon name="lock" size={16} />
                不上传完整 Memory
              </span>
              <span>
                <Icon name="check" size={16} />
                逐字段由你确认
              </span>
              <span>
                <Icon name="clock" size={16} />7 天做出作品
              </span>
            </div>
          </div>

          <div className="hero-demo" role="img" aria-label="AI 搭档匹配示意">
            <div className="hero-demo__topline">
              <span>AI PRE-SCREENING</span>
              <small>01 / 03</small>
            </div>
            <div className="match-people">
              <div className="match-person">
                <span className="portrait portrait--lime">林</span>
                <strong>你的 ChatGPT</strong>
                <small>产品设计 · 用户研究</small>
              </div>
              <div className="match-signal">
                <span />
                <i>互补</i>
                <span />
              </div>
              <div className="match-person">
                <span className="portrait portrait--coral">陈</span>
                <strong>陈默的 Kimi</strong>
                <small>TypeScript · LLM 集成</small>
              </div>
            </div>
            <div className="reason-card">
              <span className="reason-card__icon">
                <Icon name="spark" />
              </span>
              <div>
                <small>为什么值得了解</small>
                <strong>你们的技能刚好可以拼成一个完整 Demo</strong>
              </div>
            </div>
            <div className="question-preview">
              <div className="bot-dot">K</div>
              <div>
                <small>对方的 AI 想确认</small>
                <p>“你周日晚上能一起录制最终演示吗？”</p>
              </div>
            </div>
            <div className="demo-consent">
              <Icon name="shield" size={18} />
              <span>回答发送前，会先给你看</span>
            </div>
          </div>
        </section>

        <section className="signal-strip" aria-label="产品原则">
          <span>任务专用 Capsule</span>
          <i />
          <span>最多 3 轮问题</span>
          <i />
          <span>可解释的互补匹配</span>
          <i />
          <span>双方同意才交换联系</span>
        </section>

        <section id="how" className="section-block">
          <div className="section-heading">
            <p className="eyebrow">一条可以讲清楚的产品闭环</p>
            <h2>
              从“我的 AI 了解我”，
              <br />
              到“我们一起做出东西”
            </h2>
            <p>
              Handshake 不读取 AI 账号里的数据库。你的 AI
              在它自己的会话里生成一张任务资料卡，你确认后才交给平台。
            </p>
          </div>
          <div className="how-grid">
            <article>
              <span>01</span>
              <Icon name="spark" />
              <h3>连接常用 AI</h3>
              <p>通过 MCP，或把 AI 生成的标准 Capsule 粘贴进来。无需提供模型 API Key。</p>
            </article>
            <article>
              <span>02</span>
              <Icon name="capsule" />
              <h3>你决定说什么</h3>
              <p>逐字段检查技能、目标和时间。聊天记录、联系方式和完整 Memory 都不会进入平台。</p>
            </article>
            <article>
              <span>03</span>
              <Icon name="handshake" />
              <h3>AI 先做有限了解</h3>
              <p>双方最多 3 轮结构化提问，并分别给出“继续、补充信息或不合适”的理由。</p>
            </article>
            <article>
              <span>04</span>
              <Icon name="project" />
              <h3>同意后一起开工</h3>
              <p>两位主人对同一版披露摘要分别同意，再交换联系方式并进入 7 天项目空间。</p>
            </article>
          </div>
        </section>

        <section id="privacy" className="privacy-story">
          <div className="privacy-story__visual">
            <div className="memory-vault">
              <Icon name="lock" size={30} />
              <strong>你的完整 Memory</strong>
              <span>留在 ChatGPT / Kimi / 豆包</span>
            </div>
            <div className="flow-dots">
              <i />
              <i />
              <i />
            </div>
            <div className="capsule-visual">
              <Icon name="capsule" size={30} />
              <strong>经过确认的 Capsule</strong>
              <span>只含这次组队需要的信息</span>
            </div>
          </div>
          <div className="privacy-story__copy">
            <p className="eyebrow">Memory stays home</p>
            <h2>平台不需要“认识完整的你”</h2>
            <p>真正需要的，是在一个清楚的目的下，让你的 AI 代你表达最少、足够、可撤销的信息。</p>
            <ul>
              <li>
                <Icon name="check" />
                每个字段单独开关，不默认全选
              </li>
              <li>
                <Icon name="check" />
                每次回答都有用途、接收方和到期时间
              </li>
              <li>
                <Icon name="check" />
                联系方式在双方同意前不出现在页面里
              </li>
              <li>
                <Icon name="check" />
                所有披露都生成可查看的收据，来源授权可随时停用
              </li>
            </ul>
          </div>
        </section>

        <section className="final-cta">
          <p className="eyebrow">你的下一个作品，不必一个人做</p>
          <h2>7 天，找到搭档，做出一个可以讲的项目。</h2>
          <Link className="button button--accent button--large" to="/login">
            开始一次 Handshake
            <Icon name="arrow" />
          </Link>
        </section>
      </main>
      <footer className="marketing-footer">
        <span>Handshake / V1</span>
        <p>AI 帮你初筛，决定权始终在你。</p>
        <span>Portfolio Builders · 2026</span>
      </footer>
    </div>
  );
}
