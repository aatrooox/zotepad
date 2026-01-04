<script setup lang="ts">
import type { ToolbarNames } from 'md-editor-v3'
import type { Moment } from '~/types/models'
import { useColorMode, useFileDialog } from '@vueuse/core'
import { MdEditor } from 'md-editor-v3'
import { toast } from 'vue-sonner'
import { useAssetRepository } from '~/composables/repositories/useAssetRepository'
import { useMomentRepository } from '~/composables/repositories/useMomentRepository'
import { useStorageService } from '~/composables/useStorageService'

import 'md-editor-v3/lib/style.css'

useHead({ title: '发布动态 - ZotePad' })

const router = useRouter()
const route = useRoute()
const logger = useLog()
const { createMoment, getMoment, updateMoment } = useMomentRepository()
const { uploadFile, uploadFiles } = useStorageService()
const { createAsset } = useAssetRepository()

const colorMode = useColorMode({
  emitAuto: true,
})

// 获取实际生效的主题
const resolvedTheme = computed(() => {
  if (colorMode.value !== 'auto')
    return colorMode.value
  return (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'
})

const momentContent = ref('')
const isPublishing = ref(false)
const momentTags = ref<string[]>([])
const newMomentTag = ref('')
const momentImages = ref<string[]>([])
const isUploading = ref(false)

const momentId = computed(() => {
  const id = route.params.id
  return (id && id !== 'new') ? Number(id) : null
})
const isEditing = computed(() => !!momentId.value)

useHead({ title: isEditing.value ? '编辑动态 - ZotePad' : '发布动态 - ZotePad' })

onMounted(async () => {
  if (isEditing.value && momentId.value) {
    try {
      const moment = await getMoment(momentId.value)
      if (moment) {
        momentContent.value = moment.content || ''
        momentImages.value = moment.images ? JSON.parse(moment.images) : []
        momentTags.value = moment.tags ? JSON.parse(moment.tags) : []
      }
      else {
        toast.error('动态不存在')
        router.push('/notes/moments')
      }
    }
    catch (e) {
      console.error(e)
      toast.error('加载动态失败')
    }
  }
})

// Editor Config
const momentToolbars: ToolbarNames[] = ['bold', 'italic', 'underline', '-', 'link', 'image', 'code', '-', 'preview']

const onMomentEditorUploadImg = async (files: Array<File>, callback: (urls: Array<string>) => void) => {
  try {
    const results = await uploadFiles(files)

    // 记录到资源表
    for (let i = 0; i < results.length; i++) {
      const result = results[i] as any
      const file = files[i] as any

      await createAsset({
        url: result.url,
        path: result.path,
        filename: result.filename || file.name,
        size: result.size || file.size,
        mime_type: result.mime_type || file.type,
        storage_type: 'cos',
      })
    }

    const urls = results.map(r => r.url)
    callback(urls)
  }
  catch (e: any) {
    console.error(e)
    toast.error(e.message || '图片上传失败')
  }
}

// File Dialog
const { open: openFileDialog, onChange: onFileChange } = useFileDialog({
  accept: 'image/*',
  multiple: true,
})

onFileChange(async (files) => {
  if (!files || files.length === 0)
    return

  isUploading.value = true
  const uploadPromises = Array.from(files).map(file => uploadFile(file))

  try {
    const results = await Promise.all(uploadPromises)

    // 记录到资源表
    for (let i = 0; i < results.length; i++) {
      const result = results[i] as any
      const file = files[i] as any

      await createAsset({
        url: result.url,
        path: result.path,
        filename: result.filename || file.name,
        size: result.size || file.size,
        mime_type: result.mime_type || file.type,
        storage_type: 'cos',
      })
    }

    momentImages.value.push(...results.map((r: any) => r.url))
    toast.success(`成功上传 ${results.length} 张图片`)
  }
  catch (e: any) {
    console.error(e)
    toast.error(`图片上传失败: ${e.message}`)
  }
  finally {
    isUploading.value = false
  }
})

function handleAddMomentTag() {
  const tag = newMomentTag.value.trim()
  if (tag && !momentTags.value.includes(tag)) {
    momentTags.value.push(tag)
  }
  newMomentTag.value = ''
}

function handleRemoveMomentTag(index: number) {
  momentTags.value.splice(index, 1)
}

function handleRemoveMomentImage(index: number) {
  momentImages.value.splice(index, 1)
}

async function handlePublishMoment() {
  if (!momentContent.value.trim() && momentImages.value.length === 0) {
    toast.warning('请输入内容或上传图片')
    return
  }

  isPublishing.value = true
  try {
    if (isEditing.value && momentId.value) {
      await updateMoment(momentId.value, momentContent.value, momentImages.value, momentTags.value)
      toast.success('更新成功')
      router.push(`/notes/moments/${momentId.value}`)
    }
    else {
      await createMoment(momentContent.value, momentImages.value, momentTags.value)
      toast.success('发布成功')
      router.push('/notes/moments')
    }
  }
  catch (e) {
    logger.error(isEditing.value ? '更新动态失败:' : '发布动态失败:', e)
    toast.error(isEditing.value ? '更新失败' : '发布失败')
  }
  finally {
    isPublishing.value = false
  }
}
</script>

<template>
  <div class="h-full flex flex-col bg-background">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b">
      <Button variant="ghost" size="icon" @click="router.back()">
        <Icon name="lucide:arrow-left" class="w-5 h-5" />
      </Button>
      <h1 class="text-base font-medium">
        {{ isEditing ? '编辑动态' : '发布动态' }}
      </h1>
      <Button :disabled="isPublishing || (!momentContent.trim() && momentImages.length === 0)" @click="handlePublishMoment">
        <Icon v-if="isPublishing" name="lucide:loader-2" class="w-4 h-4 mr-2 animate-spin" />
        <Icon v-else name="lucide:send" class="w-4 h-4 mr-2" />
        {{ isEditing ? '更新' : '发布' }}
      </Button>
    </div>

    <div class="flex-1 overflow-y-auto p-4 space-y-6">
      <!-- Editor Section -->
      <div class="bg-card/50 backdrop-blur-sm border rounded-xl shadow-sm overflow-hidden max-w-4xl mx-auto">
        <div class="h-[300px]">
          <ClientOnly>
            <MdEditor
              v-model="momentContent"
              :theme="resolvedTheme"
              preview-theme="github"
              class="!h-full w-full"
              :toolbars="momentToolbars"
              :preview="false"
              placeholder="分享当下的想法..."
              @on-upload-img="onMomentEditorUploadImg"
            />
          </ClientOnly>
        </div>

        <!-- Image Preview -->
        <div v-if="momentImages.length > 0" class="px-4 py-2 border-t bg-muted/10 grid grid-cols-4 gap-2">
          <div v-for="(img, index) in momentImages" :key="index" class="relative group aspect-square rounded-md overflow-hidden border bg-background">
            <img :src="img" class="w-full h-full object-cover" alt="Uploaded image">
            <button
              class="absolute top-1 right-1 p-1 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
              @click="handleRemoveMomentImage(index)"
            >
              <Icon name="lucide:x" class="w-3 h-3" />
            </button>
          </div>
        </div>

        <!-- Tags Input -->
        <div class="px-4 py-2 border-t bg-muted/10 flex flex-wrap items-center gap-2">
          <div v-for="(tag, index) in momentTags" :key="index" class="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs rounded-full">
            <span>#{{ tag }}</span>
            <button class="hover:text-destructive" @click="handleRemoveMomentTag(index)">
              <Icon name="lucide:x" class="w-3 h-3" />
            </button>
          </div>
          <div class="flex items-center gap-2">
            <Icon name="lucide:hash" class="w-4 h-4 text-muted-foreground" />
            <input
              v-model="newMomentTag"
              type="text"
              placeholder="添加标签..."
              class="bg-transparent text-sm outline-none min-w-[80px] placeholder:text-muted-foreground/70"
              @keydown.enter.prevent="handleAddMomentTag"
              @blur="handleAddMomentTag"
            >
          </div>
        </div>

        <div class="px-4 py-3 bg-muted/30 border-t flex justify-between items-center">
          <div class="text-xs text-muted-foreground">
            <Button variant="ghost" size="sm" class="gap-2" :disabled="isUploading" @click="openFileDialog()">
              <Icon v-if="isUploading" name="lucide:loader-2" class="w-4 h-4 animate-spin" />
              <Icon v-else name="lucide:image" class="w-4 h-4" />
              <span>{{ isUploading ? '上传中...' : '上传图片' }}</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.md-editor {
  --md-bk-color: hsl(var(--background));
  --md-color: hsl(var(--foreground));
  --md-border-color: transparent;
}
</style>
