<script setup lang="ts">
import type { Workflow, WorkflowSchema, WorkflowStep } from '~/types/workflow'
import gsap from 'gsap'
import { toast } from 'vue-sonner'
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { useEnvironmentRepository } from '~/composables/repositories/useEnvironmentRepository'
import { useWorkflowRepository } from '~/composables/repositories/useWorkflowRepository'
import { useWorkflowSchemaRepository } from '~/composables/repositories/useWorkflowSchemaRepository'
import { extractWorkflowVariables, validateVariables } from '~/composables/useVariableValidator'

useHead({ title: '流' })

const { getAllWorkflowsWithSystem, createWorkflow, deleteWorkflow } = useWorkflowRepository()
const { getAllSchemas } = useWorkflowSchemaRepository()
const { getAllEnvs } = useEnvironmentRepository()

const workflows = ref<Workflow[]>([])
const schemas = ref<WorkflowSchema[]>([])
const envKeys = ref<string[]>([])
const router = useRouter()
const isImportDialogOpen = ref(false)
const isCreateDialogOpen = ref(false)
const importJson = ref('')
const cardsRef = ref<HTMLElement[]>([])

// Create Workflow Form
const newWorkflowName = ref('')
const newWorkflowDesc = ref('')
const newWorkflowSchemaId = ref<number | undefined>(undefined)

// 获取工作流的缺失变量
const getMissingVariables = (workflow: Workflow): string[] => {
  try {
    const steps: WorkflowStep[] = JSON.parse(workflow.steps)
    const usedVariables = extractWorkflowVariables(steps)
    return validateVariables(usedVariables, envKeys.value)
  }
  catch {
    return []
  }
}

const animateCards = () => {
  if (cardsRef.value.length) {
    gsap.fromTo(
      cardsRef.value,
      {
        opacity: 0,
        y: 20,
        scale: 0.95,
      },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.4,
        stagger: 0.05,
        ease: 'back.out(1.2)',
        clearProps: 'all',
      },
    )
  }
}

const loadData = async () => {
  try {
    const [wfData, schemaData, envData] = await Promise.all([
      getAllWorkflowsWithSystem(),
      getAllSchemas(),
      getAllEnvs(),
    ])
    workflows.value = wfData || []
    schemas.value = schemaData || []
    envKeys.value = envData?.map((e: any) => e.key) || []
    nextTick(() => {
      animateCards()
    })
  }
  catch (e) {
    console.error(e)
    toast.error('加载数据失败')
  }
}

onMounted(() => {
  loadData()
})

// Keep track of refs for animation
const setCardRef = (el: any) => {
  if (el && el.$el) {
    cardsRef.value.push(el.$el)
  }
  else if (el) {
    cardsRef.value.push(el)
  }
}

// Reset refs before update to avoid duplicates
onBeforeUpdate(() => {
  cardsRef.value = []
})

const openCreateDialog = () => {
  newWorkflowName.value = ''
  newWorkflowDesc.value = ''
  newWorkflowSchemaId.value = undefined
  isCreateDialogOpen.value = true
}

const handleCreate = async () => {
  if (!newWorkflowName.value) {
    toast.error('请输入工作流名称')
    return
  }

  try {
    const id = await createWorkflow(
      newWorkflowName.value,
      newWorkflowDesc.value,
      [],
      newWorkflowSchemaId.value,
    )
    if (id) {
      isCreateDialogOpen.value = false
      router.push(`/workflows/${id}`)
    }
  }
  catch {
    toast.error('创建工作流失败')
  }
}

const handleImport = async () => {
  try {
    const data = JSON.parse(importJson.value)
    if (!data.name || !Array.isArray(data.steps)) {
      toast.error('无效的工作流 JSON')
      return
    }

    // Note: Import currently doesn't handle schema mapping well unless ID matches
    // For now, we just import steps and basic info
    await createWorkflow(data.name, data.description || '', data.steps)
    toast.success('工作流已导入')
    isImportDialogOpen.value = false
    importJson.value = ''
    await loadData()
  }
  catch (e) {
    console.error(e)
    toast.error('导入工作流失败')
  }
}

const handleDelete = (id: number, event?: Event) => {
  toast('确定要删除该工作流吗？', {
    action: {
      label: '删除',
      onClick: async () => {
        try {
          // Animate deletion
          if (event && event.target) {
            const target = event.target as HTMLElement
            const card = target.closest('.workflow-card')
            if (card) {
              await gsap.to(card, {
                opacity: 0,
                scale: 0.8,
                duration: 0.2,
                ease: 'power2.in',
              })
            }
          }

          await deleteWorkflow(id)
          toast.success('工作流已删除')
          await loadData()
        }
        catch {
          toast.error('删除工作流失败')
        }
      },
    },
    cancel: {
      label: '取消',
    },
  })
}

const isSystemWorkflow = (workflow: Workflow) => workflow.type?.startsWith('system:')

