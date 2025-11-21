<script setup lang="ts">
import type { Workflow, WorkflowStep } from '~/types/workflow'
import { useClipboard } from '@vueuse/core'
import { toast } from 'vue-sonner'
import { useWorkflowRepository } from '~/composables/repositories/useWorkflowRepository'

interface HeaderItem {
  id: string
  key: string
  value: string
}

interface EditableWorkflowStep extends WorkflowStep {
  headersList: HeaderItem[]
}

const route = useRoute()
const router = useRouter()
const { getWorkflow, updateWorkflow } = useWorkflowRepository()
const { copy } = useClipboard()

const workflow = ref<Workflow | null>(null)
const steps = ref<EditableWorkflowStep[]>([])
const isLoading = ref(true)
const isSaving = ref(false)

const workflowId = computed(() => Number(route.params.id))

const generateId = () => {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36)
}

const loadWorkflow = async () => {
  isLoading.value = true
  try {
    const data = await getWorkflow(workflowId.value)
    if (data) {
      workflow.value = data
      try {
        const parsedSteps = JSON.parse(data.steps)
        steps.value = parsedSteps.map((step: any) => ({
          ...step,
          headersList: Object.entries(step.headers || {}).map(([key, value]) => ({
            id: generateId(),
            key,
            value: String(value),
          })),
        }))
      }
      catch {
        steps.value = []
      }
    }
    else {
      toast.error('未找到工作流')
      router.push('/workflows')
    }
  }
  catch (e) {
    console.error(e)
    toast.error('加载工作流失败')
  }
  finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadWorkflow()
})

const handleSave = async () => {
  if (!workflow.value)
    return

  isSaving.value = true
  try {
    const stepsToSave = steps.value.map((step) => {
      const headers = step.headersList.reduce((acc, item) => {
        if (item.key)
          acc[item.key] = item.value
        return acc
      }, {} as Record<string, string>)

      // Create a clean step object without headersList
      const { headersList: _, ...rest } = step
      return { ...rest, headers }
    })

    await updateWorkflow(
      workflowId.value,
      workflow.value.name,
      workflow.value.description || '',
      stepsToSave,
    )
    toast.success('工作流已保存')
  }
  catch (e) {
    console.error(e)
    toast.error('保存工作流失败')
  }
  finally {
    isSaving.value = false
  }
}

const handleExport = () => {
  if (!workflow.value)
    return

  const exportData = {
    name: workflow.value.name,
    description: workflow.value.description,
    steps: steps.value,
  }

  copy(JSON.stringify(exportData, null, 2))
  toast.success('工作流 JSON 已复制到剪贴板')
}

const addStep = (type: 'api' | 'javascript') => {
  const newStep: EditableWorkflowStep = {
    id: generateId(),
    name: type === 'api' ? '新 API 请求' : '新脚本',
    type,
    url: type === 'api' ? 'https://api.example.com' : undefined,
    method: 'GET',
    script: type === 'javascript' ? 'return ctx;' : undefined,
    headersList: [],
  }
  steps.value.push(newStep)
}

const addHeader = (step: EditableWorkflowStep) => {
  step.headersList.push({
    id: generateId(),
    key: '',
    value: '',
  })
}

const removeHeader = (step: EditableWorkflowStep, index: number) => {
  step.headersList.splice(index, 1)
}

const removeStep = (index: number) => {
  steps.value.splice(index, 1)
}

const moveStep = (index: number, direction: 'up' | 'down') => {
  if (direction === 'up' && index > 0) {
    const temp = steps.value[index]
    const prev = steps.value[index - 1]
    if (temp && prev) {
      steps.value[index] = prev
      steps.value[index - 1] = temp
    }
  }
  else if (direction === 'down' && index < steps.value.length - 1) {
    const temp = steps.value[index]
    const next = steps.value[index + 1]
    if (temp && next) {
      steps.value[index] = next
      steps.value[index + 1] = temp
    }
  }
}
</script>

