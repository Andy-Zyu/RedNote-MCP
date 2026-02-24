import logger from '../utils/logger'
import { BrowserManager } from '../browser/browserManager'
import { BaseTools } from './baseTools'
import { RedNoteTools } from './rednoteTools'
import { SELECTORS } from '../selectors'
import {
  Comment,
  ReplyCommentResult,
  SentimentCategory,
  CategorizedComment,
  FilterCommentsResult,
} from './types'

const SENTIMENT_KEYWORDS: Record<SentimentCategory, string[]> = {
  positive: ['好看', '喜欢', '太棒', '赞', '美', '爱了', '种草', '推荐', '优秀',
    '厉害', '牛', '绝了', '好用', '不错', '支持', '加油', '棒', '感谢', '谢谢',
    '有用', '收藏了', '马住', '学到了', '太好了', '完美'],
  negative: ['差', '难看', '不好', '失望', '垃圾', '坑', '差评', '退款', '骗',
    '假', '烂', '难用', '不行', '太差', '后悔', '踩雷', '避雷', '别买', '不推荐'],
  question: ['怎么', '如何', '什么', '哪里', '多少', '吗', '呢', '？', '?',
    '求', '请问', '想知道', '有没有', '能不能', '在哪', '哪个'],
  suggestion: ['建议', '希望', '可以', '应该', '最好', '不如', '改进', '优化',
    '要是', '如果能', '期待'],
  neutral: [],
}

export class CommentTools extends BaseTools {
  async replyComment(options: {
    noteUrl: string
    commentAuthor: string
    commentContent: string
    replyText: string
  }): Promise<ReplyCommentResult> {
    logger.info(`Replying to comment by ${options.commentAuthor} on ${options.noteUrl}`)
    const bm = BrowserManager.getInstance()
    const lease = await bm.acquirePage()
    try {
      const page = lease.page
      this.page = page

      // Navigate to note page (main site, no SSO needed)
      await page.goto(options.noteUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      })
      await this.randomDelay(2, 3)

      // Wait for comments to load
      await page.waitForSelector(SELECTORS.replyComment.commentItem, { timeout: 15000 })

      // Search for the target comment with scrolling
      let found = false
      let scrollAttempts = 0
      const maxScrollAttempts = 10

      while (!found && scrollAttempts < maxScrollAttempts) {
        const commentItems = page.locator(SELECTORS.replyComment.commentItem)
        const count = await commentItems.count()

        for (let i = 0; i < count; i++) {
          const item = commentItems.nth(i)
          const authorText = await item.locator(SELECTORS.replyComment.commentAuthor)
            .first().textContent().catch(() => '')
          const contentText = await item.locator(SELECTORS.replyComment.commentText)
            .first().textContent().catch(() => '')

          if (
            authorText?.includes(options.commentAuthor) &&
            contentText?.includes(options.commentContent)
          ) {
            // Found target comment — click reply
            const replyBtn = item.locator(SELECTORS.replyComment.replyButton).first()
            await this.safeClick(replyBtn, '回复按钮')
            await this.randomDelay(0.5, 1)

            // Type reply (contenteditable element — use click + type)
            const replyInput = page.locator(SELECTORS.replyComment.replyInput).first()
            await replyInput.waitFor({ state: 'visible', timeout: 5000 })
            await replyInput.click()
            await this.randomDelay(0.3, 0.5)
            await page.keyboard.type(options.replyText, { delay: 50 })
            await this.randomDelay(0.5, 1)

            // Submit — wait for button to become active (loses .gray class after typing)
            const submitBtn = page.locator('button.btn.submit:not(.gray)').first()
            try {
              await submitBtn.waitFor({ state: 'visible', timeout: 5000 })
            } catch {
              // Fallback: click even if still gray
              logger.warn('Submit button still gray, clicking anyway')
            }
            await this.safeClick(
              submitBtn.or(page.locator(SELECTORS.replyComment.submitReply).first()),
              '发送回复'
            )
            await this.randomDelay(1, 2)

            found = true
            break
          }
        }

        if (!found) {
          // Scroll comment area to load more
          await page.evaluate(() => {
            const scroller = document.querySelector('.note-scroller')
            if (scroller) scroller.scrollTop += 500
          })
          await this.randomDelay(1, 2)
          scrollAttempts++
        }
      }

      if (!found) {
        throw new Error(`未找到 ${options.commentAuthor} 的评论: "${options.commentContent}"`)
      }

      logger.info('Comment reply sent successfully')
      return { success: true, message: '评论回复成功' }
    } catch (error) {
      logger.error('Error replying to comment:', error)
      throw error
    } finally {
      this.page = null
      await lease.release()
    }
  }

  async filterComments(noteUrl: string): Promise<FilterCommentsResult> {
    logger.info(`Filtering comments for: ${noteUrl}`)

    // Reuse existing getNoteComments
    const tools = new RedNoteTools()
    const comments = await tools.getNoteComments(noteUrl)

    const categories: Record<SentimentCategory, CategorizedComment[]> = {
      positive: [],
      negative: [],
      question: [],
      suggestion: [],
      neutral: [],
    }

    for (const comment of comments) {
      const { category, matchedKeywords } = this.classifyComment(comment.content)
      const categorized: CategorizedComment = {
        ...comment,
        category,
        matchedKeywords,
      }
      categories[category].push(categorized)
    }

    const summary: Record<SentimentCategory, number> = {
      positive: categories.positive.length,
      negative: categories.negative.length,
      question: categories.question.length,
      suggestion: categories.suggestion.length,
      neutral: categories.neutral.length,
    }

    logger.info(`Comments classified: ${JSON.stringify(summary)}`)
    return { total: comments.length, categories, summary }
  }

  private classifyComment(content: string): { category: SentimentCategory; matchedKeywords: string[] } {
    const matched: { category: SentimentCategory; keywords: string[] }[] = []

    for (const [cat, keywords] of Object.entries(SENTIMENT_KEYWORDS)) {
      if (cat === 'neutral') continue
      const hits = keywords.filter(kw => content.includes(kw))
      if (hits.length > 0) {
        matched.push({ category: cat as SentimentCategory, keywords: hits })
      }
    }

    if (matched.length === 0) {
      return { category: 'neutral', matchedKeywords: [] }
    }

    // Pick category with most keyword matches
    matched.sort((a, b) => b.keywords.length - a.keywords.length)
    return { category: matched[0].category, matchedKeywords: matched[0].keywords }
  }
}
