# ADR-0003：HSP 采用 Contract-First 和显式版本兼容

- 状态：Accepted
- 日期：2026-09-14

## 背景

Handshake 要连接不同模型、不同 Endpoint 版本和不完全可信的实现。若消息定义散落在 Controller 或模型 Prompt 中，状态语义、签名内容和升级行为会发生漂移，重试也可能造成重复授权或收费。

## 决策

- `packages/hsp-contracts` 是 HSP 线协议的唯一事实来源，先改合约和测试向量，再改实现。
- 每个 Envelope 至少包含：`protocol_version`、`message_type`、`message_id`、`sender_endpoint_id`、`recipient_endpoint_id`、`community_id`、`issued_at`、`expires_at`、`nonce`、`payload` 和 `signature`。
- 签名覆盖规范化后的 Envelope（排除 `signature` 本身）。规范化算法和测试向量必须版本化，不能依赖普通对象键顺序。
- 解析顺序固定为：尺寸限制 → 语法/Schema → 版本 → TTL/nonce → 签名 → 身份/租户 → 当前状态/权限。
- 未知 `message_type`、未知必需字段语义、无兼容策略的主版本一律拒绝；不得猜测或让模型解释。
- 同一主版本只允许向后兼容地增加可选字段/错误码；删除、重命名、改变含义或签名规范需要新主版本。
- 所有副作用按 `message_id` 或明确的 `idempotency_key` 幂等；协议错误使用稳定的机器码，展示文案不属于合约。
- 领域状态机不直接依赖 wire DTO；边界层把已验证 DTO 映射成领域命令。

## 合约变更流程

1. 更新 Schema、兼容矩阵和 Changelog。
2. 增加有效、无效、边界和规范化签名测试向量。
3. 在当前版本与前一受支持版本间运行 Consumer/Provider 兼容测试。
4. 先发布能读取新旧格式的 Consumer，再灰度 Producer。
5. 观察错误率和版本分布，保留回滚；达到公开退役条件后才停止旧版本。

第一阶段只承诺 `0.x` 实验协议；进入邀请制试点前必须冻结 `1.0` 所需字段、错误码和最短支持期。

## 结果

新增消息会多一道设计和测试门禁，但 Endpoint 能独立升级，错误可审计，签名和幂等语义不会被各实现自行解释。模型供应商变化不构成 HSP 合约变化。
