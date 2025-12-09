import { toast } from 'vue-sonner'

export function useDesktopServer() {
  const serverUrl = ref('')
  const isLoadingServerInfo = ref(false)
  const isTestingConnection = ref(false)

  async function loadServerInfo(refreshSyncState?: () => Promise<void>) {
    isLoadingServerInfo.value = true
    try {
      // 检查是否在 Tauri 环境中
      const { isTauri } = await import('@tauri-apps/api/core')
      if (!await isTauri()) {
        console.warn('[Desktop] 不在 Tauri 环境中,无法获取服务器信息')
        serverUrl.value = '仅在 Tauri 桌面端可用'
        toast.error('请在 Tauri 桌面端运行')
        return
      }

      const { invoke } = await import('@tauri-apps/api/core')
      console.log('[Desktop] 开始获取本地 IP...')
      const ip = await invoke('get_local_ip') as string
      console.log('[Desktop] 本地 IP:', ip)

      console.log('[Desktop] 开始获取服务器端口...')
      const port = await invoke('get_http_server_port') as number
      console.log('[Desktop] 服务器端口:', port)

      serverUrl.value = `http://${ip}:${port}`
      console.log('[Desktop] 服务器地址:', serverUrl.value)

      if (refreshSyncState && typeof refreshSyncState === 'function')
        await refreshSyncState()
    }
    catch (e: any) {
      console.error('[Desktop] 获取服务器信息失败:', e)
      console.error('[Desktop] 错误详情:', {
        name: e.name,
        message: e.message,
        stack: e.stack,
      })
      serverUrl.value = '获取失败'
      toast.error(`无法获取服务器地址: ${e.message || '未知错误'}`)
    }
    finally {
      isLoadingServerInfo.value = false
    }
  }

  async function copyServerUrl() {
    if (!serverUrl.value || serverUrl.value === '获取失败') {
      toast.error('服务器地址无效')
      return
    }
    try {
      await navigator.clipboard.writeText(serverUrl.value)
      toast.success('已复制到剪贴板')
    }
    catch {
      toast.error('复制失败')
    }
  }

  async function testConnection() {
    if (!serverUrl.value || serverUrl.value === '获取失败' || serverUrl.value === '仅在 Tauri 桌面端可用') {
      toast.error('请先获取服务器地址')
      return
    }
    isTestingConnection.value = true
    try {
      // 在 Tauri 环境中使用 Tauri HTTP 插件
      const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http')
      console.log('[Desktop] 测试连接:', serverUrl.value)

      const response = await tauriFetch(`${serverUrl.value}/health`, {
        method: 'GET',
        connectTimeout: 5000,
      })

      console.log('[Desktop] 响应状态:', response.status)

      if (!response.ok)
        throw new Error(`HTTP ${response.status}`)

      const data = await response.json()
      console.log('[Desktop] 响应数据:', data)

      if (data.success && data.data) {
        const timestamp = new Date(data.data.timestamp).toLocaleString()
        toast.success(`连接成功！\n服务器: ${data.data.server_ip}\n时间: ${timestamp}`, { duration: 5000 })
      }
      else {
        toast.warning('服务器响应异常')
      }
    }
    catch (e: any) {
      console.error('[Desktop] 连接测试失败:', e)
      let userMessage = '连接失败'
      if (e.message?.includes('Failed to fetch') || e.message?.includes('NetworkError') || e.message?.includes('error sending request')) {
        userMessage = '无法连接到服务器，请检查网络和地址'
      }
      else if (e.message?.includes('timeout')) {
        userMessage = '连接超时，请稍后重试'
      }
      toast.error(userMessage)
    }
    finally {
      isTestingConnection.value = false
    }
  }

  return {
    serverUrl,
    isLoadingServerInfo,
    isTestingConnection,
    loadServerInfo,
    copyServerUrl,
    testConnection,
  }
}
