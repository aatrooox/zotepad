<script setup lang="ts">
import { useSettingRepository } from '~/composables/repositories/useSettingRepository'
import { useSyncManager } from '~/composables/settings/useSyncManager'

useHead({ title: '笔记 - ZotePad' })

const route = useRoute()
const router = useRouter()
const { getSetting, setSetting } = useSettingRepository()
const { syncTableSmart, syncMode } = useSyncManager()
const { toast } = useToast()

// 同步加载状态
const isSyncing = ref(false)

// 确保 syncMode 正确响应
const isManualMode = computed(() => syncMode.value === 'manual')

// Tab definitions
const tabs = [
  { id: 'articles', label: '文章', icon: 'lucide:file-text', path: '/notes/articles', syncTable: 'notes' },
  { id: 'moments', label: '动态', icon: 'lucide:camera', path: '/notes/moments', syncTable: 'moments' },
  { id: 'assets', label: '资源', icon: 'lucide:image', path: '/notes/assets', syncTable: 'assets' },
] as const

// 当前激活的 tab（基于路由）
const activeTab = computed(() => {
  const path = route.path
  if (path.startsWith('/notes/articles'))
    return 'articles'
  if (path.startsWith('/notes/moments'))
    return 'moments'
  if (path.startsWith('/notes/assets'))
    return 'assets'
  return 'articles'
})

// 获取当前激活 tab 的同步表名
const currentSyncTable = computed(() => {
  const tab = tabs.find(t => t.id === activeTab.value)
  return tab?.syncTable || 'notes'
})

// 切换 tab
const switchTab = async (path: string) => {
  router.push(path)
  // 保存用户偏好
  const tabId = tabs.find(t => t.path === path)?.id
  if (tabId) {
    await setSetting('notes_active_tab', tabId)
  }
}

/**
 * 处理同步按钮点击
 */
async function handleSync() {
  if (isSyncing.value)
    return

  try {
    isSyncing.value = true
    const tableName = currentSyncTable.value
    const result = await syncTableSmart(tableName as 'notes' | 'moments' | 'assets')

    if (result) {
      toast.success(`同步完成：↓${result.pulled} ↑${result.pushed}`)
    }
    else {
      toast.success('同步完成')
    }
  }
  catch (e: any) {
    console.error('[Sync] 同步失败:', e)
    const errorMsg = e?.message || String(e)
    toast.error(`同步失败: ${errorMsg}`)
  }
  finally {
    isSyncing.value = false
  }
}

// 初始化：如果访问 /notes，重定向到保存的 tab 或默认 articles
onMounted(async () => {
  // 调试：检查 syncMode 的值
  console.log('[Notes Index] syncMode.value =', syncMode.value)
  console.log('[Notes Index] 同步按钮显示条件:', syncMode.value === 'manual')
  console.log('[Notes Index] isManualMode.value =', isManualMode.value)

  if (route.path === '/notes' || route.path === '/notes/') {
    const savedTab = await getSetting('notes_active_tab')
    const targetTab = tabs.find(t => t.id === savedTab) || tabs[0]!
    router.replace(targetTab.path)
  }
})

// 监听 syncMode 变化
watch(syncMode, (newVal) => {
  console.log('[Notes Index] syncMode 变化:', newVal)
})
</script>

<template>
  <div class="h-full flex flex-col bg-background/50 overflow-hidden">
    <!-- Desktop Header -->
    <div class="hidden md:flex px-8 lg:px-12 py-4 items-center justify-between sticky top-0 z-10 backdrop-blur-xl">
      <!-- Tab Navigation -->
      <div class="flex items-center gap-1 bg-muted/50 p-1 rounded-full border border-border/20">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="relative px-4 py-1.5 text-xs md:text-sm font-medium transition-all rounded-full"
          :class="activeTab === tab.id
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground hover:bg-background/50'"
          @click="switchTab(tab.path)"
        >
          <div class="flex items-center gap-2">
            <Icon :name="tab.icon" class="w-4 h-4" />
            {{ tab.label }}
          </div>
        </button>
      </div>

      <!-- 同步按钮 -->
      <div v-if="isManualMode" class="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          :disabled="isSyncing"
          @click="handleSync"
        >
          <Icon
            name="lucide:refresh-cw"
            class="w-4 h-4 mr-2"
            :class="{ 'animate-spin': isSyncing }"
          />
          同步
        </Button>
      </div>
    </div>

    <!-- Mobile Header with Sticky Tabs -->
    <div class="md:hidden sticky top-0 z-20 backdrop-blur-xl">
      <div class="flex items-center justify-between px-4 pt-safe-offset-4 pb-3 mt-1">
        <!-- Tab Navigation -->
        <div class="flex items-center gap-6">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            class="relative py-2 text-base font-medium transition-colors"
            :class="activeTab === tab.id
              ? 'text-foreground'
              : 'text-muted-foreground'"
            @click="switchTab(tab.path)"
          >
            {{ tab.label }}
            <!-- Active indicator -->
            <span
              v-if="activeTab === tab.id"
              class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1/2 h-0.5 bg-primary rounded-full transition-all"
            />
          </button>
        </div>

        <!-- 同步按钮 -->
        <Button
          v-if="isManualMode"
          variant="ghost"
          size="icon"
          :disabled="isSyncing"
          @click="handleSync"
        >
          <Icon
            name="lucide:refresh-cw"
            class="w-5 h-5"
            :class="{ 'animate-spin': isSyncing }"
          />
        </Button>
      </div>
    </div>

    <!-- Content Area -->
    <div class="flex-1 overflow-y-auto">
      <NuxtPage />
    </div>
  </div>
</template>
