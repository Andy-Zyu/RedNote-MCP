/**
 * E2E test script for AnalyticsTools.
 * Tests: discoverTrending, analyzeBestPublishTime, generateContentReport
 *
 * Run with: npx tsx scripts/test-analytics.ts
 * Requires cookies at ~/.mcp/rednote/cookies.json
 */
import { AnalyticsTools } from '../src/tools/analyticsTools'
import { BrowserManager } from '../src/browser/browserManager'

async function testDiscoverTrending(tools: AnalyticsTools): Promise<boolean> {
  console.log('=== Test 1: discoverTrending ===')
  try {
    const result = await tools.discoverTrending(['AI', '穿搭', '美食'])
    console.log(`  analyzedAt: ${result.analyzedAt}`)
    console.log(`  topics count: ${result.topics.length}`)
    for (const topic of result.topics) {
      console.log(`  [${topic.keyword}] hotScore=${topic.hotScore} notes=${topic.totalNotes} avgLikes=${topic.avgLikes} avgCollects=${topic.avgCollects} avgComments=${topic.avgComments}`)
      console.log(`    topNotes: ${topic.topNotes.map(n => n.title?.slice(0, 30)).join(' | ')}`)
    }
    if (result.topics.length === 0) {
      console.log('  WARN: No topics returned — search may have failed')
      return false
    }
    // Verify sorting (descending by hotScore)
    for (let i = 1; i < result.topics.length; i++) {
      if (result.topics[i].hotScore > result.topics[i - 1].hotScore) {
        console.log('  FAIL: Topics not sorted by hotScore descending')
        return false
      }
    }
    console.log('  PASS')
    return true
  } catch (e) {
    console.error('  FAIL:', e)
    return false
  }
}

async function testAnalyzeBestPublishTime(tools: AnalyticsTools): Promise<boolean> {
  console.log('\n=== Test 2: analyzeBestPublishTime ===')
  try {
    const result = await tools.analyzeBestPublishTime()
    console.log(`  analyzedNoteCount: ${result.analyzedNoteCount}`)
    console.log(`  bestTimeSlots (${result.bestTimeSlots.length}):`)
    for (const slot of result.bestTimeSlots) {
      console.log(`    ${slot.timeSlot} — notes=${slot.noteCount} avgImpressions=${slot.avgImpressions} avgLikes=${slot.avgLikes} score=${slot.performanceScore}`)
    }
    console.log(`  worstTimeSlots (${result.worstTimeSlots.length}):`)
    for (const slot of result.worstTimeSlots) {
      console.log(`    ${slot.timeSlot} — notes=${slot.noteCount} avgImpressions=${slot.avgImpressions} avgLikes=${slot.avgLikes} score=${slot.performanceScore}`)
    }
    console.log(`  recommendation: ${result.recommendation}`)

    if (result.analyzedNoteCount === 0) {
      console.log('  WARN: No notes analyzed — publishTime parsing may have failed')
      console.log('  This could mean the publishTime format from DOM does not match the regex /\\d{1,2}:\\d{2}/')
      return false
    }
    console.log('  PASS')
    return true
  } catch (e) {
    console.error('  FAIL:', e)
    return false
  }
}

async function testGenerateContentReport(tools: AnalyticsTools): Promise<boolean> {
  console.log('\n=== Test 3: generateContentReport ===')
  try {
    const result = await tools.generateContentReport('7days')
    console.log(`  period: ${result.period}`)
    console.log(`  generatedAt: ${result.generatedAt}`)
    console.log(`  overview:`)
    console.log(`    totalImpressions: ${result.overview.totalImpressions}`)
    console.log(`    totalViews: ${result.overview.totalViews}`)
    console.log(`    totalLikes: ${result.overview.totalLikes}`)
    console.log(`    totalComments: ${result.overview.totalComments}`)
    console.log(`    totalCollects: ${result.overview.totalCollects}`)
    console.log(`    totalShares: ${result.overview.totalShares}`)
    console.log(`    avgEngagementRate: ${result.overview.avgEngagementRate}%`)
    console.log(`    fansGrowth: ${result.overview.fansGrowth}`)
    console.log(`  topPerformingNotes (${result.topPerformingNotes.length}):`)
    for (const note of result.topPerformingNotes) {
      console.log(`    "${note.title}" — impressions=${note.impressions} likes=${note.likes}`)
    }
    console.log(`  underPerformingNotes (${result.underPerformingNotes.length}):`)
    for (const note of result.underPerformingNotes) {
      console.log(`    "${note.title}" — impressions=${note.impressions} likes=${note.likes}`)
    }
    console.log(`  fansInsight:`)
    console.log(`    totalFans: ${result.fansInsight.totalFans}`)
    console.log(`    newFans: ${result.fansInsight.newFans}`)
    console.log(`    lostFans: ${result.fansInsight.lostFans}`)
    console.log(`    netGrowth: ${result.fansInsight.netGrowth}`)
    console.log(`  recommendations:`)
    for (const rec of result.recommendations) {
      console.log(`    - ${rec}`)
    }
    console.log('  PASS')
    return true
  } catch (e) {
    console.error('  FAIL:', e)
    return false
  }
}

async function main() {
  console.log('Starting analytics tools E2E test\n')

  const tools = new AnalyticsTools()
  const results: Record<string, boolean> = {}

  // Test sequentially to avoid concurrent SSO issues
  results['discoverTrending'] = await testDiscoverTrending(tools)
  results['analyzeBestPublishTime'] = await testAnalyzeBestPublishTime(tools)
  results['generateContentReport'] = await testGenerateContentReport(tools)

  // Summary
  console.log('\n=== Summary ===')
  const passed = Object.values(results).filter(Boolean).length
  const total = Object.keys(results).length
  for (const [name, ok] of Object.entries(results)) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}`)
  }
  console.log(`\n${passed}/${total} tests passed`)

  // Shutdown browser cleanly
  try {
    await BrowserManager.getInstance().shutdown()
  } catch {
    // ignore
  }
  process.exit(passed === total ? 0 : 1)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
