import { toast } from 'vue-sonner'
import { useSettingRepository } from '~/composables/repositories/useSettingRepository'
import { useWorkflowRepository } from '~/composables/repositories/useWorkflowRepository'
import { useSyncEngine } from '~/composables/sync/useSyncEngine'
import { useEnvironment } from '~/composables/useEnvironment'
import { useTauriSQL } from '~/composables/useTauriSQL'
import { getSyncTableNames, SYNC_TABLES } from '~/config/sync-tables'

interface SyncInfoState {
  status: 'idle' | 'ok' | 'error'
  message: string
  version: number | null
  paired?: boolean
}

interface SyncSummary {
  pulled: number
  pushed: number
  at: number
}

interface SyncTotalSummary {
  pulled: number
  pushed: number
}

const SYNC_WORKFLOW_NAME = '🔗 局域网同步测试'

// 使用 useState 创建全局单例状态,确保所有页面共享同一份数据
const globalServerUrl = () => useState('sync_server_url', () => '')
const globalSyncServerAddress = () => useState('sync_server_address', () => '')
const globalSyncToken = () => useState('sync_token', () => '')
const globalLastVersion = () => useState('sync_last_version', () => 0) // 改为 lastVersion
const globalLastSyncSummary = () => useState<SyncSummary | null>('sync_last_summary', () => null)
const globalTotalSyncSummary = () => useState<SyncTotalSummary>('sync_total_summary', () => ({ pulled: 0, pushed: 0 }))
const globalIsSyncing = () => useState('sync_is_syncing', () => false)
const globalSyncStatus = () => useState('sync_status', () => '未同步')
const globalSyncInfo = () => useState<SyncInfoState>('sync_info', () => ({ status: 'idle', message: '', version: null, paired: false }))
const globalSyncWorkflowId = () => useState<number | null>('sync_workflow_id', () => null)

