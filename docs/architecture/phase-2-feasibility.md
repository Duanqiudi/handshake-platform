# 阶段 2：Idea 可行性验证版

状态：本地技术验证通过；远程 CI 待首次推送  
最后更新：2026-09-15  
时间盒：3–5 个工作日

> 本文件定义当前阶段 2 的验证范围。它是对 `delivery-phases.md` 中生产级“持久化纵切”的临时收缩，不替代生产架构；PostgreSQL、Outbox、Worker 等能力只是延后，是否建设由本次验证结果决定。

## 要回答的问题

本阶段只验证一个核心假设：在不接真实模型、真实用户和生产基础设施的情况下，两个独立 Endpoint 能否通过真实 HTTP 和 HSP 合约，驱动同一个 Handshake 状态机完成双重同意，并且在重启、重放、跨 Community 请求和并发写入下保持结果正确。

如果答案是“可以”，再投资完整 MVP；如果答案是“不可以”，先修改协议或领域模型，不用基础设施掩盖问题。

## 最小运行形态

```text
Synthetic Endpoint A ─┐
                      ├─ HTTP/JSON ─> 单进程 Node Gateway ─> 单个 SQLite 文件
Synthetic Endpoint B ─┘                  ├─ HSP 校验
                                         ├─ 应用用例
                                         └─ domain 状态机
```

- Gateway 是一个 Node.js 进程，HTTP 请求必须经过真实监听端口，集成测试不得直接调用 Handler。
- SQLite 与 Gateway 同机，使用文件数据库；测试可为每个用例创建独立临时数据库。
- 两个 Synthetic Endpoint 只生成、发送和校验 HSP 消息，不调用真实模型，也不持有真实个人 Memory。
- `domain` 和 `hsp-contracts` 继续作为唯一状态规则与线协议来源；Gateway 不复制状态判断。

## 本阶段交付

### HTTP 边界

- `POST /v1/communities/:communityId/handshakes`：创建一个直接位于 `SCREENING` 的验证会话；真实发现、候选选择和身份流程在本阶段明确跳过。
- `POST /v1/communities/:communityId/handshakes/:handshakeId/messages`：解析 HSP Envelope，校验版本、TTL、Community、参与者、`message_id`、`nonce`、sender `sequence` 和期望状态版本；在事务中应用领域命令并返回新状态与版本。
- `GET /v1/communities/:communityId/handshakes/:handshakeId`：按 Community 查询当前状态，不能缺省为全局查询。
- `GET /healthz`：只报告进程和 SQLite 是否可用。

验证环境可用固定测试 Endpoint 身份和请求头建立调用上下文，但必须显式标记为开发认证，不能把它描述为生产鉴权或真实签名。

### 最小持久化

SQLite 至少保存以下事实，字段名可在实现时调整：

- `handshake_aggregates`：`handshake_id`、`community_id`、参与者、当前状态、预算、聚合 JSON 与 `version`。
- `handshake_transitions`：仅追加的状态变化记录、触发消息和聚合版本。
- `received_messages`：Endpoint、`message_id`、Envelope 摘要、接收时间，以及 sender-scoped nonce 和 `(community_id, handshake_id, sender_endpoint_id, sequence)` 唯一约束。

一次消息处理必须在同一 SQLite 事务内完成：登记去重信息、按 `expected_version` 更新 Handshake、追加 transition。任何一步失败都整体回滚。阶段 2 不实现 Outbox；Synthetic Endpoint 由测试编排器主动发送下一条消息。

### 代码边界

- HTTP Handler 只负责上下文、解析、错误映射和调用用例。
- 应用用例依赖 Repository 接口，不直接散落 SQLite SQL。
- SQLite Adapter 实现 Repository；不得让 `domain` 或 `hsp-contracts` 依赖 SQLite、HTTP 或环境变量。
- 统一返回已有稳定协议错误；不得为了让测试通过直接写状态字段。

## 成功指标

以下条件必须全部由自动化集成测试证明，才判定 Idea 在本阶段可行：

1. **完整双端流程**：Endpoint A/B 的消息全部走 HTTP，状态从验证入口推进到 `REVEALED`；连续运行 20 次无随机失败。
2. **重启恢复**：在 `SCREENING`、`PROPOSAL`、`WAITING_DUAL_CONSENT` 三个检查点停止 Gateway，使用原 SQLite 文件重启后状态、版本和去重记录不丢失，并能继续到最终揭示状态。
3. **Community 作用域**：在可信开发调用上下文下，Community B 对 Community A 的 Handshake 进行读取或写入时全部被拒绝，且响应不泄露会话正文或参与者信息。该指标不等同于生产身份认证。
4. **重放防护**：重复 `message_id`、更换 `message_id` 后重复 `nonce`，以及使用全新 replay key 但回退 sender `sequence`，都返回稳定的重放错误；重启后再次发送仍被拒绝，状态与 transition 数量不变。
5. **并发版本**：两个请求携带相同 `expected_version` 并发写入时，恰好一个成功，另一个返回版本冲突；最终只增加一次版本和一次 transition。该场景重复 20 组结果一致。
6. **工程门禁**：上述测试进入 `pnpm check`，格式、类型、边界、单元测试、集成测试和构建全部通过。

