<script setup lang="ts">
import type { ToolbarNames } from 'md-editor-v3'
import type { Moment } from '~/types/models'
import { useFileDialog, useWindowSize } from '@vueuse/core'
import gsap from 'gsap'
import { MdEditor, MdPreview } from 'md-editor-v3'
import { toast } from 'vue-sonner'
import { useMomentRepository } from '~/composables/repositories/useMomentRepository'
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

useHead({ title: '动态 - ZotePad' })

// const { width } = useWindowSize()
// const isMobile = computed(() => width.value < 768)

// Repositories
const { createMoment, getAllMoments, deleteMoment } = useMomentRepository()
const { getAllWorkflows } = useWorkflowRepository()
const { runWorkflow } = useWorkflowRunner()
const { uploadFile } = useCOSService()

// State
const content = ref('')
interface MomentDisplay extends Moment {
  imagesList: string[]
  tagsList: string[]
}
const moments = ref<MomentDisplay[]>([])
const isLoading = ref(false)
const isPublishing = ref(false)
const tags = ref<string[]>([])
const newTag = ref('')
const images = ref<string[]>([])
const isUploading = ref(false)

// File Dialog
const { open, onChange } = useFileDialog({
  accept: 'image/*',
  multiple: true,
})

onChange(async (files) => {
  if (!files || files.length === 0)
    return

  isUploading.value = true
  const uploadPromises = Array.from(files).map(file => uploadFile(file))

  try {
    const results = await Promise.all(uploadPromises)
    images.value.push(...results.map(r => r.url))
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

// Workflow State
const isWorkflowDialogOpen = ref(false)
const workflows = ref<Workflow[]>([])
const isRunningWorkflow = ref(false)
const currentMoment = ref<MomentDisplay | null>(null)

// Editor Config
const toolbars: ToolbarNames[] = [
  'bold',
  'italic',
  'underline',
  '-',
  'link',
  'code',
  '-',
  'preview',
]

// Load Data
async function loadMoments() {
  isLoading.value = true
  try {
    const rawMoments = await getAllMoments() || []
    moments.value = rawMoments.map(m => ({
      ...m,
      imagesList: m.images ? JSON.parse(m.images) : [],
      tagsList: m.tags ? JSON.parse(m.tags) : [],
    }))
    nextTick(() => animateCards())
  }
  catch (e) {
    console.error(e)
    toast.error('加载动态失败')
  }
  finally {
    isLoading.value = false
  }
}

function getGridClass(count: number) {
  if (count === 2 || count === 4)
    return 'grid-cols-2 w-2/3 sm:w-1/2 lg:w-1/3'
  if (count >= 3 && count <= 9)
    return 'grid-cols-3 w-full sm:w-3/4 lg:w-1/2'
  return 'grid-cols-4 w-full sm:w-full lg:w-2/3'
}

function animateCards() {
  gsap.fromTo(
    '.moment-card',
    { opacity: 0, y: 20 },
    { opacity: 1, y: 0, duration: 0.4, stagger: 0.05, ease: 'back.out(1.2)', clearProps: 'all' },
  )
}

onMounted(() => {
  loadMoments()
})

// Actions
function handleAddTag() {
  const tag = newTag.value.trim()
  if (tag && !tags.value.includes(tag)) {
    tags.value.push(tag)
  }
  newTag.value = ''
}

function handleRemoveTag(index: number) {
  tags.value.splice(index, 1)
}

function handleRemoveImage(index: number) {
  images.value.splice(index, 1)
}

async function handlePublish() {
  if (!content.value.trim() && images.value.length === 0) {
    toast.warning('请输入内容或上传图片')
    return
  }

  isPublishing.value = true
  try {
    await createMoment(content.value, images.value, tags.value)
    toast.success('发布成功')
    content.value = ''
    tags.value = []
    images.value = []
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

function handleDelete(id: number) {
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
    cancel: {
      label: '取消',
    },
  })
}

// Workflow Logic
async function openWorkflowDialog(moment: MomentDisplay) {
  currentMoment.value = moment
  try {
    workflows.value = await getAllWorkflows() || []
    isWorkflowDialogOpen.value = true
  }
  catch (e) {
    console.error(e)
    toast.error('加载推送配置失败')
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
      toast.error('无效的推送步骤')
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

    console.log('[Moment] Preparing workflow context:', ctx)
    console.log('[Moment] Current moment data:', currentMoment.value)

    let schemaFields = []
    if (workflow.schema && workflow.schema.fields) {
      try {
        schemaFields = JSON.parse(workflow.schema.fields)
      }
      catch (e) {
        console.error('Failed to parse schema fields', e)
      }
    }

    toast.info(`正在执行推送: ${workflow.name}`)
    const result = await runWorkflow(steps, ctx, schemaFields)

    const errors = result.logs.filter(l => l.status === 'error')
    if (errors.length > 0 && errors[0]) {
      toast.error(`推送失败: ${errors[0].error}`)
    }
    else {
      toast.success('推送执行成功')
    }
  }
  catch (e: any) {
    console.error(e)
    toast.error(`推送执行失败: ${e.message}`)
  }
  finally {
    isRunningWorkflow.value = false
    currentMoment.value = null
  }
}
</script>

<template>
  <div class="h-screen flex flex-col bg-background overflow-hidden">
    <!-- Mobile Header -->
    <div class="flex md:hidden px-4 pb-3 pt-safe-offset-4 items-center justify-between mt-2 shrink-0">
      <span class="text-lg font-bold tracking-tight">动态 <span class="text-sm font-normal text-muted-foreground ml-1">{{ moments.length }}</span></span>
    </div>

    <div class="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 md:space-y-8 pb-safe">
      <!-- Editor Section -->
      <div class="bg-card border rounded-xl shadow-sm overflow-hidden">
        <div class="h-[200px]">
          <ClientOnly>
            <MdEditor
              v-model="content"
              theme="light"
              preview-theme="github"
              class="!h-full w-full"
              :toolbars="toolbars"
              :preview="false"
              placeholder="分享当下的想法..."
            />
          </ClientOnly>
        </div>

        <!-- Image Preview -->
        <div v-if="images.length > 0" class="px-4 py-2 border-t bg-muted/10 grid grid-cols-4 gap-2">
          <div v-for="(img, index) in images" :key="index" class="relative group aspect-square rounded-md overflow-hidden border bg-background">
            <img :src="img" class="w-full h-full object-cover" alt="Uploaded image">
            <button
              class="absolute top-1 right-1 p-1 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
              @click="handleRemoveImage(index)"
            >
              <Icon name="lucide:x" class="w-3 h-3" />
            </button>
          </div>
        </div>

        <!-- Tags Input -->
        <div class="px-4 py-2 border-t bg-muted/10 flex flex-wrap items-center gap-2">
          <div v-for="(tag, index) in tags" :key="index" class="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs rounded-full">
            <span>#{{ tag }}</span>
            <button class="hover:text-destructive" @click="handleRemoveTag(index)">
              <Icon name="lucide:x" class="w-3 h-3" />
            </button>
          </div>
          <div class="flex items-center gap-2">
            <Icon name="lucide:hash" class="w-4 h-4 text-muted-foreground" />
            <input
              v-model="newTag"
              type="text"
              placeholder="添加标签..."
              class="bg-transparent text-sm outline-none min-w-[80px] placeholder:text-muted-foreground/70"
              @keydown.enter.prevent="handleAddTag"
              @blur="handleAddTag"
            >
          </div>
        </div>

        <div class="px-4 py-3 bg-muted/30 border-t flex justify-between items-center">
          <div class="text-xs text-muted-foreground">
            <Button variant="ghost" size="sm" class="gap-2" :disabled="isUploading" @click="open()">
              <Icon v-if="isUploading" name="lucide:loader-2" class="w-4 h-4 animate-spin" />
              <Icon v-else name="lucide:image" class="w-4 h-4" />
              <span>{{ isUploading ? '上传中...' : '上传图片' }}</span>
            </Button>
          </div>
          <Button :disabled="isPublishing || (!content.trim() && images.length === 0)" @click="handlePublish">
            <Icon v-if="isPublishing" name="lucide:loader-2" class="w-4 h-4 mr-2 animate-spin" />
            <Icon v-else name="lucide:send" class="w-4 h-4 mr-2" />
            发布
          </Button>
        </div>
      </div>

      <!-- Moments List -->
      <div class="space-y-4 pb-10">
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
            <div class="flex gap-2  transition-opacity">
              <Button variant="ghost" size="icon" class="h-8 w-8" @click="openWorkflowDialog(moment)">
                <Icon name="lucide:workflow" class="w-4 h-4 text-primary" />
              </Button>
              <Button variant="ghost" size="icon" class="h-8 w-8 hover:text-destructive" @click="handleDelete(moment.id)">
                <Icon name="lucide:trash-2" class="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div class="prose prose-sm dark:prose-invert max-w-none mb-3">
            <MdPreview :model-value="moment.content" preview-theme="github" :code-foldable="false" />
          </div>

          <!-- Moment Images -->
          <div v-if="moment.imagesList && moment.imagesList.length > 0" class="mb-3">
            <!-- Single Image -->
            <div v-if="moment.imagesList.length === 1">
              <img
                :src="moment.imagesList[0]"
                class="max-h-[300px] max-w-[70%] rounded-lg border bg-muted/20 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                alt="Moment image"
                loading="lazy"
                @click="() => { /* TODO: Image preview */ }"
              >
            </div>
            <!-- Multiple Images Grid -->
            <div
              v-else
              class="grid gap-1.5"
              :class="getGridClass(moment.imagesList.length)"
            >
              <div
                v-for="(img, idx) in moment.imagesList"
                :key="idx"
                class="aspect-square rounded-md overflow-hidden border bg-muted/20 cursor-pointer"
                @click="() => { /* TODO: Image preview */ }"
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

    <!-- Workflow Dialog -->
    <Dialog v-model:open="isWorkflowDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>选择推送目标</DialogTitle>
          <DialogDescription>
            选择要将此动态推送到的目标。
          </DialogDescription>
        </DialogHeader>
        <div class="py-4 space-y-2 max-h-[60vh] overflow-y-auto">
          <div v-if="workflows.length === 0" class="text-center text-muted-foreground py-4">
            未找到推送配置。
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
