import { toast } from 'vue-sonner'
import { useEnvironmentRepository } from '~/composables/repositories/useEnvironmentRepository'

export function useEnvironmentManager() {
  const { getAllEnvs, createEnv, deleteEnv } = useEnvironmentRepository()

  const envs = ref<Awaited<ReturnType<typeof getAllEnvs>>>([])
  const newEnvKey = ref('')
  const newEnvValue = ref('')
  const isExporting = ref(false)
  const isImporting = ref(false)

  const loadEnvs = async () => {
    try {
      const result = await getAllEnvs()
      envs.value = result || []
    }
    catch (e) {
      console.error(e)
      toast.error('加载环境变量失败')
    }
  }

  const handleAddEnv = async () => {
    if (!newEnvKey.value || !newEnvValue.value) {
      toast.error('键和值不能为空')
      return
    }
    try {
      await createEnv(newEnvKey.value, newEnvValue.value)
      newEnvKey.value = ''
      newEnvValue.value = ''
      await loadEnvs()
      toast.success('环境变量已添加')
    }
    catch (e) {
      console.error(e)
      toast.error('添加失败，键名可能重复')
    }
  }

  const handleDeleteEnv = (id: number) => {
    toast('确定要删除该环境变量吗？', {
      action: {
        label: '删除',
        onClick: async () => {
          try {
            await deleteEnv(id)
            await loadEnvs()
            toast.success('环境变量已删除')
          }
          catch (e) {
            console.error(e)
            toast.error('删除失败')
          }
        },
      },
      cancel: { label: '取消' },
    })
  }

  const handleExportEnvs = async () => {
    if (isExporting.value)
      return

    try {
      isExporting.value = true

      if (envs.value.length === 0) {
        toast.warning('没有可导出的环境变量')
        return
      }

      // 动态导入剪贴板插件（仅客户端）
      if (!import.meta.client)
        return

      const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')

      const exportData = {
        version: 1,
        exportDate: new Date().toISOString(),
        data: envs.value.map(env => ({
          key: env.key,
          value: env.value,
        })),
      }

      await writeText(JSON.stringify(exportData, null, 2))
      toast.success(`已导出 ${envs.value.length} 个环境变量到剪贴板`)
    }
    catch (e) {
      console.error('导出失败:', e)
      toast.error('导出失败')
    }
    finally {
      isExporting.value = false
    }
  }

  const handleImportEnvs = async () => {
    if (isImporting.value)
      return

    try {
      isImporting.value = true

      // 动态导入剪贴板插件（仅客户端）
      if (!import.meta.client)
        return

      const { readText } = await import('@tauri-apps/plugin-clipboard-manager')

      const content = await readText()
      if (!content) {
        toast.error('剪贴板为空')
        return
      }

      const importData = JSON.parse(content)

      // 验证数据格式
      if (!importData.version || !Array.isArray(importData.data)) {
        toast.error('剪贴板数据格式不正确')
        return
      }

      // 统计导入结果
      let successCount = 0
      let skipCount = 0
      let errorCount = 0

      for (const item of importData.data) {
        if (!item.key || !item.value) {
          errorCount++
          continue
        }

        try {
          // 检查是否已存在
          const existing = envs.value.find(env => env.key === item.key)
          if (existing) {
            skipCount++
            continue
          }

          await createEnv(item.key, item.value)
          successCount++
        }
        catch (e) {
          console.error(`导入 ${item.key} 失败:`, e)
          errorCount++
        }
      }

      await loadEnvs()

      // 显示导入结果
      if (successCount > 0) {
        toast.success(`成功导入 ${successCount} 个环境变量${skipCount > 0 ? `，跳过 ${skipCount} 个已存在` : ''}${errorCount > 0 ? `，失败 ${errorCount} 个` : ''}`)
      }
      else if (skipCount > 0) {
        toast.info(`所有环境变量已存在，跳过 ${skipCount} 个`)
      }
      else {
        toast.error('导入失败')
      }
    }
    catch (e) {
      console.error('导入失败:', e)
      toast.error('导入失败，请检查剪贴板内容')
    }
    finally {
      isImporting.value = false
    }
  }

  return {
    envs,
    newEnvKey,
    newEnvValue,
    isExporting,
    isImporting,
    loadEnvs,
    handleAddEnv,
    handleDeleteEnv,
    handleExportEnvs,
    handleImportEnvs,
  }
}
