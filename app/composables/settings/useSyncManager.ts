import { toast } from 'vue-sonner'
import { useSettingRepository } from '~/composables/repositories/useSettingRepository'
import { useWorkflowRepository } from '~/composables/repositories/useWorkflowRepository'
import { useTauriSQL } from '~/composables/useTauriSQL'

interface SyncInfoState {
  status: 'idle' | 'ok' | 'error'
  message: string
  seq: number | null
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

export function useSyncManager() {
  const { setSetting, getSetting } = useSettingRepository()
  const { createWorkflow, getAllWorkflows, deleteWorkflow } = useWorkflowRepository()
  const { select: syncSelect, execute: syncExecute } = useTauriSQL()

  const serverUrl = ref('')
  const syncServerAddress = ref('')
  const isSavingSyncConfig = ref(false)
  const syncWorkflowId = ref<number | null>(null)
  const syncToken = ref('')
  const lastSyncSince = ref(0)
  const lastSyncSummary = ref<SyncSummary | null>(null)
  const totalSyncSummary = ref<SyncTotalSummary>({ pulled: 0, pushed: 0 })
  const isSyncing = ref(false)
  const syncStatus = ref('未同步')
  const syncInfo = ref<SyncInfoState>({ status: 'idle', message: '', seq: null, paired: false })

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
    if (!base)
      throw new Error('请先配置服务器地址')
    const res = await fetch(`${base}/state`, { headers: buildSyncHeaders() })
    if (!res.ok)
      throw new Error(`state 请求失败: ${res.status}`)
    const data = await res.json()
    return data.data as { seq: number, paired?: boolean, version?: string }
  }

  async function applyRemoteChanges(changes: any[]) {
    for (const change of changes) {
      if (change.table !== 'notes')
        continue
      const id = change.data?.id
      const title = change.data?.title ?? ''
      const content = change.data?.content ?? ''
      const tags = change.data?.tags ?? '[]'
      const updatedAt = change.updated_at || new Date().toISOString()
      const deletedAt = change.deleted_at || null

      if (change.op === 'delete' || deletedAt) {
        await syncExecute(
          `INSERT INTO notes (id, title, content, tags, deleted_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET deleted_at = excluded.deleted_at, updated_at = excluded.updated_at`,
          [id, title, content, tags, deletedAt || updatedAt, updatedAt],
        )
        continue
      }

      await syncExecute(
        `INSERT INTO notes (id, title, content, tags, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, content = excluded.content, tags = excluded.tags, updated_at = excluded.updated_at, deleted_at = NULL`,
        [id, title, content, tags, updatedAt],
      )
    }
  }

  function toMs(dateStr?: string | null) {
    if (!dateStr)
      return 0
    const d = new Date(dateStr)
    return Number.isNaN(d.getTime()) ? 0 : d.getTime()
  }

