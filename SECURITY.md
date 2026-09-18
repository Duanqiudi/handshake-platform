# Handshake 安全说明

Handshake V1 是用于产品验证和面试展示的本地邀请制实现，不是已经通过生产安全评审的托管服务。请只使用合成数据或你有权处理的测试数据，不要把真实聊天记录、完整 AI Memory、供应商 Cookie、模型 API Key、身份证件或支付信息交给本项目。

## 报告安全问题

请不要在公开 Issue 中粘贴令牌、联系方式、数据库文件或漏洞利用细节。如果仓库启用了 GitHub Security Advisories，请使用私密报告；否则请私下联系仓库维护者，并只提供复现所需的最少信息。报告中建议包含：受影响版本、入口、影响、最小复现步骤，以及你是否已经接触真实数据。

当前维护范围是 `0.1.x`。本地未发布分支和自行修改的部署不承诺安全支持，但仍欢迎提交可复现的问题。

## V1 信任边界

```text
ChatGPT / Kimi / 豆包当前会话
        │ 只生成结构化、任务专用的参数
        ▼
本地 MCP Adapter 或人工 Capsule 导入
        │ Bearer owner token
        ▼
Platform API ── Product Application ── SQLite
        │
        └─ 双方同意后才返回联系方式
```

- Handshake 无法直接读取任何消费端 AI 账号的内部 Memory 数据库。
- MCP Adapter 只能接收宿主 AI 主动生成的工具参数；它没有读取 Memory、Cookie 或聊天历史的隐藏接口。
- 中心数据模型没有 `rawMemory`、原始聊天或供应商凭据字段。未知 Capsule 字段会被拒绝。
- Owner token 只以 SHA-256 摘要写入产品快照；明文只在账号创建响应或每次明确触发的演示重置响应中返回。
- 联系方式会写入本地产品数据库，但在双方对同一 `consentVersion` 明确选择继续之前，不进入成员 API 响应。
- 问题只对被询问的主人可见；回答必须标记为主人确认，并形成带用途、接收方和到期时间的最小 Claim/收据。

## 本地运行注意事项

- `HANDSHAKE_DEMO_MODE=true` 会开放一个可覆盖本地演示数据库的重置入口。它只能用于本机合成数据，默认必须关闭，不能暴露到公网。
- `HANDSHAKE_OWNER_TOKEN` 和其他 `.env` 值不得提交到 Git、写进截图、日志或 Issue。仓库只提交无秘密的 `.env.example`。
- 当前成员 Web 把 owner token 保存在浏览器 `localStorage`，用于方便本地演示。这不满足高风险生产会话要求；不要在共享浏览器或存在不可信脚本的页面中使用真实令牌。
- 本地 MCP 使用 `stdio`。令牌通过子进程环境变量传入；不要把带令牌的完整客户端配置公开分享。
- 默认服务只应监听回环地址。若改为局域网或公网监听，必须先补 TLS、正式身份系统、CSRF/CORS 策略、速率限制和秘密管理。
- SQLite 文件包含联系方式、Capsule、Claim 和授权收据，当前没有应用层静态加密。不要同步到公共云盘或提交到仓库；删除 `var/` 可清除本地演示数据。

## 当前已实现的防线

- Capsule 逐字段批准；没有 `approvedFields` 时按空集合处理，而不是默认全选。
- Capsule 撤销后不再进入发现结果。
- 匹配给出互补项和信息缺口，不生成虚假精确百分比。
- 每个 Handshake 最多 3 轮、每轮最多 3 个问题，由领域规则约束。
- 双方决定绑定稳定的披露摘要版本；版本不同不会揭示联系方式。
- 领域状态转换、产品实体和 API 输入有类型与运行时校验。
- 产品 SQLite 快照使用版本号和 compare-and-swap，避免静默覆盖并发写入。
- API 与静态页面响应设置基础安全头，包括禁止嵌入页面、内容类型嗅探和不必要的浏览器权限。
- 演示身份使用合成数据，邮箱使用不可投递的 `.example.test` 域名。
- MCP 层拦截常见凭据、证件、联系方式和原始 Memory 类输入；服务端仍承担最终校验责任。

## 尚未完成的生产防线

以下能力不应从 V1 的可运行 Demo 推断出来：

- OAuth/Passkey、邀请签发与撤销后台、短期会话 Cookie、MFA；
- TLS 终止、API 网关限流、CSRF 防护、完整 CORS allowlist 验证；
- 数据库字段级加密、云端 KMS、备份加密与恢复演练；
- PostgreSQL、Transactional Outbox、可靠通知和多实例部署；
- 正式的 Endpoint 签名、nonce 防重放、密钥轮换和供应商实机认证；
- 自动到期删除、账户删除、数据导出、举报申诉和 Operator 权限系统；
- SAST/依赖漏洞门禁、渗透测试、隐私/法律评审和生产监控告警。

投入真实用户试点之前，必须逐项完成威胁建模、数据生命周期验证和发布门禁。更完整的数据分类见 [`docs/security/data-classification.md`](docs/security/data-classification.md)。
