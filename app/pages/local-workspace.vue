<script setup lang="ts">
import type { FileNode } from '~/composables/useLocalWorkspace'
import { useColorMode } from '@vueuse/core'
import {
  FilePlus,
  FolderOpen,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCw,
  Save,
  Settings2,
} from 'lucide-vue-next'
import { MdEditor } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'

useHead({ title: '本地空间 - ZotePad' })

const {
  workspacePath,
  fileTree,
  isLoading: isTreeLoading,
  chooseWorkspace,
  refreshWorkspace,
  // readDirectory,
  loadSubNode,
  createMarkdownFile,
} = useLocalWorkspace()

const {
  currentFilePath,
  fileContent,
  isDirty,
  isLoading: isEditorLoading,
  error: editorError,
  loadFile,
  saveFile,
} = useLocalMarkdown()

const { toast } = useToast()
const colorMode = useColorMode({ emitAuto: true })
const { isCollapsed: isGlobalSidebarCollapsed } = useSidebar()

const isSidebarOpen = ref(true)

// Dialog State
const showConfirmDialog = ref(false)
const confirmAction = ref<(() => void) | null>(null)
const confirmMessage = ref('')

const showCreateDialog = ref(false)
const newFileName = ref('')
const createParentPath = ref('')

// Theme
const resolvedTheme = computed(() => {
  if (colorMode.value !== 'auto')
    return colorMode.value as 'light' | 'dark'
  return (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'
})

// Initialize
onMounted(async () => {
  // Collapsed global sidebar for more space
  isGlobalSidebarCollapsed.value = true
  if (workspacePath.value) {
    await refreshWorkspace()
  }
})

// Don't auto-expand on leave, user might prefer it collapsed,
// or we can restore previous state if we stored it.
// For now, let's keep it simple.

const triggerConfirm = (message: string, action: () => void) => {
  confirmMessage.value = message
  confirmAction.value = action
  showConfirmDialog.value = true
}

const handleConfirm = () => {
  if (confirmAction.value) {
    confirmAction.value()
  }
  showConfirmDialog.value = false
}

// Actions
const handleSelectNode = async (node: FileNode) => {
  if (node.kind === 'file') {
    // Check dirty
    if (isDirty.value && currentFilePath.value !== node.path) {
      triggerConfirm('当前文件未保存，切换将丢失更改，确认切换吗？', async () => {
        await loadFile(node.path)
      })
      return
    }
    await loadFile(node.path)
  }
}

const handleToggleNode = async (node: FileNode) => {
  if (node.kind === 'directory') {
    if (!node.isOpen) {
      await loadSubNode(node)
    }
    else {
      node.isOpen = false
    }
  }
}

const openCreateDialog = (parentPath: string = workspacePath.value!) => {
  createParentPath.value = parentPath
  newFileName.value = ''
  showCreateDialog.value = true
}

const confirmCreateFile = async () => {
  if (!newFileName.value.trim()) {
    toast.error('请输入文件名')
    return
  }

  showCreateDialog.value = false

  try {
    const newPath = await createMarkdownFile(createParentPath.value, newFileName.value)
    toast.success('文件创建成功')

    // Refresh to show new file
    await refreshWorkspace()

    // Open it
    await loadFile(newPath)
  }
  catch (e: any) {
    toast.error(`创建失败: ${e.message}`)
  }
}

const handleCreateFile = (parentPath: string = workspacePath.value!) => {
  openCreateDialog(parentPath)
}

const handleSave = async () => {
  const success = await saveFile()
  if (success)
    toast.success('已保存')
  else if (editorError.value)
    toast.error(editorError.value)
}

const workspaceName = computed(() => {
  if (!workspacePath.value)
    return ''
  const parts = workspacePath.value.split(/[\\/]/)
  return parts[parts.length - 1] || workspacePath.value
})
</script>

<template>
  <div class="h-full flex flex-col bg-background text-foreground overflow-hidden">
    <!-- Empty State / Setup -->
    <div v-if="!workspacePath" class="flex-1 flex flex-col items-center justify-center p-8 space-y-6">
      <div class="w-24 h-24 bg-muted/50 rounded-full flex items-center justify-center shadow-inner">
        <FolderOpen class="w-10 h-10 opacity-50" />
      </div>

      <div class="text-center space-y-2">
        <h2 class="text-2xl font-bold">
          选择本地工作空间
        </h2>
        <p class="text-muted-foreground max-w-md">
          选择一个本地文件夹作为您的笔记仓库。所有的操作都将直接反映在您的硬盘上，安全且完全可控。
        </p>
      </div>

      <Button size="lg" @click="chooseWorkspace">
        <FolderOpen class="w-5 h-5 mr-2" />
        打开文件夹
      </Button>
    </div>

    <!-- Workspace View -->
    <div v-else class="flex-1 flex overflow-hidden">
      <!-- Sidebar -->
      <aside
        v-show="isSidebarOpen"
        class="w-64 border-r bg-card/30 flex flex-col shrink-0 transition-all duration-300"
      >
        <!-- Sidebar Header -->
        <div class="h-12 border-b flex items-center justify-between px-3 bg-muted/20">
          <span class="font-semibold text-sm truncate" :title="workspacePath">
            {{ workspaceName }}
          </span>
          <div class="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" class="h-7 w-7" title="新建文件" @click="handleCreateFile(workspacePath!)">
              <FilePlus class="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" class="h-7 w-7" title="刷新" @click="refreshWorkspace">
              <RotateCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isTreeLoading }" />
            </Button>
            <Button variant="ghost" size="icon" class="h-7 w-7" title="切换工作区" @click="chooseWorkspace">
              <Settings2 class="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <!-- File Tree -->
        <div class="flex-1 overflow-y-auto py-2">
          <AppFileTreeView
            :tree="fileTree"
            :active-path="currentFilePath"
            @select="handleSelectNode"
            @toggle="handleToggleNode"
            @create="handleCreateFile"
          />
        </div>
      </aside>

      <!-- Main Content -->
      <main class="flex-1 flex flex-col min-w-0 bg-background relative">
        <!-- Editor Header -->
        <header class="h-12 border-b flex items-center justify-between px-4 bg-background z-10">
          <div class="flex items-center gap-3 overflow-hidden">
            <Button variant="ghost" size="icon" class="h-8 w-8 -ml-2" @click="isSidebarOpen = !isSidebarOpen">
              <PanelLeftOpen v-if="!isSidebarOpen" class="w-4 h-4" />
              <PanelLeftClose v-else class="w-4 h-4" />
            </Button>

            <div v-if="currentFilePath" class="flex flex-col overflow-hidden">
              <span class="text-sm font-medium truncate flex items-center gap-2">
                {{ currentFilePath.split(/[\\/]/).pop() }}
                <span v-if="isDirty" class="w-2 h-2 rounded-full bg-primary shrink-0" />
              </span>
              <span class="text-[10px] text-muted-foreground truncate opacity-70">
                {{ currentFilePath }}
              </span>
            </div>
            <span v-else class="text-sm text-muted-foreground">未选择文件</span>
          </div>

          <div class="flex items-center gap-2">
            <Button v-if="currentFilePath" variant="outline" size="sm" :disabled="isEditorLoading" @click="handleSave">
              <Save class="w-4 h-4 mr-2" />
              保存
            </Button>
          </div>
        </header>

        <!-- Editor Body -->
        <div v-if="currentFilePath" class="flex-1 relative overflow-hidden">
          <MdEditor
            v-model="fileContent"
            :theme="resolvedTheme"
            class="h-full w-full"
            preview-theme="github"
            :toolbars-exclude="['save', 'github']"
            no-upload-img
            @save="handleSave"
          />

          <div v-if="isEditorLoading" class="absolute inset-0 bg-background/50 flex items-center justify-center z-50">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </div>

        <!-- No File Selected -->
        <div v-else class="flex-1 flex flex-col items-center justify-center text-muted-foreground bg-muted/5">
          <div class="p-8 rounded-full bg-muted/20 mb-4">
            <FolderOpen class="w-12 h-12 opacity-30" />
          </div>
          <p>选择或创建一个 markdown 文件开始编辑</p>
        </div>
      </main>
    </div>

    <!-- Confirm Dialog (Alert) -->
    <AlertDialog v-model:open="showConfirmDialog">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认操作</AlertDialogTitle>
          <AlertDialogDescription>
            {{ confirmMessage }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="showConfirmDialog = false">
            取消
          </AlertDialogCancel>
          <AlertDialogAction @click="handleConfirm">
            确认
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- Create File Dialog -->
    <Dialog v-model:open="showCreateDialog">
      <DialogContent class="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>新建文件</DialogTitle>
          <DialogDescription>
            在 {{ createParentPath.split(/[\\/]/).pop() || '当前目录' }} 下创建 Markdown 文件
          </DialogDescription>
        </DialogHeader>
        <div class="grid gap-4 py-4">
          <div class="grid items-center gap-4">
            <Input
              id="filename"
              v-model="newFileName"
              class="col-span-3"
              placeholder="请输入文件名（无需 .md 后缀）"
              autofocus
              @keydown.enter="confirmCreateFile"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showCreateDialog = false">
            取消
          </Button>
          <Button @click="confirmCreateFile">
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
:deep(.md-editor) {
  height: 100%;
}
</style>
