<script setup lang="ts">
import type { FrontmatterFields } from '~/components/ui/editor/frontmatter-handler'
import type { FileNode } from '~/composables/useLocalWorkspace'
import type { Asset } from '~/types/models'
import type { Workflow } from '~/types/workflow'
import { writeHtml } from '@tauri-apps/plugin-clipboard-manager'
import { useClipboard, useColorMode, useDebounceFn } from '@vueuse/core'
import {
  FilePlus,
  FolderOpen,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCw,
  Save,
  Settings2,
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { extractFrontmatter, parseYAML, stringifyYAML } from '~/components/ui/editor/frontmatter-handler'
import MdEditorCrepe from '~/components/ui/editor/MdEditorCrepe.vue'
import { useAssetRepository } from '~/composables/repositories/useAssetRepository'
import { useEnvironmentRepository } from '~/composables/repositories/useEnvironmentRepository'
import { useWorkflowRepository } from '~/composables/repositories/useWorkflowRepository'
import { useStorageService } from '~/composables/useStorageService'
import { useWorkflowRunner } from '~/composables/useWorkflowRunner'
import { WORKFLOW_TYPES } from '~/types/workflow'
import { copyToClipboard, getWeChatMinimalHTML } from '~/utils/wechat-formatter'

useHead({ title: '本地空间 - ZotePad' })

const {
  workspacePath,
  fileTree,
  isLoading: isTreeLoading,
  chooseWorkspace,
  refreshWorkspace,
  // readDirectory,
  loadSubNode,
  createMarkdownFile,
} = useLocalWorkspace()

const {
  currentFilePath,
  fileContent,
  isDirty,
  isLoading: isEditorLoading,
  error: editorError,
  loadFile,
  saveFile,
} = useLocalMarkdown()

const { copy } = useClipboard()
const colorMode = useColorMode({ emitAuto: true })
const { isCollapsed: isGlobalSidebarCollapsed } = useSidebar()

const isSidebarOpen = ref(true)
const isPureMode = ref(false)
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
const fileCreatedAt = ref<Date | undefined>()
const fileUpdatedAt = ref<Date | undefined>()

// Workflow state
const wxDraftWorkflow = ref<Workflow | null>(null)
const wxDraftReady = ref(false)
const isUploadingToDraft = ref(false)
const WX_REQUIRED_ENVS = ['ZZCLUB_PAT', 'WX_APPID', 'WX_APPSECRET']

// Repositories
const { createAsset, getAllAssets } = useAssetRepository()
const { getSystemWorkflow } = useWorkflowRepository()
const { getAllEnvs } = useEnvironmentRepository()
const { runWorkflow } = useWorkflowRunner()
const { uploadFiles } = useStorageService()

// Dialog State
const showConfirmDialog = ref(false)
const confirmAction = ref<(() => void) | null>(null)
const confirmMessage = ref('')

const showCreateDialog = ref(false)
const newFileName = ref('')
const createParentPath = ref('')

// Theme
const resolvedTheme = computed(() => {
  if (colorMode.value !== 'auto')
    return colorMode.value as 'light' | 'dark'
  return (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'
})

// Don't auto-expand on leave, user might prefer it collapsed,
// or we can restore previous state if we stored it.
// For now, let's keep it simple.

const triggerConfirm = (message: string, action: () => void) => {
  confirmMessage.value = message
  confirmAction.value = action
  showConfirmDialog.value = true
}

const handleConfirm = () => {
  if (confirmAction.value) {
    confirmAction.value()
  }
  showConfirmDialog.value = false
}

// Actions
const handleSelectNode = async (node: FileNode) => {
  if (node.kind === 'file') {
    // Check dirty
    if (isDirty.value && currentFilePath.value !== node.path) {
      triggerConfirm('当前文件未保存，切换将丢失更改，确认切换吗？', async () => {
        await loadFile(node.path)
        updateFileMetadata()
      })
      return
    }
    await loadFile(node.path)
    updateFileMetadata()
  }
}

const handleToggleNode = async (node: FileNode) => {
  if (node.kind === 'directory') {
    if (!node.isOpen) {
      await loadSubNode(node)
    }
    else {
      node.isOpen = false
    }
  }
}

const openCreateDialog = (parentPath: string = workspacePath.value!) => {
  createParentPath.value = parentPath
  newFileName.value = ''
  showCreateDialog.value = true
}

const confirmCreateFile = async () => {
  if (!newFileName.value.trim()) {
    toast.error('请输入文件名')
    return
  }

  showCreateDialog.value = false

  try {
    const newPath = await createMarkdownFile(createParentPath.value, newFileName.value)
    toast.success('文件创建成功')

    // Refresh to show new file
    await refreshWorkspace()

    // Open it
    await loadFile(newPath)
  }
  catch (e: any) {
    toast.error(`创建失败: ${e.message}`)
  }
}

const handleCreateFile = (parentPath: string = workspacePath.value!) => {
  openCreateDialog(parentPath)
}

const handleSave = async () => {
  // 合并 frontmatter 到文件内容
  const { content: pureContent } = extractFrontmatter(fileContent.value)

  // 更新 lastmod
  frontmatterFields.value.lastmod = new Date().toISOString()

  // 生成完整的 frontmatter YAML
  const frontmatterYAML = stringifyYAML(frontmatterFields.value)
  const finalContent = frontmatterYAML ? `---\n${frontmatterYAML}\n---\n\n${pureContent}` : pureContent

  // 临时替换 fileContent 用于保存
  const originalContent = fileContent.value
  fileContent.value = finalContent

  const success = await saveFile()

  if (success) {
    toast.success('已保存')
    // 更新修改时间
    fileUpdatedAt.value = new Date()
  }
  else {
    // 保存失败，恢复原内容
    fileContent.value = originalContent
    if (editorError.value) {
      toast.error(editorError.value)
    }
  }
}

const workspaceName = computed(() => {
  if (!workspacePath.value)
    return ''
  const parts = workspacePath.value.split(/[\\/]/)
  return parts[parts.length - 1] || workspacePath.value
})

const togglePureMode = () => {
  isPureMode.value = !isPureMode.value
  isGlobalSidebarCollapsed.value = isPureMode.value
  isSidebarOpen.value = !isPureMode.value
}

// Frontmatter 管理
function updateFileMetadata() {
  if (!currentFilePath.value || !fileContent.value)
    return

  // 从文件内容提取 frontmatter
  const { frontmatter } = extractFrontmatter(fileContent.value)

  if (frontmatter) {
    // 解析已有的 frontmatter
    const parsed = parseYAML(frontmatter)

    // 解析时间字段
    if (parsed.date) {
      fileCreatedAt.value = new Date(parsed.date as string)
    }
    if (parsed.lastmod) {
      fileUpdatedAt.value = new Date(parsed.lastmod as string)
    }

    frontmatterFields.value = {
      title: (parsed.title as string) || '无标题',
      date: parsed.date as string,
      lastmod: parsed.lastmod as string,
      tags: (parsed.tags as string[]) || [],
    }
  }
  else {
    // 没有 frontmatter，使用默认值
    const fileName = currentFilePath.value.split(/[\\/]/).pop() || '无标题'
    const title = fileName.replace(/\.md$/, '')

    const now = new Date()
    fileCreatedAt.value = now
    fileUpdatedAt.value = now

    frontmatterFields.value = {
      title,
      date: now.toISOString(),
      lastmod: now.toISOString(),
      tags: [],
    }
  }
}

const openFrontmatterDrawer = () => {
  if (!currentFilePath.value) {
    toast.error('请先打开一个文件')
    return
  }
  updateFileMetadata()
  isFrontmatterDrawerOpen.value = true
}

const handleFrontmatterTitleUpdate = (newTitle: string) => {
  // 更新 frontmatter 中的标题
  frontmatterFields.value.title = newTitle
  // toast.success('标题已更新，保存文件后生效')
}

// 检查微信草稿箱工作流是否可用
const checkWxDraftWorkflow = async () => {
  try {
    const workflow = await getSystemWorkflow(WORKFLOW_TYPES.SYSTEM_WX_DRAFT)
    wxDraftWorkflow.value = workflow

    if (!workflow) {
      wxDraftReady.value = false
      return
    }

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

// 复制原始markdown
const copyMarkdown = () => {
  if (!fileContent.value) {
    toast.error('没有可复制的内容')
    return
  }
  copy(fileContent.value)
  toast.success('Markdown 已复制到剪贴板')
}

// 打开微信预览 Drawer
const openWeChatPreview = () => {
  if (!fileContent.value) {
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
  try {
    const finalHtml = getWeChatMinimalHTML(editorDom)

    const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/g
    const photos: string[] = []
    let match = imgRegex.exec(finalHtml)
    while (match !== null) {
      if (match[1]) {
        photos.push(match[1])
      }
      match = imgRegex.exec(finalHtml)
    }

    let steps = []
    try {
      steps = JSON.parse(wxDraftWorkflow.value.steps)
    }
    catch {
      toast.error('无效的工作流步骤')
      return
    }

    if (photos.length === 0) {
      photos.push('https://img.zzao.club/zotepad/1764937926926_g2uj75oxn4p.png')
    }

    const fileName = currentFilePath.value?.split(/[\\/]/).pop() || '无标题'
    const ctx = {
      title: fileName.replace(/\.md$/, ''),
      content: fileContent.value,
      html: finalHtml,
      photos,
      tags: [],
      noteId: null,
    }

    const result = await runWorkflow(steps, ctx)

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

// 图片上传处理
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

const isReplacingBase64Images = ref(false)
const replaceBase64Images = async () => {
  if (isReplacingBase64Images.value)
    return

  const matches = fileContent.value.match(dataUrlImageRegex)
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

    let updatedContent = fileContent.value
    uniqueDataUrls.forEach((dataUrl, index) => {
      const url = urls[index]
      if (url) {
        updatedContent = updatedContent.split(dataUrl).join(url)
      }
    })

    if (updatedContent !== fileContent.value) {
      fileContent.value = updatedContent
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

watch(fileContent, () => {
  debouncedReplaceBase64Images()
})

// Initialize
onMounted(async () => {
  // Collapsed global sidebar for more space
  isGlobalSidebarCollapsed.value = true

  // Check wx draft workflow
  await checkWxDraftWorkflow()

  if (workspacePath.value) {
    await refreshWorkspace()
  }
})

onUnmounted(() => {
  if (isPureMode.value) {
    isGlobalSidebarCollapsed.value = false
  }
})
</script>

<template>
  <div class="h-full flex flex-col bg-background text-foreground overflow-hidden">
    <!-- Empty State / Setup -->
    <div v-if="!workspacePath" class="flex-1 flex flex-col items-center justify-center p-8 space-y-6">
      <div class="w-24 h-24 bg-muted/50 rounded-full flex items-center justify-center shadow-inner">
        <FolderOpen class="w-10 h-10 opacity-50" />
      </div>

      <div class="text-center space-y-2">
        <h2 class="text-2xl font-bold">
          选择本地工作空间
        </h2>
        <p class="text-muted-foreground max-w-md">
          选择一个本地文件夹作为您的笔记仓库。所有的操作都将直接反映在您的硬盘上，安全且完全可控。
        </p>
      </div>

      <Button size="lg" @click="chooseWorkspace">
        <FolderOpen class="w-5 h-5 mr-2" />
        打开文件夹
      </Button>
    </div>

    <!-- Workspace View -->
    <div v-else class="flex-1 flex overflow-hidden" :class="{ 'pt-8': isPureMode }">
      <!-- Sidebar -->
      <aside
        v-show="isSidebarOpen && !isPureMode"
        class="w-64 border-r bg-card/30 flex flex-col shrink-0 transition-all duration-300"
      >
        <!-- Sidebar Header -->
        <div class="h-12 border-b flex items-center justify-between px-3 bg-muted/20">
          <span class="font-semibold text-sm truncate" :title="workspacePath">
            {{ workspaceName }}
          </span>
          <div class="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" class="h-7 w-7" title="新建文件" @click="handleCreateFile(workspacePath!)">
              <FilePlus class="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" class="h-7 w-7" title="刷新" @click="refreshWorkspace">
              <RotateCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isTreeLoading }" />
            </Button>
            <Button variant="ghost" size="icon" class="h-7 w-7" title="切换工作区" @click="chooseWorkspace">
              <Settings2 class="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <!-- File Tree -->
        <div class="flex-1 overflow-y-auto py-2">
          <AppFileTreeView
            :tree="fileTree"
            :active-path="currentFilePath"
            @select="handleSelectNode"
            @toggle="handleToggleNode"
            @create="handleCreateFile"
          />
        </div>
      </aside>

      <!-- Main Content -->
      <main class="flex-1 flex flex-col min-w-0 bg-background relative">
        <!-- Editor Header -->
        <header class="h-12 border-b flex items-center justify-between px-4 bg-background z-10">
          <div class="flex items-center gap-3 overflow-hidden">
            <Button variant="ghost" size="icon" class="h-8 w-8 -ml-2" @click="isSidebarOpen = !isSidebarOpen">
              <PanelLeftOpen v-if="!isSidebarOpen" class="w-4 h-4" />
              <PanelLeftClose v-else class="w-4 h-4" />
            </Button>

            <div v-if="currentFilePath" class="flex flex-col overflow-hidden">
              <span class="text-sm font-medium truncate flex items-center gap-2">
                {{ currentFilePath.split(/[\\/]/).pop() }}
                <span v-if="isDirty" class="w-2 h-2 rounded-full bg-primary shrink-0" />
              </span>
              <span class="text-[10px] text-muted-foreground truncate opacity-70">
                {{ currentFilePath }}
              </span>
            </div>
            <span v-else class="text-sm text-muted-foreground">未选择文件</span>
          </div>

          <div class="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              class="text-muted-foreground hover:text-foreground w-8 h-8"
              title="Frontmatter 元数据"
              @click="openFrontmatterDrawer"
            >
              <Icon name="lucide:file-code" class="w-4 h-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              class="text-muted-foreground hover:text-foreground w-8 h-8"
              title="资源库"
              @click="openResourcesDrawer"
            >
              <Icon name="lucide:images" class="w-4 h-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              class="text-muted-foreground hover:text-foreground w-8 h-8"
              title="复制为微信公众号格式"
              @click="openWeChatPreview"
            >
              <Icon name="ri:wechat-fill" class="w-4 h-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              class="text-muted-foreground hover:text-foreground w-8 h-8"
              title="纯净模式"
              @click="togglePureMode"
            >
              <Icon name="lucide:maximize-2" class="w-4 h-4" />
            </Button>

            <Button v-if="currentFilePath" variant="outline" size="icon" :disabled="isEditorLoading" title="保存" @click="handleSave">
              <Save class="w-4 h-4" />
            </Button>
          </div>
        </header>

        <!-- Editor Body -->
        <div v-if="currentFilePath" class="flex-1 relative overflow-y-auto min-h-0">
          <MdEditorCrepe
            :key="currentFilePath"
            v-model="fileContent"
            :is-dark="resolvedTheme === 'dark'"
            :read-only="isEditorReadOnly"
            @save="handleSave"
            @upload-img="onUploadImg"
          />

          <div v-if="isEditorLoading" class="absolute inset-0 bg-background/50 flex items-center justify-center z-50">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>

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

        <!-- No File Selected -->
        <div v-else class="flex-1 flex flex-col items-center justify-center text-muted-foreground bg-muted/5">
          <div class="p-8 rounded-full bg-muted/20 mb-4">
            <FolderOpen class="w-12 h-12 opacity-30" />
          </div>
          <p>选择或创建一个 markdown 文件开始编辑</p>
        </div>
      </main>
    </div>

    <!-- Confirm Dialog (Alert) -->
    <AlertDialog v-model:open="showConfirmDialog">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认操作</AlertDialogTitle>
          <AlertDialogDescription>
            {{ confirmMessage }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="showConfirmDialog = false">
            取消
          </AlertDialogCancel>
          <AlertDialogAction @click="handleConfirm">
            确认
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- Create File Dialog -->
    <Dialog v-model:open="showCreateDialog">
      <DialogContent class="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>新建文件</DialogTitle>
          <DialogDescription>
            在 {{ createParentPath.split(/[\\/]/).pop() || '当前目录' }} 下创建 Markdown 文件
          </DialogDescription>
        </DialogHeader>
        <div class="grid gap-4 py-4">
          <div class="grid items-center gap-4">
            <Input
              id="filename"
              v-model="newFileName"
              class="col-span-3"
              placeholder="请输入文件名（无需 .md 后缀）"
              autofocus
              @keydown.enter="confirmCreateFile"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showCreateDialog = false">
            取消
          </Button>
          <Button @click="confirmCreateFile">
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- WeChat Preview Drawer -->
    <Drawer :open="isWeChatPreviewOpen" @update:open="(val) => !val && closeWeChatPreview()">
      <DrawerContent class="h-auto">
        <DrawerHeader class="text-left">
          <DrawerTitle>分享到微信公众号</DrawerTitle>
          <DrawerDescription>编辑器已切换为预览模式</DrawerDescription>
        </DrawerHeader>
        <div class="px-4 pb-4 pt-2">
          <div class="flex gap-2">
            <Button @click="copyMarkdown">
              <Icon name="lucide:file-code" class="w-4 h-4" />
            </Button>
            <Button @click="copyWeChatMinimalHtml">
              <Icon name="lucide:copy" class="w-4 h-4" />
            </Button>
            <Button
              :disabled="!wxDraftReady || isUploadingToDraft"
              :title="!wxDraftWorkflow ? '请先在设置中生成微信工作流' : !wxDraftReady ? '请先配置所需环境变量' : '发送到微信草稿箱'"
              @click="sendToWxDraft"
            >
              <Icon v-if="isUploadingToDraft" name="lucide:loader-2" class="w-4 h-4 animate-spin" />
              <Icon v-else name="ri:wechat-fill" class="w-4 h-4" />
            </Button>
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
      :tags="[]"
      :created-at="fileCreatedAt"
      :updated-at="fileUpdatedAt"
      @update:title="handleFrontmatterTitleUpdate"
    />
  </div>
</template>
