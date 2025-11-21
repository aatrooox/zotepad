<script setup lang="ts">
import type { Workflow } from '~/types/workflow'
import { toast } from 'vue-sonner'
import { useWorkflowRepository } from '~/composables/repositories/useWorkflowRepository'

useHead({ title: '工作流' })

const { getAllWorkflows, createWorkflow, deleteWorkflow } = useWorkflowRepository()
const workflows = ref<Workflow[]>([])
const router = useRouter()
const isImportDialogOpen = ref(false)
const importJson = ref('')

const loadWorkflows = async () => {
  try {
    workflows.value = await getAllWorkflows() || []
  }
  catch (e) {
    console.error(e)
    toast.error('加载工作流失败')
  }
}

onMounted(() => {
  loadWorkflows()
})

const handleCreate = async () => {
  try {
    const id = await createWorkflow('新工作流', '', [])
    if (id) {
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

    await createWorkflow(data.name, data.description || '', data.steps)
    toast.success('工作流已导入')
    isImportDialogOpen.value = false
    importJson.value = ''
    await loadWorkflows()
  }
  catch (e) {
    console.error(e)
    toast.error('导入工作流失败')
  }
}

const handleDelete = async (id: number) => {
  try {
    await deleteWorkflow(id)
    toast.success('工作流已删除')
    await loadWorkflows()
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
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <div class="h-full flex flex-col bg-background/50">
    <!-- Header -->
    <div class="px-8 py-6 flex items-center justify-between sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border/40">
      <div>
        <h1 class="text-3xl font-bold tracking-tight text-foreground">
          工作流
        </h1>
        <p class="text-muted-foreground text-sm mt-1">
          使用工作流自动化您的任务
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Button size="lg" class="rounded-full shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all duration-300" @click="handleCreate">
          <Icon name="lucide:plus" class="w-5 h-5 mr-2" />
          新建工作流
        </Button>

        <Dialog v-model:open="isImportDialogOpen">
          <DialogTrigger as-child>
            <Button variant="outline" size="lg" class="rounded-full">
              <Icon name="lucide:download" class="w-5 h-5 mr-2" />
              导入
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>导入工作流</DialogTitle>
              <DialogDescription>在下方粘贴工作流 JSON。</DialogDescription>
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

    <!-- List -->
    <div class="flex-1 overflow-y-auto p-8">
      <div v-if="workflows.length === 0" class="h-[60vh] flex flex-col items-center justify-center text-muted-foreground space-y-6 animate-in fade-in zoom-in duration-500">
        <div class="w-24 h-24 bg-muted/50 rounded-full flex items-center justify-center mb-4">
          <Icon name="lucide:workflow" class="w-10 h-10 opacity-40" />
        </div>
        <div class="text-center space-y-2">
          <h3 class="text-xl font-semibold text-foreground">
            暂无工作流
          </h3>
          <p class="max-w-xs mx-auto">
            创建您的第一个工作流以自动化任务。
          </p>
        </div>
        <Button variant="outline" size="lg" class="mt-4 rounded-full" @click="handleCreate">
          创建工作流
        </Button>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
        <Card
          v-for="workflow in workflows"
          :key="workflow.id"
          class="group hover:border-primary/50 transition-all duration-300 cursor-pointer bg-card/50 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
          @click="router.push(`/workflows/${workflow.id}`)"
        >
          <CardHeader>
            <div class="flex justify-between items-start">
              <CardTitle class="text-lg group-hover:text-primary transition-colors">
                {{ workflow.name || '无标题工作流' }}
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                class="opacity-0 group-hover:opacity-100 -mr-2 -mt-2 text-muted-foreground hover:text-destructive"
                @click.stop="handleDelete(workflow.id)"
              >
                <Icon name="lucide:trash-2" class="w-4 h-4" />
              </Button>
            </div>
            <CardDescription class="line-clamp-2 h-10">
              {{ workflow.description || '无描述' }}
            </CardDescription>
          </CardHeader>
          <CardFooter class="text-xs text-muted-foreground border-t bg-muted/20 py-3">
            <div class="flex items-center gap-2">
              <Icon name="lucide:clock" class="w-3 h-3" />
              更新于 {{ formatDate(workflow.updated_at) }}
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  </div>
</template>
