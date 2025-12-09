import { toast } from 'vue-sonner'
import { useEnvironmentRepository } from '~/composables/repositories/useEnvironmentRepository'

export function useEnvironmentManager() {
  const { getAllEnvs, createEnv, deleteEnv } = useEnvironmentRepository()

  const envs = ref<Awaited<ReturnType<typeof getAllEnvs>>>([])
  const newEnvKey = ref('')
  const newEnvValue = ref('')

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

  return {
    envs,
    newEnvKey,
    newEnvValue,
    loadEnvs,
    handleAddEnv,
    handleDeleteEnv,
  }
}
