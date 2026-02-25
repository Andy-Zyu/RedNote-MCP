/**
 * Test: get_activity_center tool
 */
import { AnalyticsTools } from '../src/tools/analyticsTools'

async function main() {
  const tools = new AnalyticsTools()
  const result = await tools.getActivityCenter()
  console.log(JSON.stringify(result, null, 2))
}

main().catch(console.error)
