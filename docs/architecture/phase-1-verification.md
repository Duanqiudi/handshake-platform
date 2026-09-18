# 阶段 1 验收记录

日期：2026-09-14  
状态：本地工程门禁通过；远程 CI 待仓库首次推送后确认。

## 验收结果

| 门禁 | 结果 | 证据 |
| --- | --- | --- |
| 锁文件安装 | 通过 | `pnpm install --frozen-lockfile` |
| 格式与静态检查 | 通过 | Biome 检查 48 个文件 |
| 架构依赖边界 | 通过 | `scripts/check-boundaries.mjs` |
| TypeScript 严格类型检查 | 通过 | 3 个有源码的 Package 全部通过 |
| 自动测试 | 通过 | 92 项测试全部通过 |
| Package 构建 | 通过 | `domain`、`hsp-contracts`、`protocol-simulator` 全部构建成功 |
| 差异空白检查 | 通过 | `git diff --check` |

测试构成：

- `hsp-contracts`：30 项，覆盖 10 类 HSP 0.2 消息、未知类型、版本、时效、授权范围与 Schema 拒绝。
- `domain`：49 项，覆盖状态图、预算、Owner 介入、双重同意、终态、乐观锁与幂等。
- `protocol-simulator`：13 项，覆盖双 Endpoint 最短流程、显式 DTO→命令映射、跨 Community/参与者拒绝、重放、过期、版本冲突和规范化摘要。

## 已建立的约束

- HSP Wire Contract 与领域状态机分包，领域层不依赖协议、框架、数据库或模型供应商。
- 接收顺序固定为：Schema/TTL → 会话与租户范围 → 重放检查 → 状态版本 → DTO 显式映射 → 领域命令。
- `communityId`、`scene`、`purpose` 和参与方在 Handshake 创建后不可变。
- 双方分别提交 `continue` 之前不能进入 `REVEALED`。
- 幂等命令使用排序键的规范化 JSON 生成 SHA-256；不依赖普通对象插入顺序。
- 模拟器只使用合成数据和占位签名，不读取个人 Memory，不调用真实模型。

## 明确递延到阶段 2

- Ed25519 真实签名和 Endpoint 身份认证。
- PostgreSQL 持久化、迁移、Transactional Outbox/Inbox 和崩溃恢复。
- durable `message_id`/nonce/sequence 重放存储、限流、超时调度与审计指标。
- 真实 API/Worker 进程、跨租户数据库策略和生产部署。

远程 CI 成功前，只能称为“本地验收通过”；首次推送后应把 CI 运行链接和提交 SHA 补到本记录。
