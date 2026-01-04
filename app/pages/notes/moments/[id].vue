<script setup lang="ts">
import type { Moment } from '~/types/models'
import type { Workflow } from '~/types/workflow'
import { useColorMode } from '@vueuse/core'
import { MdPreview } from 'md-editor-v3'
import { toast } from 'vue-sonner'
import { useMomentRepository } from '~/composables/repositories/useMomentRepository'
import { useWorkflowRepository } from '~/composables/repositories/useWorkflowRepository'
import { useWorkflowRunner } from '~/composables/useWorkflowRunner'
import { WORKFLOW_TYPES } from '~/types/workflow'

import 'md-editor-v3/lib/style.css'

const route = useRoute()
const router = useRouter()
const { getMoment, deleteMoment } = useMomentRepository()
const { getAllWorkflows, getAllWorkflowsWithSystem } = useWorkflowRepository()
const { runWorkflow } = useWorkflowRunner()

const momentId = computed(() => Number(route.params.id))
const moment = ref<Moment | null>(null)
const isLoading = ref(true)
const imagesList = ref<string[]>([])
const tagsList = ref<string[]>([])
const activeImageIndex = ref(0)

const colorMode = useColorMode({
  emitAuto: true,
})

const resolvedTheme = computed(() => {
  if (colorMode.value !== 'auto')
    return colorMode.value
  return (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'
})

// Workflow State
const isWorkflowDialogOpen = ref(false)
const workflows = ref<Workflow[]>([])
const isRunningWorkflow = ref(false)

async function loadMoment() {
  isLoading.value = true
  try {
    const data = await getMoment(momentId.value)
    if (data) {
      moment.value = data
      imagesList.value = data.images ? JSON.parse(data.images) : []
      tagsList.value = data.tags ? JSON.parse(data.tags) : []

      useHead({
        title: data.content ? `${data.content.slice(0, 20)}... - 动态` : '动态详情 - ZotePad',
      })
    }
    else {
      toast.error('动态不存在')
      router.push('/notes/moments')
    }
  }
  catch (e) {
    console.error(e)
    toast.error('加载失败')
  }
  finally {
    isLoading.value = false
  }
}

const formatTime = (timestamp?: number | string) => {
  if (!timestamp)
    return ''
  let dateVal = timestamp
  if (typeof timestamp === 'string' && !timestamp.includes('Z') && !timestamp.includes('+') && timestamp.includes(' ')) {
    dateVal = `${timestamp.replace(' ', 'T')}Z`
  }
  const date = new Date(dateVal)
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function handleDelete() {
  toast('确定要删除这条动态吗？', {
    action: {
      label: '删除',
      onClick: async () => {
        try {
          await deleteMoment(momentId.value)
          toast.success('删除成功')
          router.push('/notes/moments')
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

// Workflow Logic (Reused)
async function handleRunSystemWorkflow(type: string) {
  if (!moment.value)
    return

  if (workflows.value.length === 0) {
    try {
      workflows.value = await getAllWorkflowsWithSystem() || []
    }
    catch (e) {
      console.error(e)
      toast.error('加载流配置失败')
      return
    }
  }

  const workflow = workflows.value.find(w => w.type === type)
  if (!workflow) {
    toast.error('未找到对应的系统流')
    return
  }

  if (!moment.value.content || !moment.value.content.trim()) {
    toast.error('内容不能为空')
    return
  }

  isRunningWorkflow.value = true
  try {
    const steps = JSON.parse(workflow.steps)
    const ctx = {
      title: moment.value.content.slice(0, 20),
      content: moment.value.content,
      html: '',
      tags: tagsList.value,
      images: imagesList.value,
      photos: imagesList.value,
      created_at: moment.value.created_at,
      id: moment.value.id,
    }

    let schemaFields: any[] = []
    if (workflow.schema && workflow.schema.fields) {
      try {
        schemaFields = JSON.parse(workflow.schema.fields)
      }
      catch (e) { console.error(e) }
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
  }
}

async function openWorkflowDialog() {
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
  if (!moment.value)
    return
  isRunningWorkflow.value = true
  isWorkflowDialogOpen.value = false

  try {
    const steps = JSON.parse(workflow.steps)
    const ctx = {
      title: '',
      content: moment.value.content,
      html: '',
      tags: tagsList.value,
      images: imagesList.value,
      photos: imagesList.value,
      created_at: moment.value.created_at,
      id: moment.value.id,
    }

    let schemaFields: any[] = []
    if (workflow.schema && workflow.schema.fields) {
      try {
        schemaFields = JSON.parse(workflow.schema.fields)
      }
      catch (e) { console.error(e) }
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
  }
}

onMounted(() => {
  loadMoment()
})
</script>

<template>
  <div class="h-full flex flex-col bg-background max-w-7xl mx-auto w-full shadow-2xl border-x">
    <!-- Header -->
    <div class="flex items-center gap-2 p-4 border-b shrink-0">
      <Button variant="ghost" size="icon" @click="router.back()">
        <Icon name="lucide:arrow-left" class="w-5 h-5" />
      </Button>
      <div class="flex-1" />
      <Button variant="ghost" size="icon" @click="handleRunSystemWorkflow(WORKFLOW_TYPES.SYSTEM_WX_NEWSPIC_DRAFT)">
        <Icon name="lucide:book-open" class="w-5 h-5 text-green-600" />
      </Button>
      <Button variant="ghost" size="icon" @click="openWorkflowDialog">
        <Icon name="lucide:workflow" class="w-5 h-5" />
      </Button>
      <Button variant="ghost" size="icon" @click="router.push(`/write/moment/${momentId}`)">
        <Icon name="lucide:edit" class="w-5 h-5" />
      </Button>
      <Button variant="ghost" size="icon" class="text-destructive" @click="handleDelete">
        <Icon name="lucide:trash-2" class="w-5 h-5" />
      </Button>
    </div>

    <div v-if="isLoading" class="flex-1 flex items-center justify-center">
      <Icon name="lucide:loader-2" class="w-8 h-8 animate-spin text-muted-foreground" />
    </div>

    <div v-else-if="moment" class="flex-1 overflow-hidden">
      <!-- Layout with Images -->
      <div v-if="imagesList.length > 0" class="flex flex-col md:flex-row h-full">
        <!-- Left: Image Gallery -->
        <div class="w-full md:w-[60%] lg:w-[65%] bg-black/95 flex items-center justify-center relative group overflow-hidden shrink-0 h-[50vh] md:h-full">
          <div class="w-full h-full flex items-center justify-center p-4">
            <img
              :src="imagesList[activeImageIndex]"
              class="max-w-full max-h-full object-contain shadow-2xl"
              alt="Moment image"
            >

            <!-- Navigation Arrows -->
            <button
              v-if="imagesList.length > 1"
              class="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors backdrop-blur-md border border-white/10"
              @click="activeImageIndex = (activeImageIndex - 1 + imagesList.length) % imagesList.length"
            >
              <Icon name="lucide:chevron-left" class="w-6 h-6" />
            </button>
            <button
              v-if="imagesList.length > 1"
              class="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors backdrop-blur-md border border-white/10"
              @click="activeImageIndex = (activeImageIndex + 1) % imagesList.length"
            >
              <Icon name="lucide:chevron-right" class="w-6 h-6" />
            </button>

            <!-- Dots Indicator -->
            <div v-if="imagesList.length > 1" class="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 px-3 py-1.5 rounded-full bg-black/20 backdrop-blur-sm border border-white/5">
              <button
                v-for="(_, idx) in imagesList"
                :key="idx"
                class="w-1.5 h-1.5 rounded-full transition-all"
                :class="idx === activeImageIndex ? 'bg-white w-3' : 'bg-white/40 hover:bg-white/60'"
                @click="activeImageIndex = idx"
              />
            </div>
          </div>
        </div>

        <!-- Right: Content -->
        <div class="flex-1 flex flex-col h-full overflow-hidden bg-card border-l">
          <ScrollArea class="flex-1">
            <div class="p-6 md:p-8 space-y-6">
              <!-- Author Info -->
              <div class="flex items-center gap-3 pb-6 border-b border-border/40">
                <div class="w-10 h-10 rounded-full bg-primary/5 flex items-center justify-center border border-border/50">
                  <Icon name="lucide:user" class="w-5 h-5 text-primary/80" />
                </div>
                <div>
                  <div class="font-medium text-sm">
                    我
                  </div>
                  <div class="text-xs text-muted-foreground mt-0.5">
                    {{ formatTime(moment.created_at) }}
                  </div>
                </div>
              </div>

              <!-- Content -->
              <div class="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-headings:font-medium">
                <MdPreview :model-value="moment.content" :theme="resolvedTheme" preview-theme="github" :code-foldable="false" />
              </div>

              <!-- Tags -->
              <div v-if="tagsList.length > 0" class="flex flex-wrap gap-2 pt-4">
                <span
                  v-for="(tag, idx) in tagsList"
                  :key="idx"
                  class="px-2.5 py-0.5 bg-secondary/50 text-secondary-foreground text-xs rounded-md border border-transparent hover:border-border transition-colors cursor-default"
                >
                  # {{ tag }}
                </span>
              </div>
            </div>
          </ScrollArea>

          <!-- Bottom Actions -->
          <div class="p-4 border-t bg-muted/5 backdrop-blur-sm">
            <div class="flex items-center justify-between text-xs text-muted-foreground">
              <div class="flex items-center gap-4">
                <span class="flex items-center gap-1.5">
                  <Icon name="lucide:image" class="w-3.5 h-3.5" />
                  {{ imagesList.length }}
                </span>
                <span class="flex items-center gap-1.5">
                  <Icon name="lucide:align-left" class="w-3.5 h-3.5" />
                  {{ moment.content?.length || 0 }} 字
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Layout without Images (Text Only) -->
      <div v-else class="h-full flex flex-col items-center bg-muted/5 p-4 md:p-8 overflow-y-auto">
        <div class="w-full max-w-2xl bg-card shadow-sm border rounded-xl overflow-hidden flex flex-col my-auto">
          <div class="p-6 md:p-10 space-y-8">
            <!-- Header -->
            <div class="flex items-center justify-between pb-6 border-b border-border/40">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-primary/5 flex items-center justify-center border border-border/50">
                  <Icon name="lucide:user" class="w-5 h-5 text-primary/80" />
                </div>
                <div>
                  <div class="font-medium text-sm">
                    我
                  </div>
                  <div class="text-xs text-muted-foreground mt-0.5">
                    {{ formatTime(moment.created_at) }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Content -->
            <div class="prose prose-base dark:prose-invert max-w-none prose-p:leading-loose prose-headings:font-medium min-h-[200px]">
              <MdPreview :model-value="moment.content" :theme="resolvedTheme" preview-theme="github" :code-foldable="false" />
            </div>

            <!-- Tags -->
            <div v-if="tagsList.length > 0" class="flex flex-wrap gap-2 pt-2">
              <span
                v-for="(tag, idx) in tagsList"
                :key="idx"
                class="px-2.5 py-0.5 bg-secondary/50 text-secondary-foreground text-xs rounded-md border border-transparent hover:border-border transition-colors cursor-default"
              >
                # {{ tag }}
              </span>
            </div>
          </div>

          <!-- Footer -->
          <div class="px-6 md:px-10 py-4 bg-muted/5 border-t flex justify-end">
            <span class="text-xs text-muted-foreground flex items-center gap-1.5">
              <Icon name="lucide:align-left" class="w-3.5 h-3.5" />
              {{ moment.content?.length || 0 }} 字
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Workflow Dialog -->
    <Dialog v-model:open="isWorkflowDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>选择流目标</DialogTitle>
        </DialogHeader>
        <div class="py-4 space-y-2 max-h-[60vh] overflow-y-auto">
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
