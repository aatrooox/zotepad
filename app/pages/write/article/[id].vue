<script setup lang="ts">
import type { FrontmatterFields } from '~/components/ui/editor/frontmatter-handler'
import type { Asset } from '~/types/models'
import type { Workflow } from '~/types/workflow'
import { writeHtml } from '@tauri-apps/plugin-clipboard-manager'
import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import { useClipboard, useColorMode, useDebounceFn, useWindowSize } from '@vueuse/core'
import gsap from 'gsap'
import { toast } from 'vue-sonner'
import { stringifyYAML } from '~/components/ui/editor/frontmatter-handler'
import MdEditorCrepe from '~/components/ui/editor/MdEditorCrepe.vue'
import { useAssetRepository } from '~/composables/repositories/useAssetRepository'
import { useEnvironmentRepository } from '~/composables/repositories/useEnvironmentRepository'
import { useNoteRepository } from '~/composables/repositories/useNoteRepository'
import { useWorkflowRepository } from '~/composables/repositories/useWorkflowRepository'
import { useSyncManager } from '~/composables/settings/useSyncManager'
import { useNoteStore } from '~/composables/stores/useNoteStore'
import { useKeyboardInset } from '~/composables/useKeyboardInset'
import { useSidebar } from '~/composables/useSidebar'
import { useStorageService } from '~/composables/useStorageService'
import { useWorkflowRunner } from '~/composables/useWorkflowRunner'
import { WORKFLOW_TYPES } from '~/types/workflow'
import { copyToClipboard, getWeChatMinimalHTML } from '~/utils/wechat-formatter'

useHead({ title: 'ZotePad - Editor' })
const { fetchNotes } = useNoteStore()
const { viewportHeight } = useKeyboardInset()

const route = useRoute()
const router = useRouter()
const { width } = useWindowSize()
const { copy } = useClipboard()
const colorMode = useColorMode({
  emitAuto: true,
})
const isMobile = computed(() => width.value < 768)

// 获取实际生效的主题 (用于 MdEditor 等不支持 'auto' 的组件)
const resolvedTheme = computed(() => {
  if (colorMode.value !== 'auto')
    return colorMode.value
  return (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'
})

const content = ref('')
const title = ref('')
const tags = ref<string[]>([])
const newTag = ref('')
const noteId = ref<number | null>(null)
const editorContainerRef = ref(null)
const saveStatus = ref<'idle' | 'saving' | 'saved'>('idle')
const isEditorReadOnly = ref(false)

// WeChat preview drawer state
const isWeChatPreviewOpen = ref(false)

// Resources Drawer state
const isResourcesDrawerOpen = ref(false)
const assetsList = ref<Asset[]>([])
const isAssetsLoading = ref(false)

// Frontmatter Drawer state
const isFrontmatterDrawerOpen = ref(false)
const frontmatterFields = ref<FrontmatterFields>({})
const noteCreatedAt = ref<Date | undefined>()
const noteUpdatedAt = ref<Date | undefined>()

const { getNote, createNote, updateNote } = useNoteRepository()
const { createAsset, getAllAssets, getAssetByUrl } = useAssetRepository()
const { getSystemWorkflow } = useWorkflowRepository()
const { getAllEnvs } = useEnvironmentRepository()
const { runWorkflow } = useWorkflowRunner()
const { uploadFiles } = useStorageService()
const { isVisible: sidebarVisible, setContext } = useSidebar()

const isPureMode = ref(false)

const togglePureMode = () => {
  isPureMode.value = !isPureMode.value
  sidebarVisible.value = !isPureMode.value
}

onUnmounted(() => {
  if (isPureMode.value) {
    sidebarVisible.value = true
  }
})

// 同步管理
const { syncTable, forcePushRecord } = useSyncManager()
const { isDesktop } = useEnvironment()
const isForceSyncing = ref(false)

// 添加调试日志
// console.log('[Notes] syncOnce 函数:', syncOnce)

// Workflow state
// const isWorkflowDialogOpen = ref(false)
// const workflows = ref<Workflow[]>([])
// const isRunningWorkflow = ref(false)

// 微信草稿箱系统工作流状态
const wxDraftWorkflow = ref<Workflow | null>(null)
const wxDraftReady = ref(false) // 工作流存在且环境变量已配置
const isUploadingToDraft = ref(false)
const WX_REQUIRED_ENVS = ['ZZCLUB_PAT', 'WX_APPID', 'WX_APPSECRET']

const dataUrlImageRegex = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g

const getImageExtension = (mimeType: string) => {
  const parts = mimeType.split('/')
  const rawExt = parts[1] || 'png'
  return rawExt.replace('svg+xml', 'svg').replace('jpeg', 'jpg')
}

const dataUrlToFile = (dataUrl: string, index: number) => {
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!matches)
    throw new Error('无效的图片数据')

  const contentType = matches[1] || 'image/png'
  const base64Data = matches[2]
  const binaryString = atob(base64Data)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  const extension = getImageExtension(contentType)
  const fileName = `pasted-${Date.now()}-${index}.${extension}`
  return new File([bytes], fileName, { type: contentType })
}