const formatDate = (dateStr?: string) => {
  if (!dateStr)
    return ''
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
</script>

<template>
  <div class="h-full flex flex-col bg-background/50">
    <!-- Header - 桌面端显示完整头部，移动端精简 -->
    <div class="hidden md:flex px-8 py-6 items-center justify-between sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border/40">
      <div>
        <h1 class="text-3xl font-bold tracking-tight text-foreground">
          流
        </h1>
        <p class="text-muted-foreground text-sm mt-1">
          自动化您的任务处理流程
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Dialog v-model:open="isCreateDialogOpen">
          <DialogTrigger as-child>
            <Button size="lg" class="rounded-full shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all duration-300" @click="openCreateDialog">
              <Icon name="lucide:plus" class="w-5 h-5 mr-2" />
              新建流
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新建流</DialogTitle>
              <DialogDescription>创建一个新的自动化流。</DialogDescription>
            </DialogHeader>
            <div class="space-y-4 py-4">
              <div class="space-y-2">
                <Label>名称</Label>
                <Input v-model="newWorkflowName" placeholder="流名称" />
              </div>
              <div class="space-y-2">
                <Label>描述</Label>
                <Input v-model="newWorkflowDesc" placeholder="描述" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" @click="isCreateDialogOpen = false">
                取消
              </Button>
              <Button @click="handleCreate">
                创建
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Button variant="outline" size="lg" class="rounded-full" @click="isImportDialogOpen = true">
          <Icon name="lucide:download" class="w-5 h-5 mr-2" />
          导入
        </Button>
      </div>
    </div>

    <!-- Mobile Header Actions -->
    <div class="flex md:hidden px-4 pb-3 pt-safe-offset-4 items-center justify-between mt-2">
      <span class="text-lg font-bold tracking-tight">流 <span class="text-sm font-normal text-muted-foreground ml-1">{{ workflows.length }}</span></span>
      <div class="flex items-center gap-2">
        <Dialog v-model:open="isCreateDialogOpen">
          <DialogTrigger as-child>
            <Button size="sm" class="rounded-full" @click="openCreateDialog">
              <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
              新建
            </Button>
          </DialogTrigger>
        </Dialog>
        <Button variant="outline" size="sm" class="rounded-full" @click="isImportDialogOpen = true">
          <Icon name="lucide:download" class="w-4 h-4" />
        </Button>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-4 md:p-8 pb-safe">
      <div v-if="workflows.length === 0" class="h-[50vh] flex flex-col items-center justify-center text-muted-foreground space-y-6">
        <div class="w-20 h-20 bg-muted/50 rounded-full flex items-center justify-center mb-4">
          <Icon name="lucide:workflow" class="w-8 h-8 opacity-40" />
        </div>
        <div class="text-center space-y-2">
          <h3 class="text-lg font-semibold text-foreground">
            暂无流
          </h3>
          <p class="max-w-xs mx-auto text-sm">
            创建您的第一个流以自动化任务。
          </p>
        </div>
      </div>

      <div v-else class="flex flex-col pb-20 max-w-4xl mx-auto">
        <div
          v-for="workflow in workflows"
          :key="workflow.id"
          :ref="setCardRef"
          class="group workflow-card list-item-hover rounded-lg mb-2 border border-transparent hover:border-border/60 bg-card/30"
        >
          <div class="flex items-center p-3 md:p-4 gap-3 md:gap-4">
            <!-- Main Content Link -->
            <NuxtLink :to="`/workflows/${workflow.id}`" class="flex-1 flex items-center gap-4 min-w-0">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-3 mb-1">
                  <h3 class="font-semibold text-base truncate group-hover:text-primary transition-colors">
                    {{ workflow.name || '无标题流' }}
                  </h3>
                  <Badge v-if="isSystemWorkflow(workflow)" variant="secondary" class="text-[11px]">
                    系统流
                  </Badge>
                  <span class="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
                    <Icon name="lucide:clock" class="w-3 h-3" />
                    {{ formatDate(workflow.updated_at) }}
                  </span>
                </div>

                <div class="flex items-center gap-2">
                  <p class="text-sm text-muted-foreground truncate">
                    {{ workflow.description || '暂无描述' }}
                  </p>
                </div>
              </div>
            </NuxtLink>

            <!-- Actions -->
            <div class="flex items-center md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200 relative z-10">
              <button
                class="h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="isSystemWorkflow(workflow)"
                @click.stop.prevent="(e) => handleDelete(workflow.id, e)"
              >
                <Icon name="lucide:trash-2" class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- 缺失变量警告 - 放在卡片底部，NuxtLink 外面 -->
          <div v-if="getMissingVariables(workflow).length > 0" class="px-3 md:px-4 pb-3">
            <AppMissingEnvDrawer
              :missing-variables="getMissingVariables(workflow)"
              variant="inline"
              @saved="loadData"
            />
          </div>
        </div>
      </div>
    </div>
    <!-- Import Drawer -->
    <Drawer v-model:open="isImportDialogOpen">
      <DrawerContent>
        <div class="mx-auto w-full max-w-sm">
          <DrawerHeader>
            <DrawerTitle>导入流</DrawerTitle>
            <DrawerDescription>在下方粘贴流 JSON。</DrawerDescription>
          </DrawerHeader>
          <div class="p-4 pb-0">
            <Textarea v-model="importJson" placeholder="{ ... }" class="font-mono text-xs min-h-[200px] max-h-[50vh] overflow-y-auto" />
          </div>
          <DrawerFooter>
            <Button @click="handleImport">
              导入
            </Button>
            <DrawerClose as-child>
              <Button variant="outline">
                取消
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  </div>
</template>
