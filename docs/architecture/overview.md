# Handshake V1 架构总览

状态：本地产品验证实现  
最后更新：2026-09-17

## 产品边界

Handshake 不是新的通用聊天机器人，也不是把用户的全部 AI Memory 汇总到中心。它为“7 天作品集组队”提供一条受控链路：常用 AI 生成任务资料，主人批准，平台做可解释匹配，双方通过有限问答补齐硬条件，最后由两位主人决定是否交换联系方式。

当前仓库同时保留两条工程轨道：

1. **产品 V1**：成员 Web、Platform API、产品用例、SQLite 和 MCP Adapter，支撑可演示的完整业务闭环。
2. **HSP 可行性纵切**：`gateway-api`、`reference-agent`、HSP 合约和协议模拟器，验证状态机、重放、并发与 Community 边界。

两条轨道复用领域思想，但不是同一个 HTTP API。面试演示使用产品 V1；协议工程验证使用 `gateway-api`。

## 当前运行形态

```text
┌──────────────────────── 用户侧 ────────────────────────┐
│                                                        │
│  member-web                      常用 AI 当前会话        │
│  React / Vite                    ChatGPT / Kimi / 豆包  │
│       │                                  │              │
│       │ HTTP/JSON              结构化工具参数或 JSON    │
│       │                                  ▼              │
│       │                         handshake-mcp (stdio)    │
└───────┼──────────────────────────────────┼──────────────┘
        │                                  │
        └────────────────┬─────────────────┘
                         ▼
                 platform-api (Node)
                         │
             ProductApplicationService
                 ┌───────┴────────┐
                 ▼                ▼
           product-core       domain / HSP
       匹配、授权、项目规则     合法状态转换
                 │
                 ▼
          product-sqlite-store
          本地版本化社区快照
```

生产构想中的 PostgreSQL、Outbox、Worker、运营后台和多实例部署尚未实现，不属于上图。

## 组件职责

| 组件 | 当前负责 | 当前不负责 |
| --- | --- | --- |
| `apps/member-web` | 中文成员流程、逐字段批准、候选理由、Handshake、双重同意、7 天项目空间 | 读取数据库、调用供应商 Memory、决定联系方式是否可揭示 |
| `apps/platform-api` | Bearer 认证、HTTP 输入/错误映射、产品用例组合、演示重置、静态页面托管 | 生产 OAuth、消息队列、模型推理、云端秘密管理 |
| `apps/handshake-mcp` | 9 个本地 `stdio` 工具，把宿主 AI 的结构化参数发送到成员 API | 读取账号 Memory、保存供应商 Cookie、离线唤醒宿主 AI |
| `packages/product-application` | 令牌摘要、Capsule/Intent、发现、问答、AI 建议、双重同意、联系方式揭示、项目生命周期 | HTTP、SQLite 细节、前端状态 |
| `packages/product-core` | 纯类型、运行时校验、可解释匹配、授权版本、7 天计划和状态文案 | 网络、环境变量、数据库 |
| `packages/product-sqlite-store` | 单社区快照、迁移、校验、乐观 compare-and-swap | 生产级加密、高可用、多实例写入 |
| `packages/domain` | Handshake 聚合的合法状态和命令转换 | 推荐模型、HTTP、持久化 |
| `packages/hsp-contracts` | 可版本化的协议 Schema、错误和边界校验 | 产品页面和供应商集成 |

## 产品请求路径

### 1. Capsule 与发现

1. 宿主 AI 在自己的会话中生成结构化 Capsule，或用户在成员页面手工导入。
2. 默认没有字段获批；用户逐项选择后才能发布。
3. Platform API 调用产品用例校验并保存公开 Capsule 和隐私收据。
4. 发现只使用已发布、未撤销、未过期的数据，返回互补理由和信息缺口，不返回联系方式。

### 2. 有限 AI 问答

1. 一方启动 Handshake，状态机进入 `SCREENING`。
2. 问题绑定接收主人、判断条件和到期时间；每次会话最多 3 轮、每轮最多 3 问。
3. 只有被询问的主人能看到待答问题。
4. 回答需主人确认，转成目的限定的最小 Claim，并生成披露收据。
5. 双方 AI 各自给出建议；建议只是决策输入，不能替代主人。

### 3. 双重同意与项目

1. 服务端从本轮披露摘要生成稳定 `consentVersion`。
2. 两位主人必须针对同一版本分别选择继续。
3. 第一份同意后，`contactReveal` 仍为 `null`；第二份有效同意后才构造联系方式响应。
4. 系统创建 7 天计划，允许双方提交每日进展、作品链接和合作反馈。

## 数据事实与隐私边界

| 事实 | 当前唯一来源 |
| --- | --- |
| Capsule、Intent、候选、产品 Handshake、授权收据、项目 | 产品社区快照，经 `ProductStore` 端口持久化 |
| Handshake 合法状态转换 | `packages/domain` |
| HSP 消息格式与兼容规则 | `packages/hsp-contracts` |
| 原 AI 的完整 Memory 和原始聊天 | 供应商自己的账号/客户端；不进入本仓库运行数据 |
| owner token 明文 | 仅创建/演示重置时交付给用户；持久层只保存摘要 |
| 私密联系方式 | 产品数据库；仅在服务端双重同意通过后进入响应 |

当前 SQLite 以 JSON 快照保存试点数据，适合单机小规模验证，不等于生产安全存储。具体限制和上线前门禁见根目录 [`SECURITY.md`](../../SECURITY.md)。连接器决策见 [`personal-ai-connectors.md`](./personal-ai-connectors.md)。

## 可替换边界

- Web 和 MCP 共用稳定成员 API，不直接依赖 SQLite。
- 产品用例只依赖 `ProductStore`，因此可以在保持业务规则的前提下替换为 PostgreSQL Repository。
- 匹配规则在 `product-core` 中是确定性基线，未来可增加模型评估器，但模型输出仍需通过相同校验和主人决定。
- MCP 业务工具与 `stdio` 传输分离；未来增加远程传输时，必须补 OAuth、Host 校验、TLS、限流和审计。

代码依赖约束见 [`boundaries.md`](./boundaries.md)，长期阶段门禁见 [`delivery-phases.md`](./delivery-phases.md)。
