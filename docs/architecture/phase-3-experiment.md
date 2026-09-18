# 阶段 3：第一个产品价值实验

> 历史说明：本文记录 2026-09-15 的合成资料规则实验。仓库随后增加了独立的本地产品 V1；请从 [V1 产品范围](../product/v1-scope.md) 和 [当前架构总览](./overview.md) 了解最新实现。产品 V1 仍未把真实供应商 Memory 读取或生产模型接入冒充为已完成能力。

状态：实验骨架已完成；尚未接入真实模型或真实用户数据  
最后更新：2026-09-15

## 这次只验证什么

场景固定为 **创业/职业合作伙伴初筛**：一个产品方向的个人 Agent 与一个技术方向的个人 Agent，能否仅依据双方允许公开的能力、需求和可投入时间，给出“值得双方继续确认”或“需要人工补充”的建议。

本阶段要验证的不是模型有多聪明，而是先验证三件事：

1. 本地 Agent 能否保证私有笔记和联系方式不进入评估器、输出或日志；
2. 评估器输出能否始终映射为合法 HSP `PROPOSAL`；
3. 人是否认为 Proposal 的理由有用，并愿意决定是否继续。

## 当前最小实现

`apps/reference-agent` 接收一个完全合成的本地档案和对方的公开 Capsule：

```text
合成本地档案
  ├─ publicCapsule ── 本地披露策略 ──> DisclosedCapsule ──> 评估器
  └─ privateMemory ─────────────────────────────────────────> 不可进入评估器或输出
                                                        │
                                                        ▼
                                             HSP PROPOSAL / owner_review
```

当前评估器是确定性的规则基线：双方各自提供的能力正好满足对方需求时，输出
`continue/SUCCESS_PROPOSAL`；公开资料不足时输出 `owner_review/HUMAN_REQUIRED`。它不是模型推荐结果，也不代表匹配质量。

当前自动化基线已覆盖 20 组合成档案：10 组互补能力应继续，10 组因本地策略隐藏能力而必须人工判断。该基线只验证隐私边界、输出协议和保守降级；“建议对人是否有用”仍需要真人评审。

输入示例见
[professional-collaboration.json](../../apps/reference-agent/examples/professional-collaboration.json)。CLI 输出只包含允许披露的 Capsule、评估器名称与评估结果。

## 成功指标

在接入真实模型前，先用至少 20 组完全合成的 Profile 对照验证：

| 指标 | 通过条件 |
| --- | --- |
| 数据边界 | 输出与评估输入均不含 privateMemory、联系方式或原始导入内容 |
| 协议正确性 | 每个 `continue` 均生成 schema-valid `PROPOSAL/SUCCESS_PROPOSAL` |
| 保守性 | 公开能力不完整时不输出 continue，而是 `owner_review/HUMAN_REQUIRED` |
| 人工可读性 | 每条建议能指出互补能力或信息缺口，方便主人决定 |

## 接入真实模型前的必要条件

- 使用单独的测试模型账号和新的 API Key；Key 只能保存在本地环境变量或系统凭据库，不能写入仓库、浏览器或中心数据库。
- 模型输入只能是 `DisclosedCapsule` 与任务提示词；不得把 `privateMemory` 传给模型。
- 先建立固定的 20 组合成评估集，记录建议、人工判定、耗时和成本，才允许比较两个模型。
- 模型不可用、超时或输出无效 JSON 时，必须退回 `owner_review`，不能自动披露或自动进入 `REVEALED`。

## 明确不做

- 不接入真实用户、真实联系人、真实长期记忆或生产 API Key。
- 不把当前规则基线包装成“AI 已经会匹配”。
- 不接入 Gateway 自动发送 Proposal；真实发送要等模型输出评估和签名边界一起设计。
- 不建设 Web、支付、运营系统或生产数据库。

## 下一次小迭代

在你确认可使用的模型供应商后，实现一个 `CompatibilityEvaluator` Adapter：输入、输出与本项目接口不变；先在 20 组合成样本上比较它与 `rules-0.1`，再决定是否让它接入 Gateway。
