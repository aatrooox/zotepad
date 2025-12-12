import { toast } from 'vue-sonner'
import { useSettingRepository } from '~/composables/repositories/useSettingRepository'

export function useCOSManager() {
  const { setSetting, getSettingsByCategory } = useSettingRepository()

  const cosSecretId = ref('')
  const cosSecretKey = ref('')
  const cosBucket = ref('')
  const cosRegion = ref('')
  const cosPathPrefix = ref('')
  const cosCustomDomain = ref('')
  const isExporting = ref(false)
  const isImporting = ref(false)

  const loadCOSSettings = async () => {
    try {
      const settings = await getSettingsByCategory('cos')
      cosSecretId.value = settings.secret_id || ''
      cosSecretKey.value = settings.secret_key || ''
      cosBucket.value = settings.bucket || ''
      cosRegion.value = settings.region || ''
      cosPathPrefix.value = settings.path_prefix || ''
      cosCustomDomain.value = settings.custom_domain || ''
    }
    catch (e) {
      console.error('加载 COS 配置失败:', e)
      toast.error('加载 COS 配置失败')
    }
  }

  const saveCOSSettings = async () => {
    try {
      await setSetting('secret_id', cosSecretId.value, 'cos')
      await setSetting('secret_key', cosSecretKey.value, 'cos')
      await setSetting('bucket', cosBucket.value, 'cos')
      await setSetting('region', cosRegion.value, 'cos')
      await setSetting('path_prefix', cosPathPrefix.value, 'cos')
      await setSetting('custom_domain', cosCustomDomain.value, 'cos')
      toast.success('COS 配置已保存')
    }
    catch (e) {
      console.error('保存 COS 配置失败:', e)
      toast.error('保存 COS 配置失败')
    }
  }

  const handleExportCOS = async () => {
    if (isExporting.value)
      return

    try {
      isExporting.value = true

      if (!cosSecretId.value && !cosSecretKey.value && !cosBucket.value && !cosRegion.value) {
        toast.warning('没有可导出的 COS 配置')
        return
      }

      // 动态导入剪贴板插件（仅客户端）
      if (!import.meta.client)
        return

      const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')

      const exportData = {
        version: 1,
        exportDate: new Date().toISOString(),
        type: 'cos_config',
        data: {
          secret_id: cosSecretId.value,
          secret_key: cosSecretKey.value,
          bucket: cosBucket.value,
          region: cosRegion.value,
          path_prefix: cosPathPrefix.value,
          custom_domain: cosCustomDomain.value,
        },
      }

      await writeText(JSON.stringify(exportData, null, 2))
      toast.success('COS 配置已导出到剪贴板')
    }
    catch (e) {
      console.error('导出失败:', e)
      toast.error('导出失败')
    }
    finally {
      isExporting.value = false
    }
  }

  const handleImportCOS = async () => {
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
      if (!importData.version || importData.type !== 'cos_config' || !importData.data) {
        toast.error('剪贴板数据格式不正确，请确保是 COS 配置数据')
        return
      }

      const data = importData.data

      // 更新配置
      if (data.secret_id !== undefined)
        cosSecretId.value = data.secret_id
      if (data.secret_key !== undefined)
        cosSecretKey.value = data.secret_key
      if (data.bucket !== undefined)
        cosBucket.value = data.bucket
      if (data.region !== undefined)
        cosRegion.value = data.region
      if (data.path_prefix !== undefined)
        cosPathPrefix.value = data.path_prefix
      if (data.custom_domain !== undefined)
        cosCustomDomain.value = data.custom_domain

      // 自动保存
      await saveCOSSettings()

      toast.success('COS 配置已导入')
    }
    catch (e) {
      console.error('导入失败:', e)
      if (e instanceof SyntaxError) {
        toast.error('剪贴板内容不是有效的 JSON 格式')
      }
      else {
        toast.error('导入失败')
      }
    }
    finally {
      isImporting.value = false
    }
  }

  return {
    cosSecretId,
    cosSecretKey,
    cosBucket,
    cosRegion,
    cosPathPrefix,
    cosCustomDomain,
    isExporting,
    isImporting,
    loadCOSSettings,
    saveCOSSettings,
    handleExportCOS,
    handleImportCOS,
  }
}
