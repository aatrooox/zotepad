<script setup lang="ts">
import type { AssetTag } from '~/composables/repositories/useAssetTagRepository'
import type { Asset } from '~/types/models'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { toast } from 'vue-sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { Input } from '~/components/ui/input'
import { useAssetRepository } from '~/composables/repositories/useAssetRepository'
import { useAssetTagRepository } from '~/composables/repositories/useAssetTagRepository'
import { useSyncManager } from '~/composables/settings/useSyncManager'
import { useStorageService } from '~/composables/useStorageService'

useHead({ title: '资源库 - ZotePad' })

const { getAllAssets, createAsset, deleteAsset } = useAssetRepository()
const { getAllTags, createTag, deleteTag, getAssetsByTag, addAssetsToTag, moveAssets, removeAssetsFromTag } = useAssetTagRepository()
const { uploadFile } = useStorageService()
const { syncTable, syncMode } = useSyncManager()
const { isDesktop } = useEnvironment()

// --- State ---
const assets = ref<Asset[]>([]) // All assets (cache)
const tags = ref<AssetTag[]>([])
const currentTagAssets = ref<Asset[]>([]) // Assets in current album

const viewMode = ref<'overview' | 'album'>('overview')
const currentTag = ref<AssetTag | null>(null)

const assetIsUploading = ref(false)
const assetFileInput = ref<HTMLInputElement | null>(null)
const isLoading = ref(false)

// Selection Mode
const isSelectionMode = ref(false)
const selectedAssetIds = ref<Set<number>>(new Set())

// Dialogs
const showCreateAlbumDialog = ref(false)
const newAlbumName = ref('')
const showAddToAlbumDialog = ref(false)

// --- Computed ---
const recentAssets = computed(() => {
  return assets.value.slice(0, 10)
})

const selectionCount = computed(() => selectedAssetIds.value.size)

// --- Actions ---

// 1. Load Data
async function loadData(silent = false) {
  if (!silent)
    isLoading.value = true
  try {
    const [assetsData, tagsData] = await Promise.all([
      getAllAssets(),
      getAllTags(),
    ])
    assets.value = assetsData || []
    tags.value = tagsData || []

    // If inside an album, refresh its assets too
    if (viewMode.value === 'album' && currentTag.value) {
      await loadAlbumAssets(currentTag.value.id)
    }
  }
  catch (e) {
    console.error('加载数据失败:', e)
    if (!silent)
      toast.error('加载失败')
  }
  finally {
    if (!silent)
      isLoading.value = false
  }
}

async function loadAlbumAssets(tagId: number) {
  const data = await getAssetsByTag(tagId)
  currentTagAssets.value = data || []
}

// 2. View Navigation
const openAlbum = async (tag: AssetTag) => {
  currentTag.value = tag
  viewMode.value = 'album'
  isSelectionMode.value = false
  selectedAssetIds.value.clear()
  await loadAlbumAssets(tag.id)
}

const goBackToOverview = () => {
  viewMode.value = 'overview'
  currentTag.value = null
  isSelectionMode.value = false
  selectedAssetIds.value.clear()
  // Refresh tags to update counts/covers
  getAllTags().then(data => tags.value = data || [])
}

// 3. Album Management
const handleCreateAlbum = async () => {
  if (!newAlbumName.value.trim())
    return
  try {
    await createTag(newAlbumName.value.trim())
    toast.success('相册创建成功')
    showCreateAlbumDialog.value = false
    newAlbumName.value = ''
    await loadData(true)
  }
  catch (e) {
    console.error(e)
    toast.error('创建失败')
  }
}

const handleDeleteAlbum = async (tag: AssetTag) => {
  toast(`确定要删除相册 "${tag.name}" 吗？`, {
    description: '相册内的图片不会被删除，仅删除相册本身。',
    action: {
      label: '删除',
      onClick: async () => {
        await deleteTag(tag.id)
        toast.success('相册已删除')
        if (viewMode.value === 'album' && currentTag.value?.id === tag.id) {
          goBackToOverview()
        }
        else {
          await loadData(true)
        }
      },
    },
    cancel: { label: '取消' },
  })
}

// 4. Asset Management
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
    const assetId = await createAsset({
      url: result.url,
      path: result.path,
      filename: result.filename || file.name,
      size: result.size || file.size,
      mime_type: result.mime_type || file.type,
      storage_type: 'cos',
    })

    // If inside an album, add to it automatically
    if (viewMode.value === 'album' && currentTag.value) {
      await addAssetsToTag([assetId], currentTag.value.id)
    }

    toast.success('上传成功')
    await loadData(true)
  }
  catch (e: any) {
    toast.error(`上传失败: ${e.message}`)
  }
  finally {
    assetIsUploading.value = false
    if (assetFileInput.value)
      assetFileInput.value.value = ''
  }
}

