# Handshake Member Web

面向成员的中文 V1：让用户带着常用 AI，在不上传完整 Memory 的前提下，找到 7 天作品集项目搭档。

## 本地运行

```bash
pnpm --filter @handshake/member-web dev
```

默认通过真实成员 API（`/v1`）工作。可以通过环境变量覆盖地址：

```text
VITE_API_BASE_URL=http://localhost:8787/v1
```

演示模式有两个明确档位：`VITE_DEMO_MODE=true` 连接真实 Platform API，但把合成身份持续标记为演示；`VITE_DEMO_MODE=local` 才使用纯浏览器内存数据。两者都不会伪装成真实账号或真实 AI Memory。

## 主要页面

- 产品说明、邀请登录和演示重置
- AI 连接、Capsule 导入、逐字段授权和发布
- 7 天项目意图、候选发现和可解释匹配
- Handshake 时间线、有限轮提问、AI 建议和双重同意
- 联系方式揭示、7 天项目空间、作品与反馈
- 可撤销的隐私收据

所有真实请求默认携带 `Authorization: Bearer <owner-token>`。联系方式只会读取服务端在双方同意后返回的 `contactReveal`，前端不会提前请求、缓存或在 DOM 中预埋。
