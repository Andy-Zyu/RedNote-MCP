#!/bin/bash

# 快速验证测试文件

echo "🔍 验证 E2E 测试文件..."
echo ""

# 检查 TypeScript 编译
echo "📝 检查 TypeScript 语法..."
npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "(error TS|__tests__/e2e)" || echo "✅ TypeScript 语法正确"
echo ""

# 列出所有测试文件
echo "📂 测试文件列表:"
find __tests__/e2e -name "*.test.ts" -type f | sort
echo ""

# 统计测试数量
echo "📊 测试统计:"
total_files=$(find __tests__/e2e -name "*.test.ts" -type f | wc -l | tr -d ' ')
echo "  测试文件数: $total_files"

total_tests=$(grep -r "test(" __tests__/e2e/*.test.ts | wc -l | tr -d ' ')
echo "  测试用例数: $total_tests"

total_describes=$(grep -r "test.describe(" __tests__/e2e/*.test.ts | wc -l | tr -d ' ')
echo "  测试套件数: $total_describes"
echo ""

echo "✅ 验证完成"