const handleAssetDelete = async (ids: number[]) => {
  // If in album, ask if remove from album or delete permanently
  if (viewMode.value === 'album' && currentTag.value) {
    toast('要执行什么操作？', {
      action: {
        label: '移出相册',
        onClick: async () => {
          await removeAssetsFromTag(ids, currentTag.value!.id)
          toast.success('已移出相册')
          await loadAlbumAssets(currentTag.value!.id)
          isSelectionMode.value = false
          selectedAssetIds.value.clear()
        },
      },
      cancel: { label: '取消' },
    })
    return
  }

  // Global delete
  toast('确定要永久删除选中的图片吗？', {
    action: {
      label: '永久删除',
      onClick: async () => {
        for (const id of ids) {
          await deleteAsset(id)
        }
        toast.success('删除成功')
        await loadData(true)
        isSelectionMode.value = false
        selectedAssetIds.value.clear()
      },
    },
    cancel: { label: '取消' },
  })
}

// 5. Selection & Moving
const toggleSelection = (id: number) => {
  if (selectedAssetIds.value.has(id)) {
    selectedAssetIds.value.delete(id)
    if (selectedAssetIds.value.size === 0)
      isSelectionMode.value = false
  }
  else {
    selectedAssetIds.value.add(id)
    isSelectionMode.value = true
  }
}

const openAddToAlbumDialog = () => {
  if (selectedAssetIds.value.size === 0)
    return
  showAddToAlbumDialog.value = true
}

