<script setup lang="ts">
import { ref } from 'vue'
import { useDataFixer } from '~/composables/sync/useDataFixer'
import { useTauriSQL } from '~/composables/useTauriSQL'

definePageMeta({
  layout: 'default',
})

const { fixMissingUUIDs } = useDataFixer()
const { select } = useTauriSQL()

const isFixing = ref(false)
const result = ref<string>('')
const tableStats = ref<Array<{ table: string, total: number, missing: number }>>([])

// 检查每个表的 UUID 状态
async function checkUUIDs() {
  const tables = ['notes', 'moments', 'assets', 'workflows', 'workflow_schemas']
  const stats: Array<{ table: string, total: number, missing: number }> = []

  for (const table of tables) {
    try {
      const total = await select<Array<{ count: number }>>(
        `SELECT COUNT(*) as count FROM ${table}`,
      )
      const missing = await select<Array<{ count: number }>>(
        `SELECT COUNT(*) as count FROM ${table} WHERE uuid IS NULL OR uuid = ''`,
      )

      stats.push({
        table,
        total: total[0]?.count || 0,
        missing: missing[0]?.count || 0,
      })
    }
    catch (err) {
      console.error(`检查 ${table} 失败:`, err)
    }
  }

  tableStats.value = stats
}

// 手动触发修复
async function runFix() {
  isFixing.value = true
  result.value = '开始修复...'

  try {
    await fixMissingUUIDs()
    result.value = '修复完成！'
    // 重新检查
    await checkUUIDs()
  }
  catch (err) {
    result.value = `修复失败: ${err}`
  }
  finally {
    isFixing.value = false
  }
}

// 页面加载时自动检查
onMounted(() => {
  checkUUIDs()
})
</script>

<template>
  <div class="p-4 max-w-2xl mx-auto">
    <h1 class="text-2xl font-bold mb-6">
      UUID 调试工具
    </h1>

    <div class="space-y-4">
      <UiCard>
        <UiCardHeader>
          <UiCardTitle>数据库状态</UiCardTitle>
          <UiCardDescription>检查各表的 UUID 情况</UiCardDescription>
        </UiCardHeader>
        <UiCardContent>
          <div class="space-y-2">
            <div
              v-for="stat in tableStats"
              :key="stat.table"
              class="flex justify-between items-center p-2 rounded"
              :class="stat.missing > 0 ? 'bg-red-50 dark:bg-red-950' : 'bg-green-50 dark:bg-green-950'"
            >
              <span class="font-mono">{{ stat.table }}</span>
              <span class="text-sm">
                总计: {{ stat.total }} | 缺失 UUID: <span :class="stat.missing > 0 ? 'text-red-600 font-bold' : 'text-green-600'">{{ stat.missing }}</span>
              </span>
            </div>
          </div>

          <UiButton
            class="w-full mt-4"
            @click="checkUUIDs"
          >
            重新检查
          </UiButton>
        </UiCardContent>
      </UiCard>

      <UiCard>
        <UiCardHeader>
          <UiCardTitle>修复工具</UiCardTitle>
          <UiCardDescription>为缺失 UUID 的记录补充 UUID</UiCardDescription>
        </UiCardHeader>
        <UiCardContent>
          <UiButton
            class="w-full"
            :disabled="isFixing"
            @click="runFix"
          >
            {{ isFixing ? '修复中...' : '开始修复' }}
          </UiButton>

          <div
            v-if="result"
            class="mt-4 p-3 rounded bg-muted text-sm font-mono"
          >
            {{ result }}
          </div>
        </UiCardContent>
      </UiCard>

      <UiCard>
        <UiCardHeader>
          <UiCardTitle>使用说明</UiCardTitle>
        </UiCardHeader>
        <UiCardContent class="text-sm text-muted-foreground space-y-2">
          <p>1. 点击"重新检查"查看各表的 UUID 状态</p>
          <p>2. 如果有缺失的 UUID（红色显示），点击"开始修复"</p>
          <p>3. 修复完成后，"缺失 UUID" 应该全部变为 0（绿色）</p>
          <p>4. 修复完成后即可正常使用同步功能</p>
        </UiCardContent>
      </UiCard>
    </div>
  </div>
</template>