const uploadImagesAndRegister = async (files: File[]) => {
  const results = await uploadFiles(files)
  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const file = files[i]
    if (!result || !file)
      continue

    await createAsset({
      url: result.url,
      path: result.path,
      filename: result.filename || file.name,
      size: result.size || file.size,
      mime_type: result.mime_type || file.type,
      storage_type: 'cos',
    })
  }
  return results.map(r => r.url)
}

const isReplacingBase64Images = ref(false)
const replaceBase64Images = async () => {
  if (isReplacingBase64Images.value)
    return

  const matches = content.value.match(dataUrlImageRegex)
  if (!matches || matches.length === 0)
    return

  isReplacingBase64Images.value = true
  try {
    const uniqueDataUrls = [...new Set(matches)]
    const files = uniqueDataUrls.map((dataUrl, index) => dataUrlToFile(dataUrl, index))
    const urls = await uploadImagesAndRegister(files)

    if (urls.length !== uniqueDataUrls.length) {
      throw new Error('图片上传失败')
    }

    let updatedContent = content.value
    uniqueDataUrls.forEach((dataUrl, index) => {
      const url = urls[index]
      if (url) {
        updatedContent = updatedContent.split(dataUrl).join(url)
      }
    })

    if (updatedContent !== content.value) {
      content.value = updatedContent
      toast.success(`已上传 ${urls.length} 张图片`)
    }
  }
  catch (e: any) {
    console.error('Base64 image replace failed:', e)
    toast.error(e.message || '图片上传失败')
  }
  finally {
    isReplacingBase64Images.value = false
  }
}

const debouncedReplaceBase64Images = useDebounceFn(replaceBase64Images, 500)

// 检查微信草稿箱工作流是否可用
const checkWxDraftWorkflow = async () => {
  try {
    // 获取系统工作流
    const workflow = await getSystemWorkflow(WORKFLOW_TYPES.SYSTEM_WX_DRAFT)
    wxDraftWorkflow.value = workflow

    if (!workflow) {
      wxDraftReady.value = false
      return
    }

    // 检查环境变量是否已配置
    const envs = await getAllEnvs() || []
    const configuredKeys = envs.map(e => e.key)
    const missingEnvs = WX_REQUIRED_ENVS.filter(key => !configuredKeys.includes(key))

    wxDraftReady.value = missingEnvs.length === 0
  }
  catch (e) {
    console.error('Failed to check wx draft workflow', e)
    wxDraftReady.value = false
  }
}

// const loadWorkflows = async () => {
//   try {
//     workflows.value = await getAllWorkflows() || []
//   }
//   catch (e) {
//     console.error(e)
//     toast.error('加载流配置失败')
//   }
// }

// const handleRunWorkflow = async (workflow: Workflow) => {
//   isRunningWorkflow.value = true
//   isWorkflowDialogOpen.value = false

//   try {
//     let steps = []
//     try {
//       steps = JSON.parse(workflow.steps)
//     }
//     catch {
//       toast.error('无效的流步骤')
//       return
//     }

