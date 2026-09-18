# Handshake MCP Adapter

这个包把支持 MCP `stdio` 的 AI 客户端连接到 Handshake 成员 API。它让用户常用的 AI **主动提交经过授权的最小信息**，但绝不尝试读取 ChatGPT、Kimi 或豆包账号内部的 Memory 数据库。

## 最重要的边界

```text
宿主 AI 当前可用的 Memory / 对话上下文
                │
                │ 宿主 AI 生成结构化参数
                │ 用户检查并确认敏感动作
                ▼
        Handshake MCP Adapter
                │
                │ Bearer owner token
                ▼
        Handshake Member API
```

- Adapter 没有“读取 Memory”工具，也不接收供应商账号 Cookie、聊天记录或模型 API Key。
- API Key 只能调用模型 API，不等于用户消费端 AI 账号的 Memory 钥匙。
- Capsule 是当前用途的最小、可撤销披露，不是完整个人档案。
- `prepare_memory_capsule` 未收到 `approvedFields` 时会显式发送空数组，绝不会把“用户尚未选择”解释成“全部批准”；此类草稿需在成员页面完成字段审批后才能发布。
- 发布 Capsule、发布项目意图、发送 Claim 和提交主人决定都设置了明确确认边界。
- 联系方式是否返回由 Member API 的双重同意规则控制，不由 MCP 自行决定。
- 本包不会让 AI 在用户离线时自动醒来。后台回调是另一项供应商能力，不能假设存在。

## 九个工具

| 工具 | 成员 API | 用途 |
| --- | --- | --- |
| `prepare_memory_capsule` | `POST /v1/me/capsules/import` | 创建任务专用 Capsule 草稿 |
| `publish_memory_capsule` | `POST /v1/me/capsules/:id/publish` | 主人确认后发布 Capsule |
| `publish_project_intent` | `POST /v1/me/intents` | 发布 7 天作品集组队意图 |
| `list_candidates` | `GET /v1/discovery/candidates` | 查看可解释候选匹配 |
| `list_pending_questions` | `GET /v1/handshakes` | 提取待主人回答的问题 |
| `submit_claim_response` | `POST /v1/handshakes/:id/questions/:questionId/answer` | 发送经主人确认的最小 Claim |
| `get_handshake_status` | `GET /v1/handshakes/:id/view` | 查看流程、披露摘要和决定状态 |
| `submit_match_recommendation` | `POST /v1/handshakes/:id/recommendations` | 提交 AI 建议，不代替主人决定 |
| `submit_owner_decision` | `POST /v1/handshakes/:id/decisions` | 提交主人基于特定摘要版本的决定 |

所有输入 schema 都关闭额外字段。Adapter 还会在发出请求前拦截常见邮箱、手机号、证件/账号号码、密钥和密码内容。最终安全边界仍必须由成员 API 再验证一次。

## 安装和构建

包已经在 `package.json` 声明 `@modelcontextprotocol/sdk`。在仓库根目录统一安装依赖并更新锁文件后构建：

```powershell
pnpm install
pnpm --filter @handshake/mcp-adapter build
pnpm --filter @handshake/mcp-adapter test
```

这个实现使用官方 MCP TypeScript SDK 的低层 `Server`、`ListToolsRequestSchema`、`CallToolRequestSchema` 和 `StdioServerTransport`。业务逻辑与 SDK 加载分开，因此 API client、schema 和工具映射可以独立测试。

## 本地运行

必须配置两个环境变量：

```powershell
$env:HANDSHAKE_API_BASE_URL = "http://127.0.0.1:3220"
$env:HANDSHAKE_OWNER_TOKEN = "从本地邀请制注册流程获得的 owner token"
node D:\hgagent\apps\handshake-mcp\dist\main.js
```

可选：`HANDSHAKE_API_TIMEOUT_MS`，范围为 100–120000 毫秒，默认 10000。

`stdout` 完全保留给 MCP 协议帧；启动错误只写入 `stderr`，且不会打印 owner token。

