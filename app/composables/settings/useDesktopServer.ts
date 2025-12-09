import { toast } from 'vue-sonner'

export function useDesktopServer() {
  const serverUrl = ref('')
  const isLoadingServerInfo = ref(false)
  const isTestingConnection = ref(false)

  async function loadServerInfo(refreshSyncState?: () => Promise<void>) {
    isLoadingServerInfo.value = true
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const ip = await invoke('get_local_ip') as string
      const port = await invoke('get_http_server_port') as number
      serverUrl.value = `http://${ip}:${port}`
      if (refreshSyncState)
        await refreshSyncState()
    }
    catch (e: any) {
      console.error('获取服务器信息失败:', e)
      serverUrl.value = '获取失败'
      toast.error('无法获取服务器地址')
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
    if (!serverUrl.value || serverUrl.value === '获取失败') {
      toast.error('请先获取服务器地址')
      return
    }
    isTestingConnection.value = true
    try {
      const response = await fetch(`${serverUrl.value}/health`)
      if (!response.ok)
        throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      if (data.success && data.data) {
        const timestamp = new Date(data.data.timestamp).toLocaleString()
        toast.success(`连接成功！\n服务器: ${data.data.server_ip}\n时间: ${timestamp}`, { duration: 5000 })
      }
      else {
        toast.warning('服务器响应异常')
      }
    }
    catch (e: any) {
      console.error('连接测试失败:', e)
      let userMessage = '连接失败'
      if (e.message?.includes('Failed to fetch') || e.message?.includes('NetworkError')) {
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
