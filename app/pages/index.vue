<script setup lang="ts">
import type { ToolbarNames } from 'md-editor-v3'
import type { Asset, Moment, Note } from '~/types/models'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { useFileDialog } from '@vueuse/core'
import gsap from 'gsap'
import { MdEditor, MdPreview } from 'md-editor-v3'
import { toast } from 'vue-sonner'
import { useAssetRepository } from '~/composables/repositories/useAssetRepository'
import { useMomentRepository } from '~/composables/repositories/useMomentRepository'
import { useNoteRepository } from '~/composables/repositories/useNoteRepository'
import { useSettingRepository } from '~/composables/repositories/useSettingRepository'
import { useWorkflowRepository } from '~/composables/repositories/useWorkflowRepository'
import { useCOSService } from '~/composables/useCOSService'
import { useWorkflowRunner } from '~/composables/useWorkflowRunner'
import 'md-editor-v3/lib/style.css'

interface Workflow {
  id: number
  name: string
  description?: string
  steps: string
  schema?: {
    fields?: string
  }
}

useHead({ title: '笔记 - ZotePad' })

const route = useRoute()
const router = useRouter()

// Tab state
const tabs = [
  { id: 'articles', label: '文章', icon: 'lucide:file-text' },
  { id: 'moments', label: '动态', icon: 'lucide:camera' },
  { id: 'assets', label: '资源', icon: 'lucide:image' },
] as const

type TabId = typeof tabs[number]['id']

const activeTab = ref<TabId>('articles')
const { getSetting, setSetting } = useSettingRepository()

// ==================== Articles (Notes) Logic ====================
const { getAllNotes, deleteNote, createNote } = useNoteRepository()
const notes = ref<Note[]>([])
const noteCardsRef = ref<HTMLElement[]>([])
const { uploadFile } = useCOSService()

const animateNoteCards = () => {
  if (noteCardsRef.value.length) {
    gsap.fromTo(
      noteCardsRef.value,
      { opacity: 0, y: 20, scale: 0.95 },
      { opacity: 1, y: 0, scale: 1, duration: 0.4, stagger: 0.05, ease: 'back.out(1.2)', clearProps: 'all' },
    )
  }
}

const loadNotes = async () => {
  try {
    notes.value = await getAllNotes() || []
    nextTick(() => animateNoteCards())
  }
  catch (e) {
    console.error(e)
    toast.error('加载笔记失败')
  }
}

// ==================== Assets Logic ====================
const { getAllAssets, createAsset, deleteAsset } = useAssetRepository()
const assets = ref<Asset[]>([])
const assetIsUploading = ref(false)
const assetFileInput = ref<HTMLInputElement | null>(null)
const assetViewMode = ref<'grid' | 'list'>('grid')

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