export function useSyncManager() {
  const { setSetting, getSetting } = useSettingRepository()
  const { createWorkflow, getAllWorkflows, deleteWorkflow } = useWorkflowRepository()
  const syncEngine = useSyncEngine()
  const { isDesktop } = useEnvironment()

  // 使用全局状态
  const serverUrl = globalServerUrl()
  const syncServerAddress = globalSyncServerAddress()
  const syncToken = globalSyncToken()
  const lastVersion = globalLastVersion()
  const lastSyncSummary = globalLastSyncSummary()
  const totalSyncSummary = globalTotalSyncSummary()
  const isSyncing = globalIsSyncing()
  const syncStatus = globalSyncStatus()
  const syncInfo = globalSyncInfo()
  const syncWorkflowId = globalSyncWorkflowId()
  const activity = useActivityStatus()

  const isSavingSyncConfig = ref(false)

  function getSyncBaseUrl() {
    return syncServerAddress.value.trim() || serverUrl.value.trim()
  }

  function buildSyncHeaders() {
    const token = syncToken.value.trim() || 'zotepad-dev-token'
    return { Authorization: `Bearer ${token}` }
  }

  function bumpTotalSyncCounts(deltaPulled: number, deltaPushed: number) {
    const currentPulled = totalSyncSummary.value?.pulled || 0
    const currentPushed = totalSyncSummary.value?.pushed || 0
    const next = { pulled: currentPulled + deltaPulled, pushed: currentPushed + deltaPushed }
    totalSyncSummary.value = next
    setSetting('sync_total_counts', JSON.stringify(next), 'sync').catch((e) => {
      console.error('save sync_total_counts failed', e)
    })
  }

  async function fetchSyncState() {
    const base = getSyncBaseUrl()
    console.log('[Sync] fetchSyncState 开始, base=', base)
    if (!base)
      throw new Error('请先配置服务器地址')

    console.log('[Sync] 发送 state 请求到:', `${base}/state`)
    try {
      const res = await fetch(`${base}/state`, {
        headers: buildSyncHeaders(),
        mode: 'cors',
        cache: 'no-cache',
      })
      console.log('[Sync] state 响应状态:', res.status, res.statusText)

      if (!res.ok)
        throw new Error(`state 请求失败: ${res.status}`)
      const data = await res.json()
      console.log('[Sync] state 响应数据:', data)
      return data.data as { version: number, paired?: boolean, server_version?: string }
    }
    catch (fetchError: any) {
      console.error('[Sync] fetch 请求失败:', fetchError)
      console.error('[Sync] fetch 错误类型:', fetchError.constructor.name)
      console.error('[Sync] fetch 错误消息:', fetchError.message)

      // 尝试提供更详细的错误信息
      if (fetchError.message?.includes('Failed to fetch')) {
        console.error('[Sync] 这是网络连接失败。可能原因:')
        console.error('[Sync] 1. 设备不在同一 WiFi 网络')
        console.error('[Sync] 2. 服务器地址错误:', base)
        console.error('[Sync] 3. 服务器未启动')
        console.error('[Sync] 4. 防火墙阻止了连接')
      }
      throw fetchError
    }
  }

  /**
   * 同步所有表的本地变更和远程变更
   */
  /**
   * 同步单个表
   * @param tableName 表名 (notes | moments | assets | workflows)
   * @param silent 是否静默同步（不显示 Toast）
   */
  async function syncTable(tableName: string, silent = false) {
    const base = getSyncBaseUrl()
    if (!base) {
      console.warn('[Sync] 同步终止: 未配置服务器地址')
      if (!silent) {
        toast.error('请先配置服务器地址')
      }
      return { pulled: 0, pushed: 0, version: lastVersion.value }
    }

    const table = SYNC_TABLES[tableName]
    if (!table) {
      console.error(`[Sync] 表 ${tableName} 不存在`)
      return { pulled: 0, pushed: 0, version: lastVersion.value }
    }

    const headers = buildSyncHeaders()
    const currentVersion = lastVersion.value || 0
    let totalPulled = 0
    let totalPushed = 0
    let maxVersion = currentVersion

    console.log(`[Sync] 开始同步单表: ${tableName}, currentVersion=${currentVersion}`)

    try {
      // 桌面端：升级本地负数版本号
      if (isDesktop.value) {
        const { upgraded, finalVersion } = await syncEngine.upgradeLocalVersions(table, maxVersion)
        if (upgraded > 0) {
          console.log(`[Sync] 桌面端: ${tableName} 升级 ${upgraded} 条记录，版本号 -> ${finalVersion}`)
          maxVersion = finalVersion
          totalPushed += upgraded
        }
      }
      else {
        // 移动端：推送本地变更
        const pushResult = await syncEngine.pushTableChanges(table, base, headers, currentVersion)
        totalPushed += pushResult.applied
        maxVersion = Math.max(maxVersion, pushResult.server_version)
        console.log(`[Sync] ${tableName} 推送完成:`, pushResult)
      }

      // 拉取远程变更
      const pullResult = await syncEngine.pullTableChanges(table, base, headers, currentVersion)
      totalPulled += pullResult.pulled
      maxVersion = Math.max(maxVersion, pullResult.lastServerVersion)
      console.log(`[Sync] ${tableName} 拉取完成:`, pullResult)

      // 更新版本号
      if (maxVersion > lastVersion.value) {
        lastVersion.value = maxVersion
        await setSetting('sync_last_version', String(maxVersion), 'sync')
        console.log('[Sync] 单表同步更新 lastVersion 到:', maxVersion)
      }

      // 更新统计
      if (totalPulled > 0 || totalPushed > 0) {
        lastSyncSummary.value = { pulled: totalPulled, pushed: totalPushed, at: Date.now() }
        await setSetting('sync_last_summary', JSON.stringify(lastSyncSummary.value), 'sync')
        bumpTotalSyncCounts(totalPulled, totalPushed)
      }

      // 更新 Activity 指示器
      activity.setSyncCounts(totalPushed, totalPulled)

      return { pulled: totalPulled, pushed: totalPushed, version: maxVersion }
    }
    catch (e: any) {
      console.error(`[Sync] ${tableName} 同步失败:`, e)
      throw e
    }
  }

  /**
   * 同步所有表的本地变更和远程变更
   */
  async function syncAllTables(_silent = false) {
    const base = getSyncBaseUrl()
    const headers = buildSyncHeaders()
    const currentVersion = lastVersion.value || 0

    let totalPulled = 0
    let totalPushed = 0
    let maxVersion = currentVersion

    // 遍历所有可同步的表
    const tableNames = getSyncTableNames()
    console.log('[Sync] 开始同步表:', tableNames)

    for (const tableName of tableNames) {
      const table = SYNC_TABLES[tableName]
      if (!table)
        continue

      try {
        console.log(`[Sync] 同步表: ${tableName}`)

        // 桌面端：升级本地负数版本号
        if (isDesktop.value) {
          const { upgraded, finalVersion } = await syncEngine.upgradeLocalVersions(table, maxVersion)
          if (upgraded > 0) {
            console.log(`[Sync] 桌面端: ${tableName} 升级 ${upgraded} 条记录，版本号 -> ${finalVersion}`)
            maxVersion = finalVersion
            totalPushed += upgraded
          }
        }
        else {
          // 移动端：推送本地变更
          const pushResult = await syncEngine.pushTableChanges(table, base, headers, currentVersion)
          totalPushed += pushResult.applied
          maxVersion = Math.max(maxVersion, pushResult.server_version)
          console.log(`[Sync] ${tableName} 推送完成:`, pushResult)
        }

        // 拉取远程变更
        const pullResult = await syncEngine.pullTableChanges(table, base, headers, currentVersion)
        totalPulled += pullResult.pulled
        maxVersion = Math.max(maxVersion, pullResult.lastServerVersion)
        console.log(`[Sync] ${tableName} 拉取完成:`, pullResult)

        // 更新 Activity 指示器
        activity.setSyncCounts(totalPushed, totalPulled)
      }
      catch (e: any) {
        console.error(`[Sync] ${tableName} 同步失败:`, e)
        // 继续同步其他表，不中断整个流程
      }
    }

    return { totalPulled, totalPushed, maxVersion }
  }

  async function syncOnce(silent = false) {
    const base = getSyncBaseUrl()
    console.log('[Sync] syncOnce 被调用, silent=', silent, ', base=', base)

    if (!base) {
      console.warn('[Sync] 同步终止: 未配置服务器地址')
      if (!silent) {
        toast.error('请先配置服务器地址')
      }
      return
    }

    console.log('[Sync] ========== 开始同步 ==========')
    console.log('[Sync] 当前 lastVersion:', lastVersion.value)

    isSyncing.value = true
    syncStatus.value = '同步中…'
    activity.setSyncState(true)

    const toastId = silent ? undefined : undefined // Disable loading toast
    try {
      console.log('[Sync] 准备调用 fetchSyncState, base=', base)
      const state = await fetchSyncState()
      console.log('[Sync] fetchSyncState 成功,服务器状态:', JSON.stringify(state, null, 2))
      syncInfo.value = { status: 'ok', message: '服务器可用', version: state.version ?? null, paired: state.paired }

      // 检测服务器版本号异常(时间戳污染)
      const MAX_REASONABLE_VERSION = 1000000
      if (state.version && state.version > MAX_REASONABLE_VERSION) {
        const errorMsg = '服务器版本号异常,请在桌面端执行"重置同步状态"'
        console.error('[Sync]', errorMsg, '服务器版本:', state.version)
        syncStatus.value = errorMsg
        syncInfo.value = { status: 'error', message: errorMsg, version: state.version, paired: state.paired }
        if (!silent) {
          toast.error(errorMsg, { id: toastId, duration: 6000 })
        }
        isSyncing.value = false
        return
      }

      // 执行多表同步
      const { totalPulled, totalPushed, maxVersion } = await syncAllTables(silent)

      console.log('[Sync] 同步完成:', {
        maxVersion,
        pulled: totalPulled,
        pushed: totalPushed,
      })

      // 总是更新 lastVersion 为服务器版本号
      if (maxVersion > lastVersion.value) {
        lastVersion.value = maxVersion
        await setSetting('sync_last_version', String(maxVersion), 'sync')
        console.log('[Sync] 更新 lastVersion 到:', maxVersion)
      }

      lastSyncSummary.value = { pulled: totalPulled, pushed: totalPushed, at: Date.now() }
      await setSetting('sync_last_summary', JSON.stringify(lastSyncSummary.value), 'sync')
      bumpTotalSyncCounts(lastSyncSummary.value.pulled, lastSyncSummary.value.pushed)

      syncStatus.value = '已同步'

      if (lastSyncSummary.value.pulled > 0 || lastSyncSummary.value.pushed > 0) {
        const parts: string[] = []
        if (lastSyncSummary.value.pulled > 0) {
          parts.push(`拉取 ${lastSyncSummary.value.pulled} 条`)
        }
        if (lastSyncSummary.value.pushed > 0) {
          parts.push(`推送 ${lastSyncSummary.value.pushed} 条`)
        }
        // 有变更时总是提示，忽略 silent
        // toast.success(`同步完成: ${parts.join(', ')}`, { id: toastId })
      }
      else {
        if (!silent) {
          // toast.success('已是最新', { id: toastId })
        }
      }
    }
    catch (e: any) {
      console.error('[Sync] 同步失败,错误对象:', e)
      console.error('[Sync] 错误消息:', e.message)
      console.error('[Sync] 错误堆栈:', e.stack)

      // 用户友好的错误提示
      let userMessage = '同步失败'
      if (e.message?.includes('Failed to fetch') || e.message?.includes('NetworkError')) {
        userMessage = '无法连接到服务器，请检查网络和服务器地址'
      }
      else if (e.message?.includes('401') || e.message?.includes('403')) {
        userMessage = '认证失败，请检查 Token 配置'
      }
      else if (e.message?.includes('404')) {
        userMessage = '服务器接口不存在，请检查服务器地址'
      }
      else if (e.message?.includes('422')) {
        userMessage = '数据冲突，请在桌面端和移动端都执行"重置同步状态"'
      }
      else if (e.message?.includes('timeout')) {
        userMessage = '请求超时，请稍后重试'
      }

      syncStatus.value = userMessage

      // silent 模式下不显示 toast,避免干扰用户
      if (!silent) {
        toast.error(userMessage, { id: toastId })
      }
      else if (toastId) {
        toast.dismiss(toastId)
      }
    }
    finally {
      if (toastId) {
        toast.dismiss(toastId)
      }
      isSyncing.value = false
      activity.setSyncState(false)
      // Reset counts after a short delay to allow the user to see the final state
      setTimeout(() => {
        activity.setSyncCounts(0, 0)
      }, 3500)
    }
  }

  async function refreshSyncStateCard() {
    const base = getSyncBaseUrl()
    if (!base) {
      syncInfo.value = { status: 'error', message: '未配置服务器地址', version: null, paired: false }
      return
    }
    try {
      const state = await fetchSyncState()
      syncInfo.value = { status: 'ok', message: '服务器可用', version: state.version ?? null, paired: state.paired }
    }
    catch (e: any) {
      console.error('获取同步状态失败:', e)
      let userMessage = '连接失败'
      if (e.message?.includes('Failed to fetch') || e.message?.includes('NetworkError')) {
        userMessage = '无法连接到服务器'
      }
      else if (e.message?.includes('401') || e.message?.includes('403')) {
        userMessage = '认证失败'
      }
      syncInfo.value = { status: 'error', message: userMessage, version: null, paired: false }
    }
  }

  async function loadSyncConfig() {
    const savedAddress = await getSetting('sync_server_address')
    if (savedAddress) {
      syncServerAddress.value = savedAddress
    }
    else if (import.meta.client) {
      // 桌面端没有配置同步地址时,自动使用本地HTTP服务器地址
      try {
        const { isTauri } = await import('@tauri-apps/api/core')
        if (await isTauri()) {
          const { invoke } = await import('@tauri-apps/api/core')
          const ip = await invoke('get_local_ip') as string
          const port = await invoke('get_http_server_port') as number
          const localServerUrl = `http://${ip}:${port}`
          syncServerAddress.value = localServerUrl
          // 保存到数据库,下次直接加载
          await setSetting('sync_server_address', localServerUrl, 'sync')
          console.log('[Sync] 桌面端自动配置同步地址:', localServerUrl)
        }
      }
      catch (e) {
        console.warn('[Sync] 无法自动获取本地服务器地址:', e)
      }
    }

    const savedToken = await getSetting('sync_token')
    if (savedToken)
      syncToken.value = savedToken

    const savedVersion = await getSetting('sync_last_version')
    if (savedVersion)
      lastVersion.value = Number(savedVersion) || 0

    const savedSummary = await getSetting('sync_last_summary')
    if (savedSummary) {
      try {
        const parsed = JSON.parse(savedSummary)
        if (parsed && typeof parsed === 'object') {
          lastSyncSummary.value = {
            pulled: Number(parsed.pulled) || 0,
            pushed: Number(parsed.pushed) || 0,
            at: Number(parsed.at) || 0,
          }
        }
      }
      catch (e) {
        console.error('parse sync_last_summary failed', e)
      }
    }

    const savedTotal = await getSetting('sync_total_counts')
    if (savedTotal) {
      try {
        const parsedTotal = JSON.parse(savedTotal)
        if (parsedTotal && typeof parsedTotal === 'object') {
          totalSyncSummary.value = {
            pulled: Number(parsedTotal.pulled) || 0,
            pushed: Number(parsedTotal.pushed) || 0,
          }
        }
      }
      catch (e) {
        console.error('parse sync_total_counts failed', e)
      }
    }

    const workflows = await getAllWorkflows()
    const syncWorkflow = workflows?.find(w => w.name === SYNC_WORKFLOW_NAME)
    if (syncWorkflow)
      syncWorkflowId.value = syncWorkflow.id

    // 桌面端监听远程推送事件
    if (import.meta.client && isDesktop.value) {
      try {
        const { listen } = await import('@tauri-apps/api/event')
        await listen<number>('sync:incoming', (event) => {
          console.log('[Sync] 收到远程推送通知:', event.payload)
          // 显示"拉取"状态
          activity.setSyncCounts(0, event.payload)
          // 3.5秒后清除状态
          setTimeout(() => {
            activity.setSyncCounts(0, 0)
          }, 3500)

          // 触发列表刷新(如果需要)
          // 这里可以考虑触发一个全局事件或者重新获取数据
          // 目前 index.vue 会在 onActivated 时刷新，或者我们可以手动触发
        })
        console.log('[Sync] 已注册 sync:incoming 监听器')
      }
      catch (e) {
        console.warn('[Sync] 注册监听器失败:', e)
      }
    }
  }

  async function saveSyncConfig() {
    const address = syncServerAddress.value.trim()
    if (!address) {
      toast.error('请输入服务器地址')
      return
    }
    if (!address.startsWith('http://') && !address.startsWith('https://')) {
      toast.error('请输入完整地址，包含 http:// 或 https://')
      return
    }

    isSavingSyncConfig.value = true
    try {
      await setSetting('sync_server_address', address, 'sync')
      if (syncToken.value.trim())
        await setSetting('sync_token', syncToken.value.trim(), 'sync')

      const workflows = await getAllWorkflows()
      const existingWorkflow = workflows?.find(w => w.name === SYNC_WORKFLOW_NAME)
      if (existingWorkflow)
        await deleteWorkflow(existingWorkflow.id)

      const steps = [
        {
          id: 'health-check',
          name: '健康检查',
          type: 'api',
          url: `${address}/health`,
          method: 'GET',
          headers: {},
          body: '',
          timeout: 5000,
        },
      ]

      const newId = await createWorkflow(SYNC_WORKFLOW_NAME, '测试与桌面端的局域网连接', steps)
      syncWorkflowId.value = newId ?? null
      toast.success('同步配置已保存,流已创建')
      await refreshSyncStateCard()
    }
    catch (e: any) {
      console.error('Failed to save sync config:', e)
      toast.error(`保存失败: ${e.message}`)
    }
    finally {
      isSavingSyncConfig.value = false
    }
  }

  async function resetSyncState() {
    toast('确定要重置同步状态吗？这将清除版本号和统计,但保留服务器地址配置。', {
      action: {
        label: '重置',
        onClick: async () => {
          try {
            await setSetting('sync_last_version', '0', 'sync')
            await setSetting('sync_last_summary', '', 'sync')
            await setSetting('sync_total_counts', JSON.stringify({ pulled: 0, pushed: 0 }), 'sync')
            lastVersion.value = 0
            lastSyncSummary.value = null
            totalSyncSummary.value = { pulled: 0, pushed: 0 }

            // 清理数据库中被污染的大版本号（针对所有表）
            try {
              const tableNames = getSyncTableNames()
              for (const tableName of tableNames) {
                const { execute } = useTauriSQL()
                await execute(
                  `UPDATE ${tableName} SET version = 0 WHERE version > 1000000`,
                  [],
                )
                console.log(`[Sync] 已清理 ${tableName} 表中的异常版本号`)
              }
            }
            catch (e) {
              console.error('[Sync] 清理数据库版本号失败:', e)
            }

            toast.success('同步状态已重置,请重新同步')
          }
          catch (e: any) {
            console.error('Failed to reset sync state:', e)
            toast.error(`重置失败: ${e.message}`)
          }
        },
      },
      cancel: { label: '取消' },
    })
  }

  async function deleteSyncConfig() {
    toast('确定要删除同步配置吗？', {
      action: {
        label: '删除',
        onClick: async () => {
          try {
            await setSetting('sync_server_address', '', 'sync')
            await setSetting('sync_token', '', 'sync')
            await setSetting('sync_last_version', '0', 'sync')
            await setSetting('sync_total_counts', '0', 'sync')
            syncServerAddress.value = ''
            syncToken.value = ''
            lastVersion.value = 0
            totalSyncSummary.value = { pulled: 0, pushed: 0 }

            if (syncWorkflowId.value) {
              await deleteWorkflow(syncWorkflowId.value)
              syncWorkflowId.value = null
            }

            toast.success('同步配置已删除')
          }
          catch (e: any) {
            console.error('Failed to delete sync config:', e)
            toast.error(`删除失败: ${e.message}`)
          }
        },
      },
      cancel: { label: '取消' },
    })
  }

  const lastSyncText = computed(() => {
    if (!lastVersion.value)
      return '从未同步'
    return `版本 ${lastVersion.value}`
  })

  const lastSyncCountText = computed(() => {
    if (!lastSyncSummary.value)
      return ''
    const { pulled, pushed } = lastSyncSummary.value
    return `上次 ↓${pulled} ↑${pushed}`
  })

  const totalSyncCountText = computed(() => {
    if (!totalSyncSummary.value)
      return ''
    const { pulled, pushed } = totalSyncSummary.value
    if (!pulled && !pushed)
      return ''
    return `累计 ↓${pulled} ↑${pushed}`
  })

  const syncSummaryText = computed(() => {
    const parts: string[] = []
    
    if (lastVersion.value) {
      parts.push(`版本 ${lastVersion.value}`)
    }
    
    if (lastSyncSummary.value) {
      const { pulled, pushed } = lastSyncSummary.value
      if (pulled > 0 || pushed > 0) {
        parts.push(`上次 ↓${pulled} ↑${pushed}`)
      }
    }
    
    if (totalSyncSummary.value) {
      const { pulled, pushed } = totalSyncSummary.value
      if (pulled > 0 || pushed > 0) {
        parts.push(`累计 ↓${pulled} ↑${pushed}`)
      }
    }
    
    return parts.length > 0 ? parts.join(' · ') : '暂无同步记录'
  })

  return {
    SYNC_WORKFLOW_NAME,
    serverUrl,
    syncServerAddress,
    isSavingSyncConfig,
    syncWorkflowId,
    syncToken,
    lastVersion,
    lastSyncSummary,
    totalSyncSummary,
    isSyncing,
    syncStatus,
    syncInfo,
    lastSyncText,
    lastSyncCountText,
    totalSyncCountText,
    syncSummaryText,
    loadSyncConfig,
    saveSyncConfig,
    resetSyncState,
    deleteSyncConfig,
    syncTable,
    syncOnce,
    refreshSyncStateCard,
  }
}
