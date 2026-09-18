# ADR-0002：个人长期记忆留在 Home Agent

- 状态：Accepted
- 日期：2026-09-14

> 2026-09-17 V1 解释：这里的 “Home” 指记忆原本所属的信任域，不强制要求它位于用户设备。自建 Home Agent 的记忆留在本地；ChatGPT、Kimi、豆包等消费端账号的 Memory 留在各自供应商和客户端中。Handshake 都不直接读取或复制。具体连接方式见 [`../architecture/personal-ai-connectors.md`](../architecture/personal-ai-connectors.md)。

## 背景

个人 Memory 可能包含原始文档、长期对话、偏好、关系、Embedding 和推导出的私有 Claim。把这些内容集中上传会扩大泄露面、提高合规成本，并削弱用户对披露的控制。

## 决策

- 自建 Agent 的原始导入内容、长期记忆、私有 Embedding、未披露 Claim 和本地模型上下文只存于用户设备；供应商 AI 的账号 Memory 继续留在供应商信任域，不能复制到 Handshake。
- 记忆所属的 Agent/宿主先把当前可用上下文最小化为目的明确的 Capsule 或 Claim；用户/策略授权后，才通过 HSP、MCP 或人工导入发送。
- Gateway 只接收完成服务所需的 Agent Card、Intent Capsule、会话 Envelope、被授权的最小披露和收据元数据。
- 平台授权是发送的必要条件而非充分条件；Endpoint 本地策略可以再次拒绝。
- 中心 Schema 不设置 `memory`、`raw_context` 等兜底 JSON 字段。未知字段默认拒绝，不能静默持久化。
- Reference Agent 的内容密钥存系统凭据库；原始文件解析在隔离进程进行，私钥/API Key 不进入 WebView、遥测或中心端。

## 中心端允许保存什么

| 数据 | 条件 | 默认期限 |
| --- | --- | --- |
| Agent Card / Intent Capsule | 用户明确发布，限制在目标 Community | 有效期内，撤销/删除后 30 天内清除主存储 |
| 会话状态、Envelope 元数据、transition | 编排和审计所必需，不含正文 | 暂定上限为会话结束后 365 天；试点前须经法律/合同评审批准 |
| 被授权消息正文/最小 Claim | 仅限声明用途，加密并与审计分表 | 创建后最多 7 天，不因重试延长 |
| 授权/双重同意收据 | 只保存主体、范围、版本、哈希、时间和状态 | 暂定上限为会话结束后 365 天；试点前须经法律/合同评审批准 |
| nonce、在线状态、限流键 | 可丢失的协议运行数据 | 不超过 24 小时或协议 TTL |

备份保留不得超过 30 天；备份、日志和删除恢复的完整规则以 [data-classification.md](../security/data-classification.md) 为准。

## 结果

平台无法对完整个人记忆做中心搜索或恢复；本地 Home Agent 换设备时需要端到端加密的导出/迁移能力，供应商账号的迁移则受供应商能力约束。作为交换，中心端泄露不会直接暴露用户的完整记忆，平台只能获得逐次授权的最小上下文。

任何希望“为体验或调试临时上传完整上下文”的功能都必须先替代为本地处理或合成数据；若仍不可行，需要新的安全 ADR、显式用户选择和删除验证，不能作为本决策的隐式例外。