//     const ctx = {
//       title: title.value,
//       content: content.value,
//       html: htmlContent.value,
//       tags: tags.value,
//       noteId: noteId.value,
//     }

//     let schemaFields = []
//     if (workflow.schema && workflow.schema.fields) {
//       try {
//         schemaFields = JSON.parse(workflow.schema.fields)
//       }
//       catch (e) {
//         console.error('Failed to parse schema fields', e)
//         toast.error('Schema 解析失败，将使用完整上下文')
//       }
//     }

//     toast.info(`正在执行流: ${workflow.name}`)
//     const result = await runWorkflow(steps, ctx, schemaFields)

//     // Check for errors in logs
//     const errors = result.logs.filter(l => l.status === 'error')
//     if (errors.length > 0 && errors[0]) {
//       toast.error(`流失败: ${errors[0].error}`)
//     }
//     else {
//       toast.success('流执行成功')
//     }
//   }
//   catch (e: any) {
//     console.error(e)
//     toast.error(`流执行失败: ${e.message}`)
//   }
//   finally {
//     isRunningWorkflow.value = false
//   }
// }

// 提取 Markdown 中的图片链接
const extractImageUrls = (markdown: string): string[] => {
  const urls: string[] = []

  // 匹配 ![alt](url) 或 ![alt](url "title") 格式
  // 只抓取 URL 部分，忽略可选的 title 描述
  const markdownImageRegex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
  let match = markdownImageRegex.exec(markdown)
  while (match !== null) {
    if (match[2]) {
      urls.push(match[2])
    }
    match = markdownImageRegex.exec(markdown)
  }

  // 匹配 <img src="url"> 格式
  const htmlImageRegex = /<img[^>]+src="([^"]+)"[^>]*>/g
  match = htmlImageRegex.exec(markdown)
  while (match !== null) {
    if (match[1]) {
      urls.push(match[1])
    }
    match = htmlImageRegex.exec(markdown)
  }

  // 去重
  return [...new Set(urls)]
}

// 自动维护图片链接到资源表
const maintainImageAssets = async (markdown: string) => {
  if (!markdown)
    return

  const imageUrls = extractImageUrls(markdown)
  if (imageUrls.length === 0)
    return

  try {
    for (const url of imageUrls) {
      // 检查是否已存在
      const existing = await getAssetByUrl(url)
      if (existing) {
        continue
      }

      // 不存在则插入
      const filename = url.split('/').pop() || 'image'
      const mimeType = url.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)
        ? `image/${url.split('.').pop()?.toLowerCase()}`
        : 'image/jpeg'

      await createAsset({
        url,
        path: url,
        filename,
        size: 0,
        mime_type: mimeType,
        storage_type: 'external',
      })
    }
  }
  catch (e) {
    // 维护失败不影响保存流程
    console.warn('维护图片资源失败:', e)
  }
}

// Auto-save logic
const updateSidebarContext = () => {
  setContext('notes', { id: noteId.value })
}

// Frontmatter 管理
const updateFrontmatterFieldsFromNote = () => {
  frontmatterFields.value = {
    title: title.value || '无标题',
    date: noteCreatedAt.value?.toISOString(),
    lastmod: noteUpdatedAt.value?.toISOString(),
    tags: tags.value,
  }
}

