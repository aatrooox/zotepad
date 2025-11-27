<script setup lang="ts">
import type { WorkflowSchemaField } from '~/types/workflow'

const props = defineProps<{
  modelValue: WorkflowSchemaField[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: WorkflowSchemaField[]): void
}>()

const fields = computed({
  get: () => props.modelValue,
  set: val => emit('update:modelValue', val),
})

const addField = () => {
  fields.value = [
    ...fields.value,
    {
      key: '',
      label: '',
      type: 'string',
      required: false,
      description: '',
    },
  ]
}

const removeField = (index: number) => {
  const newFields = [...fields.value]
  newFields.splice(index, 1)
  fields.value = newFields
}
</script>

<template>
  <div class="space-y-4">
    <div v-if="fields.length === 0" class="text-center py-8 border-2 border-dashed rounded-lg text-muted-foreground">
      暂无字段定义。添加一个字段以开始。
    </div>

    <div v-else class="space-y-2">
      <div v-for="(field, index) in fields" :key="index" class="flex items-start gap-2 p-3 border rounded-md bg-card/50">
        <div class="grid grid-cols-12 gap-2 flex-1">
          <div class="col-span-3 space-y-1">
            <Label class="text-xs text-muted-foreground">Key (变量名)</Label>
            <Input v-model="field.key" placeholder="e.g. title" class="h-8" />
          </div>
          <div class="col-span-3 space-y-1">
            <Label class="text-xs text-muted-foreground">Label (显示名)</Label>
            <Input v-model="field.label" placeholder="e.g. 标题" class="h-8" />
          </div>
          <div class="col-span-2 space-y-1">
            <Label class="text-xs text-muted-foreground">类型</Label>
            <Select v-model="field.type">
              <SelectTrigger class="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="string">
                  文本
                </SelectItem>
                <SelectItem value="number">
                  数字
                </SelectItem>
                <SelectItem value="boolean">
                  布尔值
                </SelectItem>
                <SelectItem value="json">
                  JSON
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="col-span-3 space-y-1">
            <Label class="text-xs text-muted-foreground">描述</Label>
            <Input v-model="field.description" placeholder="字段说明" class="h-8" />
          </div>
          <div class="col-span-1 flex items-center justify-center pt-5">
            <div class="flex items-center space-x-2">
              <Checkbox :id="`required-${index}`" v-model:checked="field.required" />
              <Label :for="`required-${index}`" class="text-xs cursor-pointer">必填</Label>
            </div>
          </div>
        </div>
        <Button variant="ghost" size="icon" class="mt-5 h-8 w-8 text-destructive hover:text-destructive" @click="removeField(index)">
          <Icon name="lucide:trash-2" class="w-4 h-4" />
        </Button>
      </div>
    </div>

    <Button variant="outline" size="sm" class="w-full border-dashed" @click="addField">
      <Icon name="lucide:plus" class="w-4 h-4 mr-2" />
      添加字段
    </Button>
  </div>
</template>
