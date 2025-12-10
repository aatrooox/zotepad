<script setup lang="ts">
import type { ToolbarNames } from 'md-editor-v3'
import type { Workflow } from '~/types/workflow'
import { writeHtml } from '@tauri-apps/plugin-clipboard-manager'
import { useClipboard, useDebounceFn, useWindowSize } from '@vueuse/core'
import gsap from 'gsap'
import { MdEditor, MdPreview } from 'md-editor-v3'
import { toast } from 'vue-sonner'
import { useEnvironmentRepository } from '~/composables/repositories/useEnvironmentRepository'
import { useNoteRepository } from '~/composables/repositories/useNoteRepository'
import { useSettingRepository } from '~/composables/repositories/useSettingRepository'
import { useWorkflowRepository } from '~/composables/repositories/useWorkflowRepository'
import { useSyncManager } from '~/composables/settings/useSyncManager'
import { useCOSService } from '~/composables/useCOSService'
import { useWorkflowRunner } from '~/composables/useWorkflowRunner'
import { WORKFLOW_TYPES } from '~/types/workflow'
import { copyToClipboard, getWeChatMinimalHTML } from '~/utils/wechat-formatter'
import 'md-editor-v3/lib/style.css'

useHead({ title: 'ZotePad - Editor' })

const route = useRoute()
const router = useRouter()
const { width } = useWindowSize()
const { copy } = useClipboard()
const isMobile = computed(() => width.value < 768)

const content = ref('')
const title = ref('')
const tags = ref<string[]>([])
const newTag = ref('')
const noteId = ref<number | null>(null)
const htmlContent = ref('')
const customCss = ref('')
const editorContainerRef = ref(null)
const saveStatus = ref<'idle' | 'saving' | 'saved'>('idle')

// Keyboard safe area padding (mobile)
const keyboardPadding = ref(0)
const keyboardSafeStyle = computed(() => ({
  paddingBottom: `calc(${keyboardPadding.value}px + env(safe-area-inset-bottom, 0px))`,
}))

// const updateKeyboardInset = () => {
//   if (typeof window === 'undefined' || !window.visualViewport)
//     return

//   const vv = window.visualViewport
//   const inset = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop))
//   keyboardPadding.value = inset
// }

// WeChat preview drawer state
const isWeChatPreviewOpen = ref(false)
const wechatPreviewRef = ref<HTMLElement | null>(null)

const { getNote, createNote, updateNote } = useNoteRepository()
const { getSetting } = useSettingRepository()
const { getAllWorkflows, getSystemWorkflow } = useWorkflowRepository()
const { getAllEnvs } = useEnvironmentRepository()
const { runWorkflow } = useWorkflowRunner()
const { uploadFile } = useCOSService()

// 同步管理
const { syncOnce } = useSyncManager()

// 添加调试日志
// console.log('[Notes] syncOnce 函数:', syncOnce)

// Workflow state
const isWorkflowDialogOpen = ref(false)
const workflows = ref<Workflow[]>([])
const isRunningWorkflow = ref(false)

// 微信草稿箱系统工作流状态
const wxDraftWorkflow = ref<Workflow | null>(null)
const wxDraftReady = ref(false) // 工作流存在且环境变量已配置
const isUploadingToDraft = ref(false)
const WX_REQUIRED_ENVS = ['ZZCLUB_PAT', 'WX_APPID', 'WX_APPSECRET']

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

const loadWorkflows = async () => {
  try {
    workflows.value = await getAllWorkflows() || []
  }
  catch (e) {
    console.error(e)
    toast.error('加载流配置失败')
  }
}

const handleRunWorkflow = async (workflow: Workflow) => {
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
      title: title.value,
      content: content.value,
      html: htmlContent.value,
      tags: tags.value,
      noteId: noteId.value,
    }

    let schemaFields = []
    if (workflow.schema && workflow.schema.fields) {
      try {
        schemaFields = JSON.parse(workflow.schema.fields)
      }
      catch (e) {
        console.error('Failed to parse schema fields', e)
        toast.error('Schema 解析失败，将使用完整上下文')
      }
    }

    toast.info(`正在执行流: ${workflow.name}`)
    const result = await runWorkflow(steps, ctx, schemaFields)

    // Check for errors in logs
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
  }
}