const saveNote = async () => {
  if (!content.value && !title.value)
    return

  const startTime = Date.now()
  saveStatus.value = 'saving'

  try {
    // 先维护图片资源（不阻塞保存流程）
    maintainImageAssets(content.value).catch(e => console.warn('维护图片资源失败:', e))

    if (noteId.value) {
      await updateNote(noteId.value, title.value, content.value, tags.value)
      // 更新时间
      noteUpdatedAt.value = new Date()
    }
    else {
      const id = await createNote(title.value || '无标题笔记', content.value, tags.value)
      if (id) {
        noteId.value = id
        // Update URL to reflect the new ID without reloading
        router.replace({ params: { id: id.toString() } })
        updateSidebarContext()
        // 设置创建时间
        noteCreatedAt.value = new Date()
        noteUpdatedAt.value = new Date()
      }
    }

    // 更新 frontmatter 字段
    updateFrontmatterFieldsFromNote()

    fetchNotes(true)
    // Ensure loading state shows for at least 500ms for visual smoothness
    const elapsed = Date.now() - startTime
    if (elapsed < 500) {
      await new Promise(resolve => setTimeout(resolve, 500 - elapsed))
    }

    saveStatus.value = 'saved'
    setTimeout(() => {
      if (saveStatus.value === 'saved')
        saveStatus.value = 'idle'
    }, 2000)

    // 保存成功后触发同步(不等待完成,避免阻塞) - 仅移动端且自动模式
    if (!isDesktop.value) {
      const { syncMode } = useSyncManager()
      if (syncMode.value === 'auto') {
        syncTable('notes', true).catch((e: any) => console.error('[Notes] 保存后自动同步失败:', e))
      }
    }
  }
  catch (e) {
    console.error('Auto-save failed', e)
    toast.error('自动保存失败')
    saveStatus.value = 'idle'
  }
}

const debouncedSave = useDebounceFn(saveNote, 1000)


/**
 * 强制同步当前笔记
 */
const handleForceSync = async () => {
  if (!noteId.value) {
    toast.error('请先保存笔记')
    return
  }

  isForceSyncing.value = true
  try {
    await forcePushRecord('notes', noteId.value)
    // toast.success('已同步到远程端')
  }
  catch (e: any) {
    console.error('[ForceSync] 失败:', e)
    toast.error(`同步失败: ${e.message || '未知错误'}`)
  }
  finally {
    isForceSyncing.value = false
  }
}

// Tag management
const addTag = () => {
  const tag = newTag.value.trim()
  if (tag && !tags.value.includes(tag)) {
    tags.value.push(tag)
    debouncedSave()
  }
  newTag.value = ''
}

const removeTag = (tag: string) => {
  tags.value = tags.value.filter(t => t !== tag)
  debouncedSave()
}

const openFrontmatterDrawer = () => {
  updateFrontmatterFieldsFromNote()
  isFrontmatterDrawerOpen.value = true
}

const handleFrontmatterTitleUpdate = (newTitle: string) => {
  // 同步更新主标题
  title.value = newTitle
  frontmatterFields.value.title = newTitle
  debouncedSave()
}

// 字数统计与成就系统
// const wordCount = computed(() => {
//   return content.value.replace(/\s+/g, '').length
// })

// const lastAchievementWordCount = ref(0)

// watch(wordCount, (newCount) => {
//   const threshold = 100
//   const newMilestone = Math.floor(newCount / threshold)
//   const lastMilestone = Math.floor(lastAchievementWordCount.value / threshold)

//   if (newMilestone > lastMilestone) {
//     const pointsEarned = (newMilestone - lastMilestone)
//     celebrateAchievement(pointsEarned)
//       duration: 2000,
//     })
//   }

//   lastAchievementWordCount.value = newCount
// })

watch([content, title], () => {
  debouncedSave()
})

watch(content, () => {
  debouncedReplaceBase64Images()
})

// Load initial data
onMounted(async () => {
  // Animate editor entry
  if (editorContainerRef.value) {
    gsap.from(editorContainerRef.value, {
      opacity: 0,
      y: 10,
      duration: 0.4,
      ease: 'power2.out',
      delay: 0.1,
    })
  }

  try {
    // 检查微信草稿箱工作流
    await checkWxDraftWorkflow()

    const idParam = route.params.id

    if (idParam === 'new') {
      // Initialize new note
      noteId.value = null
      content.value = ''
      title.value = ''
      tags.value = []
      noteCreatedAt.value = new Date()
      noteUpdatedAt.value = new Date()
      updateSidebarContext()
    }
    else {
      const id = Number.parseInt(idParam as string)
      if (!Number.isNaN(id)) {
        const note = await getNote(id)
        if (note) {
          noteId.value = note.id
          content.value = note.content
          title.value = note.title
          try {
            tags.value = JSON.parse(note.tags || '[]')
          }
          catch {
            tags.value = []
          }
          // 解析时间戳
          noteCreatedAt.value = note.created_at ? new Date(note.created_at) : new Date()
          noteUpdatedAt.value = note.updated_at ? new Date(note.updated_at) : new Date()
          updateSidebarContext()
        }
        else {
          toast.error('未找到笔记')
          router.push('/')
        }
      }
    }
  }
  catch (e) {
    console.error('Failed to load note', e)
    toast.error('加载笔记失败')
  }
})

