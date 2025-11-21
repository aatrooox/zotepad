<script setup lang="ts">
import type { ToolbarNames } from 'md-editor-v3'
import type { Workflow } from '~/types/workflow'
import { useClipboard, useDebounceFn, useWindowSize } from '@vueuse/core'
import gsap from 'gsap'
import { MdEditor } from 'md-editor-v3'
import { toast } from 'vue-sonner'
import { useNoteRepository } from '~/composables/repositories/useNoteRepository'
import { useSettingRepository } from '~/composables/repositories/useSettingRepository'
import { useWorkflowRepository } from '~/composables/repositories/useWorkflowRepository'
import { useWorkflowRunner } from '~/composables/useWorkflowRunner'
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

const { getNote, createNote, updateNote } = useNoteRepository()
const { getSetting } = useSettingRepository()
const { getAllWorkflows } = useWorkflowRepository()
const { runWorkflow } = useWorkflowRunner()

// Workflow state
const isWorkflowDialogOpen = ref(false)
const workflows = ref<Workflow[]>([])
const isRunningWorkflow = ref(false)

const loadWorkflows = async () => {
  try {
    workflows.value = await getAllWorkflows() || []
  }
  catch (e) {
    console.error(e)
    toast.error('加载工作流失败')
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
      toast.error('无效的工作流步骤')
      return
    }

    const ctx = {
      title: title.value,
      content: content.value,
      html: htmlContent.value,
      tags: tags.value,
      noteId: noteId.value,
    }

    toast.info(`正在运行工作流: ${workflow.name}`)
    const result = await runWorkflow(steps, ctx)

    // Check for errors in logs
    const errors = result.logs.filter(l => l.status === 'error')
    if (errors.length > 0 && errors[0]) {
      toast.error(`工作流失败: ${errors[0].error}`)
    }
    else {
      toast.success('工作流执行成功')
    }
  }
  catch (e: any) {
    console.error(e)
    toast.error(`工作流执行失败: ${e.message}`)
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
  'image',
  'link',
  'quote',
  'code',
  '-',
  'preview',
  'save',
]

// Auto-save logic
const saveNote = async () => {
  if (!content.value && !title.value)
    return

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
  }
  catch (e) {
    console.error('Auto-save failed', e)
    toast.error('自动保存失败')
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

  try {
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

const onSave = () => {
  saveNote()
  toast.success('保存成功')
}

const onHtmlChanged = (h: string) => {
  htmlContent.value = h
}

const copyHtml = () => {
  if (!htmlContent.value) {
    toast.error('没有可复制的内容')
    return
  }
  copy(htmlContent.value)
  toast.success('HTML 已复制到剪贴板')
}
</script>

<template>
  <div class="absolute inset-0 flex flex-col bg-background">
    <!-- Header / Toolbar Area -->
    <header class="border-b px-6 py-4 flex items-start justify-between bg-background/80 backdrop-blur-md z-10 shrink-0">
      <div class="flex flex-col flex-1 gap-3 mr-8">
        <input
          v-model="title"
          class="bg-transparent font-bold text-2xl focus:outline-none text-foreground placeholder:text-muted-foreground/50 w-full tracking-tight"
          placeholder="无标题笔记"
          @input="debouncedSave"
        >
        <div class="flex items-center gap-2 flex-wrap">
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
      <div class="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          class="text-muted-foreground hover:text-foreground"
          @click="copyHtml"
        >
          <Icon name="lucide:copy" class="w-4 h-4" />
        </Button>

        <Dialog v-model:open="isWorkflowDialogOpen">
          <DialogTrigger as-child>
            <Button
              variant="outline"
              size="sm"
              :disabled="isRunningWorkflow"
              class="gap-2"
              @click="loadWorkflows"
            >
              <Icon v-if="isRunningWorkflow" name="lucide:loader-2" class="w-4 h-4 animate-spin" />
              <Icon v-else name="lucide:play" class="w-4 h-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>选择工作流</DialogTitle>
              <DialogDescription>
                选择要在此笔记上运行的工作流。
              </DialogDescription>
            </DialogHeader>
            <div class="py-4 space-y-2 max-h-[60vh] overflow-y-auto">
              <div v-if="workflows.length === 0" class="text-center text-muted-foreground py-4">
                未找到工作流。 <NuxtLink to="/workflows" class="text-primary hover:underline">
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
          <Button variant="ghost" size="icon" class="text-muted-foreground hover:text-foreground">
            <Icon name="lucide:settings" class="w-5 h-5" />
          </Button>
        </NuxtLink>
      </div>
    </header>

    <!-- Editor Area -->
    <div ref="editorContainerRef" class="flex-1 overflow-hidden bg-background relative">
      <ClientOnly>
        <MdEditor
          v-model="content"
          theme="light"
          class="!h-full w-full"
          :toolbars="currentToolbars"
          :preview="!isMobile"
          :show-code-row="true"
          @on-save="onSave"
          @on-html-changed="onHtmlChanged"
        />
      </ClientOnly>
    </div>
  </div>
</template>

<style>
/* Customize MdEditor to fit Shadcn/Tailwind theme if needed */
.md-editor {
  --md-bk-color: hsl(var(--background));
  --md-color: hsl(var(--foreground));
  --md-border-color: hsl(var(--border));
}

.md-editor-toolbar-wrapper {
  border-bottom: 1px solid hsl(var(--border) / 0.5) !important;
}
</style>
