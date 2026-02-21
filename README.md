# RedNote MCP

[![English](https://img.shields.io/badge/English-Click-yellow)](docs/README.en.md)
[![简体中文](https://img.shields.io/badge/简体中文-点击查看-orange)](README.md)
[![npm](https://img.shields.io/npm/v/@pigbun-ai/rednote-mcp)](https://www.npmjs.com/package/@pigbun-ai/rednote-mcp)

小红书内容访问的MCP服务

https://github.com/user-attachments/assets/06b2c67f-d9ed-4a30-8f1d-9743f3edaa3a

## 快速开始

开始前确保安装了 [playwright](https://github.com/microsoft/playwright) 环境：

```bash
npx playwright install
```

### NPM 全局安装

```bash
# 全局安装
npm install -g @pigbun-ai/rednote-mcp

# 初始化登录，会自动记录cookie到 ~/.mcp/rednote/cookies.json
rednote-mcp init
```

### 从源码安装

```bash
# 克隆项目
git clone https://github.com/PigBun-AI/RedNote-MCP.git
cd RedNote-MCP

# 安装依赖
npm install

# 全局安装（可选，方便命令行调用）
npm install -g .

# 或者直接运行，如初始化登录
npm run dev -- init
```

## 功能特性

- 认证管理（支持 Cookie 持久化）
- 关键词搜索笔记
- 命令行初始化工具
- 通过 URL 访问笔记内容
- 发布图文/纯文字笔记
- 创作者数据看板（账号概览、内容分析、粉丝数据）
- [ ] 通过 URL 访问评论内容

## 使用说明

### 1. 初始化登录

首次使用需要先进行登录初始化：

```bash
rednote-mcp init
# 或者直接从源码run
npm run dev -- init
# 或者mcp-client里选择login
```

执行此命令后：

1. 会自动打开浏览器窗口
2. 跳转到小红书登录页面
3. 请手动完成登录操作
4. 登录成功后会自动保存 Cookie 到 `~/.mcp/rednote/cookies.json` 文件

### 2. 发布笔记

通过 MCP tool `publish_note` 发布小红书笔记：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | string | ✅ | 笔记标题（最多20字） |
| `content` | string | ✅ | 笔记正文 |
| `images` | string[] | ❌ | 图片文件路径数组（本地绝对路径） |
| `tags` | string[] | ❌ | 标签/话题数组 |
| `keepAlive` | boolean | ❌ | 发布后保持浏览器打开（连续发布多篇时使用） |

示例（在支持 MCP 的客户端中）：

```
帮我发布一篇小红书笔记：
标题：今日份咖啡分享
正文：在家用摩卡壶做了一杯拿铁，拉花居然成功了！
图片：/Users/me/photos/coffee.jpg
标签：咖啡, 拿铁, 居家咖啡
```

> ⚠️ 发布前请确保已通过 `rednote-mcp init` 完成登录。

### 3. 数据看板

通过 MCP 工具获取创作者中心的数据看板信息，支持三个维度：

#### `get_dashboard_overview` — 账号数据总览

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `period` | `"7days"` \| `"30days"` | ❌ | 统计周期，默认近7日 |

返回数据包括：账号诊断（观看数、涨粉数、主页访客数、发布数、互动数）、数据总览（曝光、观看、封面点击率、观看时长等）、互动数据（点赞、评论、收藏、分享）、涨粉数据。

#### `get_content_analytics` — 内容分析

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `startDate` | string | ❌ | 开始日期，格式 YYYY-MM-DD |
| `endDate` | string | ❌ | 结束日期，格式 YYYY-MM-DD |

返回每篇笔记的详细数据：曝光、观看、封面点击率、点赞、评论、收藏、涨粉、分享、人均观看时长等。

#### `get_fans_analytics` — 粉丝数据

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `period` | `"7days"` \| `"30days"` | ❌ | 统计周期，默认近7天 |

返回数据包括：总粉丝数、新增粉丝、流失粉丝、粉丝画像、活跃粉丝。

示例（在支持 MCP 的客户端中）：

```
帮我看看最近7天的账号数据概览
帮我分析一下每篇笔记的数据表现
查看我的粉丝增长情况
```

### 4. 在 MCP 客户端中配置

以下配置适用于 Cursor、Claude Code、Windsurf 等支持 MCP 的客户端。

#### 方式一：npx（推荐，无需安装）

```json
{
  "mcpServers": {
    "rednote-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "@pigbun-ai/rednote-mcp",
        "--stdio"
      ]
    }
  }
}
```

#### 方式二：全局安装后使用

```json
{
  "mcpServers": {
    "rednote-mcp": {
      "command": "rednote-mcp",
      "args": [
        "--stdio"
      ]
    }
  }
}
```

配置说明：

- `command`: 可以是全局安装后的 `rednote-mcp` 命令，或使用 `npx` 直接运行
- `args`: 必须包含 `--stdio` 参数以支持 MCP 客户端的通信方式

## 开发指南

### 环境要求

- Node.js >= 16
- npm >= 7

### 开发流程

```bash
# 安装依赖
npm install

# 构建项目
npm run build

# 开发模式运行
npm run dev

# 运行测试
npm test
```

### 使用 MCP Inspector 进行调试

MCP Inspector 是一个用于调试 MCP 服务器的工具，可以帮助开发者检查和验证 MCP 服务器的行为。使用以下命令启动：

```bash
npx @modelcontextprotocol/inspector npx @pigbun-ai/rednote-mcp --stdio
```

这个命令会：

1. 启动 MCP Inspector 工具
2. 通过 Inspector 运行 rednote-mcp 服务
3. 提供一个交互式界面来检查请求和响应
4. 帮助调试和验证 MCP 协议的实现

## 注意事项

1. 首次使用必须执行 `init` 命令进行登录
2. Cookie 文件包含敏感信息，避免泄露
3. 建议定期更新 Cookie，避免失效
4. 确保已正确安装 Node.js 环境

## 贡献指南

1. Fork 本仓库
2. 创建你的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交你的改动 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启一个 Pull Request

## 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件 
