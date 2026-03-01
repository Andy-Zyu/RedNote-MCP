# PigBun RedNote MCP

[![npm](https://img.shields.io/npm/v/@pigbun-ai/pigbun-rednote-mcp)](https://www.npmjs.com/package/@pigbun-ai/pigbun-rednote-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[English](docs/README.en.md) | 简体中文

小红书自动化 MCP 服务 — 搜索、发布、数据分析，一站搞定。

> ⚠️ 本工具仅供学习和测试用途，使用者需自行承担使用风险。

## 快速开始

### 1. 获取 API Key

前往 [pigbunai.com](https://pigbunai.com) 注册账号，在 Dashboard 中创建 API Key。

免费套餐：每天 50 次调用（登录操作不计入额度）。

### 2. 安装 Playwright

```bash
npx playwright install chromium
```

### 3. 初始化登录

```bash
npx @pigbun-ai/pigbun-rednote-mcp init
```

会打开浏览器，手动完成小红书登录。Cookie 自动保存到 `~/.mcp/rednote/cookies.json`。

### 4. 配置 MCP 客户端

适用于 Claude Desktop、Cursor、Windsurf、Claude Code 等支持 MCP 的客户端：

```json
{
  "mcpServers": {
    "pigbun-rednote-mcp": {
      "command": "npx",
      "args": ["@pigbun-ai/pigbun-rednote-mcp@latest", "--stdio"],
      "env": {
        "PIGBUN_API_KEY": "pb_live_your_key_here"
      }
    }
  }
}
```

将 `pb_live_your_key_here` 替换为你在 Dashboard 中获取的 API Key。

## 功能（27 个工具）

### 搜索与内容

| 工具 | 说明 |
|------|------|
| `search_notes` | 关键词搜索笔记（返回含 xsec_token 的链接） |
| `get_note_content` | 获取笔记详情（标题、正文、图片、视频等） |
| `get_note_comments` | 获取笔记评论列表 |

### 发布笔记

| 工具 | 说明 |
|------|------|
| `publish_note` | 发布图文笔记（至少一张图片） |
| `publish_note_video` | 发布视频笔记 |
| `publish_note_text` | 发布纯文字笔记（自动生成封面图） |
| `publish_note_article` | 发布长文笔记（标题无字数限制） |

### 笔记管理

| 工具 | 说明 |
|------|------|
| `get_my_notes` | 获取自己的笔记列表（创作者中心） |
| `edit_note` | 编辑已发布笔记的标题、正文、标签 |
| `delete_note` | 删除已发布的笔记 |

### 评论互动

| 工具 | 说明 |
|------|------|
| `comment_note` | 在笔记下发表一级评论 |
| `reply_comment` | 回复笔记下的指定评论 |
| `filter_comments` | 对评论进行情感分类（正面/负面/问题/建议/中性） |

### 社交互动

| 工具 | 说明 |
|------|------|
| `like_note` | 给笔记点赞 |
| `collect_note` | 收藏笔记 |
| `follow_author` | 关注笔记作者 |

### 数据分析

| 工具 | 说明 |
|------|------|
| `get_dashboard_overview` | 创作者数据总览（曝光、观看、互动、涨粉） |
| `get_content_analytics` | 内容分析（每篇笔记的详细数据） |
| `get_fans_analytics` | 粉丝数据（总量、新增/流失、画像、活跃度） |
| `discover_trending` | 发现热门话题（多关键词热度对比） |
| `analyze_best_publish_time` | 分析最佳发布时间 |
| `generate_content_report` | 生成综合运营报告 |
| `get_inspiration_topics` | 获取笔记灵感话题（含参与人数、浏览量、热门笔记示例） |
| `get_activity_center` | 获取官方活动列表（流量扶持、活动奖励、参与话题） |

### 其他

| 工具 | 说明 |
|------|------|
| `login` | 浏览器登录小红书，保存 Cookie |
| `get_notifications` | 获取通知消息（评论、点赞、关注） |
| `get_share_link` | 获取笔记分享链接 |

## 发布笔记

支持四种发布方式：

| 方式 | 工具 | 说明 |
|------|------|------|
| 图文 | `publish_note` | 至少一张图片，标题最多 20 字 |
| 视频 | `publish_note_video` | 提供一个视频文件 |
| 纯文字 | `publish_note_text` | 无需图片，自动生成封面 |
| 长文 | `publish_note_article` | 适合长篇内容，标题无字数限制 |

通用参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | string | ✅ | 标题 |
| `content` | string | ✅ | 正文 |
| `images` | string[] | 图文必填 | 图片路径数组（本地绝对路径） |
| `video` | string | 视频必填 | 视频文件路径（本地绝对路径） |
| `tags` | string[] | ❌ | 标签数组 |
| `keepAlive` | boolean | ❌ | 发布后保持浏览器（连续发布时使用） |

示例：

```
帮我发布一篇小红书笔记：
标题：今日份咖啡分享
正文：在家用摩卡壶做了一杯拿铁，拉花居然成功了！
图片：/Users/me/photos/coffee.jpg
标签：咖啡, 拿铁, 居家咖啡
```

## 数据看板

### 账号总览 `get_dashboard_overview`

| 参数 | 类型 | 说明 |
|------|------|------|
| `period` | `"7days"` \| `"30days"` | 统计周期，默认 7 天 |

返回：曝光、观看、封面点击率、互动数据、涨粉数据。

### 内容分析 `get_content_analytics`

| 参数 | 类型 | 说明 |
|------|------|------|
| `startDate` | string | 开始日期 YYYY-MM-DD |
| `endDate` | string | 结束日期 YYYY-MM-DD |

返回：每篇笔记的曝光、观看、点赞、评论、收藏、分享等。

### 粉丝分析 `get_fans_analytics`

| 参数 | 类型 | 说明 |
|------|------|------|
| `period` | `"7days"` \| `"30days"` | 统计周期，默认 7 天 |

返回：总粉丝、新增、流失、粉丝画像、活跃粉丝。

## 调试

使用 MCP Inspector：

```bash
PIGBUN_API_KEY=pb_live_xxx npx @modelcontextprotocol/inspector npx @pigbun-ai/pigbun-rednote-mcp --stdio
```

## 注意事项

- Cookie 文件含敏感信息，请勿泄露
- 建议定期重新登录刷新 Cookie
- 所有自动化操作从你本地 IP 发出，不经过中心化代理

## License

MIT — 详见 [LICENSE](LICENSE)