// 复制原始markdown
const copyMarkdown = () => {
  if (!content.value) {
    toast.error('没有可复制的内容')
    return
  }
  copy(content.value)
  toast.success('Markdown 已复制到剪贴板')
}

// 打开微信预览 Drawer
const openWeChatPreview = () => {
  if (!content.value) {
    toast.error('没有可复制的内容')
    return
  }
  isEditorReadOnly.value = true
  isWeChatPreviewOpen.value = true
}

// 关闭微信预览 Drawer
const closeWeChatPreview = () => {
  isWeChatPreviewOpen.value = false
  isEditorReadOnly.value = false
}

// 精简版复制 - 适用于手机端公众号助手
const copyWeChatMinimalHtml = async () => {
  const editorDom = document.querySelector('.milkdown .editor') as HTMLElement
  if (!editorDom) {
    toast.error('未找到编辑器内容')
    return
  }

  try {
    const finalHtml = getWeChatMinimalHTML(editorDom)
    const success = await copyToClipboard(finalHtml)
    if (success) {
      toast.success('已复制')
      closeWeChatPreview()
    }
    else {
      await writeHtml(finalHtml, editorDom.textContent || '内容已复制')
      toast.success('已复制')
      closeWeChatPreview()
    }
  }
  catch (e: any) {
    console.error('WeChat minimal copy failed', e)
    toast.error(`格式化失败: ${e.message || '未知错误'}`)
  }
}

// Resources Drawer Logic
const openResourcesDrawer = async () => {
  isResourcesDrawerOpen.value = true
  isAssetsLoading.value = true
  try {
    assetsList.value = await getAllAssets() || []
  }
  catch (e) {
    console.error(e)
    toast.error('加载资源失败')
  }
  finally {
    isAssetsLoading.value = false
  }
}

const copyAssetUrl = (url: string) => {
  copy(url)
  toast.success('链接已复制')
}

const copyAssetMarkdown = (asset: Asset) => {
  const md = `![](${asset.url})`
  copy(md)
  toast.success('Markdown链接已复制')
}

// 发送到微信草稿箱
const sendToWxDraft = async () => {
  if (!wxDraftWorkflow.value || !wxDraftReady.value) {
    toast.error('请先在设置中配置微信公众号工作流')
    return
  }

  const editorDom = document.querySelector('.milkdown .editor') as HTMLElement
  if (!editorDom) {
    toast.error('未找到编辑器内容')
    return
  }

  isUploadingToDraft.value = true
  isWeChatPreviewOpen.value = false
  try {
    // 获取处理后的 HTML 和图片列表
    const finalHtml = getWeChatMinimalHTML(editorDom)

    // 提取图片 URL
    const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/g
    const photos: string[] = []
    let match = imgRegex.exec(finalHtml)
    while (match !== null) {
      if (match[1]) {
        photos.push(match[1])
      }
      match = imgRegex.exec(finalHtml)
    }

    // 解析工作流步骤
    let steps = []
    try {
      steps = JSON.parse(wxDraftWorkflow.value.steps)
    }
    catch {
      toast.error('无效的工作流步骤')
      return
    }
    // 如果没图片，给用户传一张zotepad的图作为一种宣传
    if (photos.length === 0) {
      photos.push('https://img.zzao.club/zotepad/1764937926926_g2uj75oxn4p.png')
    }
    // 构建上下文
    const ctx = {
      title: title.value || '无标题',
      content: content.value,
      html: finalHtml,
      photos,
      tags: tags.value,
      noteId: noteId.value,
    }

    // toast.info('正在上传到草稿箱...')
    const result = await runWorkflow(steps, ctx)

    // 检查执行结果
    const errors = result.logs.filter(l => l.status === 'error')
    if (errors.length > 0 && errors[0]) {
      toast.error(`上传失败: ${errors[0].error}`)
    }
    else {
      toast.success('已成功上传到草稿箱')
      closeWeChatPreview()
    }
  }
  catch (e: any) {
    console.error('Failed to send to wx draft', e)
    toast.error(`上传失败: ${e.message}`)
  }
  finally {
    isUploadingToDraft.value = false
  }
}

