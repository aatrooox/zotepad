<script setup lang="ts">
import type { Moment } from '~/types/models'
import type { Workflow } from '~/types/workflow'
import gsap from 'gsap'
import { toast } from 'vue-sonner'
import { useMomentRepository } from '~/composables/repositories/useMomentRepository'
import { useSyncManager } from '~/composables/settings/useSyncManager'
import { useWorkflowRunner } from '~/composables/useWorkflowRunner'

useHead({ title: '动态 - ZotePad' })

const router = useRouter()
// const logger = useLog()
const { getAllMoments, deleteMoment } = useMomentRepository()
// const { getAllWorkflows, getAllWorkflowsWithSystem } = useWorkflowRepository()
const { runWorkflow } = useWorkflowRunner()
const { syncTable, syncMode } = useSyncManager()
const { isDesktop } = useEnvironment()

// const colorMode = useColorMode({
//   emitAuto: true,
// })

// 获取实际生效的主题
// const resolvedTheme = computed(() => {
//   if (colorMode.value !== 'auto')
//     return colorMode.value
//   return (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'
// })

interface MomentDisplay extends Moment {
  imagesList: string[]
  tagsList: string[]
}

const moments = ref<MomentDisplay[]>([])
const isLoading = ref(false)

// Workflow State
const isWorkflowDialogOpen = ref(false)
const workflows = ref<Workflow[]>([])
const isRunningWorkflow = ref(false)
const currentMoment = ref<MomentDisplay | null>(null)