  async function collectLocalNoteChanges(since: number) {
    const rows = await syncSelect<any[]>(
      'SELECT id, title, content, tags, updated_at, deleted_at FROM notes WHERE (strftime(\'%s\', updated_at) * 1000) > ?1 OR (deleted_at IS NOT NULL AND (strftime(\'%s\', deleted_at) * 1000) > ?1)',
      [since],
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
        seq: toMs(deletedIso ?? updatedIso),
        updated_at: updatedIso,
        deleted_at: deletedIso,
      }
    })
  }

  async function pullRemoteChanges(since: number) {
    const base = getSyncBaseUrl()
    let cursor = since
    let lastServerSeq = since
    let pulled = 0

    while (true) {
      const url = `${base}/pull?since=${cursor}&limit=200`
      const res = await fetch(url, { headers: buildSyncHeaders() })
      if (!res.ok)
        throw new Error(`pull 失败: ${res.status}`)
      const body = await res.json()
      const payload = body.data as { changes: any[], next_since?: number | null, server_seq: number }
      if (payload.server_seq)
        lastServerSeq = payload.server_seq

      if (payload.changes?.length) {
        pulled += payload.changes.length
        await applyRemoteChanges(payload.changes)
        const last = payload.next_since ?? payload.server_seq
        if (last)
          cursor = last
      }

      if (!payload.next_since)
        break
    }

    return { lastServerSeq, pulled }
  }

  async function pushLocalChanges(since: number) {
    const base = getSyncBaseUrl()
    const changes = await collectLocalNoteChanges(since)
    if (!changes.length)
      return { server_seq: since, applied: 0, conflict: false }

    const res = await fetch(`${base}/push`, {
      method: 'POST',
      headers: { ...buildSyncHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes, client_last_seq: since }),
    })
    if (!res.ok)
      throw new Error(`push 失败: ${res.status}`)
    const body = await res.json()
    return body.data as { server_seq: number, applied: number, conflict: boolean }
  }

  async function syncOnce(silent = false) {
    const base = getSyncBaseUrl()
    if (!base) {
      if (!silent) {
        toast.error('请先配置服务器地址')
      }
      return
    }

    isSyncing.value = true
    syncStatus.value = '同步中…'
    const toastId = silent ? undefined : toast.loading('开始同步...', { duration: 4000 })
    try {
      const state = await fetchSyncState()
      syncInfo.value = { status: 'ok', message: '服务器可用', seq: state.seq ?? null, paired: state.paired }
      const since = lastSyncSince.value || 0

      const pullResult = await pullRemoteChanges(since)
      const pushResult = await pushLocalChanges(pullResult.lastServerSeq)

      if (pushResult.conflict) {
        const latest = await pullRemoteChanges(pullResult.lastServerSeq)
        const resolvedSeq = Number(latest.lastServerSeq || pullResult.lastServerSeq || Date.now())
        lastSyncSince.value = resolvedSeq
        await setSetting('sync_last_since', String(resolvedSeq), 'sync')
        lastSyncSummary.value = { pulled: pullResult.pulled + latest.pulled, pushed: 0, at: Date.now() }
        await setSetting('sync_last_summary', JSON.stringify(lastSyncSummary.value), 'sync')
        bumpTotalSyncCounts(lastSyncSummary.value.pulled, lastSyncSummary.value.pushed)
        syncStatus.value = '已同步（解决冲突）'
        if (!silent && lastSyncSummary.value.pulled > 0) {
          toast.success(`同步完成（已拉取 ${lastSyncSummary.value.pulled} 条，解决冲突）`, { id: toastId })
        }
        else if (toastId) {
          toast.dismiss(toastId)
        }
        return
      }

      const pullSeq = Number.isFinite(pullResult.lastServerSeq) ? Number(pullResult.lastServerSeq) : 0
      const pushSeq = Number.isFinite(pushResult.server_seq) ? Number(pushResult.server_seq) : 0
      const stateSeq = Number.isFinite(state.seq) ? Number(state.seq) : 0
      const finalSeqRaw = Math.max(pullSeq, pushSeq, stateSeq)
      const finalSeq = finalSeqRaw > 0 ? finalSeqRaw : Date.now()
      lastSyncSince.value = finalSeq
      await setSetting('sync_last_since', String(finalSeq), 'sync')
      lastSyncSummary.value = { pulled: pullResult.pulled, pushed: pushResult.applied, at: Date.now() }
      await setSetting('sync_last_summary', JSON.stringify(lastSyncSummary.value), 'sync')
      bumpTotalSyncCounts(lastSyncSummary.value.pulled, lastSyncSummary.value.pushed)
      syncStatus.value = '已同步'

      // 仅在有数据变动时显示 toast
      if (!silent && (lastSyncSummary.value.pulled > 0 || lastSyncSummary.value.pushed > 0)) {
        const parts: string[] = []
        if (lastSyncSummary.value.pulled > 0) {
          parts.push(`拉取 ${lastSyncSummary.value.pulled} 条`)
        }
        if (lastSyncSummary.value.pushed > 0) {
          parts.push(`推送 ${lastSyncSummary.value.pushed} 条`)
        }
        toast.success(`同步完成: ${parts.join('、')}`, { id: toastId })
      }
      else if (toastId) {
        toast.dismiss(toastId)
      }
    }
    catch (e: any) {
      console.error('同步失败', e)

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
      else if (e.message?.includes('timeout')) {
        userMessage = '请求超时，请稍后重试'
      }

      syncStatus.value = userMessage
      if (!silent) {
        toast.error(userMessage, { id: toastId })
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
      syncInfo.value = { status: 'error', message: '未配置服务器地址', seq: null, paired: false }
      return
    }
    try {
      const state = await fetchSyncState()
      syncInfo.value = { status: 'ok', message: '服务器可用', seq: state.seq ?? null, paired: state.paired }
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
      syncInfo.value = { status: 'error', message: userMessage, seq: null, paired: false }
    }
  }

  async function loadSyncConfig() {
    const savedAddress = await getSetting('sync_server_address')
    if (savedAddress)
      syncServerAddress.value = savedAddress

    const savedToken = await getSetting('sync_token')
    if (savedToken)
      syncToken.value = savedToken

    const savedSince = await getSetting('sync_last_since')
    if (savedSince)
      lastSyncSince.value = Number(savedSince) || 0

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

  async function deleteSyncConfig() {
    toast('确定要删除同步配置吗？', {
      action: {
        label: '删除',
        onClick: async () => {
          try {
            await setSetting('sync_server_address', '', 'sync')
            await setSetting('sync_token', '', 'sync')
            await setSetting('sync_last_since', '0', 'sync')
            await setSetting('sync_total_counts', '0', 'sync')
            syncServerAddress.value = ''
            syncToken.value = ''
            lastSyncSince.value = 0
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
    if (!lastSyncSince.value)
      return '从未同步'
    const d = new Date(lastSyncSince.value)
    return Number.isNaN(d.getTime()) ? `最近序列 ${lastSyncSince.value}` : `最近同步 ${d.toLocaleString()}`
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
    lastSyncSince,
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
    deleteSyncConfig,
    syncOnce,
    refreshSyncStateCard,
  }
}