// 保存到本地文件
const saveToLocalFile = async () => {
  if (!content.value) {
    toast.error('没有可保存的内容')
    return
  }

  try {
    // 使用标题作为默认文件名
    const defaultFileName = title.value ? `${title.value}.md` : '无标题笔记.md'

    // 打开保存对话框
    const filePath = await save({
      defaultPath: defaultFileName,
      filters: [{
        name: 'Markdown',
        extensions: ['md'],
      }],
    })

    if (!filePath) {
      // 用户取消
      return
    }

    // 准备 frontmatter
    const now = new Date().toISOString()
    const frontmatterData: FrontmatterFields = {
      title: title.value || '无标题',
      date: noteCreatedAt.value?.toISOString() || now,
      lastmod: now, // 保存时更新为当前时间
      tags: tags.value,
    }

    const frontmatterYAML = stringifyYAML(frontmatterData)
    const finalContent = `---\n${frontmatterYAML}\n---\n\n${content.value}`

    // 写入文件
    await writeTextFile(filePath, finalContent)
    toast.success('已保存到本地')
    closeWeChatPreview()
  }
  catch (e: any) {
    console.error('Failed to save to local file', e)
    toast.error(`保存失败: ${e.message}`)
  }
}

const onUploadImg = async (files: Array<File>, callback: (urls: Array<string>) => void) => {
  try {
    const urls = await uploadImagesAndRegister(files)
    callback(urls)
    toast.success(`已上传 ${urls.length} 张图片`)
  }
  catch (e: any) {
    console.error('Image upload failed:', e)
    toast.error(e.message || '图片上传失败')
  }
}
</script>

