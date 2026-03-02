#!/bin/bash

# E2E 测试运行脚本

set -e

echo "🚀 开始 E2E 测试..."
echo ""

# 检查 Node.js 版本
echo "📋 检查环境..."
node --version
npm --version
echo ""

# 安装依赖（如果需要）
if [ ! -d "node_modules/@playwright/test" ]; then
  echo "📦 安装 Playwright..."
  npm install --save-dev @playwright/test
  npx playwright install chromium
  echo ""
fi

# 清理旧的测试数据和报告
echo "🧹 清理旧数据..."
rm -rf __tests__/e2e/.test-data
rm -rf playwright-report
rm -rf test-results
echo ""

# 运行测试
echo "🧪 运行 E2E 测试..."
echo ""

if [ "$1" == "--headed" ]; then
  echo "运行模式: 可视化"
  npx playwright test --headed
elif [ "$1" == "--debug" ]; then
  echo "运行模式: 调试"
  npx playwright test --debug
elif [ "$1" == "--ui" ]; then
  echo "运行模式: UI 模式"
  npx playwright test --ui
else
  echo "运行模式: 无头"
  npx playwright test
fi

# 测试结果
if [ $? -eq 0 ]; then
  echo ""
  echo "✅ 所有测试通过！"
  echo ""
  echo "📊 查看测试报告:"
  echo "   npm run test:e2e:report"
else
  echo ""
  echo "❌ 测试失败"
  echo ""
  echo "📊 查看详细报告:"
  echo "   npm run test:e2e:report"
  exit 1
fi
