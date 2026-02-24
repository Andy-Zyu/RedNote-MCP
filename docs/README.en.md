# PigBun RedNote MCP

[![npm](https://img.shields.io/npm/v/@pigbun-ai/pigbun-rednote-mcp)](https://www.npmjs.com/package/@pigbun-ai/pigbun-rednote-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[简体中文](../README.md) | English

MCP server for Xiaohongshu (RedNote) automation — search, publish, and analyze, all in one place.

> ⚠️ This tool is for learning and testing purposes only. Users assume all risks associated with its use.

## Getting Started

### 1. Get an API Key

Sign up at [pigbunai.com](https://pigbunai.com) and create an API Key from your Dashboard.

Free tier: 50 calls/day (login operations are not counted).

### 2. Install Playwright

```bash
npx playwright install chromium
```

### 3. Initialize Login

```bash
npx @pigbun-ai/pigbun-rednote-mcp init
```

A browser window will open. Complete the Xiaohongshu login manually. Cookies are saved to `~/.mcp/rednote/cookies.json`.

### 4. Configure Your MCP Client

Works with Claude Desktop, Cursor, Windsurf, Claude Code, and any MCP-compatible client:

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

Replace `pb_live_your_key_here` with the API Key from your Dashboard.

## Tools

### Search & Content

| Tool | Description |
|------|-------------|
| `search_notes` | Search notes by keyword (returns links with xsec_token) |
| `get_note_content` | Get note details (title, body, images, videos, etc.) |
| `get_note_comments` | Get comment list for a note |
| `publish_note` | Publish image-text note (at least one image required) |

### Note Management

| Tool | Description |
|------|-------------|
| `get_my_notes` | List your own notes (creator center) |
| `edit_note` | Edit a published note's title, body, or tags |
| `delete_note` | Delete a published note |

### Comments

| Tool | Description |
|------|-------------|
| `comment_note` | Post a top-level comment on a note |
| `reply_comment` | Reply to a specific comment on a note |
| `filter_comments` | Classify comments by sentiment (positive/negative/question/suggestion/neutral) |

### Social Engagement

| Tool | Description |
|------|-------------|
| `like_note` | Like a note |
| `collect_note` | Bookmark/save a note |
| `follow_author` | Follow a note's author |

### Analytics

| Tool | Description |
|------|-------------|
| `get_dashboard_overview` | Creator dashboard overview (impressions, views, engagement, follower growth) |
| `get_content_analytics` | Per-note analytics (impressions, views, likes, comments, saves) |
| `get_fans_analytics` | Follower analytics (total, new/lost, demographics, active) |
| `discover_trending` | Discover trending topics (multi-keyword comparison) |
| `analyze_best_publish_time` | Analyze best publishing times |
| `generate_content_report` | Generate comprehensive operations report |

### Other

| Tool | Description |
|------|-------------|
| `login` | Browser-based Xiaohongshu login, saves cookies |
| `get_notifications` | Get notifications (comments, likes, follows) |
| `get_share_link` | Get share link for a note |

## Publishing Notes

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | ✅ | Title (max 20 chars) |
| `content` | string | ✅ | Body text |
| `images` | string[] | ✅ | Local image file paths (at least 1 required) |
| `tags` | string[] | ❌ | Hashtags |
| `keepAlive` | boolean | ❌ | Keep browser open for batch publishing |

## Dashboard Analytics

### Overview `get_dashboard_overview`

| Parameter | Type | Description |
|-----------|------|-------------|
| `period` | `"7days"` \| `"30days"` | Time range, default 7 days |

Returns: impressions, views, CTR, engagement, follower growth.

### Content Analytics `get_content_analytics`

| Parameter | Type | Description |
|-----------|------|-------------|
| `startDate` | string | Start date YYYY-MM-DD |
| `endDate` | string | End date YYYY-MM-DD |

Returns: per-note impressions, views, likes, comments, saves, shares.

### Follower Analytics `get_fans_analytics`

| Parameter | Type | Description |
|-----------|------|-------------|
| `period` | `"7days"` \| `"30days"` | Time range, default 7 days |

Returns: total followers, new, lost, demographics, active followers.

## Debugging

Use MCP Inspector:

```bash
PIGBUN_API_KEY=pb_live_xxx npx @modelcontextprotocol/inspector npx @pigbun-ai/pigbun-rednote-mcp --stdio
```

## Notes

- Cookie files contain sensitive data — keep them safe
- Re-login periodically to refresh cookies
- All automation runs from your local IP, never through a centralized proxy

## License

MIT — see [LICENSE](../LICENSE)