const handleAddToAlbum = async (targetTag: AssetTag) => {
  const ids = Array.from(selectedAssetIds.value)
  try {
    if (viewMode.value === 'album' && currentTag.value) {
      // Move: Add to new, remove from old
      await moveAssets(ids, currentTag.value.id, targetTag.id)
      toast.success(`已移动到 "${targetTag.name}"`)
      await loadAlbumAssets(currentTag.value.id)
    }
    else {
      // Add: Just add
      await addAssetsToTag(ids, targetTag.id)
      toast.success(`已添加到 "${targetTag.name}"`)
    }
    showAddToAlbumDialog.value = false
    isSelectionMode.value = false
    selectedAssetIds.value.clear()
    // Refresh tags to update counts
    getAllTags().then(data => tags.value = data || [])
  }
  catch (e) {
    console.error(e)
    toast.error('操作失败')
  }
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

// Init
onMounted(async () => {
  await loadData()

  // Sync logic (kept from original)
  if (!isDesktop.value && syncMode.value === 'auto') {
    syncTable('assets', true).then(() => loadData(true)).catch(() => {})
    syncTable('asset_tags', true).catch(() => {})
    syncTable('asset_tag_relations', true).catch(() => {})
  }
})
</script>

<template>
  <div class="min-h-screen  pb-20">
    <!-- Header -->
    <header class="sticky top-0 z-10  backdrop-blur-md px-4 h-14 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Button v-if="viewMode === 'album'" variant="ghost" size="icon" @click="goBackToOverview">
          <Icon name="lucide:arrow-left" class="w-5 h-5" />
        </Button>
        <h1 class="font-semibold text-lg truncate max-w-[200px]">
          {{ viewMode === 'album' ? currentTag?.name : '资源库' }}
        </h1>
      </div>

      <div class="flex items-center gap-2">
        <template v-if="isSelectionMode">
          <span class="text-sm text-muted-foreground mr-2">{{ selectionCount }} 已选</span>
          <Button size="sm" variant="secondary" @click="openAddToAlbumDialog">
            <Icon name="lucide:folder-input" class="w-4 h-4 mr-1" />
            {{ viewMode === 'album' ? '移动' : '添加到' }}
          </Button>
          <Button size="sm" variant="destructive" @click="handleAssetDelete(Array.from(selectedAssetIds))">
            <Icon name="lucide:trash-2" class="w-4 h-4" />
          </Button>
          <Button size="sm" variant="ghost" @click="isSelectionMode = false; selectedAssetIds.clear()">
            取消
          </Button>
        </template>
        <template v-else>
          <Button v-if="viewMode === 'overview'" variant="ghost" size="icon" @click="showCreateAlbumDialog = true">
            <Icon name="lucide:folder-plus" class="w-5 h-5" />
          </Button>
          <Button size="sm" :disabled="assetIsUploading" @click="assetFileInput?.click()">
            <Icon v-if="assetIsUploading" name="lucide:loader-2" class="w-4 h-4 animate-spin" />
            <Icon v-else name="lucide:upload" class="w-4 h-4 mr-1" />
            上传
          </Button>
        </template>
      </div>
    </header>

    <div class="p-4 space-y-6">
      <!-- Overview Mode -->
      <template v-if="viewMode === 'overview'">
        <!-- Recent Uploads -->
        <section v-if="recentAssets.length > 0">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-medium text-muted-foreground">
              最近上传
            </h2>
          </div>
          <div class="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
            <div
              v-for="asset in recentAssets"
              :key="asset.id"
              class="relative shrink-0 w-24 h-24 rounded-lg overflow-hidden border bg-muted"
              @click="copyAssetUrl(asset.url)"
            >
              <img :src="asset.url" :alt="asset.filename" class="w-full h-full object-cover" loading="lazy">
            </div>
          </div>
        </section>

        <!-- Albums Grid -->
        <section>
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-medium text-muted-foreground">
              相册
            </h2>
          </div>
          <div class="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 md:gap-4">
            <!-- Create New Card -->
            <div
              class="aspect-square rounded-xl border-2 border-dashed border-muted-foreground/20 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-muted/50 transition-colors"
              @click="showCreateAlbumDialog = true"
            >
              <Icon name="lucide:plus" class="w-8 h-8 text-muted-foreground/50" />
              <span class="text-xs text-muted-foreground">新建相册</span>
            </div>

            <!-- Album Cards -->
            <div
              v-for="tag in tags"
              :key="tag.id"
              class="group relative aspect-square rounded-xl border bg-card overflow-hidden cursor-pointer hover:shadow-md transition-all"
              @click="openAlbum(tag)"
            >
              <!-- Cover -->
              <div class="w-full h-full bg-muted">
                <img v-if="tag.cover_url" :src="tag.cover_url" :alt="tag.name" class="w-full h-full object-cover transition-transform group-hover:scale-105">
                <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground/30">
                  <Icon name="lucide:image" class="w-10 h-10" />
                </div>
              </div>

              <!-- Info Overlay -->
              <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-8 text-white">
                <div class="font-medium truncate">
                  {{ tag.name }}
                </div>
                <div class="text-xs opacity-80">
                  {{ tag.asset_count || 0 }} 张
                </div>
              </div>

              <!-- Actions -->
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button variant="ghost" size="icon" class="absolute top-1 right-1 h-6 w-6 text-white opacity-0 group-hover:opacity-100 hover:bg-black/20" @click.stop>
                    <Icon name="lucide:more-vertical" class="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem class="text-destructive" @click="handleDeleteAlbum(tag)">
                    <Icon name="lucide:trash-2" class="w-4 h-4 mr-2" />
                    删除相册
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </section>

        <!-- All Photos -->
        <section>
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-medium text-muted-foreground">
              所有照片
            </h2>
          </div>
          <div class="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-1">
            <div
              v-for="asset in assets"
              :key="asset.id"
              class="relative aspect-square bg-muted overflow-hidden cursor-pointer group"
              :class="{ 'ring-2 ring-primary': selectedAssetIds.has(asset.id) }"
              @click="isSelectionMode ? toggleSelection(asset.id) : null"
              @contextmenu.prevent="toggleSelection(asset.id)"
            >
              <img :src="asset.url" :alt="asset.filename" class="w-full h-full object-cover" loading="lazy">

              <!-- Selection Overlay -->
              <div
                v-if="isSelectionMode"
                class="absolute inset-0 bg-black/20 flex items-center justify-center"
              >
                <div
                  class="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors"
                  :class="selectedAssetIds.has(asset.id) ? 'bg-primary border-primary' : 'border-white bg-black/20'"
                >
                  <Icon v-if="selectedAssetIds.has(asset.id)" name="lucide:check" class="w-4 h-4 text-primary-foreground" />
                </div>
              </div>

              <template v-else>
                <!-- Hover Actions (Desktop) -->
                <div class="hidden md:flex absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity items-center justify-center gap-2">
                  <Button size="icon" variant="secondary" class="h-8 w-8 rounded-full" @click.stop="copyAssetUrl(asset.url)">
                    <Icon name="lucide:copy" class="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="secondary" class="h-8 w-8 rounded-full" @click.stop="toggleSelection(asset.id)">
                    <Icon name="lucide:check" class="w-4 h-4" />
                  </Button>
                </div>

                <!-- Mobile Actions (Always Visible) -->
                <div class="md:hidden absolute top-1 right-1">
                  <Button size="icon" variant="secondary" class="h-7 w-7 rounded-full bg-background/60 backdrop-blur-sm shadow-sm" @click.stop="toggleSelection(asset.id)">
                    <Icon name="lucide:check" class="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div class="md:hidden absolute bottom-1 right-1">
                  <Button size="icon" variant="secondary" class="h-7 w-7 rounded-full bg-background/60 backdrop-blur-sm shadow-sm" @click.stop="copyAssetUrl(asset.url)">
                    <Icon name="lucide:copy" class="w-3.5 h-3.5" />
                  </Button>
                </div>
              </template>
            </div>
          </div>
        </section>
      </template>

      <!-- Album View -->
      <template v-else>
        <div v-if="currentTagAssets.length === 0" class="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Icon name="lucide:image-off" class="w-12 h-12 mb-4 opacity-20" />
          <p>相册是空的</p>
          <Button variant="link" @click="assetFileInput?.click()">
            上传图片
          </Button>
        </div>

        <div class="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-1">
          <div
            v-for="asset in currentTagAssets"
            :key="asset.id"
            class="relative aspect-square bg-muted overflow-hidden cursor-pointer group"
            :class="{ 'ring-2 ring-primary': selectedAssetIds.has(asset.id) }"
            @click="isSelectionMode ? toggleSelection(asset.id) : null"
            @contextmenu.prevent="toggleSelection(asset.id)"
          >
            <img :src="asset.url" :alt="asset.filename" class="w-full h-full object-cover" loading="lazy">

            <!-- Selection Overlay -->
            <div
              v-if="isSelectionMode"
              class="absolute inset-0 bg-black/20 flex items-center justify-center"
            >
              <div
                class="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors"
                :class="selectedAssetIds.has(asset.id) ? 'bg-primary border-primary' : 'border-white bg-black/20'"
              >
                <Icon v-if="selectedAssetIds.has(asset.id)" name="lucide:check" class="w-4 h-4 text-primary-foreground" />
              </div>
            </div>

            <template v-else>
              <!-- Hover Actions -->
              <div class="hidden md:flex absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity items-center justify-center gap-2">
                <Button size="icon" variant="secondary" class="h-8 w-8 rounded-full" @click.stop="copyAssetUrl(asset.url)">
                  <Icon name="lucide:copy" class="w-4 h-4" />
                </Button>
                <Button size="icon" variant="secondary" class="h-8 w-8 rounded-full" @click.stop="toggleSelection(asset.id)">
                  <Icon name="lucide:check" class="w-4 h-4" />
                </Button>
              </div>

              <!-- Mobile Actions (Always Visible) -->
              <div class="md:hidden absolute top-1 right-1">
                <Button size="icon" variant="secondary" class="h-7 w-7 rounded-full bg-background/60 backdrop-blur-sm shadow-sm" @click.stop="toggleSelection(asset.id)">
                  <Icon name="lucide:check" class="w-3.5 h-3.5" />
                </Button>
              </div>
              <div class="md:hidden absolute bottom-1 right-1">
                <Button size="icon" variant="secondary" class="h-7 w-7 rounded-full bg-background/60 backdrop-blur-sm shadow-sm" @click.stop="copyAssetUrl(asset.url)">
                  <Icon name="lucide:copy" class="w-3.5 h-3.5" />
                </Button>
              </div>
            </template>
          </div>
        </div>
      </template>
    </div>

    <!-- Hidden Input -->
    <input ref="assetFileInput" type="file" accept="image/*" class="hidden" @change="handleAssetUpload">

    <!-- Create Album Dialog -->
    <Dialog v-model:open="showCreateAlbumDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建相册</DialogTitle>
          <DialogDescription>创建一个新相册来整理您的照片。</DialogDescription>
        </DialogHeader>
        <div class="py-4">
          <Input v-model="newAlbumName" placeholder="相册名称" @keyup.enter="handleCreateAlbum" />
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showCreateAlbumDialog = false">
            取消
          </Button>
          <Button @click="handleCreateAlbum">
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Add To Album Dialog -->
    <Dialog v-model:open="showAddToAlbumDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ viewMode === 'album' ? '移动到相册' : '添加到相册' }}</DialogTitle>
        </DialogHeader>
        <div class="grid grid-cols-2 gap-4 py-4 max-h-[60vh] overflow-y-auto">
          <div
            v-for="tag in tags"
            :key="tag.id"
            class="flex flex-col items-center gap-2 p-4 rounded-lg border cursor-pointer hover:bg-muted transition-colors"
            :class="{ 'opacity-50 pointer-events-none': tag.id === currentTag?.id }"
            @click="handleAddToAlbum(tag)"
          >
            <div class="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary">
              <Icon name="lucide:folder" class="w-6 h-6" />
            </div>
            <span class="text-sm font-medium text-center">{{ tag.name }}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