// Inject Custom CSS
useHead({
  style: computed(() => customCss.value ? [{ children: customCss.value, id: 'custom-css' }] : []),
})

// Editor configuration
const toolbars: ToolbarNames[] = [
  'bold',
  'underline',
  'italic',
  '-',
  'title',
  'strikeThrough',
  'sub',
  'sup',
  'quote',
  'unorderedList',
  'orderedList',
  'task',
  '-',
  'codeRow',
  'code',
  'link',
  'image',
  'table',
  'mermaid',
  'katex',
  '-',
  'revoke',
  'next',
  'save',
  '=',
  'pageFullscreen',
  'fullscreen',
  'preview',
  'htmlPreview',
  'catalog',
]

// Mobile specific toolbar (simplified)
const mobileToolbars: ToolbarNames[] = [
  'bold',
  'underline',
  'italic',
  'codeRow',
  'image',
  'link',
  'quote',
  'code',
  'mermaid',
  '-',
  'save',
]

// Auto-save logic
const saveNote = async () => {
  if (!content.value && !title.value)
    return

  const startTime = Date.now()
  saveStatus.value = 'saving'

  try {
    if (noteId.value) {
      await updateNote(noteId.value, title.value, content.value, tags.value)
    }
    else {
      const id = await createNote(title.value || '无标题笔记', content.value, tags.value)
      if (id) {
        noteId.value = id
        // Update URL to reflect the new ID without reloading
        router.replace({ params: { id: id.toString() } })
      }
    }

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

    // 保存成功后触发同步(不等待完成,避免阻塞)
    syncOnce(true).catch(e => console.error('[Notes] 同步失败:', e))
  }
  catch (e) {
    console.error('Auto-save failed', e)
    toast.error('自动保存失败')
    saveStatus.value = 'idle'
  }
}

const debouncedSave = useDebounceFn(saveNote, 1000)
const currentToolbars = computed(() => isMobile.value ? mobileToolbars : toolbars)

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

