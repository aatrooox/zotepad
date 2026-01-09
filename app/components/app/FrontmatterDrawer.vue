<script setup lang="ts">
import type { FrontmatterFields } from '~/components/ui/editor/frontmatter-handler'
import dayjs from 'dayjs'
import { toast } from 'vue-sonner'

const props = defineProps<{
  open: boolean
  frontmatterFields: FrontmatterFields
  tags: string[]
  createdAt?: Date
  updatedAt?: Date
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:title': [value: string]
}>()

const localTitle = ref(props.frontmatterFields.title || '')

// 监听外部 frontmatterFields 变化
watch(() => props.frontmatterFields.title, (newTitle) => {
  localTitle.value = newTitle || ''
})

const formattedDate = computed(() => {
  if (!props.createdAt)
    return '未知'
  return dayjs(props.createdAt).format('YYYY-MM-DD HH:mm:ss')
})

const formattedLastmod = computed(() => {
  if (!props.updatedAt)
    return '未知'
  return dayjs(props.updatedAt).format('YYYY-MM-DD HH:mm:ss')
})

const handleTitleBlur = () => {
  emit('update:title', localTitle.value)
}

const handleCopyFrontmatter = () => {
  const yaml = [
    '---',
    `title: ${localTitle.value || '无标题'}`,
    props.createdAt ? `date: ${props.createdAt.toISOString()}` : '',
    props.updatedAt ? `lastmod: ${props.updatedAt.toISOString()}` : '',
    props.tags.length > 0 ? `tags: [${props.tags.map(t => `"${t}"`).join(', ')}]` : '',
    '---',
  ].filter(Boolean).join('\n')

  navigator.clipboard.writeText(yaml)
  toast.success('Frontmatter 已复制')
}
</script>

<template>
  <Drawer :open="open" @update:open="emit('update:open', $event)">
    <DrawerContent class="max-h-[85vh] flex flex-col">
      <DrawerHeader class="text-left shrink-0">
        <DrawerTitle>Frontmatter 元数据</DrawerTitle>
        <DrawerDescription>
          管理文章的元数据信息
        </DrawerDescription>
      </DrawerHeader>

      <div class="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
        <!-- 标题 (可编辑) -->
        <div class="space-y-2">
          <Label for="fm-title" class="text-sm font-medium">标题</Label>
          <Input
            id="fm-title"
            v-model="localTitle"
            placeholder="文章标题"
            @blur="handleTitleBlur"
          />
        </div>

        <!-- 元数据信息一行展示 -->
        <div class="flex items-center gap-3 text-xs py-2 border-t border-b">
          <!-- 创建时间 -->
          <div class="flex items-center gap-1.5">
            <span class="text-muted-foreground">创建:</span>
            <span class="font-medium">{{ formattedDate }}</span>
          </div>

          <div class="h-4 w-px bg-border" />

          <!-- 更新时间 -->
          <div class="flex items-center gap-1.5">
            <span class="text-muted-foreground">更新:</span>
            <span class="font-medium">{{ formattedLastmod }}</span>
          </div>

          <div class="h-4 w-px bg-border" />

          <!-- 标签 -->
          <div class="flex items-center gap-1.5 flex-1 min-w-0">
            <span class="text-muted-foreground shrink-0">标签:</span>
            <div v-if="tags.length > 0" class="flex flex-wrap gap-1 flex-1 min-w-0">
              <Badge
                v-for="tag in tags"
                :key="tag"
                variant="secondary"
                class="cursor-default text-[10px] px-1.5 py-0"
              >
                {{ tag }}
              </Badge>
            </div>
            <span v-else class="text-muted-foreground/60">暂无</span>
          </div>

          <!-- 复制按钮 -->
          <Button
            variant="ghost"
            size="icon"
            class="shrink-0 h-7 w-7"
            title="复制 Frontmatter"
            @click="handleCopyFrontmatter"
          >
            <Icon name="lucide:copy" class="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </DrawerContent>
  </Drawer>
</template>
