<script setup lang="ts">
import type { Asset } from '~/types/models'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { toast } from 'vue-sonner'
import { useAssetRepository } from '~/composables/repositories/useAssetRepository'
import { useSettingRepository } from '~/composables/repositories/useSettingRepository'
import { useCOSService } from '~/composables/useCOSService'

useHead({ title: '资源库 - ZotePad' })

const { getAllAssets, createAsset, deleteAsset } = useAssetRepository()
const { uploadFile } = useCOSService()
const { getSetting, setSetting } = useSettingRepository()

const assets = ref<Asset[]>([])
const isUploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const viewMode = ref<'grid' | 'list'>('grid')

// 切换视图模式并保存
const toggleViewMode = async (mode: 'grid' | 'list') => {
  viewMode.value = mode
  await setSetting('assets_view_mode', mode, 'ui')
}

const loadAssets = async () => {
  try {
    assets.value = await getAllAssets() || []
  }
  catch (e) {
    console.error(e)
    toast.error('加载资源失败')
  }
}

const handleUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement
  if (!target.files || target.files.length === 0)
    return

  const file = target.files[0]
  if (!file)
    return

  isUploading.value = true

  try {
    const { url, path } = await uploadFile(file)

    await createAsset({
      url,
      path,
      filename: file.name,
      size: file.size,
      mime_type: file.type,
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
    isUploading.value = false
    if (fileInput.value)
      fileInput.value.value = ''
  }
}

const handleDelete = (id: number) => {
  toast('确定要删除这张图片吗？', {
    action: {
      label: '删除',
      onClick: async () => {
        try {
          await deleteAsset(id)
          toast.success('删除成功')
          await loadAssets()
        }
        catch (e) {
          console.error(e)
          toast.error('删除失败')
        }
      },
    },
    cancel: { label: '取消' },
  })
}

const copyUrl = async (url: string) => {
  try {
    await writeText(url)
    toast.success('链接已复制')
  }
  catch (e) {
    console.error(e)
    toast.error('复制失败')
  }
}

const triggerUpload = () => {
  fileInput.value?.click()
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

onMounted(async () => {
  // 加载保存的视图模式
  const savedViewMode = await getSetting('assets_view_mode')
  if (savedViewMode === 'grid' || savedViewMode === 'list') {
    viewMode.value = savedViewMode
  }

  loadAssets()
})
</script>

<template>
  <div class="h-full flex flex-col bg-background/50">
    <!-- Desktop Header -->
    <div class="hidden md:flex px-8 py-6 items-center justify-between sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border/40">
      <div>
        <h1 class="text-3xl font-bold tracking-tight text-foreground">
          资源库
        </h1>
        <p class="text-muted-foreground text-sm mt-1">
          {{ assets.length }} 个文件
        </p>
      </div>
      <div class="flex items-center gap-2">
        <!-- View Mode Toggle -->
        <div class="flex items-center bg-muted/50 rounded-lg p-1">
          <button
            class="p-2 rounded-md transition-colors"
            :class="viewMode === 'grid' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            title="网格视图"
            @click="toggleViewMode('grid')"
          >
            <Icon name="lucide:grid-2x2" class="w-4 h-4" />
          </button>
          <button
            class="p-2 rounded-md transition-colors"
            :class="viewMode === 'list' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            title="列表视图"
            @click="toggleViewMode('list')"
          >
            <Icon name="lucide:list" class="w-4 h-4" />
          </button>
        </div>
        <Button :disabled="isUploading" @click="triggerUpload">
          <Icon v-if="isUploading" name="lucide:loader-2" class="w-4 h-4 mr-2 animate-spin" />
          <Icon v-else name="lucide:upload" class="w-4 h-4 mr-2" />
          上传图片
        </Button>
      </div>
      <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="handleUpload">
    </div>

    <!-- Mobile Header -->
    <div class="flex md:hidden px-4 pb-3 pt-safe-offset-4 items-center justify-between mt-2">
      <span class="text-lg font-bold tracking-tight">资源 <span class="text-sm font-normal text-muted-foreground ml-1">{{ assets.length }}</span></span>
      <div class="flex items-center gap-2">
        <!-- View Mode Toggle -->
        <button
          class="p-2 rounded-md text-muted-foreground hover:text-foreground transition-colors"
          :title="viewMode === 'grid' ? '切换到列表视图' : '切换到网格视图'"
          @click="toggleViewMode(viewMode === 'grid' ? 'list' : 'grid')"
        >
          <Icon :name="viewMode === 'grid' ? 'lucide:list' : 'lucide:grid-2x2'" class="w-5 h-5" />
        </button>
        <Button size="sm" :disabled="isUploading" @click="triggerUpload">
          <Icon v-if="isUploading" name="lucide:loader-2" class="w-4 h-4 mr-1 animate-spin" />
          <Icon v-else name="lucide:upload" class="w-4 h-4 mr-1" />
          上传
        </Button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto p-4 md:p-8 pb-safe">
      <div v-if="assets.length === 0" class="h-[60vh] flex flex-col items-center justify-center text-muted-foreground">
        <Icon name="lucide:image" class="w-12 h-12 opacity-20 mb-4" />
        <p>暂无图片</p>
      </div>

      <!-- Grid View -->
      <div v-else-if="viewMode === 'grid'" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <div v-for="asset in assets" :key="asset.id" class="group relative aspect-square bg-card rounded-lg overflow-hidden border shadow-sm">
          <img :src="asset.url" :alt="asset.filename" class="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy">

          <div class="absolute top-1 right-1 flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
            <Button variant="secondary" size="icon" class="h-7 w-7 bg-background/80 backdrop-blur-sm" title="复制链接" @click="copyUrl(asset.url)">
              <Icon name="lucide:copy" class="w-3.5 h-3.5" />
            </Button>
            <Button variant="destructive" size="icon" class="h-7 w-7 opacity-90" title="删除" @click="handleDelete(asset.id)">
              <Icon name="lucide:trash-2" class="w-3.5 h-3.5" />
            </Button>
          </div>

          <div class="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent text-white text-xs truncate">
            {{ asset.filename }}
          </div>
        </div>
      </div>

      <!-- List View -->
      <div v-else class="flex flex-col gap-2 max-w-4xl mx-auto">
        <div
          v-for="asset in assets"
          :key="asset.id"
          class="group flex items-center gap-4 p-3 bg-card rounded-lg border hover:border-border/60 transition-colors"
        >
          <!-- Thumbnail -->
          <div class="w-12 h-12 md:w-16 md:h-16 rounded-md overflow-hidden bg-muted shrink-0">
            <img :src="asset.url" :alt="asset.filename" class="w-full h-full object-cover" loading="lazy">
          </div>

          <!-- Info -->
          <div class="flex-1 min-w-0">
            <p class="font-medium text-sm truncate">
              {{ asset.filename }}
            </p>
            <p class="text-xs text-muted-foreground mt-0.5">
              {{ asset.mime_type }} · {{ formatFileSize(asset.size) }}
            </p>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" class="h-8 w-8" title="复制链接" @click="copyUrl(asset.url)">
              <Icon name="lucide:copy" class="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" class="h-8 w-8 hover:text-destructive" title="删除" @click="handleDelete(asset.id)">
              <Icon name="lucide:trash-2" class="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