watch([content, title], () => {
  debouncedSave()
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

  // Keyboard inset listener for Android 15+ / mobile
  // if (typeof window !== 'undefined' && window.visualViewport) {
  //   window.visualViewport.addEventListener('resize', updateKeyboardInset)
  //   window.visualViewport.addEventListener('scroll', updateKeyboardInset)
  //   updateKeyboardInset()
  // }

  try {
    // 检查微信草稿箱工作流
    await checkWxDraftWorkflow()

    // Load Custom CSS
    customCss.value = await getSetting('custom_css') || ''

    const idParam = route.params.id

    if (idParam === 'new') {
      // Initialize new note
      noteId.value = null
      content.value = ''
      title.value = ''
      tags.value = []
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
            tags.value = note.tags ? JSON.parse(note.tags) : []
          }
          catch {
            tags.value = []
          }
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

onBeforeUnmount(() => {
  if (typeof window !== 'undefined' && window.visualViewport) {
    // window.visualViewport.removeEventListener('resize', updateKeyboardInset)
    // window.visualViewport.removeEventListener('scroll', updateKeyboardInset)
  }
})

const onSave = () => {
  saveNote()
}

const onHtmlChanged = (h: string) => {
  htmlContent.value = h
}

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
  isWeChatPreviewOpen.value = true
}

// 精简版复制 - 适用于手机端公众号助手
const copyWeChatMinimalHtml = async () => {
  await nextTick()

  const previewDom = wechatPreviewRef.value?.querySelector('.md-editor-preview') as HTMLElement
  if (!previewDom) {
    toast.error('预览内容未加载')
    return
  }

  try {
    const finalHtml = getWeChatMinimalHTML(previewDom)
    const success = await copyToClipboard(finalHtml)
    if (success) {
      toast.success('已复制')
      isWeChatPreviewOpen.value = false
    }
    else {
      await writeHtml(finalHtml, previewDom.textContent || '内容已复制')
      toast.success('已复制')
      isWeChatPreviewOpen.value = false
    }
  }
  catch (e) {
    console.error('WeChat minimal copy failed', e)
    toast.error('格式化复制失败')
  }
}

// 发送到微信草稿箱
const sendToWxDraft = async () => {
  if (!wxDraftWorkflow.value || !wxDraftReady.value) {
    toast.error('请先在设置中配置微信公众号工作流')
    return
  }

  await nextTick()

  const previewDom = wechatPreviewRef.value?.querySelector('.md-editor-preview') as HTMLElement
  if (!previewDom) {
    toast.error('预览内容未加载')
    return
  }

  isUploadingToDraft.value = true
  try {
    // 获取处理后的 HTML 和图片列表
    const finalHtml = getWeChatMinimalHTML(previewDom)

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
      // toast.success('已成功上传到草稿箱！')
      isWeChatPreviewOpen.value = false
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

const onUploadImg = async (files: Array<File>, callback: (urls: Array<string>) => void) => {
  const uploadPromises = files.map(file => uploadFile(file))
  try {
    const results = await Promise.all(uploadPromises)
    const urls = results.map(r => r.url)
    callback(urls)
  }
  catch (e) {
    console.error(e)
    toast.error('图片上传失败')
  }
}
</script>

<template>
  <div
    class="relative min-h-[100dvh] flex flex-col bg-background pt-safe-offset-4 md:pt-0 overflow-auto md:overflow-hidden"
    :style="keyboardSafeStyle"
  >
    <!-- Header / Toolbar Area -->
    <header class="md:border-b px-4 md:px-6 py-3 md:py-4 flex items-start justify-between bg-background/80 backdrop-blur-md z-10 shrink-0 md:mt-0 gap-2">
      <div class="flex flex-col flex-1 gap-2 md:gap-3 min-w-0">
        <!-- 移动端返回按钮 -->
        <div class="flex items-center gap-2 md:hidden">
          <Button variant="ghost" size="icon" class="shrink-0 -ml-2" @click="router.push('/')">
            <Icon name="lucide:arrow-left" class="w-5 h-5" />
          </Button>
          <input
            v-model="title"
            class="bg-transparent font-bold text-lg focus:outline-none text-foreground placeholder:text-muted-foreground/50 w-full tracking-tight"
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
          variant="ghost"
          size="icon"
          class="text-muted-foreground hover:text-foreground w-8 h-8 md:w-9 md:h-9"
          title="复制 Markdown"
          @click="copyMarkdown"
        >
          <Icon name="lucide:copy" class="w-4 h-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          class="text-muted-foreground hover:text-foreground w-8 h-8 md:w-9 md:h-9"
          title="复制为微信公众号格式"
          @click="openWeChatPreview"
        >
          <Icon name="ri:wechat-fill" class="w-4 h-4" />
        </Button>

        <Dialog v-model:open="isWorkflowDialogOpen">
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
        </Dialog>

        <NuxtLink to="/settings">
          <Button variant="ghost" size="icon" class="text-muted-foreground hover:text-foreground w-8 h-8 md:w-9 md:h-9">
            <Icon name="lucide:settings" class="w-4 h-4 md:w-5 md:h-5" />
          </Button>
        </NuxtLink>
      </div>
    </header>

    <!-- Editor Area -->
    <div ref="editorContainerRef" class="flex-1 bg-background relative pb-safe overflow-auto md:overflow-hidden">
      <ClientOnly>
        <MdEditor
          v-model="content"
          theme="light"
          class="!h-full w-full"
          :toolbars="currentToolbars"
          :preview="false"
          :editable="true"
          preview-theme="github"
          :code-foldable="false"
          :show-code-row="true"
          @on-save="onSave"
          @on-html-changed="onHtmlChanged"
          @on-upload-img="onUploadImg"
        />
      </ClientOnly>

      <!-- Save Status Indicator -->
      <AppActionStatusIndicator :status="saveStatus" class="bottom-8 right-4" />
    </div>

    <!-- WeChat Preview Drawer -->
    <Drawer v-model:open="isWeChatPreviewOpen">
      <DrawerContent class="max-h-[85vh] flex flex-col">
        <DrawerHeader class="text-left shrink-0">
          <DrawerTitle>微信公众号预览</DrawerTitle>
          <DrawerDescription>预览移动端样式，点击复制按钮将 HTML 复制到剪贴板</DrawerDescription>
        </DrawerHeader>
        <div class="flex-1 overflow-y-auto px-4 pb-4">
          <!-- 居中显示的移动端宽度容器 -->
          <div class="mx-auto" style="max-width: 850px;">
            <!-- 模拟手机屏幕外框 -->
            <div class="bg-muted/30 rounded-2xl p-3 border border-border/50">
              <!-- 手机顶部状态栏模拟 -->
              <div class="flex items-center justify-center mb-2">
                <div class="w-20 h-1 bg-muted-foreground/20 rounded-full" />
              </div>
              <!-- 内容区域 -->
              <div
                ref="wechatPreviewRef"
                class="bg-white rounded-xl overflow-hidden shadow-sm p-4"
              >
                <ClientOnly>
                  <MdPreview
                    :model-value="content"
                    preview-theme="github"
                    :code-foldable="false"
                    class="wechat-preview-content"
                  />
                </ClientOnly>
              </div>
            </div>
          </div>
        </div>
        <!-- 悬浮在底部的按钮区域 -->
        <div class="shrink-0 border-t bg-background px-4 py-4">
          <div class="mx-auto flex flex-col gap-2" style="max-width: 375px;">
            <div class="flex gap-2">
              <Button class="flex-1" @click="copyWeChatMinimalHtml">
                <Icon name="lucide:copy" class="w-4 h-4 mr-2" />
                复制样式
              </Button>
              <Button
                class="flex-1"
                :disabled="!wxDraftReady || isUploadingToDraft"
                :title="!wxDraftWorkflow ? '请先在设置中生成微信工作流' : !wxDraftReady ? '请先配置所需环境变量' : '发送到微信草稿箱'"
                @click="sendToWxDraft"
              >
                <Icon v-if="isUploadingToDraft" name="lucide:loader-2" class="w-4 h-4 mr-2 animate-spin" />
                <Icon v-else name="ri:wechat-fill" class="w-4 h-4 mr-2" />
                发送到草稿箱
              </Button>
            </div>
            <DrawerClose as-child>
              <Button variant="ghost" size="sm">
                关闭
              </Button>
            </DrawerClose>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  </div>
</template>

<style>
/* Customize MdEditor to fit Shadcn/Tailwind theme if needed */
.md-editor {
  --md-bk-color: hsl(var(--background));
  --md-color: hsl(var(--foreground));
  --md-border-color: hsl(var(--border));
}

/* 强制编辑器输入区域使用系统无衬线字体，覆盖默认的等宽字体 */
.md-editor-input .cm-editor {
  font-family:
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    'Helvetica Neue',
    Arial,
    'Noto Sans',
    sans-serif !important;
}

.md-editor-toolbar-wrapper {
  border-bottom: 1px solid hsl(var(--border) / 0.5) !important;
}

/* Mobile: move toolbar to bottom for easier typing */
@media (max-width: 767px) {
  .md-editor {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }

  .md-editor-toolbar-wrapper {
    order: 2;
    border-top: 1px solid hsl(var(--border) / 0.5) !important;
    border-bottom: 0 !important;
    position: sticky;
    bottom: 0;
    z-index: 10;
    background: hsl(var(--background));
  }

  .md-editor-content {
    order: 1;
    min-height: 0;
  }
}

/* WeChat Preview Styles */
.wechat-preview-content {
  --md-bk-color: #ffffff;
  --md-color: #333333;
}

.wechat-preview-content .md-editor-preview-wrapper {
  padding: 16px !important;
}
</style>
