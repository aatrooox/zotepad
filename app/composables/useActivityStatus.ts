// Using useState for global singleton behavior in Nuxt
export const useActivityStatus = () => {
  const syncState = useState('activity_sync_state', () => ({
    pushing: 0,
    pulling: 0,
    isSyncing: false,
    lastUpdated: 0,
  }))

  const workflows = useState<Map<string, {
    id: string
    title: string
    currentStep: number
    totalSteps: number
    stepName: string
    status: 'running' | 'success' | 'error'
  }>>('activity_workflows', () => new Map())

  // Helper to force reactivity for Map
  const workflowList = computed(() => Array.from(workflows.value.values()))

  function setSyncState(isSyncing: boolean) {
    syncState.value.isSyncing = isSyncing
    if (isSyncing) {
      syncState.value.lastUpdated = Date.now()
    }
  }

  function setSyncCounts(pushing: number, pulling: number) {
    syncState.value.pushing = pushing
    syncState.value.pulling = pulling
    syncState.value.lastUpdated = Date.now()
  }

  function startWorkflow(id: string, title: string, totalSteps: number) {
    workflows.value.set(id, {
      id,
      title,
      currentStep: 0,
      totalSteps,
      stepName: '初始化...',
      status: 'running',
    })
    triggerRef(workflows)
  }

  function updateWorkflowStep(id: string, stepIndex: number, stepName: string) {
    const wf = workflows.value.get(id)
    if (wf) {
      wf.currentStep = stepIndex
      wf.stepName = stepName
      triggerRef(workflows)
    }
  }

  function finishWorkflow(id: string, status: 'success' | 'error') {
    const wf = workflows.value.get(id)
    if (wf) {
      wf.status = status
      triggerRef(workflows)

      // Auto remove after 3 seconds
      setTimeout(() => {
        workflows.value.delete(id)
        triggerRef(workflows)
      }, 3000)
    }
  }

  return {
    syncState,
    workflowList,
    setSyncState,
    setSyncCounts,
    startWorkflow,
    updateWorkflowStep,
    finishWorkflow,
  }
}
