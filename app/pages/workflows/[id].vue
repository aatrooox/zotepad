<script setup lang="ts">
import type { Workflow, WorkflowSchema, WorkflowStep } from '~/types/workflow'
import { useClipboard } from '@vueuse/core'
import { toast } from 'vue-sonner'
import { useEnvironmentRepository } from '~/composables/repositories/useEnvironmentRepository'
import { useWorkflowRepository } from '~/composables/repositories/useWorkflowRepository'
import { useWorkflowSchemaRepository } from '~/composables/repositories/useWorkflowSchemaRepository'
import { extractStepVariables, extractWorkflowVariables, validateVariables } from '~/composables/useVariableValidator'

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
const { getAllSchemas } = useWorkflowSchemaRepository()
const { getAllEnvs } = useEnvironmentRepository()
const { copy } = useClipboard()

const workflow = ref<Workflow | null>(null)
const schemas = ref<WorkflowSchema[]>([])
const envKeys = ref<string[]>([])
const steps = ref<EditableWorkflowStep[]>([])
const isLoading = ref(true)
const isSaving = ref(false)

const workflowId = computed(() => Number(route.params.id))

const availableVariables = computed(() => {
  // Base variables (always available in Note context)
  const vars = [
    { name: 'title', desc: '笔记标题' },
    { name: 'content', desc: '笔记 Markdown 内容' },
    { name: 'html', desc: '笔记 HTML 内容' },
    { name: 'tags', desc: '标签数组' },
    { name: 'photos', desc: '图片数组' },
    { name: 'noteId', desc: '笔记 ID' },
    { name: 'system.timestamp', desc: '当前时间戳' },
    { name: 'system.date', desc: 'ISO 日期字符串' },
    { name: 'system.locale_date', desc: '本地化日期字符串' },
  ]

  // 添加前序步骤输出变量提示 (step1, step2, ...)
  // 注意：这里只显示通用提示，实际字段取决于 API 响应
  steps.value.forEach((_, index) => {
    const stepNum = index + 1
    vars.push({ name: `step${stepNum}`, desc: `第 ${stepNum} 步的输出结果` })
    vars.push({ name: `step${stepNum}.data`, desc: `第 ${stepNum} 步返回的 data` })
    vars.push({ name: `step${stepNum}.code`, desc: `第 ${stepNum} 步返回的 code` })
  })

  // Add variables from selected schema if available
  // if (workflow.value?.schema_id) {
  //   const selectedSchema = schemas.value.find(s => s.id === workflow.value?.schema_id)
  //   if (selectedSchema) {
  //     try {
  //       const fields = JSON.parse(selectedSchema.fields)
  //       // Merge schema fields, avoiding duplicates if they match base vars
  //       fields.forEach((f: any) => {
  //         if (!vars.some(v => v.name === f.key)) {
  //           vars.push({ name: f.key, desc: f.description || f.label })
  //         }
  //       })
  //     }
  //     catch (e) {
  //       console.error('Failed to parse schema fields for hints', e)
  //     }
  //   }
  // }

  const envVars = envKeys.value.map(k => ({
    name: `env.${k}`,
    desc: '环境变量 (Secret)',
  }))

  return [...vars, ...envVars]
})

// 检测所有步骤中的缺失变量
const missingVariables = computed(() => {
  const stepsAsWorkflowSteps: WorkflowStep[] = steps.value.map((step) => {
    const headers = step.headersList.reduce((acc, item) => {
      if (item.key) {
        acc[item.key] = item.value
      }
      return acc
    }, {} as Record<string, string>)
    return { ...step, headers }
  })
  const usedVariables = extractWorkflowVariables(stepsAsWorkflowSteps)
  return validateVariables(usedVariables, envKeys.value)
})

// 获取单个步骤的缺失变量
const getStepMissingVariables = (step: EditableWorkflowStep): string[] => {
  const headers = step.headersList.reduce((acc, item) => {
    if (item.key) {
      acc[item.key] = item.value
    }
    return acc
  }, {} as Record<string, string>)
  const stepWithHeaders: WorkflowStep = { ...step, headers }
  const usedVariables = extractStepVariables(stepWithHeaders)
  return validateVariables(usedVariables, envKeys.value)
}