<template>
  <div
    class="relative flex flex-col pt-safe-offset-4 md:pt-0 overflow-hidden"
    :class="{ 'pt-8': isPureMode }"
    :style="{
      height: viewportHeight ? `${viewportHeight}px` : '100dvh',
      maxHeight: viewportHeight ? `${viewportHeight}px` : '100dvh',
    }"
  >
    <!-- Header / Toolbar Area -->
    <header
      v-if="!isPureMode"
      class="md:border-b px-4 md:px-6 py-3 md:py-4 flex items-start justify-between z-10 shrink-0 md:mt-0 gap-2"
    >
      <div class="flex flex-col flex-1 gap-2 md:gap-3 min-w-0">
        <!-- 移动端返回按钮 -->
        <div class="flex items-center gap-2 md:hidden">
          <Button variant="ghost" size="icon" class="shrink-0 -ml-2" @click="router.push('/')">
            <Icon name="lucide:arrow-left" class="w-5 h-5" />
          </Button>
          <input
            v-model="title"
            class="bg-transparent font-bold text-base focus:outline-none text-foreground placeholder:text-muted-foreground/50 w-full tracking-tight"
            placeholder="无标题笔记"
            @input="debouncedSave"
          >
        </div>
        <!-- 桌面端标题 -->
        <input
          v-model="title"
          class="hidden md:block bg-transparent font-bold text-2xl focus:outline-none text-foreground placeholder:text-muted-foreground/50 w-full tracking-tight"
          placeholder="无标题笔记"
          @input="debouncedSave"
        >
        <!-- 标签区域 - 移动端隐藏 -->
        <div class="hidden md:flex items-center gap-2 flex-wrap">
          <Badge
            v-for="tag in tags"
            :key="tag"
            variant="secondary"
            class="cursor-pointer hover:bg-destructive hover:text-destructive-foreground transition-colors px-2 py-1 text-xs font-medium"
            @click="removeTag(tag)"
          >
            {{ tag }} <Icon name="lucide:x" class="w-3 h-3 ml-1 opacity-50" />
          </Badge>
          <div class="relative flex items-center">
            <Icon name="lucide:tag" class="w-3 h-3 absolute left-2 text-muted-foreground" />
            <input
              v-model="newTag"
              class="bg-muted/30 hover:bg-muted/50 focus:bg-muted/50 rounded-full pl-7 pr-3 py-1 text-xs focus:outline-none text-foreground placeholder:text-muted-foreground transition-colors min-w-[80px]"
              placeholder="添加标签..."
              @keydown.enter.prevent="addTag"
              @blur="addTag"
            >
          </div>
        </div>
      </div>
      <div class="flex items-center gap-1 md:gap-2 shrink-0">
        <Button
          v-if="isMobile"
          variant="ghost"
          size="icon"
          class="text-muted-foreground hover:text-foreground w-8 h-8 md:w-9 md:h-9"
          title="强制同步此文章"
          :disabled="!noteId || isForceSyncing"
          @click="handleForceSync"
        >
          <Icon name="lucide:cloud-upload" class="w-4 h-4" :class="{ 'animate-pulse': isForceSyncing }" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          class="text-muted-foreground hover:text-foreground w-8 h-8 md:w-9 md:h-9"
          title="Frontmatter 元数据"
          @click="openFrontmatterDrawer"
        >
          <Icon name="lucide:file-code" class="w-4 h-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          class="text-muted-foreground hover:text-foreground w-8 h-8 md:w-9 md:h-9"
          title="资源库"
          @click="openResourcesDrawer"
        >
          <Icon name="lucide:images" class="w-4 h-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          class="text-muted-foreground hover:text-foreground w-8 h-8 md:w-9 md:h-9"
          title="更多操作"
          @click="openWeChatPreview"
        >
          <Icon name="lucide:more-horizontal" class="w-4 h-4" />
        </Button>

        <!-- <Dialog v-model:open="isWorkflowDialogOpen">
          <DialogTrigger as-child>
            <Button
              variant="ghost"
              size="icon"
              :disabled="isRunningWorkflow"
              class="w-8 h-8 md:w-9 md:h-9"
              @click="loadWorkflows"
            >
              <Icon v-if="isRunningWorkflow" name="lucide:loader-2" class="w-4 h-4 animate-spin" />
              <Icon v-else name="lucide:play" class="w-4 h-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>选择流目标</DialogTitle>
              <DialogDescription>
                选择要将此笔记流到的目标。
              </DialogDescription>
            </DialogHeader>
            <div class="py-4 space-y-2 max-h-[60vh] overflow-y-auto">
              <div v-if="workflows.length === 0" class="text-center text-muted-foreground py-4">
                未找到流配置。 <NuxtLink to="/workflows" class="text-primary hover:underline">
                  创建一个
                </NuxtLink>。
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
        </Dialog> -->

        <Button
          variant="ghost"
          size="icon"
          class="text-muted-foreground hover:text-foreground w-8 h-8 md:w-9 md:h-9"
          title="纯净模式"
          @click="togglePureMode"
        >
          <Icon name="lucide:maximize-2" class="w-4 h-4" />
        </Button>

        <!-- <NuxtLink to="/settings">
          <Button variant="ghost" size="icon" class="text-muted-foreground hover:text-foreground w-8 h-8 md:w-9 md:h-9">
            <Icon name="lucide:settings" class="w-4 h-4 md:w-5 md:h-5" />
          </Button>
        </NuxtLink> -->
      </div>
    </header>

    <!-- Editor Area -->
    <div ref="editorContainerRef" class="flex-1 bg-background relative overflow-y-auto min-h-0">
      <MdEditorCrepe
        :key="noteId || 'new'"
        v-model="content"
        :is-dark="resolvedTheme === 'dark'"
        :read-only="isEditorReadOnly"
        @save="saveNote"
        @upload-img="onUploadImg"
      />
      <!-- Save Status Indicator -->
      <AppActionStatusIndicator :status="saveStatus" class="bottom-8 right-4" />

      <!-- Exit Pure Mode Button -->
      <Transition
        enter-active-class="transition duration-300 ease-out"
        enter-from-class="opacity-0 -translate-y-4"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition duration-200 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-4"
      >
        <Button
          v-if="isPureMode"
          variant="outline"
          size="icon"
          class="fixed top-4 right-4 z-50 rounded-full shadow-md bg-background/60 backdrop-blur-md border-primary/10 hover:border-primary/30 hover:bg-background/80 group w-8 h-8"
          title="退出纯净模式"
          @click="togglePureMode"
        >
          <Icon name="lucide:minimize-2" class="w-4 h-4 group-hover:scale-110 transition-transform" />
        </Button>
      </Transition>
    </div>

    <!-- WeChat Preview Drawer -->
    <Drawer :open="isWeChatPreviewOpen" @update:open="(val) => !val && closeWeChatPreview()">
      <DrawerContent class="h-auto">
        <DrawerHeader class="text-left">
          <DrawerTitle>更多操作</DrawerTitle>
        </DrawerHeader>
        <div class="px-4 pb-4 pt-2">
          <div class="flex gap-2">
            <Button @click="copyMarkdown">
              <Icon name="lucide:file-code" class="w-4 h-4 " />
            </Button>
            <Button @click="copyWeChatMinimalHtml">
              <Icon name="lucide:copy" class="w-4 h-4 " />
            </Button>
            <Button
              :disabled="!wxDraftReady || isUploadingToDraft"
              :title="!wxDraftWorkflow ? '请先在设置中生成微信工作流' : !wxDraftReady ? '请先配置所需环境变量' : '发送到微信草稿箱'"
              @click="sendToWxDraft"
            >
              <Icon v-if="isUploadingToDraft" name="lucide:loader-2" class="w-4 h-4  animate-spin" />
              <Icon v-else name="ri:wechat-fill" class="w-4 h-4 " />
            </Button>
            <Button v-if="isDesktop" title="保存到本地" @click="saveToLocalFile">
              <Icon name="lucide:download" class="w-4 h-4 " />
            </Button>
            <!-- <DrawerClose as-child>
              <Button variant="ghost" size="sm" @click="closeWeChatPreview">
                关闭
              </Button>
            </DrawerClose> -->
          </div>
        </div>
      </DrawerContent>
    </Drawer>

    <!-- Resources Drawer -->
    <Drawer v-model:open="isResourcesDrawerOpen">
      <DrawerContent class="max-h-[85vh] flex flex-col">
        <DrawerHeader class="text-left shrink-0">
          <DrawerTitle>资源库</DrawerTitle>
        </DrawerHeader>
        <div class="flex-1 overflow-y-auto px-4 pb-4">
          <div v-if="isAssetsLoading" class="flex justify-center py-8">
            <Icon name="lucide:loader-2" class="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
          <div v-else-if="assetsList.length === 0" class="text-center text-muted-foreground py-8">
            暂无资源
          </div>
          <div v-else class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div v-for="asset in assetsList" :key="asset.id" class="flex flex-col gap-2">
              <div class="aspect-square bg-muted/30 rounded-lg overflow-hidden border relative">
                <img :src="asset.url" class="w-full h-full object-cover" :alt="asset.filename" loading="lazy">
              </div>
              <div class="flex items-center gap-1">
                <Button variant="outline" size="sm" class="flex-1 h-8 px-0" title="复制链接" @click="copyAssetUrl(asset.url)">
                  <Icon name="lucide:link" class="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" class="flex-1 h-8 px-0" title="复制 Markdown" @click="copyAssetMarkdown(asset)">
                  <Icon name="lucide:file-code" class="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>

    <!-- Frontmatter Drawer -->
    <AppFrontmatterDrawer
      v-model:open="isFrontmatterDrawerOpen"
      :frontmatter-fields="frontmatterFields"
      :tags="tags"
      :created-at="noteCreatedAt"
      :updated-at="noteUpdatedAt"
      @update:title="handleFrontmatterTitleUpdate"
    />
  </div>
</template>
