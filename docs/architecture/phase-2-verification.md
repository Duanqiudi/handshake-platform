# 阶段 2 可行性验证记录

日期：2026-09-15  
结论：**技术纵切通过**  
范围：单进程 Node Gateway + SQLite + Synthetic Endpoint；不是生产验收或市场验证。

## 被验证的核心假设

两个独立 Endpoint 可以通过真实 HTTP 与 HSP 合约驱动同一个持久化 Handshake，在进程重启、消息重放、可信开发 Community 上下文和同版本并发下，继续遵守领域状态机并最终完成双重同意。

## 自动化证据

| 验证项 | 结果 | 证据 |
| --- | --- | --- |
| 真实 HTTP | 通过 | 测试启动随机本地 TCP 端口，经 `fetch` 调用 Gateway，不直接调用 Handler |
| 完整双端流程 | 通过 | 20 组会话均从 `SCREENING` 到 `REVEALED`，最终版本固定为 9 |
| 同版本并发 | 通过 | 每组两条并发 Proposal 恰好一条成功、一条 `CONCURRENT_MODIFICATION`，随后可恢复完成 |
| Proposal 语义 | 通过 | HSP Schema 与应用层双重拒绝矛盾的 `recommendation/stop_code`；本流程只接受 `continue/SUCCESS_PROPOSAL` |
| 同意版本 | 通过 | 第一方锁定共享 `consent_version` 标识；重启后第二方不同标识被拒，相同标识重试后才揭示 |
| 重启恢复 | 通过 | 在三个必测状态及第一份 consent 后关闭 Gateway/SQLite，使用原文件重启并继续 |
| durable 防重放 | 通过 | 重启后重复 `message_id`、复用 sender-scoped nonce、回退 sender `sequence` 均返回 `REPLAY_DETECTED` |
| Community 作用域 | 通过 | 在可伪造的开发请求头上下文内验证路由、Envelope、Repository 和 SQLite scope；这不是生产鉴权 |
| 原子持久化 | 通过 | 直接核对 SQLite 行数，确认重放/并发失败不增加 received message 或 transition，成功提交各增加一行 |
| 工程门禁 | 通过 | Frozen lockfile、Biome、依赖边界、严格类型、测试和构建全部通过 |

本次整仓共有 135 项测试：

- `hsp-contracts`：36 项
- `domain`：61 项
- `application`：18 项
- `sqlite-store`：6 项
- `protocol-simulator`：12 项
- `gateway-api`：2 项集成测试，其中包含 20 组完整并发恢复流程

## 代码层结论

- 双方 Proposal 进度已经进入领域聚合，重启后不会依赖进程内 Set 或 Controller 临时状态。
- HTTP、应用用例、领域和 SQLite Adapter 的依赖方向成立；业务转换没有写进 SQL 或路由。
- `HandshakeStore` 是替换边界。进入真实试点时可实现 PostgreSQL Adapter，无需改 HSP 或领域规则。
- `community_id` 出现在路由、用例、Repository 查询和所有 SQLite 业务主键/外键中。
- `message_id`、sender-scoped nonce 与每个 Handshake/sender 的 sequence 由数据库事实和唯一约束兜底，预检查只用于返回稳定错误。
- `DUAL_CONSENT_REACHED` 审计事件记录双方共同提交的 `consent_version` 标识。

## 本次没有证明的内容

- 没有真实签名、Endpoint 身份认证、用户账号或公网威胁防护。
- 开发请求头可以由本地客户端伪造，因此当前只证明代码和存储作用域，没有证明真实租户隔离。
- 相同 `consent_version` 目前只是双方报告的同一字符串；没有可信 proposal digest、consent artifact 或披露范围摘要，所以不能证明双方签署了同一份具体内容。
- 没有真实模型、个人 Memory、匹配准确率或用户披露体验。
- 没有 PostgreSQL、Outbox/Worker、多进程、高可用、备份和生产运维。
- 没有证明用户需要该产品、愿意持续使用或愿意付费。

因此本结论只表示“协议 + 状态机 + 最小持久化 + HTTP 编排”在单机验证范围内成立。

## 最小下一步

不要直接扩建生产平台。下一次时间盒应只接一个真实场景和一个 Reference Agent CLI，使用少量完全合成的个人资料，让两个真实模型 Adapter 完成 Claim→提问→Proposal，并记录：

1. 是否能在不泄露原始 Memory 的情况下生成足够信息；
2. Proposal 是否对人有用；
3. 需要人工介入多少次；
4. 单次会话延迟和模型成本。

这些指标有正向信号后，再决定是否建设 PostgreSQL、真实签名、Web UI 和邀请制用户试点。

本阶段 SQLite 数据不承诺升级兼容；聚合和 migration 已在验证期变化，旧测试数据库应丢弃重建。远程 CI 尚未执行，因为仓库还没有提交并推送；首次推送后应补充提交 SHA 与 CI 链接。