async function loadMoments(silent = false) {
  if (!silent)
    isLoading.value = true
  try {
    const rawMoments = await getAllMoments() || []
    console.log(`[loadMoments] 从数据库查询到 ${rawMoments.length} 条动态`)

    moments.value = rawMoments.map((m, index) => {
      try {
        return {
          ...m,
          imagesList: m.images ? JSON.parse(m.images) : [],
          tagsList: m.tags ? JSON.parse(m.tags) : [],
        }
      }
      catch (parseError) {
        console.error(`[loadMoments] 动态 #${m.id} (index ${index}) JSON 解析失败:`, parseError)
        return {
          ...m,
          imagesList: [],
          tagsList: [],
        }
      }
    })

    console.log(`[loadMoments] 成功处理 ${moments.value.length} 条动态`)
    if (!silent)
      nextTick(() => animateMomentCards())
  }
  catch (e) {
    console.error('[loadMoments] 加载动态失败:', e)
    if (!silent)
      toast.error('加载动态失败')
  }
  finally {
    if (!silent)
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

const formatMomentTime = (timestamp?: number | string) => {
  if (!timestamp)
    return ''

  let dateVal = timestamp
  if (typeof timestamp === 'string' && !timestamp.includes('Z') && !timestamp.includes('+') && timestamp.includes(' ')) {
    dateVal = `${timestamp.replace(' ', 'T')}Z`
  }

  const date = new Date(dateVal)
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

function handleCreateMoment() {
  router.push('/write/moment/new')
}

function handleMomentClick(id: number) {
  router.push(`/notes/moments/${id}`)
}

function handleDeleteMoment(id: number, event: Event) {
  event.stopPropagation()
  toast('确定要删除这条动态吗？', {
    action: {
      label: '删除',
      onClick: async () => {
        try {
          const index = moments.value.findIndex(m => m.id === id)
          if (index !== -1) {
            moments.value.splice(index, 1)
          }

          await deleteMoment(id)
          toast.success('删除成功')
        }
        catch (e) {
          console.error(e)
          toast.error('删除失败')
          await loadMoments()
        }
      },
    },
    cancel: { label: '取消' },
  })
}

// async function handleRunSystemWorkflow(type: string, moment: MomentDisplay, event: Event) {
//   event.stopPropagation()
//   if (!moment)
//     return

//   if (workflows.value.length === 0) {
//     try {
//       workflows.value = await getAllWorkflowsWithSystem() || []
//     }
//     catch (e) {
//       console.error(e)
//       toast.error('加载流配置失败')
//       return
//     }
//   }

//   const workflow = workflows.value.find(w => w.type === type)
//   if (!workflow) {
//     toast.error('未找到对应的系统流，请在设置中启用')
//     return
//   }

//   if (!moment.content || !moment.content.trim()) {
//     toast.error('发布到公众号必须包含文字内容')
//     return
//   }

//   isRunningWorkflow.value = true
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
//       title: moment.content ? moment.content.slice(0, 20) : '分享图片',
//       content: moment.content,
//       html: '',
//       tags: moment.tagsList || [],
//       images: moment.imagesList || [],
//       photos: moment.imagesList || [],
//       created_at: moment.created_at,
//       id: moment.id,
//     }

//     let schemaFields: any[] = []
//     if (workflow.schema && workflow.schema.fields) {
//       try {
//         schemaFields = JSON.parse(workflow.schema.fields)
//       }
//       catch (e) {
//         console.error('Failed to parse schema fields', e)
//       }
//     }

//     toast.info(`正在执行流: ${workflow.name}`)
//     const result = await runWorkflow(steps, ctx, schemaFields)

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

// async function openWorkflowDialog(moment: MomentDisplay, event: Event) {
//   event.stopPropagation()
//   currentMoment.value = moment
//   try {
//     workflows.value = await getAllWorkflows() || []
//     isWorkflowDialogOpen.value = true
//   }
//   catch (e) {
//     console.error(e)
//     toast.error('加载流配置失败')
//   }
// }

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

// 初始化
onMounted(async () => {
  // 1. Load local data immediately
  await loadMoments()

  // 2. Sync in background - 仅移动端且自动模式
  if (!isDesktop.value && syncMode.value === 'auto') {
    console.log('[Moments] 自动模式，触发 moments 表同步')
    syncTable('moments', true).then((result) => {
      console.log(`[Moments同步] moments: 拉取 ${result?.pulled || 0} 条, 推送 ${result?.pushed || 0} 条`)
      loadMoments(true)
    }).catch((e: any) => {
      console.error('Moments页面初始化同步失败:', e)
      if (e.message?.includes('配置') || e.message?.includes('网络')) {
        toast.warning('后台同步失败，可在设置中配置局域网同步')
      }
    })
  }
})
</script>

<template>
  <div class="p-4 md:p-6 space-y-6 pb-safe min-h-full">
    <!-- Action Buttons -->
    <div class="flex items-center justify-end mb-4">
      <Button
        size="sm"
        class="rounded-full shadow-sm hover:shadow-md transition-all"
        @click="handleCreateMoment"
      >
        <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
        发布动态
      </Button>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center h-64">
      <Icon name="lucide:loader-2" class="w-8 h-8 animate-spin text-muted-foreground" />
    </div>

    <!-- Moments List (Waterfall) -->
    <div v-else class="pb-20">
      <!-- Empty State -->
      <div v-if="moments.length === 0" class="h-[40vh] flex flex-col items-center justify-center text-muted-foreground space-y-6 animate-in fade-in zoom-in duration-500">
        <div class="w-20 h-20 bg-muted/50 rounded-full flex items-center justify-center mb-4 shadow-inner">
          <Icon name="lucide:camera" class="w-8 h-8 opacity-40" />
        </div>
        <div class="text-center space-y-1">
          <h3 class="text-lg font-semibold text-foreground">
            暂无动态
          </h3>
          <p class="max-w-xs mx-auto text-sm text-balance">
            发布您的第一条动态以分享生活。
          </p>
        </div>
      </div>

      <div v-else class="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4 space-y-4">
        <div
          v-for="moment in moments"
          :key="moment.id"
          class="moment-card break-inside-avoid bg-card border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all group cursor-pointer"
          @click="handleMomentClick(moment.id)"
        >
          <!-- Cover Image -->
          <div v-if="moment.imagesList && moment.imagesList.length > 0" class="relative aspect-[3/4] w-full overflow-hidden bg-muted/20">
            <img
              :src="moment.imagesList[0]"
              class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              alt="Moment cover"
              loading="lazy"
            >
            <div v-if="moment.imagesList.length > 1" class="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
              <Icon name="lucide:images" class="w-3 h-3" />
              {{ moment.imagesList.length }}
            </div>
          </div>

          <!-- Content -->
          <div class="p-4 space-y-3">
            <!-- Text Content -->
            <div v-if="moment.content" class="text-sm text-foreground/90 line-clamp-2">
              {{ moment.content }}
            </div>

            <!-- Tags -->
            <div v-if="moment.tagsList && moment.tagsList.length > 0" class="flex flex-wrap gap-1.5">
              <span
                v-for="(tag, idx) in moment.tagsList.slice(0, 3)"
                :key="idx"
                class="text-xs text-muted-foreground"
              >
                #{{ tag }}
              </span>
              <span v-if="moment.tagsList.length > 3" class="text-xs text-muted-foreground">...</span>
            </div>

            <!-- Footer -->
            <div class="flex items-center justify-between pt-2 border-t border-border/50">
              <span class="text-xs text-muted-foreground">
                {{ formatMomentTime(moment.created_at) }}
              </span>

              <!-- Actions (Hover only) -->
              <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-6 w-6 hover:text-destructive"
                  @click="(e: MouseEvent) => handleDeleteMoment(moment.id, e)"
                >
                  <Icon name="lucide:trash-2" class="w-3.5 h-3.5" />
                </Button>
              </div>
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
.moment-card {
  backface-visibility: hidden;
}
</style>