## 本地验证结果

2026-09-15 的自动化结果满足上述技术指标：

- 20 组真实 TCP/HTTP 会话均先制造同版本并发竞争，验证一条成功、一条冲突，再恢复并到达 `REVEALED`。
- 另一路会话在 `SCREENING`、`PROPOSAL`、`WAITING_DUAL_CONSENT` 三个必测检查点，以及第一方提交 consent 后，关闭 Gateway 和数据库连接并重开同一个 SQLite 文件，最终到达 `REVEALED`。
- 重启后重复 `message_id`、复用 nonce 和回退 sender `sequence` 均返回 `REPLAY_DETECTED`；SQLite 测试直接确认失败事务没有增加消息或 transition 行。
- HSP 合约拒绝 `continue + LOW_CONFIDENCE/HUMAN_REQUIRED/ENOUGH_INFO` 等矛盾 Proposal；只有 `continue + SUCCESS_PROPOSAL` 能进入本阶段流程。
- 第一份 OWNER_DECISION 锁定本轮 `consent_version` 标识；另一方提交不同标识会被拒绝，重启后约束仍成立，使用相同标识重试才能进入 `REVEALED`。
- 在可伪造的开发请求头上下文内，跨 Community 读取与写入均被拒绝且不泄露正文；状态版本冲突返回 `CONCURRENT_MODIFICATION`。
- 完整结果及未覆盖范围见 [phase-2-verification.md](./phase-2-verification.md)。

测试报告需保留请求、状态版本和错误码，但不得记录完整 Claim、签名密钥或任何真实个人数据。

## 失败与停止条件

出现任一情况即停止加功能，记录失败证据并回到协议/领域设计：

- 必须绕过 `domain` 状态机、放宽 HSP Schema 或直接改数据库状态才能走完 Happy Path。
- 任一重启、重放或并发测试产生状态丢失、重复 transition、最后写入覆盖或不确定结果，且在时间盒内无法定位根因。
- Community 隔离必须依赖调用方自觉传参，而 Repository 无法强制限定 Community。
- 为完成最小双端流程已经必须引入真实模型、消息队列、后台 Worker 或外部缓存，说明当前协议编排边界不成立。
- 3–5 个工作日时间盒结束仍无法满足全部成功指标。此时输出“继续、修改假设或停止”的决策，不自动扩大范围。

失败不是继续堆基础设施的理由；允许本阶段得出 Idea 暂不可行或需要重构的结论。

## 明确非目标

本阶段不建设：

- PostgreSQL、Redis、Transactional Outbox、消息队列或独立 Worker。
- 真实模型 Adapter、语义召回、Embedding 或真实个人 Memory。
- 生产身份系统、PKI、密钥轮换、真实数字签名或公网 Endpoint 接入。
- Member Web、Operator Web、桌面 UI 或完整运营后台。
- 容器编排、云部署、灰度、备份、监控告警和生产 SLO。
- 多节点扩缩容、高可用、性能压测或微服务拆分。
- 真实用户试点、付费、推荐效果和市场需求验证。

因此，即使本阶段全部通过，也只证明协议编排与最小持久化技术路径可行，不证明产品需求、匹配质量、安全合规或生产可运营性成立。

## 进入下一步的条件

只有成功指标全部通过，且决定开始封闭 MVP，才迁移到生产级持久化纵切。触发以下任一需求时，不再扩展 SQLite 方案：

- 运行多个 Gateway 进程或需要跨进程并发一致性。
- 接入真实 Endpoint/用户，需要可靠异步投递、重试和超时任务。
- 需要生产鉴权、真实签名、限流、审计留存、删除作业或备份恢复。
- SQLite 单机写入、可用性或运维边界已成为经测试确认的限制。

迁移时保留 HSP、领域状态机、用例和 Repository 接口，替换 SQLite Adapter 为 PostgreSQL，并补上 Transactional Outbox、Worker、durable Inbox/防重放、真实签名、可观测性和迁移演练。SQLite 验证数据可丢弃，不承担生产数据原地升级或滚动升级承诺；本阶段新增聚合字段时应重建旧测试数据库。

## 阶段结论模板

完成时间盒后只给出以下三种结论之一：

- **通过**：全部成功指标有自动化证据，可以进入封闭 MVP。
- **有条件通过**：核心流程成立，但列出必须先修正的协议/领域问题和新的短时间盒。
- **不通过**：写明被证伪的假设、复现方式和停止投资建议。

结论必须引用测试结果，不能以“Demo 看起来能跑”代替验收。
