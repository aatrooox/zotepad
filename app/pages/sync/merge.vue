<script setup lang="ts">
import type { ConflictDecision } from '~/composables/sync/useSyncConflict'
import type { RecordMetadata } from '~/composables/sync/useSyncMetadata'

definePageMeta({
  layout: 'default',
})

const router = useRouter()

// 从全局状态读取待处理的冲突
const conflicts = useState<Array<{ local: RecordMetadata, remote: RecordMetadata }>>('sync_pending_conflicts', () => [])
const pendingTable = useState<string>('sync_pending_table', () => '')
const conflictResolved = useState<ConflictDecision[] | null>('sync_conflict_resolved')

// 用户的决策
const decisions = ref<Record<string, 'keep_local' | 'keep_remote'>>({})

// 已决策的数量
const decidedCount = computed(() => Object.keys(decisions.value).length)
const allDecided = computed(() => decidedCount.value === conflicts.value.length)

/**
 * 选择保留哪个版本
 */
function selectDecision(uuid: string, action: 'keep_local' | 'keep_remote') {
  decisions.value[uuid] = action
}

/**
 * 批量应用决策
 */
function applyAll(action: 'keep_local' | 'keep_remote') {
  conflicts.value.forEach((conflict) => {
    decisions.value[conflict.local.uuid] = action
  })
}

/**
 * 格式化日期
 */
function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * 取消合并
 */
function cancel() {
  // 默认保留本地
  const defaultDecisions: ConflictDecision[] = conflicts.value.map(c => ({
    uuid: c.local.uuid,
    action: 'keep_local',
  }))
  conflictResolved.value = defaultDecisions
  router.back()
}

/**
 * 确认合并
 */
function confirm() {
  const finalDecisions: ConflictDecision[] = conflicts.value.map(conflict => ({
    uuid: conflict.local.uuid,
    action: decisions.value[conflict.local.uuid] || 'keep_local',
  }))

  conflictResolved.value = finalDecisions
  router.back()
}

// 页面加载时检查是否有待处理的冲突
onMounted(() => {
  if (conflicts.value.length === 0) {
    // 没有冲突，返回上一页
    router.back()
  }
})
</script>

<template>
  <div class="min-h-screen bg-background p-4">
    <div class="mx-auto max-w-4xl">
      <!-- 头部 -->
      <div class="mb-6">
        <h1 class="text-2xl font-bold">
          合并冲突
        </h1>
        <p class="text-muted-foreground mt-2">
          {{ pendingTable }} 表有 {{ conflicts.length }} 条记录需要手动合并
        </p>
      </div>

      <!-- 批量操作 -->
      <div class="mb-4 flex gap-2">
        <UiButton variant="outline" @click="applyAll('keep_local')">
          <Icon name="lucide:smartphone" class="mr-2 h-4 w-4" />
          全部保留移动端
        </UiButton>
        <UiButton variant="outline" @click="applyAll('keep_remote')">
          <Icon name="lucide:monitor" class="mr-2 h-4 w-4" />
          全部保留桌面端
        </UiButton>
      </div>

      <!-- 冲突列表 -->
      <div class="space-y-4">
        <div
          v-for="(conflict, index) in conflicts"
          :key="conflict.local.uuid"
          class="rounded-lg border bg-card p-4"
        >
          <div class="mb-3 flex items-center justify-between">
            <span class="font-medium">记录 {{ conflict.local.uuid.slice(0, 8) }}</span>
            <span class="text-sm text-muted-foreground">
              冲突 {{ index + 1 }} / {{ conflicts.length }}
            </span>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <!-- 本地版本 -->
            <div
              class="rounded border p-3"
              :class="decisions[conflict.local.uuid] === 'keep_local' ? 'border-primary bg-primary/5' : ''"
            >
              <div class="mb-2 flex items-center justify-between">
                <span class="text-sm font-medium">📱 移动端</span>
                <UiBadge variant="outline">
                  v{{ conflict.local.version }}
                </UiBadge>
              </div>
              <div class="text-sm text-muted-foreground">
                更新时间: {{ formatDate(conflict.local.updated_at) }}
              </div>
              <UiButton
                size="sm"
                class="mt-3 w-full"
                :variant="decisions[conflict.local.uuid] === 'keep_local' ? 'default' : 'outline'"
                @click="selectDecision(conflict.local.uuid, 'keep_local')"
              >
                保留此版本
              </UiButton>
            </div>

            <!-- 远程版本 -->
            <div
              class="rounded border p-3"
              :class="decisions[conflict.local.uuid] === 'keep_remote' ? 'border-primary bg-primary/5' : ''"
            >
              <div class="mb-2 flex items-center justify-between">
                <span class="text-sm font-medium">💻 桌面端</span>
                <UiBadge variant="outline">
                  v{{ conflict.remote.version }}
                </UiBadge>
              </div>
              <div class="text-sm text-muted-foreground">
                更新时间: {{ formatDate(conflict.remote.updated_at) }}
              </div>
              <UiButton
                size="sm"
                class="mt-3 w-full"
                :variant="decisions[conflict.local.uuid] === 'keep_remote' ? 'default' : 'outline'"
                @click="selectDecision(conflict.local.uuid, 'keep_remote')"
              >
                保留此版本
              </UiButton>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部操作 -->
      <div class="mt-6 flex justify-end gap-3">
        <UiButton variant="outline" @click="cancel">
          取消
        </UiButton>
        <UiButton :disabled="!allDecided" @click="confirm">
          确认合并 ({{ decidedCount }}/{{ conflicts.length }})
        </UiButton>
      </div>
    </div>
  </div>
</template>
