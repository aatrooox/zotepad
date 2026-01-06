import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'

export function useLocalMarkdown() {
  const currentFilePath = ref<string | null>(null)
  const fileContent = ref<string>('')
  const isDirty = ref(false)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // 监听内容变化设置 dirty 状态
  // 注意：在实际绑定中，打开文件后的初始赋值不应触发 dirty，需自行处理或在 openFile 后重置
  watch(fileContent, () => {
    isDirty.value = true
  })

  const resetState = () => {
    currentFilePath.value = null
    fileContent.value = ''
    isDirty.value = false
    error.value = null
  }

  const openFile = async () => {
    try {
      isLoading.value = true
      error.value = null

      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Markdown',
          extensions: ['md', 'markdown'],
        }],
      })

      if (selected && typeof selected === 'string') {
        const content = await readTextFile(selected)
        currentFilePath.value = selected
        fileContent.value = content
        // 重置 dirty 状态，因为刚加载
        nextTick(() => {
          isDirty.value = false
        })
        return true
      }
    }
    catch (e: any) {
      error.value = `无法打开文件: ${e.message || e}`
      console.error(e)
    }
    finally {
      isLoading.value = false
    }
    return false
  }

  // 直接加载指定路径的文件
  const loadFile = async (path: string) => {
    try {
      isLoading.value = true
      error.value = null

      const content = await readTextFile(path)
      currentFilePath.value = path
      fileContent.value = content

      nextTick(() => {
        isDirty.value = false
      })
      return true
    }
    catch (e: any) {
      error.value = `无法加载文件: ${e.message || e}`
      console.error(e)
    }
    finally {
      isLoading.value = false
    }
    return false
  }

  const saveAsFile = async () => {
    try {
      isLoading.value = true
      error.value = null
      const selected = await save({
        filters: [{
          name: 'Markdown',
          extensions: ['md', 'markdown'],
        }],
        defaultPath: currentFilePath.value || 'untitled.md',
      })

      if (selected) {
        await writeTextFile(selected, fileContent.value)
        currentFilePath.value = selected
        isDirty.value = false
        return true
      }
    }
    catch (e: any) {
      error.value = `另存为失败: ${e.message || e}`
      console.error(e)
    }
    finally {
      isLoading.value = false
    }
    return false
  }

  const saveFile = async () => {
    if (!currentFilePath.value) {
      return saveAsFile()
    }

    try {
      isLoading.value = true
      error.value = null
      await writeTextFile(currentFilePath.value, fileContent.value)
      isDirty.value = false
      return true
    }
    catch (e: any) {
      error.value = `保存失败: ${e.message || e}`
      console.error(e)
    }
    finally {
      isLoading.value = false
    }
    return false
  }

  return {
    currentFilePath,
    fileContent,
    isDirty,
    isLoading,
    error,
    openFile,
    saveFile,
    saveAsFile,
    loadFile,
    resetState,
  }
}