<template>
  <div class="h-full flex flex-col bg-background/50">
    <!-- Header -->
    <div class="px-8 py-4 flex items-center justify-between sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border/40">
      <div class="flex items-center gap-4">
        <Button variant="ghost" size="icon" @click="router.back()">
          <Icon name="lucide:arrow-left" class="w-5 h-5" />
        </Button>
        <div>
          <h1 class="text-xl font-bold tracking-tight text-foreground">
            编辑工作流
          </h1>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="outline" :disabled="isSaving" @click="handleExport">
          <Icon name="lucide:share" class="w-4 h-4 mr-2" />
          导出
        </Button>
        <Button variant="outline" :disabled="isSaving" @click="loadWorkflow">
          重置
        </Button>
        <Button :disabled="isSaving" @click="handleSave">
          <Icon v-if="isSaving" name="lucide:loader-2" class="w-4 h-4 mr-2 animate-spin" />
          <Icon v-else name="lucide:save" class="w-4 h-4 mr-2" />
          保存
        </Button>
      </div>
    </div>

    <!-- Content -->
    <div v-if="isLoading" class="flex-1 flex items-center justify-center">
      <Icon name="lucide:loader-2" class="w-8 h-8 animate-spin text-muted-foreground" />
    </div>

    <div v-else-if="workflow" class="flex-1 overflow-y-auto p-8">
      <div class="max-w-4xl mx-auto space-y-8">
        <!-- Basic Info -->
        <Card>
          <CardHeader>
            <CardTitle>基本信息</CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="space-y-2">
              <Label>名称</Label>
              <Input v-model="workflow.name" placeholder="工作流名称" />
            </div>
            <div class="space-y-2">
              <Label>描述</Label>
              <Textarea v-model="workflow.description" placeholder="描述" rows="3" />
            </div>
          </CardContent>
        </Card>

        <!-- Steps -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold">
              步骤
            </h2>
            <div class="flex gap-2">
              <Button size="sm" variant="outline" @click="addStep('api')">
                <Icon name="lucide:globe" class="w-4 h-4 mr-2" />
                添加 API 请求
              </Button>
              <Button size="sm" variant="outline" @click="addStep('javascript')">
                <Icon name="lucide:code" class="w-4 h-4 mr-2" />
                添加脚本
              </Button>
            </div>
          </div>

          <div v-if="steps.length === 0" class="text-center py-12 border-2 border-dashed rounded-lg text-muted-foreground">
            未定义步骤。添加一个步骤以开始。
          </div>

          <div v-else class="space-y-4">
            <Card v-for="(step, index) in steps" :key="step.id" class="relative group">
              <CardHeader class="pb-3">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <Badge variant="outline" class="uppercase text-xs font-bold">
                      {{ step.type }}
                    </Badge>
                    <Input v-model="step.name" class="h-8 w-64 font-medium" />
                  </div>
                  <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" :disabled="index === 0" @click="moveStep(index, 'up')">
                      <Icon name="lucide:arrow-up" class="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" :disabled="index === steps.length - 1" @click="moveStep(index, 'down')">
                      <Icon name="lucide:arrow-down" class="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" class="text-destructive hover:text-destructive" @click="removeStep(index)">
                      <Icon name="lucide:trash-2" class="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent class="space-y-4">
                <!-- API Step Fields -->
                <template v-if="step.type === 'api'">
                  <div class="flex gap-2">
                    <Select v-model="step.method">
                      <SelectTrigger class="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GET">
                          GET
                        </SelectItem>
                        <SelectItem value="POST">
                          POST
                        </SelectItem>
                        <SelectItem value="PUT">
                          PUT
                        </SelectItem>
                        <SelectItem value="DELETE">
                          DELETE
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Input v-model="step.url" placeholder="https://api.example.com/endpoint" class="flex-1 font-mono text-sm" />
                  </div>

                  <Accordion type="single" collapsible>
                    <AccordionItem value="headers">
                      <AccordionTrigger>请求头</AccordionTrigger>
                      <AccordionContent>
                        <div class="space-y-2">
                          <div v-for="(header, hIndex) in step.headersList" :key="header.id" class="flex gap-2">
                            <Input v-model="header.key" placeholder="键" class="flex-1 h-8" />
                            <Input v-model="header.value" placeholder="值" class="flex-1 h-8" />
                            <Button variant="ghost" size="icon" class="h-8 w-8" @click="removeHeader(step, hIndex)">
                              <Icon name="lucide:x" class="w-4 h-4" />
                            </Button>
                          </div>
                          <Button variant="outline" size="sm" class="w-full" @click="addHeader(step)">
                            <Icon name="lucide:plus" class="w-3 h-3 mr-2" />
                            添加请求头
                          </Button>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="body">
                      <AccordionTrigger>请求体</AccordionTrigger>
                      <AccordionContent>
                        <Textarea v-model="step.body" placeholder="{ 'key': 'value' }" class="font-mono text-sm" rows="5" />
                        <div v-pre class="text-xs text-muted-foreground mt-1">
                          使用 {{variable}} 插入动态值。
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </template>

                <!-- Script Step Fields -->
                <template v-if="step.type === 'javascript'">
                  <div class="space-y-2">
                    <Label>脚本</Label>
                    <Textarea v-model="step.script" class="font-mono text-sm" rows="8" placeholder="// return { ...ctx, newKey: 'value' }" />
                    <div class="text-xs text-muted-foreground">
                      可用上下文: <code>ctx</code>。返回新上下文或数据以合并。
                    </div>
                  </div>
                </template>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
