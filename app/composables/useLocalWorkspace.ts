import { join } from '@tauri-apps/api/path'
import { open } from '@tauri-apps/plugin-dialog'
import { exists, readDir, writeTextFile } from '@tauri-apps/plugin-fs'
import { useStorage } from '@vueuse/core'

export interface FileNode {
  name: string
  path: string
  kind: 'file' | 'directory'
  children?: FileNode[]
  isOpen?: boolean // for directories
}

export function useLocalWorkspace() {
  // 持久化存储工作区路径
  const workspacePath = useStorage<string | null>('zotepad:workspace_path', null)

  const fileTree = ref<FileNode[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const { toast } = useToast()

  // 排序：文件夹在前，文件在后，按名称排序
  const sortNodes = (nodes: FileNode[]) => {
    return nodes.sort((a, b) => {
      if (a.kind === b.kind) {
        return a.name.localeCompare(b.name)
      }
      return a.kind === 'directory' ? -1 : 1
    })
  }

  // 递归读取目录 (简单起见，这里设置深度限制或仅读取一层，
  // 但为了体验，我们设计为：传递一个 parent path，如有则读取该 parent 下的内容。
  // 更好的方式是：加载根目录，子目录点击时展开加载)

  // 这里我们采用"懒加载 + 缓存"混合模式，或者是简单的"全量/按需"模式。
  // 为了配合 FileTree 组件，我们先实现一个读取指定路径下所有直接子节点的函数

  const readDirectory = async (path: string): Promise<FileNode[]> => {
    try {
      const entries = await readDir(path)
      const nodes: FileNode[] = []

      for (const entry of entries) {
        // 过滤隐藏文件和非 .md 文件 (如果是文件的话)
        if (entry.name.startsWith('.'))
          continue

        let kind: 'file' | 'directory' = 'file'
        if (entry.isDirectory)
          kind = 'directory'
        else if (entry.isFile)
          kind = 'file'
        else continue // ignore symlinks for now

        // 如果是文件，只显示 markdown
        if (kind === 'file' && !entry.name.endsWith('.md'))
          continue

        // 构造完整路径
        // 注意：readDir 返回的 entry.name 只是文件名，我们需要拼接
        const fullPath = await join(path, entry.name)

        nodes.push({
          name: entry.name,
          path: fullPath,
          kind,
          children: kind === 'directory' ? [] : undefined,
          isOpen: false, // 默认折叠
        })
      }
      return sortNodes(nodes)
    }
    catch (e: any) {
      console.error(`Failed to read dir ${path}:`, e)
      throw e
    }
  }

  // 初始化或刷新根目录
  const refreshWorkspace = async () => {
    if (!workspacePath.value)
      return

    try {
      isLoading.value = true
      error.value = null
      // 读取根目录
      fileTree.value = await readDirectory(workspacePath.value)
    }
    catch (e: any) {
      error.value = `无法读取工作区: ${e.message}`
      toast.error(error.value)
      // 如果目录不存在，可能需要重置 workspacePath
      // workspacePath.value = null
    }
    finally {
      isLoading.value = false
    }
  }

  // 选择工作区
  const chooseWorkspace = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择本地工作区文件夹',
      })

      if (selected && typeof selected === 'string') {
        workspacePath.value = selected
        await refreshWorkspace()
        return true
      }
    }
    catch (e: any) {
      console.error(e)
      toast.error('选择文件夹失败')
    }
    return false
  }

  // 加载子目录 (用于展开文件夹)
  const loadSubNode = async (node: FileNode) => {
    if (node.kind !== 'directory')
      return
    try {
      const children = await readDirectory(node.path)
      node.children = children
      node.isOpen = true
    }
    catch {
      toast.error('无法读取子目录')
    }
  }

  // 简单的创建文件
  const createMarkdownFile = async (parentPath: string, fileName: string) => {
    if (!fileName.endsWith('.md'))
      fileName += '.md'
    try {
      const fullPath = await join(parentPath, fileName)
      if (await exists(fullPath)) {
        throw new Error('文件已存在')
      }
      await writeTextFile(fullPath, '')
      // 简单的处理：刷新整个工作区或局部刷新，这里为了稳健先重新加载该父目录的子节点
      // 但由于我们没有维护父节点引用，可能需要 UI 层配合。
      // 为简化，这里返回 fullPath，让调用者决定怎么做。
      return fullPath
    }
    catch (e: any) {
      console.error(e)
      throw e
    }
  }

  return {
    workspacePath,
    fileTree,
    isLoading,
    chooseWorkspace,
    refreshWorkspace,
    readDirectory,
    loadSubNode,
    createMarkdownFile,
  }
}
