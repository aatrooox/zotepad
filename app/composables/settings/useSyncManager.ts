import { toast } from 'vue-sonner'
import { useSettingRepository } from '~/composables/repositories/useSettingRepository'
import { useWorkflowRepository } from '~/composables/repositories/useWorkflowRepository'
import { useEnvironment } from '~/composables/useEnvironment'
import { useTauriSQL } from '~/composables/useTauriSQL'

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
  const { select: syncSelect, execute: syncExecute } = useTauriSQL()
  const { isDesktop } = useEnvironment()

  // 使用全局状态
  const serverUrl = globalServerUrl()
  const syncServerAddress = globalSyncServerAddress()
  const syncToken = globalSyncToken()
  const lastVersion = globalLastVersion() // 改为 lastVersion
  const lastSyncSummary = globalLastSyncSummary()
  const totalSyncSummary = globalTotalSyncSummary()
  const isSyncing = globalIsSyncing()
  const syncStatus = globalSyncStatus()
  const syncInfo = globalSyncInfo()
  const syncWorkflowId = globalSyncWorkflowId()

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

  async function applyRemoteChanges(changes: any[]) {
    let applied = 0
    for (const change of changes) {
      if (change.table !== 'notes')
        continue
      const id = change.data?.id
      const title = change.data?.title ?? ''
      const content = change.data?.content ?? ''
      const tags = change.data?.tags ?? '[]'
      const updatedAt = change.updated_at || new Date().toISOString()
      const deletedAt = change.deleted_at || null
      const incomingVersion = change.version || 0

      // 检查本地是否已有更新的版本
      const existing = await syncSelect<any[]>(
        'SELECT version FROM notes WHERE id = ?',
        [id],
      )
      if (existing.length > 0) {
        const localVersion = existing[0].version || 0
        if (localVersion >= incomingVersion) {
          console.log(`[Sync] 跳过较旧的远程变更: note ${id}, local=${localVersion}, remote=${incomingVersion}`)
          continue // 本地版本更新,跳过
        }
      }

      if (change.op === 'delete' || deletedAt) {
        await syncExecute(
          `INSERT INTO notes (id, title, content, tags, deleted_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET deleted_at = excluded.deleted_at, updated_at = excluded.updated_at, version = excluded.version`,
          [id, title, content, tags, deletedAt || updatedAt, updatedAt, incomingVersion],
        )
      }
      else {
        await syncExecute(
          `INSERT INTO notes (id, title, content, tags, updated_at, deleted_at, version) VALUES (?, ?, ?, ?, ?, NULL, ?)
           ON CONFLICT(id) DO UPDATE SET title = excluded.title, content = excluded.content, tags = excluded.tags, updated_at = excluded.updated_at, deleted_at = NULL, version = excluded.version`,
          [id, title, content, tags, updatedAt, incomingVersion],
        )
      }
      applied++
      console.log(`[Sync] 应用远程变更: note ${id}, version=${incomingVersion}`)
    }
    return applied
  }

  async function collectLocalNoteChanges(sinceVersion: number) {
    // 收集所有负数版本号(客户端本地编辑,未被服务器分配正数版本)
    // 或者版本号大于 lastVersion 的记录(从其他设备同步过来但还没推送的)
    // 但排除异常大的版本号(时间戳污染,如 1765281618399)
    const MAX_REASONABLE_VERSION = 1000000 // 服务器版本号应该是递增序列,不会超过百万
    const rows = await syncSelect<any[]>(
      'SELECT id, title, content, tags, updated_at, deleted_at, version FROM notes WHERE (version < 0) OR (version > ? AND version < ?)',
      [sinceVersion, MAX_REASONABLE_VERSION],
    )

    return rows.map((row) => {
      const updatedIso = row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString()
      const deletedIso = row.deleted_at ? new Date(row.deleted_at).toISOString() : null
      return {
        table: 'notes',
        op: deletedIso ? 'delete' : 'upsert',
        data: {
          id: row.id,
          title: row.title ?? '',
          content: row.content ?? '',
          tags: row.tags ?? '[]',
          updated_at: updatedIso,
          deleted_at: deletedIso,
        },
        version: row.version || 0,
        updated_at: updatedIso,
        deleted_at: deletedIso,
      }
    })
  }

  async function pullRemoteChanges(sinceVersion: number) {
    const base = getSyncBaseUrl()
    let cursor = sinceVersion
    let lastServerVersion = 0
    let pulled = 0
    let maxPulledVersion = 0

    console.log('[Sync] pullRemoteChanges 开始:', JSON.stringify({ sinceVersion, base }, null, 2))

    while (true) {
      const url = `${base}/pull?since_version=${cursor}&limit=200`
      console.log('[Sync] 请求拉取:', url)
      const res = await fetch(url, { headers: buildSyncHeaders() })
      if (!res.ok)
        throw new Error(`pull 失败: ${res.status}`)
      const body = await res.json()
      const payload = body.data as { changes: any[], next_version?: number | null, server_version: number }
      console.log('[Sync] 拉取响应:', JSON.stringify({ changes: payload.changes?.length, next_version: payload.next_version, server_version: payload.server_version }, null, 2))

      if (payload.server_version)
        lastServerVersion = payload.server_version

      if (payload.changes?.length) {
        console.log('[Sync] 应用远程变更:', JSON.stringify(payload.changes, null, 2))
        const applied = await applyRemoteChanges(payload.changes)
        pulled += applied
        // 追踪实际应用的变更的最大 version
        for (const change of payload.changes) {
          if (change.version) {
            maxPulledVersion = Math.max(maxPulledVersion, change.version)
          }
        }
      }

      if (!payload.next_version)
        break
      cursor = payload.next_version
    }

    console.log('[Sync] pullRemoteChanges 完成:', JSON.stringify({ lastServerVersion, pulled, maxPulledVersion }, null, 2))
    return { lastServerVersion, pulled, maxPulledVersion }
  }

  async function pushLocalChanges(sinceVersion: number) {
    const base = getSyncBaseUrl()
    const changes = await collectLocalNoteChanges(sinceVersion)
    console.log('[Sync] pushLocalChanges:', JSON.stringify({ sinceVersion, changes: changes.length }, null, 2))

    if (!changes.length)
      return { server_version: sinceVersion, applied: 0, conflict: false }

    console.log(`[Sync] 推送变更[${changes.length}]:`, JSON.stringify(changes))
    const res = await fetch(`${base}/push`, {
      method: 'POST',
      headers: { ...buildSyncHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes, client_version: sinceVersion }),
    })
    if (!res.ok)
      throw new Error(`push 失败: ${res.status}`)
    const body = await res.json()
    console.log('[Sync] 推送响应:', JSON.stringify(body.data, null, 2))
    return body.data as { server_version: number, applied: number, conflict: boolean }
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
    const toastId = silent ? undefined : toast.loading('开始同步...', { duration: 4000 })
    try {
      console.log('[Sync] 准备调用 fetchSyncState, base=', base)
      const state = await fetchSyncState()
      console.log('[Sync] fetchSyncState 成功,服务器状态:', JSON.stringify(state, null, 2))
      syncInfo.value = { status: 'ok', message: '服务器可用', version: state.version ?? null, paired: state.paired }
      const currentVersion = lastVersion.value || 0

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

      // 桌面端是服务器,需要升级本地负数版本号为正数
      if (isDesktop.value) {
        console.log('[Sync] 桌面端模式: 升级本地编辑的版本号')

        // 获取服务器当前最大版本号
        let serverVersion = state.version || 0

        // 查询本地所有负数版本号的记录
        const localChanges = await syncSelect<any[]>(
          'SELECT id, version FROM notes WHERE version < 0',
          [],
        )

        if (localChanges.length > 0) {
          console.log(`[Sync] 桌面端发现 ${localChanges.length} 条本地编辑,分配服务器版本号`)

          for (const change of localChanges) {
            serverVersion += 1
            await syncExecute(
              'UPDATE notes SET version = ? WHERE id = ?',
              [serverVersion, change.id],
            )
            console.log(`[Sync] 桌面端: note ${change.id} 版本号 ${change.version} → ${serverVersion}`)
          }

          // 更新 lastVersion
          lastVersion.value = serverVersion
          await setSetting('sync_last_version', String(serverVersion), 'sync')

          syncStatus.value = `已升级 ${localChanges.length} 条记录`
          if (!silent) {
            toast.success(`桌面端已升级 ${localChanges.length} 条编辑`, { id: toastId })
          }
        }
        else {
          syncStatus.value = '桌面端无待同步数据'
          if (toastId) {
            toast.dismiss(toastId)
          }
        }

        isSyncing.value = false
        return
      }

      console.log('[Sync] 移动端模式: 推送本地变更, currentVersion=', currentVersion)
      // 移动端: 先推送本地变更,再拉取远程变更
      const pushResult = await pushLocalChanges(currentVersion)
      console.log('[Sync] 推送完成, pushResult=', pushResult)

      // 无论是否有推送，都进行拉取
      // 1. 如果刚才推送了，拉取可以把新版本号同步回来（解决重复推送问题）
      // 2. 如果没推送，拉取可以获取服务器上的新数据
      console.log('[Sync] 拉取远程变更...')
      const pullResult = await pullRemoteChanges(currentVersion)

      const finalVersion = Math.max(pullResult.lastServerVersion, pushResult.server_version, currentVersion)

      console.log('[Sync] 同步完成:', {
        pullVersion: pullResult.maxPulledVersion,
        serverVersion: finalVersion,
        pulled: pullResult.pulled,
        pushed: pushResult.applied,
      })

      // 总是更新 lastVersion 为服务器版本号
      if (finalVersion > lastVersion.value) {
        lastVersion.value = finalVersion
        await setSetting('sync_last_version', String(finalVersion), 'sync')
        console.log('[Sync] 更新 lastVersion 到:', finalVersion)
      }

      lastSyncSummary.value = { pulled: pullResult.pulled, pushed: pushResult.applied, at: Date.now() }
      await setSetting('sync_last_summary', JSON.stringify(lastSyncSummary.value), 'sync')
      bumpTotalSyncCounts(lastSyncSummary.value.pulled, lastSyncSummary.value.pushed)

      syncStatus.value = pushResult.conflict ? '已同步（解决冲突）' : '已同步'

      if (lastSyncSummary.value.pulled > 0 || lastSyncSummary.value.pushed > 0) {
        const parts: string[] = []
        if (lastSyncSummary.value.pulled > 0) {
          parts.push(`拉取 ${lastSyncSummary.value.pulled} 条`)
        }
        if (lastSyncSummary.value.pushed > 0) {
          parts.push(`推送 ${lastSyncSummary.value.pushed} 条`)
        }
        if (!silent) {
          toast.success(`同步完成: ${parts.join(', ')}`, { id: toastId })
        }
      }
      else {
        if (!silent)
          toast.success('已是最新', { id: toastId })
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

            // 清理数据库中被污染的大版本号
            try {
              await syncExecute(
                'UPDATE notes SET version = 0 WHERE version > 1000000',
                [],
              )
              console.log('[Sync] 已清理数据库中的异常版本号')
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
    return `最近版本 ${lastVersion.value}`
  })

  const lastSyncCountText = computed(() => {
    if (!lastSyncSummary.value)
      return ''
    const { pulled, pushed } = lastSyncSummary.value
    return `上次同步 拉 ${pulled} 条 · 推 ${pushed} 条`
  })

  const totalSyncCountText = computed(() => {
    if (!totalSyncSummary.value)
      return ''
    const { pulled, pushed } = totalSyncSummary.value
    if (!pulled && !pushed)
      return ''
    return `累计同步 拉 ${pulled} 条 · 推 ${pushed} 条`
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
    loadSyncConfig,
    saveSyncConfig,
    resetSyncState,
    deleteSyncConfig,
    syncOnce,
    refreshSyncStateCard,
  }
}
