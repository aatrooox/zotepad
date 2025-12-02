<script setup lang="ts">
import type { Workflow, WorkflowSchema } from '~/types/workflow'
import gsap from 'gsap'
import { toast } from 'vue-sonner'
import SchemaList from '~/components/workflow/SchemaList.vue'
import { useWorkflowRepository } from '~/composables/repositories/useWorkflowRepository'
import { useWorkflowSchemaRepository } from '~/composables/repositories/useWorkflowSchemaRepository'

useHead({ title: '推送' })

const { getAllWorkflows, createWorkflow, deleteWorkflow } = useWorkflowRepository()
const { getAllSchemas } = useWorkflowSchemaRepository()

const workflows = ref<Workflow[]>([])
const schemas = ref<WorkflowSchema[]>([])
const router = useRouter()
const isImportDialogOpen = ref(false)
const isCreateDialogOpen = ref(false)
const importJson = ref('')
const activeTab = ref('workflows')
const cardsRef = ref<HTMLElement[]>([])

// Create Workflow Form
const newWorkflowName = ref('')
const newWorkflowDesc = ref('')
const newWorkflowSchemaId = ref<number | undefined>(undefined)

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
    const [wfData, schemaData] = await Promise.all([
      getAllWorkflows(),
      getAllSchemas(),
    ])
    workflows.value = wfData || []
    schemas.value = schemaData || []
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

const handleDelete = async (id: number, event?: Event) => {
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
}

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
          推送
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
              新建推送
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新建推送</DialogTitle>
              <DialogDescription>创建一个新的自动化推送。</DialogDescription>
            </DialogHeader>
            <div class="space-y-4 py-4">
              <div class="space-y-2">
                <Label>名称</Label>
                <Input v-model="newWorkflowName" placeholder="推送名称" />
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

        <Dialog v-model:open="isImportDialogOpen">
          <DialogTrigger as-child>
            <Button variant="outline" size="lg" class="rounded-full">
              <Icon name="lucide:download" class="w-5 h-5 mr-2" />
              导入
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>导入推送</DialogTitle>
              <DialogDescription>在下方粘贴推送 JSON。</DialogDescription>
            </DialogHeader>
            <Textarea v-model="importJson" placeholder="{ ... }" rows="10" class="font-mono text-xs" />
            <DialogFooter>
              <Button @click="handleImport">
                导入
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>

    <!-- Mobile Header Actions -->
    <div class="flex md:hidden px-4 py-3 items-center justify-end gap-2 border-b border-border/40">
      <Dialog v-model:open="isCreateDialogOpen">
        <DialogTrigger as-child>
          <Button size="sm" class="rounded-full" @click="openCreateDialog">
            <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
            新建
          </Button>
        </DialogTrigger>
      </Dialog>
      <Dialog v-model:open="isImportDialogOpen">
        <DialogTrigger as-child>
          <Button variant="outline" size="sm" class="rounded-full">
            <Icon name="lucide:download" class="w-4 h-4" />
          </Button>
        </DialogTrigger>
      </Dialog>
    </div>

    <!-- Tabs -->
    <div class="flex-1 overflow-hidden flex flex-col">
      <Tabs v-model="activeTab" class="flex-1 flex flex-col">
        <div class="px-8 pt-4 border-b bg-background/50">
          <TabsList>
            <TabsTrigger value="workflows">
              我的推送
            </TabsTrigger>
            <!-- <TabsTrigger value="schemas">
              Schema 管理
            </TabsTrigger> -->
          </TabsList>
        </div>

        <div class="flex-1 overflow-y-auto p-4 md:p-8">
          <TabsContent value="workflows" class="mt-0 h-full">
            <div v-if="workflows.length === 0" class="h-[50vh] flex flex-col items-center justify-center text-muted-foreground space-y-6">
              <div class="w-20 h-20 bg-muted/50 rounded-full flex items-center justify-center mb-4">
                <Icon name="lucide:workflow" class="w-8 h-8 opacity-40" />
              </div>
              <div class="text-center space-y-2">
                <h3 class="text-lg font-semibold text-foreground">
                  暂无推送
                </h3>
                <p class="max-w-xs mx-auto text-sm">
                  创建您的第一个推送以自动化任务。
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
                          {{ workflow.name || '无标题推送' }}
                        </h3>
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
                  <div class="flex items-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 relative z-10">
                    <button
                      class="h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full transition-colors cursor-pointer"
                      @click.stop.prevent="(e) => handleDelete(workflow.id, e)"
                    >
                      <Icon name="lucide:trash-2" class="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <!-- <TabsContent value="schemas" class="mt-0">
            <SchemaList />
          </TabsContent> -->
        </div>
      </Tabs>
    </div>
  </div>
</template>
