# PigBun RedNote

小红书 AI 运营工具 —— 搜索、发布、分析、互动，一站式自动化。

## 功能概览

本技能为 OpenClaw 提供 27 个小红书工具，覆盖内容创作、社交互动和数据分析全流程。

## 前置要求

1. 从 [pigbunai.com](https://pigbunai.com) 获取免费 API Key（每天 50 次调用）
2. 安装 Playwright：`npx playwright install chromium`
3. 首次使用前登录小红书：
   - 单账号模式：`openclaw rednote init`
   - 多账号模式：`openclaw rednote matrix`（启动管理界面）

## 工具列表

所有工具在多账号模式下支持可选的 `accountId` 参数。单账号模式下此参数不可见。

### 搜索与内容获取

| 工具 | 说明 |
|------|------|
| `search_notes` | 根据关键词搜索笔记 |
| `get_note_content` | 获取笔记详细内容 |
| `get_note_comments` | 获取笔记评论列表 |

### 发布笔记

| 工具 | 说明 |
|------|------|
| `publish_note` | 发布图文笔记（至少 1 张图片） |
| `publish_note_video` | 发布视频笔记 |
| `publish_note_text` | 发布纯文字笔记（自动生成封面） |
| `publish_note_article` | 发布长文笔记（标题无字数限制） |

### 笔记管理

| 工具 | 说明 |
|------|------|
| `get_my_notes` | 获取自己的笔记列表 |
| `edit_note` | 编辑已发布笔记的标题、正文、标签 |
| `delete_note` | 删除已发布的笔记 |

### 评论互动

| 工具 | 说明 |
|------|------|
| `comment_note` | 在笔记下发表评论 |
| `reply_comment` | 回复指定评论 |
| `filter_comments` | 评论情感分类（正面/负面/问题/建议/中性） |

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
| `get_content_analytics` | 每篇笔记的详细数据 |
| `get_fans_analytics` | 粉丝数据（总量、新增/流失、画像） |
| `discover_trending` | 发现热门话题（多关键词热度对比） |
| `analyze_best_publish_time` | 分析最佳发布时间 |
| `generate_content_report` | 生成综合运营报告 |
| `get_inspiration_topics` | 获取灵感话题（含参与人数、浏览量） |
| `get_activity_center` | 获取官方活动列表（流量扶持、奖励） |

### 其他

| 工具 | 说明 |
|------|------|
| `login` | 浏览器登录小红书 |
| `get_notifications` | 获取通知消息（评论、点赞、关注） |
| `get_share_link` | 获取笔记分享链接 |

## 使用示例

### 单账号模式

搜索笔记：
```
搜索关键词"咖啡推荐"的热门笔记
```

发布笔记：
```
帮我发布一篇关于今日早餐的图文笔记，标题"元气早餐分享"，配上这张图片 /path/to/photo.jpg
```

数据分析：
```
生成我最近 7 天的运营报告
```

评论管理：
```
帮我查看最新笔记的评论，筛选出提问类评论并逐一回复
```

### 多账号模式

在多账号模式下，可以通过 `accountId` 参数指定操作的账号：

```
使用账号 acc_xxx_xxxx 搜索关键词"咖啡推荐"的笔记
```

```
用账号 acc_yyy_yyyy 发布一篇笔记，标题"今日分享"，内容"这是测试内容"
```

```
查看账号 acc_xxx_xxxx 最近 7 天的数据总览
```

如果不指定 `accountId`，将使用默认账号。

## 配置

在 OpenClaw 插件配置中设置 API Key：

```json
{
  "plugins": {
    "entries": {
      "pigbun-rednote": {
        "enabled": true,
        "config": {
          "apiKey": "pb_live_your_key_here"
        }
      }
    }
  }
}
```

## 链接

- 官网：[pigbunai.com](https://pigbunai.com)