const generateId = () => {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36)
}

const loadData = async () => {
  isLoading.value = true
  try {
    const [wfData, schemaData, envData] = await Promise.all([
      getWorkflow(workflowId.value),
      getAllSchemas(),
      getAllEnvs(),
    ])

    if (envData) {
      envKeys.value = envData.map(e => e.key)
    }

    if (wfData) {
      workflow.value = wfData
      try {
        const parsedSteps = JSON.parse(wfData.steps)
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

    schemas.value = schemaData || []
  }
  catch (e) {
    console.error(e)
    toast.error('加载数据失败')
  }
  finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadData()
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
      workflow.value.schema_id,
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
    schema_id: workflow.value.schema_id,
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
  <div class="h-full flex flex-col bg-background/50 pt-safe-offset-4 md:pt-0">
    <!-- Header -->
    <div class="px-4 md:px-8 py-3 md:py-4 flex items-center justify-between sticky top-0 z-10 bg-background/80 backdrop-blur-md md:border-b md:border-border/40 md:mt-0">
      <div class="flex items-center gap-2 md:gap-4">
        <Button variant="ghost" size="icon" @click="router.back()">
          <Icon name="lucide:arrow-left" class="w-5 h-5" />
        </Button>
        <div>
          <h1 class="text-lg md:text-xl font-bold tracking-tight text-foreground">
            编辑流
          </h1>
        </div>
      </div>
      <!-- 桌面端按钮 -->
      <div class="hidden md:flex items-center gap-2">
        <Button variant="outline" :disabled="isSaving" @click="handleExport">
          <Icon name="lucide:share" class="w-4 h-4 mr-2" />
          导出
        </Button>
        <Button variant="outline" :disabled="isSaving" @click="loadData">
          重置
        </Button>
        <Button :disabled="isSaving" @click="handleSave">
          <Icon v-if="isSaving" name="lucide:loader-2" class="w-4 h-4 mr-2 animate-spin" />
          <Icon v-else name="lucide:save" class="w-4 h-4 mr-2" />
          保存
        </Button>
      </div>
      <!-- 移动端按钮 -->
      <div class="flex md:hidden items-center gap-1">
        <Button variant="ghost" size="icon" :disabled="isSaving" @click="handleExport">
          <Icon name="lucide:share" class="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" :disabled="isSaving" @click="loadData">
          <Icon name="lucide:rotate-ccw" class="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" :disabled="isSaving" @click="handleSave">
          <Icon v-if="isSaving" name="lucide:loader-2" class="w-4 h-4 animate-spin" />
          <Icon v-else name="lucide:save" class="w-4 h-4" />
        </Button>
      </div>
    </div>

    <!-- Content -->
    <div v-if="isLoading" class="flex-1 flex items-center justify-center">
      <Icon name="lucide:loader-2" class="w-8 h-8 animate-spin text-muted-foreground" />
    </div>

    <div v-else-if="workflow" class="flex-1 overflow-y-auto p-4 md:p-8 pb-safe">
      <div class="max-w-4xl mx-auto space-y-6 md:space-y-8">
        <!-- 全局缺失变量警告 -->
        <AppMissingEnvDrawer
          v-if="missingVariables.length > 0"
          :missing-variables="missingVariables"
          variant="banner"
          @saved="loadData"
        />

        <!-- Basic Info -->
        <Card>
          <CardHeader>
            <CardTitle>基本信息</CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="space-y-2">
                <Label>名称</Label>
                <Input v-model="workflow.name" placeholder="流名称" />
              </div>
              <!-- <div class="space-y-2">
                <Label>关联 Schema (可选)</Label>
                <Select v-model="workflow.schema_id">
                  <SelectTrigger>
                    <SelectValue placeholder="选择 Schema (仅作变量提示)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem :value="undefined">
                      无
                    </SelectItem>
                    <SelectItem v-for="schema in schemas" :key="schema.id" :value="schema.id">
                      {{ schema.name }}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p class="text-xs text-muted-foreground">
                  选择 Schema 可以帮助您在编辑时获得更准确的变量提示，但不会限制运行时的数据。
                </p>
              </div> -->
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
              <!-- <Button size="sm" variant="outline" @click="addStep('javascript')">
                <Icon name="lucide:code" class="w-4 h-4 mr-2" />
                添加脚本
              </Button> -->
            </div>
          </div>

          <div v-if="steps.length === 0" class="text-center py-12 border-2 border-dashed rounded-lg text-muted-foreground">
            未定义步骤。添加一个步骤以开始。
          </div>

          <Accordion v-else type="multiple" :default-value="steps.map(s => s.id)" class="space-y-3">
            <AccordionItem
              v-for="(step, index) in steps"
              :key="step.id"
              :value="step.id"
              class="border rounded-lg bg-card px-4"
            >
              <AccordionTrigger class="hover:no-underline py-3">
                <div class="flex items-center gap-3 flex-1 min-w-0">
                  <Badge variant="secondary" class="shrink-0 w-7 h-7 rounded-full p-0 flex items-center justify-center font-bold">
                    {{ index + 1 }}
                  </Badge>
                  <Badge variant="outline" class="uppercase text-xs font-bold shrink-0">
                    {{ step.type }}
                  </Badge>
                  <span class="font-medium truncate">{{ step.name }}</span>
                  <!-- 步骤缺失变量警告图标 -->
                  <Icon
                    v-if="getStepMissingVariables(step).length > 0"
                    name="lucide:alert-circle"
                    class="w-4 h-4 text-amber-500 shrink-0"
                    title="存在未配置的环境变量"
                  />
                </div>
                <div class="flex items-center gap-1 mr-2" @click.stop>
                  <Button variant="ghost" size="icon" class="h-7 w-7" :disabled="index === 0" @click="moveStep(index, 'up')">
                    <Icon name="lucide:arrow-up" class="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" class="h-7 w-7" :disabled="index === steps.length - 1" @click="moveStep(index, 'down')">
                    <Icon name="lucide:arrow-down" class="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" class="h-7 w-7 text-destructive hover:text-destructive" @click="removeStep(index)">
                    <Icon name="lucide:trash-2" class="w-3.5 h-3.5" />
                  </Button>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div class="space-y-4 pt-2 pb-4">
                  <!-- 步骤名称编辑 -->
                  <div class="flex gap-2 items-center">
                    <Label class="shrink-0 text-muted-foreground">名称</Label>
                    <Input v-model="step.name" class="h-8 font-medium" placeholder="步骤名称" />
                  </div>

                  <!-- 步骤缺失变量警告 -->
                  <AppMissingEnvDrawer
                    v-if="getStepMissingVariables(step).length > 0"
                    :missing-variables="getStepMissingVariables(step)"
                    variant="inline"
                    @saved="loadData"
                  />

                  <!-- API Step Fields -->
                  <template v-if="step.type === 'api'">
                    <div class="flex gap-2">
                      <Select v-model="step.method">
                        <SelectTrigger class="w-24">
                          <SelectValue placeholder="Method" />
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
                        <AccordionTrigger class="text-sm">
                          请求头
                        </AccordionTrigger>
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
                        <AccordionTrigger class="text-sm">
                          请求体
                        </AccordionTrigger>
                        <AccordionContent>
                          <Textarea v-model="step.body" placeholder="{ 'key': 'value' }" class="font-mono text-sm" rows="5" />
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>

                    <div class="mt-2 pt-2 border-t border-border/50">
                      <p class="text-xs font-medium mb-2 text-muted-foreground flex items-center gap-2">
                        <Icon name="lucide:info" class="w-3 h-3" />
                        可用变量 (点击复制，支持在 URL、Header 和 Body 中使用):
                      </p>
                      <div class="flex flex-wrap gap-1">
                        <Badge
                          v-for="v in availableVariables"
                          :key="v.name"
                          variant="secondary"
                          class="cursor-pointer hover:bg-primary hover:text-primary-foreground text-[10px] px-1.5 py-0.5 transition-colors"
                          :title="v.desc"
                          @click="copy(`{{${v.name}}}`); toast.success(`已复制 {{${v.name}}}`)"
                        >
                          {{ v.name }}
                        </Badge>
                      </div>
                    </div>
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
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>

      <!-- 移动端悬浮保存按钮 -->
    </div>
  </div>
</template>