const loadAssets = async () => {
  try {
    assets.value = await getAllAssets() || []
  }
  catch (e) {
    console.error(e)
    toast.error('加载资源失败')
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

// ==================== Moments Logic ====================
const { createMoment, getAllMoments, deleteMoment } = useMomentRepository()
const { getAllWorkflows } = useWorkflowRepository()
const { runWorkflow } = useWorkflowRunner()

interface MomentDisplay extends Moment {
  imagesList: string[]
  tagsList: string[]
}

const momentContent = ref('')
const moments = ref<MomentDisplay[]>([])
const isLoading = ref(false)
const isPublishing = ref(false)
const momentTags = ref<string[]>([])
const newMomentTag = ref('')
const momentImages = ref<string[]>([])
const isUploading = ref(false)

// Workflow State
const isWorkflowDialogOpen = ref(false)
const workflows = ref<Workflow[]>([])
const isRunningWorkflow = ref(false)
const currentMoment = ref<MomentDisplay | null>(null)

// Editor Config
const momentToolbars: ToolbarNames[] = ['bold', 'italic', 'underline', '-', 'link', 'code', '-', 'preview']

async function loadMoments() {
  isLoading.value = true
  try {
    const rawMoments = await getAllMoments() || []
    moments.value = rawMoments.map(m => ({
      ...m,
      imagesList: m.images ? JSON.parse(m.images) : [],
      tagsList: m.tags ? JSON.parse(m.tags) : [],
    }))
    nextTick(() => animateMomentCards())
  }
  catch (e) {
    console.error(e)
    toast.error('加载动态失败')
  }
  finally {
    isLoading.value = false
  }
}

function animateMomentCards() {
  gsap.fromTo(
    '.moment-card',
    { opacity: 0, y: 20 },
    { opacity: 1, y: 0, duration: 0.4, stagger: 0.05, ease: 'back.out(1.2)', clearProps: 'all' },
  )
}

// Initialize tab from URL query
onMounted(async () => {
  const tabParam = route.query.tab as string
  if (tabParam && tabs.some(t => t.id === tabParam)) {
    activeTab.value = tabParam as TabId
  }
  else {
    // Check saved preference
    const savedTab = await getSetting('notes_active_tab')
    if (savedTab && tabs.some(t => t.id === savedTab)) {
      activeTab.value = savedTab as TabId
    }
  }

  // Load data based on active tab
  if (activeTab.value === 'articles') {
    loadNotes()
  }
  else if (activeTab.value === 'moments') {
    loadMoments()
  }
  else {
    await loadAssetsViewMode()
    await loadAssets()
  }
})

// Watch tab changes
watch(activeTab, async (newTab) => {
  // Update URL
  router.replace({ query: { tab: newTab } })
  // Save preference
  await setSetting('notes_active_tab', newTab)

  // Load data
  if (newTab === 'articles') {
    loadNotes()
  }
  else if (newTab === 'moments') {
    loadMoments()
  }
  else {
    await loadAssetsViewMode()
    await loadAssets()
  }
})

const handleCreateNote = async () => {
  try {
    const id = await createNote('无标题笔记', '')
    if (id) {
      router.push(`/notes/${id}`)
    }
  }
  catch {
    toast.error('创建笔记失败')
  }
}

const handleDeleteNote = (id: number, event?: Event) => {
  toast('确定要删除这条笔记吗？', {
    action: {
      label: '删除',
      onClick: async () => {
        try {
          if (event && event.target) {
            const target = event.target as HTMLElement
            const card = target.closest('.note-card')
            if (card) {
              await gsap.to(card, { opacity: 0, scale: 0.8, duration: 0.2, ease: 'power2.in' })
            }
          }
          await deleteNote(id)
          toast.success('笔记已删除')
          await loadNotes()
        }
        catch {
          toast.error('删除笔记失败')
        }
      },
    },
    cancel: { label: '取消' },
  })
}

const formatDate = (dateStr?: string) => {
  if (!dateStr)
    return ''
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const getTags = (tagsStr?: string) => {
  if (!tagsStr)
    return []
  try {
    return JSON.parse(tagsStr)
  }
  catch {
    return []
  }
}

const setNoteCardRef = (el: any) => {
  if (el && el.$el)
    noteCardsRef.value.push(el.$el)
  else if (el)
    noteCardsRef.value.push(el)
}

onBeforeUpdate(() => {
  noteCardsRef.value = []
})

// File Dialog
const { open: openFileDialog, onChange: onFileChange } = useFileDialog({
  accept: 'image/*',
  multiple: true,
})

onFileChange(async (files) => {
  if (!files || files.length === 0)
    return

  isUploading.value = true
  const uploadPromises = Array.from(files).map(file => uploadFile(file))

  try {
    const results = await Promise.all(uploadPromises)
    momentImages.value.push(...results.map((r: any) => r.url))
    toast.success(`成功上传 ${results.length} 张图片`)
  }
  catch (e: any) {
    console.error(e)
    toast.error(`图片上传失败: ${e.message}`)
  }
  finally {
    isUploading.value = false
  }
})

function getGridClass(count: number) {
  if (count === 2 || count === 4)
    return 'grid-cols-2 w-2/3 sm:w-1/2 lg:w-1/3'
  if (count >= 3 && count <= 9)
    return 'grid-cols-3 w-full sm:w-3/4 lg:w-1/2'
  return 'grid-cols-4 w-full sm:w-full lg:w-2/3'
}

function handleAddMomentTag() {
  const tag = newMomentTag.value.trim()
  if (tag && !momentTags.value.includes(tag)) {
    momentTags.value.push(tag)
  }
  newMomentTag.value = ''
}

function handleRemoveMomentTag(index: number) {
  momentTags.value.splice(index, 1)
}

function handleRemoveMomentImage(index: number) {
  momentImages.value.splice(index, 1)
}

async function handlePublishMoment() {
  if (!momentContent.value.trim() && momentImages.value.length === 0) {
    toast.warning('请输入内容或上传图片')
    return
  }

  isPublishing.value = true
  try {
    await createMoment(momentContent.value, momentImages.value, momentTags.value)
    toast.success('发布成功')
    momentContent.value = ''
    momentTags.value = []
    momentImages.value = []
    await loadMoments()
  }
  catch (e) {
    console.error(e)
    toast.error('发布失败')
  }
  finally {
    isPublishing.value = false
  }
}

function handleDeleteMoment(id: number) {
  toast('确定要删除这条动态吗？', {
    action: {
      label: '删除',
      onClick: async () => {
        try {
          await deleteMoment(id)
          toast.success('删除成功')
          await loadMoments()
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

async function openWorkflowDialog(moment: MomentDisplay) {
  currentMoment.value = moment
  try {
    workflows.value = await getAllWorkflows() || []
    isWorkflowDialogOpen.value = true
  }
  catch (e) {
    console.error(e)
    toast.error('加载流配置失败')
  }
}

async function handleRunWorkflow(workflow: Workflow) {
  if (!currentMoment.value)
    return

  isRunningWorkflow.value = true
  isWorkflowDialogOpen.value = false

  try {
    let steps = []
    try {
      steps = JSON.parse(workflow.steps)
    }
    catch {
      toast.error('无效的流步骤')
      return
    }

    const ctx = {
      title: '',
      content: currentMoment.value.content,
      html: '',
      tags: currentMoment.value.tagsList || [],
      images: currentMoment.value.imagesList || [],
      photos: currentMoment.value.imagesList || [],
      created_at: currentMoment.value.created_at,
      id: currentMoment.value.id,
    }

    let schemaFields: any[] = []
    if (workflow.schema && workflow.schema.fields) {
      try {
        schemaFields = JSON.parse(workflow.schema.fields)
      }
      catch (e) {
        console.error('Failed to parse schema fields', e)
      }
    }

    toast.info(`正在执行流: ${workflow.name}`)
    const result = await runWorkflow(steps, ctx, schemaFields)

    const errors = result.logs.filter(l => l.status === 'error')
    if (errors.length > 0 && errors[0]) {
      toast.error(`流失败: ${errors[0].error}`)
    }
    else {
      toast.success('流执行成功')
    }
  }
  catch (e: any) {
    console.error(e)
    toast.error(`流执行失败: ${e.message}`)
  }
  finally {
    isRunningWorkflow.value = false
    currentMoment.value = null
  }
}
</script>

<template>
  <div class="h-full flex flex-col bg-background/50 overflow-hidden">
    <!-- Desktop Header -->
    <div class="hidden md:flex px-8 py-4 items-center justify-between sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border/40">
      <!-- Tab Navigation -->
      <div class="flex items-center gap-6">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="relative py-2 text-base font-medium transition-colors"
          :class="activeTab === tab.id
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground'"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
          <!-- Active indicator -->
          <span
            v-if="activeTab === tab.id"
            class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
          />
        </button>
      </div>
      <!-- Create Button -->
      <Button
        v-if="activeTab === 'articles'"
        size="sm"
        class="rounded-full"
        @click="handleCreateNote"
      >
        <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
        新建
      </Button>
    </div>

    <!-- Mobile Header with Sticky Tabs -->
    <div class="md:hidden sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border/40">
      <div class="flex items-center justify-between px-4 pt-safe-offset-4 pb-3 mt-1">
        <!-- Tab Navigation -->
        <div class="flex items-center gap-6">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            class="relative py-1 text-base font-medium transition-colors"
            :class="activeTab === tab.id
              ? 'text-foreground'
              : 'text-muted-foreground'"
            @click="activeTab = tab.id"
          >
            {{ tab.label }}
            <!-- Active indicator -->
            <span
              v-if="activeTab === tab.id"
              class="absolute -bottom-1 left-0 right-0 h-0.5 bg-primary rounded-full"
            />
          </button>
        </div>
        <!-- Create Button -->
        <Button v-if="activeTab === 'articles'" size="sm" class="rounded-full" @click="handleCreateNote">
          <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
          新建
        </Button>
      </div>
    </div>

    <!-- Content Area -->
    <div class="flex-1 overflow-y-auto">
      <!-- Articles Tab -->
      <div v-if="activeTab === 'articles'" class="p-4 md:p-8">
        <!-- Stats Header -->
        <div class="mb-4 md:mb-6">
          <p class="text-sm text-muted-foreground">
            共 {{ notes.length }} 篇文章
          </p>
        </div>

        <div v-if="notes.length === 0" class="h-[50vh] flex flex-col items-center justify-center text-muted-foreground space-y-6 animate-in fade-in zoom-in duration-500">
          <div class="w-24 h-24 bg-muted/50 rounded-full flex items-center justify-center mb-4">
            <Icon name="lucide:file-plus" class="w-10 h-10 opacity-40" />
          </div>
          <div class="text-center space-y-2">
            <h3 class="text-xl font-semibold text-foreground">
              暂无笔记
            </h3>
            <p class="max-w-xs mx-auto">
              创建您的第一篇笔记以开始记录想法。
            </p>
          </div>
          <Button variant="outline" size="lg" class="mt-4 rounded-full" @click="handleCreateNote">
            创建笔记
          </Button>
        </div>

        <div v-else class="flex flex-col pb-20 max-w-4xl mx-auto">
          <div
            v-for="note in notes"
            :key="note.id"
            :ref="setNoteCardRef"
            class="group note-card list-item-hover rounded-lg mb-2 border border-transparent hover:border-border/60 bg-card/30"
          >
            <div class="flex items-center p-4 gap-4">
              <NuxtLink :to="`/notes/${note.id}`" class="flex-1 flex items-center gap-4 min-w-0">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-3 mb-1">
                    <h3 class="font-semibold text-base truncate group-hover:text-primary transition-colors">
                      {{ note.title || '无标题' }}
                    </h3>
                  </div>
                  <div class="flex items-start gap-2 flex-wrap">
                    <div v-if="getTags(note.tags).length > 0" class="flex flex-wrap gap-1.5">
                      <Badge
                        v-for="tag in getTags(note.tags).slice(0, 5)"
                        :key="tag"
                        variant="secondary"
                        class="text-[10px] px-2 py-0 h-5 bg-secondary/50 hover:bg-secondary transition-colors font-normal"
                      >
                        {{ tag }}
                      </Badge>
                      <span v-if="getTags(note.tags).length > 5" class="text-[10px] text-muted-foreground">
                        +{{ getTags(note.tags).length - 5 }}
                      </span>
                    </div>
                    <span v-else class="text-xs text-muted-foreground italic">无标签</span>
                    <span class="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1 ml-auto mt-1 md:mt-0">
                      <Icon name="lucide:clock" class="w-3 h-3" />
                      {{ formatDate(note.updated_at) }}
                    </span>
                  </div>
                </div>
              </NuxtLink>
              <div class="flex items-center md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200 relative z-10">
                <button
                  class="h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full transition-colors cursor-pointer"
                  @click.stop.prevent="(e) => handleDeleteNote(note.id, e)"
                >
                  <Icon name="lucide:trash-2" class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Assets Tab -->
      <div v-else-if="activeTab === 'assets'" class="p-4 md:p-8">
        <div class="hidden md:flex px-4 py-2 items-center justify-between bg-card/40 rounded-xl border border-border/60 mb-6">
          <div>
            <h2 class="text-xl font-semibold">
              资源库
            </h2>
            <p class="text-sm text-muted-foreground">
              {{ assets.length }} 个文件
            </p>
          </div>
          <div class="flex items-center gap-2">
            <div class="flex items-center bg-muted/50 rounded-lg p-1">
              <button
                class="p-2 rounded-md transition-colors"
                :class="assetViewMode === 'grid' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
                title="网格视图"
                @click="toggleAssetViewMode('grid')"
              >
                <Icon name="lucide:grid-2x2" class="w-4 h-4" />
              </button>
              <button
                class="p-2 rounded-md transition-colors"
                :class="assetViewMode === 'list' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
                title="列表视图"
                @click="toggleAssetViewMode('list')"
              >
                <Icon name="lucide:list" class="w-4 h-4" />
              </button>
            </div>
            <Button :disabled="assetIsUploading" @click="triggerAssetUpload">
              <Icon v-if="assetIsUploading" name="lucide:loader-2" class="w-4 h-4 mr-2 animate-spin" />
              <Icon v-else name="lucide:upload" class="w-4 h-4 mr-2" />
              上传图片
            </Button>
          </div>
        </div>

        <!-- Mobile header -->
        <div class="flex md:hidden px-2 pb-3 items-center justify-between">
          <div>
            <h2 class="text-lg font-semibold">
              资源库
            </h2>
            <p class="text-xs text-muted-foreground">
              {{ assets.length }} 个文件
            </p>
          </div>
          <div class="flex items-center gap-2">
            <button
              class="p-2 rounded-md text-muted-foreground hover:text-foreground transition-colors"
              :title="assetViewMode === 'grid' ? '切换到列表视图' : '切换到网格视图'"
              @click="toggleAssetViewMode(assetViewMode === 'grid' ? 'list' : 'grid')"
            >
              <Icon :name="assetViewMode === 'grid' ? 'lucide:list' : 'lucide:grid-2x2'" class="w-5 h-5" />
            </button>
            <Button size="sm" :disabled="assetIsUploading" @click="triggerAssetUpload">
              <Icon v-if="assetIsUploading" name="lucide:loader-2" class="w-4 h-4 mr-1 animate-spin" />
              <Icon v-else name="lucide:upload" class="w-4 h-4 mr-1" />
              上传
            </Button>
          </div>
        </div>
        <input ref="assetFileInput" type="file" accept="image/*" class="hidden" @change="handleAssetUpload">

        <div class="flex-1 overflow-y-auto">
          <div v-if="assets.length === 0" class="h-[40vh] flex flex-col items-center justify-center text-muted-foreground">
            <Icon name="lucide:image" class="w-12 h-12 opacity-20 mb-3" />
            <p>暂无图片</p>
          </div>

          <div v-else-if="assetViewMode === 'grid'" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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

          <div v-else class="flex flex-col gap-2 max-w-4xl mx-auto">
            <div
              v-for="asset in assets"
              :key="asset.id"
              class="group flex items-center gap-4 p-3 bg-card rounded-lg border hover:border-border/60 transition-colors"
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
          </div>
        </div>
      </div>

      <!-- Moments Tab -->
      <div v-else-if="activeTab === 'moments'" class="p-4 md:p-6 space-y-6 md:space-y-8 pb-safe">
        <!-- Stats Header -->
        <div class="max-w-4xl mx-auto">
          <p class="text-sm text-muted-foreground">
            共 {{ moments.length }} 条动态
          </p>
        </div>

        <!-- Editor Section -->
        <div class="bg-card border rounded-xl shadow-sm overflow-hidden max-w-4xl mx-auto">
          <div class="h-[200px]">
            <ClientOnly>
              <MdEditor
                v-model="momentContent"
                theme="light"
                preview-theme="github"
                class="!h-full w-full"
                :toolbars="momentToolbars"
                :preview="false"
                placeholder="分享当下的想法..."
              />
            </ClientOnly>
          </div>

          <!-- Image Preview -->
          <div v-if="momentImages.length > 0" class="px-4 py-2 border-t bg-muted/10 grid grid-cols-4 gap-2">
            <div v-for="(img, index) in momentImages" :key="index" class="relative group aspect-square rounded-md overflow-hidden border bg-background">
              <img :src="img" class="w-full h-full object-cover" alt="Uploaded image">
              <button
                class="absolute top-1 right-1 p-1 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
                @click="handleRemoveMomentImage(index)"
              >
                <Icon name="lucide:x" class="w-3 h-3" />
              </button>
            </div>
          </div>

          <!-- Tags Input -->
          <div class="px-4 py-2 border-t bg-muted/10 flex flex-wrap items-center gap-2">
            <div v-for="(tag, index) in momentTags" :key="index" class="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs rounded-full">
              <span>#{{ tag }}</span>
              <button class="hover:text-destructive" @click="handleRemoveMomentTag(index)">
                <Icon name="lucide:x" class="w-3 h-3" />
              </button>
            </div>
            <div class="flex items-center gap-2">
              <Icon name="lucide:hash" class="w-4 h-4 text-muted-foreground" />
              <input
                v-model="newMomentTag"
                type="text"
                placeholder="添加标签..."
                class="bg-transparent text-sm outline-none min-w-[80px] placeholder:text-muted-foreground/70"
                @keydown.enter.prevent="handleAddMomentTag"
                @blur="handleAddMomentTag"
              >
            </div>
          </div>

          <div class="px-4 py-3 bg-muted/30 border-t flex justify-between items-center">
            <div class="text-xs text-muted-foreground">
              <Button variant="ghost" size="sm" class="gap-2" :disabled="isUploading" @click="openFileDialog()">
                <Icon v-if="isUploading" name="lucide:loader-2" class="w-4 h-4 animate-spin" />
                <Icon v-else name="lucide:image" class="w-4 h-4" />
                <span>{{ isUploading ? '上传中...' : '上传图片' }}</span>
              </Button>
            </div>
            <Button :disabled="isPublishing || (!momentContent.trim() && momentImages.length === 0)" @click="handlePublishMoment">
              <Icon v-if="isPublishing" name="lucide:loader-2" class="w-4 h-4 mr-2 animate-spin" />
              <Icon v-else name="lucide:send" class="w-4 h-4 mr-2" />
              发布
            </Button>
          </div>
        </div>

        <!-- Moments List -->
        <div class="space-y-4 pb-10 max-w-4xl mx-auto">
          <div v-if="moments.length === 0 && !isLoading" class="text-center text-muted-foreground py-10">
            暂无动态，发一条试试？
          </div>

          <div
            v-for="moment in moments"
            :key="moment.id"
            class="moment-card bg-card border rounded-xl p-5 shadow-sm hover:shadow-md transition-all group"
          >
            <div class="flex justify-between items-start mb-3">
              <div class="text-sm text-muted-foreground">
                {{ new Date(moment.created_at!).toLocaleString() }}
              </div>
              <div class="flex gap-2 transition-opacity">
                <Button variant="ghost" size="icon" class="h-8 w-8" @click="openWorkflowDialog(moment)">
                  <Icon name="lucide:workflow" class="w-4 h-4 text-primary" />
                </Button>
                <Button variant="ghost" size="icon" class="h-8 w-8 hover:text-destructive" @click="handleDeleteMoment(moment.id)">
                  <Icon name="lucide:trash-2" class="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div class="prose prose-sm dark:prose-invert max-w-none mb-3">
              <MdPreview :model-value="moment.content" preview-theme="github" :code-foldable="false" />
            </div>

            <!-- Moment Images -->
            <div v-if="moment.imagesList && moment.imagesList.length > 0" class="mb-3">
              <div v-if="moment.imagesList.length === 1">
                <img
                  :src="moment.imagesList[0]"
                  class="max-h-[300px] max-w-[70%] rounded-lg border bg-muted/20 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                  alt="Moment image"
                  loading="lazy"
                >
              </div>
              <div v-else class="grid gap-1.5" :class="getGridClass(moment.imagesList.length)">
                <div
                  v-for="(img, idx) in moment.imagesList"
                  :key="idx"
                  class="aspect-square rounded-md overflow-hidden border bg-muted/20 cursor-pointer"
                >
                  <img :src="img" class="w-full h-full object-cover hover:scale-105 transition-transform duration-300" loading="lazy" alt="Moment image">
                </div>
              </div>
            </div>

            <!-- Moment Tags -->
            <div v-if="moment.tagsList && moment.tagsList.length > 0" class="flex flex-wrap gap-2">
              <span
                v-for="(tag, idx) in moment.tagsList"
                :key="idx"
                class="px-2 py-0.5 bg-secondary text-secondary-foreground text-xs rounded-full"
              >
                #{{ tag }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Workflow Dialog -->
    <Dialog v-model:open="isWorkflowDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>选择流目标</DialogTitle>
          <DialogDescription>
            选择要将此动态流到的目标。
          </DialogDescription>
        </DialogHeader>
        <div class="py-4 space-y-2 max-h-[60vh] overflow-y-auto">
          <div v-if="workflows.length === 0" class="text-center text-muted-foreground py-4">
            未找到流配置。
          </div>
          <Button
            v-for="wf in workflows"
            :key="wf.id"
            variant="outline"
            class="w-full justify-start h-auto py-3 px-4"
            @click="handleRunWorkflow(wf)"
          >
            <div class="flex flex-col items-start text-left">
              <span class="font-medium">{{ wf.name }}</span>
              <span v-if="wf.description" class="text-xs text-muted-foreground line-clamp-1">{{ wf.description }}</span>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
.md-editor {
  --md-bk-color: hsl(var(--background));
  --md-color: hsl(var(--foreground));
  --md-border-color: transparent;
}
</style>
