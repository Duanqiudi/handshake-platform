# Handshake V1 成员 API 契约

所有成员接口使用 `Authorization: Bearer <owner-token>`。除 `/healthz`、`/v1/onboarding` 和启用演示模式后的 `/v1/demo/reset` 外，均要求认证。社区在 V1 中固定为 `portfolio-builders`，但数据模型保留 `communityId`。

## 核心 DTO

### Memory Capsule

```json
{
  "id": "capsule_xxx",
  "ownerId": "owner_xxx",
  "connectionId": "connection_xxx",
  "sourceProvider": "chatgpt",
  "sourceMode": "mcp",
  "status": "draft",
  "purpose": "seven_day_portfolio_teamup",
  "fields": {
    "goal": "7 天完成一个 AI 求职助手",
    "offers": ["产品设计", "用户研究"],
    "seeks": ["TypeScript", "LLM 集成"],
    "availability": "工作日晚间和周末 6 小时",
    "collaborationStyles": ["异步优先", "每日简短同步"],
    "projectInterests": ["AI 求职", "开发者工具"],
    "location": "远程",
    "languages": ["中文"]
  },
  "approvedFields": ["goal", "offers", "seeks", "availability", "collaborationStyles", "projectInterests", "location", "languages"],
  "privateCategories": ["raw_chat_history", "contact_details"],
  "expiresAt": "2026-10-17T00:00:00.000Z"
}
```

### Candidate

`recommendation` 只能是 `continue`、`needs_info` 或 `conflict`。界面不展示虚假精确百分比。

```json
{
  "ownerId": "owner_candidate",
  "displayName": "陈默",
  "provider": "kimi",
  "connectionMode": "mcp",
  "capsule": {},
  "recommendation": "continue",
  "reasons": ["你需要的 TypeScript 正是对方可提供的能力"],
  "gaps": ["尚未确认每日异步更新习惯"],
  "matchedOffers": ["TypeScript", "LLM 集成"],
  "scheduleCompatible": true
}
```

### Handshake View

```json
{
  "id": "handshake_xxx",
  "status": "SCREENING",
  "statusLabel": "双方 AI 正在了解",
  "currentOwnerId": "owner_me",
  "participants": [
    { "id": "owner_me", "displayName": "林然", "provider": "chatgpt", "isCurrentOwner": true },
    { "id": "owner_partner", "displayName": "陈默", "provider": "kimi", "isCurrentOwner": false }
  ],
  "timeline": [],
  "pendingQuestions": [],
  "roundsUsed": 0,
  "maxRounds": 3,
  "recommendations": [],
  "decisions": [],
  "contactReveal": null,
  "projectId": null
}
```

`contactReveal` 在双方使用同一 `consentVersion` 选择 `continue` 前必须为 `null`，不得返回掩码前的值或在其他字段中预埋。

## 路由

```text
POST   /v1/onboarding
GET    /v1/me/dashboard

GET    /v1/me/connections
POST   /v1/me/connections
PATCH  /v1/me/connections/:connectionId

GET    /v1/me/capsules
POST   /v1/me/capsules/import
PATCH  /v1/me/capsules/:capsuleId
POST   /v1/me/capsules/:capsuleId/publish
POST   /v1/me/capsules/:capsuleId/revoke

GET    /v1/me/intents
POST   /v1/me/intents
POST   /v1/me/intents/:intentId/pause

GET    /v1/discovery/candidates
GET    /v1/handshakes
POST   /v1/handshakes
GET    /v1/handshakes/:handshakeId/view
POST   /v1/handshakes/:handshakeId/questions
POST   /v1/handshakes/:handshakeId/questions/:questionId/answer
POST   /v1/handshakes/:handshakeId/recommendations
POST   /v1/handshakes/:handshakeId/decisions

GET    /v1/projects
GET    /v1/projects/:projectId
POST   /v1/projects/:projectId/check-ins
POST   /v1/projects/:projectId/artifacts
POST   /v1/projects/:projectId/feedback

GET    /v1/privacy/receipts

POST   /v1/demo/reset
```

隐私收据是不可篡改的审计历史，不提供“删除一张收据”的接口。用户撤销 Capsule
时，服务端会在同一事务中暂停关联项目意图，并把对应发布收据标记为已撤销；已经发送给对方的
Claim 或已经完成的联系方式交换不能被描述成可远程删除。

## MCP 工具

通用 MCP Adapter 使用同一个成员 API，并至少公开：

- `prepare_memory_capsule`
- `publish_memory_capsule`
- `publish_project_intent`
- `list_candidates`
- `list_pending_questions`
- `submit_claim_response`
- `get_handshake_status`
- `submit_match_recommendation`
- `submit_owner_decision`

工具描述必须告诉宿主 AI：不得传递原始聊天、完整 Memory、密码、地址、证件、联系人或未被当前用途请求的私密内容。
