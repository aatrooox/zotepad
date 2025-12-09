import type { Workflow, WorkflowType } from '~/types/workflow'
import { toast } from 'vue-sonner'
import { useWorkflowRepository } from '~/composables/repositories/useWorkflowRepository'
import { WORKFLOW_TYPES } from '~/types/workflow'

interface SystemWorkflowSpec {
  type: WorkflowType
  displayName: string
  name: string
  description: string
  requiredEnvs?: string[]
  buildSteps: () => any[]
}

const WX_WORKFLOW_NAME = '📤 上传至公众号草稿箱'

export function useSystemWorkflowManager() {
  const { getAllWorkflowsWithSystem, deleteWorkflow, upsertSystemWorkflow } = useWorkflowRepository()

  const systemWorkflows = ref<Workflow[]>([])
  const isCreatingSystemWorkflow = ref<string | null>(null)
  const isDeletingWorkflowId = ref<number | null>(null)

  function buildWxDraftSteps() {
    return [
      {
        id: 'get-access-token',
        name: '🔑 获取微信 Access Token',
        type: 'api',
        url: 'https://zzao.club/api/v1/wx/cgi-bin/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer {{env.ZZCLUB_PAT}}',
        },
        body: JSON.stringify({ appId: '{{env.WX_APPID}}', appSecret: '{{env.WX_APPSECRET}}' }),
        timeout: 10000,
      },
      {
        id: 'upload-wx-material',
        name: '🖼️ 上传图片素材',
        type: 'api',
        url: 'https://zzao.club/api/v1/wx/cgi-bin/material/add_material',
        method: 'POST',
        headers: { Authorization: 'Bearer {{env.ZZCLUB_PAT}}' },
        body: '',
        timeout: 60000,
      },
      {
        id: 'add-to-wx-draft',
        name: '📝 上传到草稿箱',
        type: 'api',
        url: 'https://zzao.club/api/v1/wx/cgi-bin/draft/add',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer {{env.ZZCLUB_PAT}}',
        },
        body: JSON.stringify({
          access_token: '{{step1.data.accessToken}}',
          articles: [
            {
              article_type: 'news',
              title: '{{title}}',
              content: '{{step2.data.html}}',
              thumb_media_id: '{{step2.data.coverMediaId}}',
            },
          ],
        }),
        timeout: 30000,
      },
    ]
  }

  const systemWorkflowSpecs: SystemWorkflowSpec[] = [
    {
      type: WORKFLOW_TYPES.SYSTEM_WX_DRAFT,
      displayName: '公众号草稿箱',
      name: WX_WORKFLOW_NAME,
      description: '上传文章至微信公众号草稿箱',
      requiredEnvs: ['ZZCLUB_PAT', 'WX_APPID', 'WX_APPSECRET'],
      buildSteps: buildWxDraftSteps,
    },
  ]

  const systemWorkflowStates = computed(() => (envsList: any[]) => systemWorkflowSpecs.map((spec) => {
    const workflow = systemWorkflows.value.find(w => w.type === spec.type) || null
    const missingEnvs = spec.requiredEnvs
      ? spec.requiredEnvs.filter(key => !envsList?.some((e: any) => e.key === key))
      : []
    return { spec, workflow, missingEnvs }
  }))

  const extraSystemWorkflows = computed(() => systemWorkflows.value.filter(
    wf => wf.type?.startsWith('system:') && !systemWorkflowSpecs.some(spec => spec.type === wf.type),
  ))

  async function loadSystemWorkflows() {
    try {
      const list = await getAllWorkflowsWithSystem()
      systemWorkflows.value = (list || []).filter(w => w.type?.startsWith('system:'))
    }
    catch (e) {
      console.error('Failed to load system workflows:', e)
      toast.error('加载系统流失败')
    }
  }

  async function handleCreateSystemWorkflow(spec: SystemWorkflowSpec, envsList: any[]) {
    const missing = spec.requiredEnvs?.filter(key => !envsList?.some((e: any) => e.key === key)) || []
    if (missing.length) {
      toast.error(`请先配置环境变量：${missing.join(', ')}`)
      return
    }

    isCreatingSystemWorkflow.value = spec.type
    try {
      const steps = spec.buildSteps()
      await upsertSystemWorkflow(spec.type, spec.name, spec.description, steps)
      const existed = systemWorkflows.value.some(w => w.type === spec.type)
      toast.success(existed ? '已重新创建系统流' : '系统流已创建')
      await loadSystemWorkflows()
    }
    catch (e: any) {
      console.error('Failed to create system workflow:', e)
      toast.error(`创建失败: ${e.message}`)
    }
    finally {
      isCreatingSystemWorkflow.value = null
    }
  }

  function handleDeleteSystemWorkflow(workflowId: number) {
    toast('确定要删除该系统流吗？', {
      action: {
        label: '删除',
        onClick: async () => {
          isDeletingWorkflowId.value = workflowId
          try {
            await deleteWorkflow(workflowId)
            toast.success('工作流已删除')
            await loadSystemWorkflows()
          }
          catch (e: any) {
            console.error('Failed to delete system workflow:', e)
            toast.error(`删除失败: ${e.message}`)
          }
          finally {
            isDeletingWorkflowId.value = null
          }
        },
      },
      cancel: { label: '取消' },
    })
  }

  return {
    systemWorkflows,
    systemWorkflowStates,
    extraSystemWorkflows,
    isCreatingSystemWorkflow,
    isDeletingWorkflowId,
    loadSystemWorkflows,
    handleCreateSystemWorkflow,
    handleDeleteSystemWorkflow,
  }
}
