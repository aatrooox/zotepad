<script setup lang="ts">
import type { Asset } from '~/types/models'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { toast } from 'vue-sonner'
import { useAssetRepository } from '~/composables/repositories/useAssetRepository'
import { useSettingRepository } from '~/composables/repositories/useSettingRepository'
import { useSyncManager } from '~/composables/settings/useSyncManager'
import { useStorageService } from '~/composables/useStorageService'

useHead({ title: '资源 - ZotePad' })

const { getAllAssets, createAsset, deleteAsset } = useAssetRepository()
const { uploadFile } = useStorageService()
const { getSetting, setSetting } = useSettingRepository()
const { syncTable, syncMode } = useSyncManager()
const { isDesktop } = useEnvironment()

const assets = ref<Asset[]>([])
const assetIsUploading = ref(false)
const assetFileInput = ref<HTMLInputElement | null>(null)
const assetViewMode = ref<'grid' | 'list'>('grid')
const isLoading = ref(false)

const loadAssetsViewMode = async () => {
  const savedViewMode = await getSetting('assets_view_mode')
  if (savedViewMode === 'grid' || savedViewMode === 'list') {
    assetViewMode.value = savedViewMode
  }
}

const toggleAssetViewMode = async (mode: 'grid' | 'list') => {
  assetViewMode.value = mode
  await setSetting('assets_view_mode', mode, 'ui')
}

async function loadAssets(silent = false) {
  if (!silent)
    isLoading.value = true
  try {
    const rawAssets = await getAllAssets() || []
    console.log(`[loadAssets] 从数据库查询到 ${rawAssets.length} 条资源`)
    assets.value = rawAssets
    console.log(`[loadAssets] 成功加载 ${assets.value.length} 条资源`)
  }
  catch (e) {
    console.error('[loadAssets] 加载资源失败:', e)
    if (!silent)
      toast.error('加载资源失败')
  }
  finally {
    if (!silent)
      isLoading.value = false
  }
}

const handleAssetUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement
  if (!target.files || target.files.length === 0)
    return

  const file = target.files[0]
  if (!file)
    return

  assetIsUploading.value = true

  try {
    const result = await uploadFile(file)

    await createAsset({
      url: result.url,
      path: result.path,
      filename: result.filename || file.name,
      size: result.size || file.size,
      mime_type: result.mime_type || file.type,
      storage_type: 'cos',
    })

    toast.success('上传成功')
    await loadAssets()
  }
  catch (e: any) {
    console.error(e)
    toast.error(`上传失败: ${e.message}`)
  }
  finally {
    assetIsUploading.value = false
    if (assetFileInput.value)
      assetFileInput.value.value = ''
  }
}

const handleAssetDelete = (id: number) => {
  toast('确定要删除这张图片吗？', {
    action: {
      label: '删除',
      onClick: async () => {
        try {
          // Optimistic UI
          const index = assets.value.findIndex(a => a.id === id)
          if (index !== -1) {
            assets.value.splice(index, 1)
          }

          await deleteAsset(id)
          toast.success('删除成功')
        }
        catch (e) {
          console.error(e)
          toast.error('删除失败')
          await loadAssets()
        }
      },
    },
    cancel: { label: '取消' },
  })
}

const copyAssetUrl = async (url: string) => {
  try {
    await writeText(url)
    toast.success('链接已复制')
  }
  catch (e) {
    console.error(e)
    toast.error('复制失败')
  }
}

const triggerAssetUpload = () => {
  assetFileInput.value?.click()
}

