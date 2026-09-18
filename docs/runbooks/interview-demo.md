# 面试演示 Runbook

目标：在 5–8 分钟内讲清产品问题、核心闭环、隐私边界和工程取舍；网络或后端临时失败时仍能继续展示。演示数据必须是仓库自带的合成身份。

## 演示前一天

在仓库根目录执行：

```powershell
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm check
```

期望使用 Node.js 24+ 和 pnpm 11.19.0。不要在面试开始前临时更新依赖、模型客户端或真实账号连接。

准备两个入口：

1. **主路径：真实本地 API**，证明 HTTP、鉴权、SQLite、双方隔离和重启持久化。
2. **备用路径：浏览器合成演示**，确保即使 API 或 MCP 客户端出问题，也能讲完整产品故事。

清理截图、终端历史和 MCP 配置中的真实 token。不要使用自己的真实 Memory、联系人、Cookie 或模型 API Key。

## 主路径：单进程真实 API

先让成员 Web 使用同源 `/v1`，再构建 API：

```powershell
$env:VITE_DEMO_MODE = "true"
$env:VITE_API_BASE_URL = "/v1"
pnpm --filter @handshake/member-web build
pnpm --filter @handshake/platform-api build
```

启动本机演示服务：

```powershell
$env:NODE_ENV = "production"
$env:HOST = "127.0.0.1"
$env:PORT = "3220"
$env:HANDSHAKE_PRODUCT_DB_PATH = "./var/handshake-interview.sqlite"
$env:HANDSHAKE_DEMO_MODE = "true"
pnpm --filter @handshake/platform-api start
```

在另一终端检查服务并重置合成数据：

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:3220/healthz"
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:3220/v1/demo/reset"
```

打开 `http://127.0.0.1:3220`。使用两个独立浏览器上下文，避免 `localStorage` 中的令牌互相覆盖：

- 普通窗口：林然，`hs_demo_linran`
- 隐私窗口：陈默，`hs_demo_chenmo`

演示重置会覆盖该路径下的本地合成数据库。不要把 `HANDSHAKE_DEMO_MODE=true` 的服务暴露到公网。

## 5–8 分钟讲解顺序

### 0:00–0:45：先讲问题

推荐表述：

> 公开资料卡只能告诉我“这个人大概会什么”，却不能确认“他这周有没有时间、愿不愿意做同一个交付”。Handshake 让双方常用 AI 用最少、经主人批准的信息先补齐这些未知条件，合适后再把决定交还给人。

不要说“平台把 ChatGPT 和 Kimi 的 Memory 拉了进来”。准确说法是：原 AI 使用它当前可用的上下文生成任务专用 Capsule，Handshake 只接收批准字段。

### 0:45–1:45：Capsule 与连接器

展示连接页和 Capsule 页：

- ChatGPT/Kimi 的演示连接必须带“合成”标识。
- 指出没有 `approvedFields` 时默认一个字段也不批准。
- 展示不属于 Capsule 的三类数据：原始聊天、联系方式、账号凭据。
- 解释 MCP 和手工导入产生同一种 Capsule，所以产品不被某一家供应商锁死。

### 1:45–2:45：发现不是黑盒评分

以林然身份打开候选页：

- 陈默能提供 TypeScript/LLM 集成，正好补林然的需求；林然的产品/研究能力也补陈默。
- 页面同时显示信息缺口，不伪造“92% 匹配”之类的精确数字。
- 发起 Handshake，说明硬冲突候选不能绕过规则进入下一步。

### 2:45–4:15：有限问答与主人确认

林然向陈默询问一个会影响 7 天交付的具体条件。切到陈默的隐私窗口：

- 待答问题只出现在陈默一侧，不会广播给另一位无关用户。
- 回答之前先展示文字和用途，再确认发送。
- 平台记录的是最小 Claim 和摘要收据，不是陈默的整段 Memory。
- 每个 Handshake 最多 3 轮、每轮 3 问，防止 AI 无限聊天。

### 4:15–5:30：AI 建议不替人同意

