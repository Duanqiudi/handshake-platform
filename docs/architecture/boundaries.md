# 模块与依赖边界

本文中的“必须”“不得”是代码评审和 CI 的约束，不是建议。

## 允许的依赖方向

```text
apps/*（组合根、传输层、UI）
    ├── application/use cases（用例与端口，建立后添加）
    │      ├── domain
    │      └── hsp-contracts（只在协议边界映射）
    ├── adapters（data-access、model-adapters、通知等）
    │      └── application/domain 定义的端口
    └── observability

hsp-contracts ──> Schema/序列化依赖
domain        ──> 标准库与自身模块
```

规则：

- `domain` 必须是纯业务代码；不得依赖 HTTP、WebSocket、数据库、Redis、文件系统、模型 SDK、环境变量或任一 `apps/*`。
- `hsp-contracts` 只拥有线协议、解析、标准化和兼容性；不得依赖 `domain` 或应用代码。
- HSP DTO 与领域对象必须显式映射，不能把传输 DTO 当作领域实体持久化。
- Adapter 实现内层定义的端口；内层不得反向导入具体 Adapter。
- `apps/*` 是组合根。Controller/handler 只做认证、解析、映射和调用用例，不承载状态规则。
- `member-web`、`operator-web` 只使用生成的客户端或稳定 API 类型，不导入后端领域实现或数据访问代码。
- `reference-agent` 不得导入平台数据访问模块；平台模块不得导入其本地 Memory 存储实现。
- 供应商名称、SDK 类型和供应商错误码只能出现在对应 Adapter 内；业务层只认识模型能力端口和统一错误。

第一阶段应通过 `package.json` 的显式 `exports`、TypeScript project references 和依赖检查阻止深层导入。发现循环依赖时必须修正边界，不得用动态导入掩盖。

## 业务模块所有权

| 模块 | 拥有的数据/行为 | 其他模块如何使用 |
| --- | --- | --- |
| Identity | Owner、Endpoint、Community、密钥状态 | 公开查询/验证接口 |
| Intent & Discovery | Agent Card、Intent Capsule、候选结果 | 查询接口；不得修改 Identity |
| Session | Handshake 聚合、状态机、轮次和预算 | 命令接口与领域事件 |
| Consent | 披露授权、双重同意、不可变收据 | 查询授权结果；撤销走命令 |
| Safety | 举报、封禁、申诉和处置 | 策略判断接口与审计事件 |
| Notification | 投递偏好与通知任务 | 消费 Outbox 事件 |
| Local Memory | 原文、长期记忆、Embedding、私有 Claim | 仅 Endpoint 本地策略接口 |

每个模块只能通过自己的 Repository 修改所拥有的数据表。跨模块读取通过公开查询接口，跨模块写入通过命令或领域事件；不得直接调用另一个模块的 Repository。

## 状态和事务边界

- Handshake 状态只能由 `domain` 的聚合方法转换。
- 所有命令携带聚合 `version`；并发写入使用乐观锁，冲突返回稳定错误而不是最后写入覆盖。
- 状态、transition 记录和 Outbox 必须在一个 PostgreSQL 事务中提交。
- Consumer 必须以 `message_id`/`idempotency_key` 去重；重复投递不得重复收费、授权或通知。
- Redis 锁丢失、缓存清空或 Worker 重启不得改变已提交业务结果。
- 定时任务通过正常领域命令触发超时转换，不得直接执行 `UPDATE handshake SET state = ...`。

## 数据和权限边界

- 中心端不得提供能够存放完整 Memory、原始导入文件或本地 Embedding 的通用 JSON 字段。
- 公共 Agent Card、Intent Capsule 与经同意披露的最小 Claim 必须是不同的数据类型和存储字段。
- 消息正文与长期审计元数据分表存放；正文必须可独立加密、分区和到期删除。
- 日志、Trace、指标标签不得包含正文、Prompt、Token、邮箱、电话、API Key、签名私钥或完整 Claim。
- Operator 默认只能查看元数据。查看受限正文必须有工单原因、临时授权、操作审计和自动到期。
- `community_id` 必须随请求上下文传递并存在于所有租户业务表；Repository 查询不得接受“缺省为全部租户”。跨社区发现默认拒绝。

完整分类与留存规则见 [data-classification.md](../security/data-classification.md)。任何例外必须先增加 ADR、威胁分析和迁移/删除方案。

## 边界变更检查

新增模块、字段或集成时，PR 必须回答：

1. 谁拥有这项业务事实？
2. 允许的依赖方向是否改变？
3. 数据类别、用途、留存和删除任务是什么？
4. 重试、并发和重复消息如何保持幂等？
5. 需要哪些指标、告警、回滚和 Runbook？

无法回答时不得合并。