const formatFileSize = (bytes?: number) => {
  if (!bytes) {
    return '未知大小'
  }
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// 初始化
onMounted(async () => {
  // Load view mode
  await loadAssetsViewMode()

  // 1. Load local data immediately
  await loadAssets()

  // 2. Sync in background - 仅移动端且自动模式
  if (!isDesktop.value && syncMode.value === 'auto') {
    console.log('[Assets] 自动模式，触发 assets 表同步')
    syncTable('assets', true).then((result) => {
      console.log(`[Assets同步] assets: 拉取 ${result?.pulled || 0} 条, 推送 ${result?.pushed || 0} 条`)
      loadAssets(true)
    }).catch((e: any) => {
      console.error('Assets页面初始化同步失败:', e)
      if (e.message?.includes('配置') || e.message?.includes('网络')) {
        toast.warning('后台同步失败，可在设置中配置局域网同步')
      }
    })
  }
})
</script>

<template>
  <div class="p-4 md:p-8">
    <!-- Desktop Controls -->
    <div class="hidden md:flex px-0 py-2 items-center justify-start mb-4">
      <div class="flex items-center gap-2">
        <div class="flex items-center bg-muted/50 rounded-lg p-0.5">
          <button
            class="p-1.5 rounded-md transition-colors"
            :class="assetViewMode === 'grid' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            title="网格视图"
            @click="toggleAssetViewMode('grid')"
          >
            <Icon name="lucide:grid-2x2" class="w-3.5 h-3.5" />
          </button>
          <button
            class="p-1.5 rounded-md transition-colors"
            :class="assetViewMode === 'list' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            title="列表视图"
            @click="toggleAssetViewMode('list')"
          >
            <Icon name="lucide:list" class="w-3.5 h-3.5" />
          </button>
        </div>
        <Button size="sm" class="h-8 px-3 text-xs" :disabled="assetIsUploading" @click="triggerAssetUpload">
          <Icon v-if="assetIsUploading" name="lucide:loader-2" class="w-3.5 h-3.5 mr-1.5 animate-spin" />
          <Icon v-else name="lucide:upload" class="w-3.5 h-3.5 mr-1.5" />
          上传图片
        </Button>
      </div>
    </div>

    <!-- Mobile Controls -->
    <div class="flex md:hidden px-2 pb-3 items-center justify-start">
      <div class="flex items-center gap-2">
        <button
          class="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors bg-muted/50"
          :title="assetViewMode === 'grid' ? '切换到列表视图' : '切换到网格视图'"
          @click="toggleAssetViewMode(assetViewMode === 'grid' ? 'list' : 'grid')"
        >
          <Icon :name="assetViewMode === 'grid' ? 'lucide:list' : 'lucide:grid-2x2'" class="w-4 h-4" />
        </button>
        <Button size="sm" class="h-8 px-3 text-xs" :disabled="assetIsUploading" @click="triggerAssetUpload">
          <Icon v-if="assetIsUploading" name="lucide:loader-2" class="w-3.5 h-3.5 mr-1 animate-spin" />
          <Icon v-else name="lucide:upload" class="w-3.5 h-3.5 mr-1" />
          上传
        </Button>
      </div>
    </div>

    <input ref="assetFileInput" type="file" accept="image/*" class="hidden" @change="handleAssetUpload">

    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center h-64">
      <Icon name="lucide:loader-2" class="w-8 h-8 animate-spin text-muted-foreground" />
    </div>

    <!-- Empty State -->
    <div v-else-if="assets.length === 0" class="h-[50vh] flex flex-col items-center justify-center text-muted-foreground space-y-6 animate-in fade-in zoom-in duration-500">
      <div class="w-20 h-20 bg-muted/50 rounded-full flex items-center justify-center mb-4 shadow-inner">
        <Icon name="lucide:image" class="w-8 h-8 opacity-40" />
      </div>
      <div class="text-center space-y-1">
        <h3 class="text-base md:text-lg font-semibold text-foreground">
          暂无资源
        </h3>
        <p class="max-w-xs mx-auto text-sm text-balance">
          上传您的第一张图片以开始管理资源。
        </p>
      </div>
      <Button variant="outline" size="default" class="mt-4 rounded-full shadow-sm hover:shadow-md transition-all" @click="triggerAssetUpload">
        上传图片
      </Button>
    </div>

    <!-- Assets Grid View -->
    <div
      v-else-if="assetViewMode === 'grid'"
      class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-20"
    >
      <div v-for="asset in assets" :key="asset.id" class="group relative aspect-square bg-card rounded-lg overflow-hidden border shadow-sm">
        <img :src="asset.url" :alt="asset.filename" class="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy">

        <div class="absolute top-1 right-1 flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          <Button variant="secondary" size="icon" class="h-7 w-7 bg-background/80 backdrop-blur-sm" title="复制链接" @click="copyAssetUrl(asset.url)">
            <Icon name="lucide:copy" class="w-3.5 h-3.5" />
          </Button>
          <Button variant="destructive" size="icon" class="h-7 w-7 opacity-90" title="删除" @click="handleAssetDelete(asset.id)">
            <Icon name="lucide:trash-2" class="w-3.5 h-3.5" />
          </Button>
        </div>

        <div class="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent text-white text-xs truncate">
          {{ asset.filename }}
        </div>
      </div>
    </div>

    <!-- Assets List View -->
    <div v-else class="flex flex-col pb-20 max-w-5xl mx-auto">
      <div class="bg-card/50 backdrop-blur-sm rounded-xl border border-border/40 shadow-sm overflow-hidden">
        <TransitionGroup
          name="list"
          tag="div"
          class="divide-y divide-border/30"
        >
          <div
            v-for="asset in assets"
            :key="asset.id"
            class="group flex items-center gap-4 p-3 hover:bg-muted/50 transition-colors"
          >
            <div class="w-12 h-12 md:w-16 md:h-16 rounded-md overflow-hidden bg-muted shrink-0">
              <img :src="asset.url" :alt="asset.filename" class="w-full h-full object-cover" loading="lazy">
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-medium text-sm truncate">
                {{ asset.filename }}
              </p>
              <p class="text-xs text-muted-foreground mt-0.5">
                {{ asset.mime_type }} · {{ formatFileSize(asset.size) }}
              </p>
            </div>
            <div class="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="icon" class="h-8 w-8" title="复制链接" @click="copyAssetUrl(asset.url)">
                <Icon name="lucide:copy" class="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" class="h-8 w-8 hover:text-destructive" title="删除" @click="handleAssetDelete(asset.id)">
                <Icon name="lucide:trash-2" class="w-4 h-4" />
              </Button>
            </div>
          </div>
        </TransitionGroup>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* List Transitions */
.list-move,
.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  height: 0;
  margin: 0;
  padding: 0;
  transform: translateX(-20px);
}

.list-leave-active {
  position: absolute;
  width: 100%;
  z-index: 0;
}
</style>