### MCP 客户端配置示例

任何支持本地 `stdio` MCP Server 的客户端都可以使用下面的等价配置。具体设置入口由客户端决定：

```json
{
  "mcpServers": {
    "handshake": {
      "command": "node",
      "args": ["D:\\hgagent\\apps\\handshake-mcp\\dist\\main.js"],
      "env": {
        "HANDSHAKE_API_BASE_URL": "http://127.0.0.1:3220",
        "HANDSHAKE_OWNER_TOKEN": "owner_xxx"
      }
    }
  }
}
```

不要把真实 token 提交到 Git，也不要把它写进公开截图。面试演示请使用演示账号和可随时撤销的 token。

成员 Web 里的“登记连接信息”只保存 provider、接入方式和能力等元数据；它不会启动这个 `stdio` 进程，也不会探测某个 AI 客户端是否在线。只有宿主客户端按上面的配置成功启动 Adapter、列出 Handshake 工具并完成一次调用，才表示 MCP 真正连通。V1 没有可填写的 `https://.../mcp` 远程地址。

## ChatGPT、Kimi、豆包的实际能力边界

### ChatGPT / OpenAI 客户端

- 能否安装本地 MCP 取决于具体客户端、账号和工作区策略；“ChatGPT 有 Memory”不代表第三方工具可直接读取该 Memory。
- 当宿主支持 MCP 时，宿主模型可以根据**它在当前会话中本来就获准使用的上下文**生成工具参数。
- OpenAI API 调用不会自动继承 ChatGPT 消费端账号 Memory。
- 只支持远程 connector 的界面不能直接连接本地 `stdio` 进程，需要未来部署经过认证的 Streamable HTTP 版本。

### Kimi

- 只有在当前 Kimi 客户端确实支持该 MCP/插件接入方式时，才能交互式调用这些工具。
- 不支持时仍可让 Kimi 生成标准 Capsule，由用户复制到 Handshake 的导入页面；这属于 `capsule_import`，不是实时 Memory 连接。
- Adapter 不拥有 Kimi 账号 Memory 的读取权限，也不会绕过 Kimi 的授权机制。

### 豆包

- 同样需要以当前客户端真实开放的 MCP/插件能力为准，不能把模型 API 当作豆包账号 Memory 接口。
- 若客户端没有适用的 MCP 入口，V1 使用经用户检查的 Capsule 导入流程。
- 不使用浏览器 Cookie、页面抓取或自动化登录来获取豆包个人数据。

这三条接入路径都遵循同一个原则：**Memory 留在原 AI 内部，Handshake 只接收本次任务中用户允许披露的字段和回答。**

## 面试演示建议

1. 用两个合成身份分别完成本地 onboarding，并各自创建 AI connection。
2. 在两个支持 MCP 的会话中分别配置自己的 owner token。
3. 让 A 的 AI 根据当前上下文调用 `prepare_memory_capsule`，展示严格结构化草稿。
4. 让主人检查 `approvedFields`，再调用 `publish_memory_capsule` 和 `publish_project_intent`。
5. B 重复该流程；双方查看可解释候选和 Handshake。
6. 展示一轮待回答问题：AI 先草拟最小 Claim，主人确认后才调用 `submit_claim_response`。
7. 两边 AI 分别提交建议，然后两位主人基于同一个 `consentVersion` 决定。
8. 在第二位主人同意前检查 `contactReveal` 为 `null`；同意后再展示联系方式和 7 天项目空间。

这一流程展示的是一个真实、诚实的跨 AI 协作协议，而不是伪造“第三方可以读取所有账号 Memory”的能力。

## 当前传输方式

V1 提供本地 `stdio` 入口，适合开发和可控的面试演示。远程 Streamable HTTP 入口没有在这里假装完成：生产版还需要 OAuth/用户绑定、Host 校验、限流、会话管理、TLS、审计和云端密钥管理。业务工具层已经与传输分离，后续可以复用同一个 `HandshakeMcpRuntime` 增加安全的远程入口。
