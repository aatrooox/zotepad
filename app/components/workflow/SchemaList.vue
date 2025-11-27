<script setup lang="ts">
import type { WorkflowSchema, WorkflowSchemaField } from '~/types/workflow'
import { toast } from 'vue-sonner'
import SchemaEditor from '~/components/workflow/SchemaEditor.vue'
import { useWorkflowSchemaRepository } from '~/composables/repositories/useWorkflowSchemaRepository'

const { getAllSchemas, createSchema, updateSchema, deleteSchema } = useWorkflowSchemaRepository()

const schemas = ref<WorkflowSchema[]>([])
const isDialogOpen = ref(false)
const isEditing = ref(false)
const isLoading = ref(false)

const currentSchema = ref<{
  id?: number
  name: string
  description: string
  fields: WorkflowSchemaField[]
}>({
  name: '',
  description: '',
  fields: [],
})

const loadSchemas = async () => {
  isLoading.value = true
  try {
    schemas.value = await getAllSchemas() || []
  }
  catch (e) {
    console.error(e)
    toast.error('加载 Schema 列表失败')
  }
  finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadSchemas()
})

const openCreateDialog = () => {
  isEditing.value = false
  currentSchema.value = {
    name: '',
    description: '',
    fields: [],
  }
  isDialogOpen.value = true
}

const openEditDialog = (schema: WorkflowSchema) => {
  isEditing.value = true
  let fields: WorkflowSchemaField[] = []
  try {
    fields = JSON.parse(schema.fields)
  }
  catch {
    fields = []
  }

  currentSchema.value = {
    id: schema.id,
    name: schema.name,
    description: schema.description || '',
    fields,
  }
  isDialogOpen.value = true
}

const handleSave = async () => {
  if (!currentSchema.value.name) {
    toast.error('请输入 Schema 名称')
    return
  }

  try {
    if (isEditing.value && currentSchema.value.id) {
      await updateSchema(
        currentSchema.value.id,
        currentSchema.value.name,
        currentSchema.value.description,
        currentSchema.value.fields,
      )
      toast.success('Schema 已更新')
    }
    else {
      await createSchema(
        currentSchema.value.name,
        currentSchema.value.description,
        currentSchema.value.fields,
      )
      toast.success('Schema 已创建')
    }
    isDialogOpen.value = false
    await loadSchemas()
  }
  catch (e: any) {
    console.error(e)
    toast.error(e.message || '保存失败')
  }
}

const handleDelete = async (id: number) => {
  try {
    await deleteSchema(id)
    toast.success('Schema 已删除')
    await loadSchemas()
  }
  catch (e: any) {
    console.error(e)
    toast.error(e.message || '删除失败')
  }
}

const formatDate = (dateStr?: string) => {
  if (!dateStr)
    return ''
  return new Date(dateStr).toLocaleDateString()
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex justify-between items-center">
      <h2 class="text-lg font-semibold">
        Schema 列表
      </h2>
      <Button size="sm" @click="openCreateDialog">
        <Icon name="lucide:plus" class="w-4 h-4 mr-2" />
        新建 Schema
      </Button>
    </div>

    <div v-if="isLoading" class="flex justify-center py-8">
      <Icon name="lucide:loader-2" class="w-6 h-6 animate-spin text-muted-foreground" />
    </div>

    <div v-else-if="schemas.length === 0" class="text-center py-12 border rounded-lg bg-muted/10">
      <p class="text-muted-foreground">
        暂无 Schema 定义
      </p>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <Card v-for="schema in schemas" :key="schema.id" class="group hover:border-primary/50 transition-all">
        <CardHeader class="pb-2">
          <div class="flex justify-between items-start">
            <CardTitle class="text-base">
              {{ schema.name }}
            </CardTitle>
            <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="icon" class="h-8 w-8" @click="openEditDialog(schema)">
                <Icon name="lucide:edit-2" class="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" class="h-8 w-8 text-destructive hover:text-destructive" @click="handleDelete(schema.id)">
                <Icon name="lucide:trash-2" class="w-4 h-4" />
              </Button>
            </div>
          </div>
          <CardDescription class="line-clamp-2 text-xs">
            {{ schema.description || '无描述' }}
          </CardDescription>
        </CardHeader>
        <CardFooter class="pt-2 pb-3 text-xs text-muted-foreground border-t bg-muted/20">
          更新于 {{ formatDate(schema.updated_at) }}
        </CardFooter>
      </Card>
    </div>

    <!-- Edit Dialog -->
    <Dialog v-model:open="isDialogOpen">
      <DialogContent class="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{{ isEditing ? '编辑 Schema' : '新建 Schema' }}</DialogTitle>
          <DialogDescription>定义工作流所需的输入字段结构。</DialogDescription>
        </DialogHeader>

        <div class="space-y-6 py-4">
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label>名称</Label>
              <Input v-model="currentSchema.name" placeholder="Schema 名称" />
            </div>
            <div class="space-y-2">
              <Label>描述</Label>
              <Input v-model="currentSchema.description" placeholder="描述用途" />
            </div>
          </div>

          <div class="space-y-2">
            <Label>字段定义</Label>
            <SchemaEditor v-model="currentSchema.fields" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="isDialogOpen = false">
            取消
          </Button>
          <Button @click="handleSave">
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
