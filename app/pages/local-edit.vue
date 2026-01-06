<script setup lang="ts">
import { writeHtml } from '@tauri-apps/plugin-clipboard-manager'
import { useColorMode } from '@vueuse/core'
import { Eye, FilePlus, FolderOpen, Pencil, Save, Wand2 } from 'lucide-vue-next'
// import { MdEditor } from 'md-editor-v3'
// import 'md-editor-v3/lib/style.css'
import MdEditorCrepe from '~/components/ui/editor/MdEditorCrepe.vue'
import { copyToClipboard, getWeChatMinimalHTML } from '~/utils/wechat-formatter'

useHead({ title: '本地编辑 - ZotePad' })

const {
  currentFilePath,
  fileContent,
  isDirty,
  isLoading,
  error,
  openFile,
  saveFile,
  saveAsFile,
} = useLocalMarkdown()

const isReadOnly = ref(false)

const { toast } = useToast()
const colorMode = useColorMode({
  emitAuto: true,
})

// 处理主题
const resolvedTheme = computed(() => {
  if (colorMode.value !== 'auto')
    return colorMode.value as 'light' | 'dark'
  return (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'
})

// 处理保存
const handleSave = async () => {
  const success = await saveFile()
  if (success) {
    toast.success('已保存')
  }
  else if (error.value) {
    toast.error(error.value)
  }
}

// 处理打开
const handleOpen = async () => {
  // Check dirty?
  if (isDirty.value) {
    // 简易处理，实际可弹窗确认
    // if (!confirm('当前文件未保存，确认打开新文件吗？'))
    return
  }
  const success = await openFile()
  if (!success && error.value) {
    toast.error(error.value)
  }
}

// 处理另存为
const handleSaveAs = async () => {
  const success = await saveAsFile()
  if (success) {
    toast.success('已另存为')
  }
  else if (error.value) {
    toast.error(error.value)
  }
}

// 复制公众号格式 (测试功能)
const copyWeChatFormat = async () => {
  const editorDom = document.querySelector('.milkdown .editor') as HTMLElement
  if (!editorDom) {
    toast.error('未找到编辑器内容')
    return
  }

  try {
    const finalHtml = getWeChatMinimalHTML(editorDom)
    // 优先尝试使用 Clipboard API
    const success = await copyToClipboard(finalHtml)
    if (success) {
      toast.success('已复制公众号格式')
    }
    else {
      // 降级使用 Tauri 剪贴板插件
      await writeHtml(finalHtml, editorDom.textContent || '内容已复制')
      toast.success('已复制公众号格式 (Tauri)')
    }
  }
  catch (e: any) {
    console.error('WeChat formatting failed', e)
    toast.error(`格式化失败: ${e.message || '未知错误'}`)
  }
}

// 自动保持焦点在编辑器（可选）
</script>

<template>
  <div class="h-full flex flex-col bg-background">
    <!-- Header / Toolbar -->
    <header class="flex items-center justify-between px-4 py-2 border-b bg-card">
      <div class="flex items-center gap-2 overflow-hidden">
        <h1 class="text-lg font-semibold shrink-0">
          本地编辑
        </h1>
        <div class="h-4 w-px bg-border mx-2" />
        <span class="text-xs text-muted-foreground truncate" :title="currentFilePath || '未命名'">
          {{ currentFilePath || '未命名' }}
          <span v-if="isDirty" class="text-primary font-bold">*</span>
        </span>
      </div>

      <div class="flex items-center gap-2">
        <Button variant="ghost" size="icon" :title="isReadOnly ? '切换为编辑模式' : '切换为只读模式'" @click="isReadOnly = !isReadOnly">
          <component :is="isReadOnly ? Pencil : Eye" class="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" title="复制公众号格式" @click="copyWeChatFormat">
          <Wand2 class="w-4 h-4" />
        </Button>
        <Button variant="outline" size="sm" :disabled="isLoading" @click="handleOpen">
          <FolderOpen class="w-4 h-4 mr-2" />
          打开
        </Button>
        <Button variant="outline" size="sm" :disabled="isLoading" @click="handleSave">
          <Save class="w-4 h-4 mr-2" />
          保存
        </Button>
        <Button variant="ghost" size="icon" :disabled="isLoading" title="另存为" @click="handleSaveAs">
          <FilePlus class="w-4 h-4" />
        </Button>
      </div>
    </header>

    <!-- Editor Area -->
    <div class="flex-1 overflow-hidden relative">
      <!-- <MdEditor
        v-model="fileContent"
        :theme="resolvedTheme"
        class="h-full w-full"
        preview-theme="github"
        :toolbars-exclude="['save', 'github']"
        no-upload-img
        @save="handleSave"
      /> -->
      <MdEditorCrepe
        v-model="fileContent"
        :is-dark="resolvedTheme === 'dark'"
        :read-only="isReadOnly"
        @save="handleSave"
      />

      <div v-if="isLoading" class="absolute inset-0 bg-background/50 flex items-center justify-center z-50">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 调整编辑器样式以适应容器 */
:deep(.md-editor) {
  height: 100%;
}
</style>