两边分别提交建议，然后展示同一个 `consentVersion`：

1. 林然先选择继续。
2. 刷新 Handshake，指出 `contactReveal` 仍为 `null`。
3. 陈默基于同一版本选择继续。
4. 再刷新，联系方式才出现，同时生成 7 天项目。

这是整场演示最重要的安全证据。不要提前在开发者工具、截图或讲稿里展示联系方式。

### 5:30–6:30：从匹配到结果

打开项目空间，展示 7 天计划、每日进展、作品 URL 和双方反馈。强调产品的成功指标不是“AI 聊了多少轮”，而是：

- 双方是否愿意联系；
- 是否真正创建 7 天项目；
- 是否提交可展示作品；
- 合作后是否愿意再次搭档。

### 6:30–8:00：工程取舍（按面试官兴趣选讲）

- `product-core` 保持纯规则；HTTP 和 SQLite 都在外层，可单独替换。
- `product-application` 保存的是用例和隐私不变量，Web 与 MCP 复用同一套服务端规则。
- SQLite 使用版本化 compare-and-swap，适合 10–20 人本地/邀请制验证；真实试点再迁移 PostgreSQL 和 Outbox。
- HSP 纵切单独验证重放、并发和状态机，不用一开始就拆微服务。
- 自动测试覆盖完整双重同意路径，以及“第一份同意绝不泄露联系方式”。

## 快速技术证据

登录令牌在 HTTP 中是标准 Bearer token。以下命令可证明真实 API，而无需展示数据库：

```powershell
$headers = @{ Authorization = "Bearer hs_demo_linran" }
Invoke-RestMethod -Headers $headers -Uri "http://127.0.0.1:3220/v1/me/dashboard"
Invoke-RestMethod -Headers $headers -Uri "http://127.0.0.1:3220/v1/discovery/candidates"
Invoke-RestMethod -Headers $headers -Uri "http://127.0.0.1:3220/v1/privacy/receipts"
```

停止并重新启动 Platform API，再请求 Dashboard，可以展示 SQLite 持久化。演示中不要直接打开数据库快照，因为里面包含双方私密联系方式。

## 备用路径：纯浏览器演示

如果 API、SQLite 或端口临时异常：

```powershell
$env:VITE_DEMO_MODE = "local"
pnpm --filter @handshake/member-web dev
```

打开 `http://127.0.0.1:4173`，页面会持续标注“安全演示环境”。这条路径使用浏览器内存中的合成案例，应主动告诉面试官它用于稳定展示交互，不把它说成真实后端请求。

如果目标 AI 客户端当场没有 MCP 入口，直接展示 Capsule JSON 导入。这是正式设计的兼容路径，不是临时造假。

## 常见追问

**有资料卡，为什么还需要 AI 问答？**  
资料卡用于低成本筛选；问答只确认会决定本次合作的动态条件，例如具体时间、交付范围和角色边界。固定资料与临时承诺是两类事实。

**A 的 AI 怎么带着 A 的 Memory 和 B 的 AI 聊？**  
Handshake 不搬运 Memory。A 的宿主 AI 在它自己的授权上下文中生成最小 Capsule 或回答，A 确认后平台才转交；B 同理。供应商不支持工具时改用人工导入。

**为什么需要平台 API？**  
API 不是为了调用大模型，而是为了保存共同状态、控制轮次、校验接收方、生成授权版本、执行双重同意和创建项目。没有中立协调层，两边很难对“披露了什么、谁同意了哪个版本”达成一致。

**下一步先做什么？**  
先邀请 10–20 位目标用户完成真实的 7 天组队，验证联系率、开工率、作品完成率和反馈；只有证据支持，再投入供应商实机认证、生产身份、PostgreSQL/Outbox 和运营工具。

## 收尾检查

- 停止本地服务。
- 不提交 `var/`、SQLite、`.env` 或带令牌的 MCP 配置。
- 如果使用了非合成数据，删除本地数据库和浏览器站点数据；正式试点前不要收集真实敏感信息。
