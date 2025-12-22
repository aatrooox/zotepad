<script setup lang="ts">
import { toast } from 'vue-sonner'
import { useAchievementSystem } from '~/composables/useAchievementSystem'
import { useCurrentUser } from '~/composables/useCurrentUser'
import { usePointsRewards } from '~/composables/usePointsRewards'
import { usePointsSystem } from '~/composables/usePointsSystem'

definePageMeta({
  layout: 'default',
})

// 获取当前用户 ID
const { getCurrentUserId, initCurrentUser } = useCurrentUser()
const userId = computed(() => getCurrentUserId())

const activeCategory = ref('all')

// 获取用户档案
const { getProfile, getLevelProgress, getPointsLog } = usePointsSystem()
const { recalculateAllPoints } = usePointsRewards()
const profile = ref<any>(null)
const pointsLog = ref<any[]>([])
const isRecalculating = ref(false)
const levelProgress = computed(() => {
  if (!profile.value)
    return { current: 0, max: 100, percentage: 0 }
  return getLevelProgress(profile.value.total_exp, profile.value.current_level)
})

// 获取成就列表
const { getAllAchievementsWithStatus } = useAchievementSystem()
const achievements = ref<any[]>([])

// 过滤成就
const filteredAchievements = computed(() => {
  if (activeCategory.value === 'all')
    return achievements.value
  return achievements.value.filter(a => a.category === activeCategory.value)
})

// 加载数据
async function loadData() {
  try {
    // 确保用户已初始化
    await initCurrentUser()
    const uid = userId.value
    profile.value = await getProfile(uid)
    achievements.value = await getAllAchievementsWithStatus(uid)

    // 加载积分日志
    const logData = await getPointsLog(uid, 20)
    pointsLog.value = logData || []
    console.log('[成就页面] 加载积分日志:', pointsLog.value.length, '条记录')
  }
  catch (error) {
    console.error('加载成就数据失败:', error)
  }
}

// 计算下一等级目标
function getNextLevelTarget(achievement: any): number {
  const rule = JSON.parse(achievement.rule_config)
  const baseTarget = rule.baseTarget || 100
  const rate = rule.rate || 2
  return Math.floor(baseTarget * rate ** achievement.level)
}

// 计算进度百分比
function getProgressPercentage(achievement: any): number {
  const target = getNextLevelTarget(achievement)
  return Math.min((achievement.progress / target) * 100, 100)
}

// 格式化解锁时间
function formatUnlockTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0)
    return '今天'
  if (days === 1)
    return '昨天'
  if (days < 7)
    return `${days}天前`
  if (days < 30)
    return `${Math.floor(days / 7)}周前`

  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

// 格式化积分日志时间
function formatLogTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const logDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  if (logDate.getTime() === today.getTime()) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  else {
    return `${date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })} ${
      date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
  }
}

// 获取积分来源图标
function getSourceIcon(sourceType: string): string {
  switch (sourceType) {
    case 'note': return '📝'
    case 'moment': return '💭'
    case 'asset': return '📷'
    case 'workflow': return '⚡'
    case 'achievement': return '🏆'
    default: return '✨'
  }
}

// 获取积分来源名称
function getSourceName(sourceType: string): string {
  switch (sourceType) {
    case 'note': return '笔记'
    case 'moment': return '动态'
    case 'asset': return '资源'
    case 'workflow': return '工作流'
    case 'achievement': return '成就'
    default: return '其他'
  }
}

// 重新计算所有积分
function handleRecalculate() {
  if (isRecalculating.value)
    return

  toast('确定要重新计算所有内容的积分吗？', {
    description: '这将为所有未记录积分的笔记、动态和资源补全积分。此操作可能需要一些时间。',
    action: {
      label: '确认',
      onClick: async () => {
        isRecalculating.value = true
        try {
          const uid = userId.value
          const result = await recalculateAllPoints(uid)

          toast.success(`重新计算完成！\n笔记: ${result.notes} 篇\n动态: ${result.moments} 条\n资源: ${result.assets} 个`)

          // 重新加载数据
          await loadData()
        }
        catch (error: any) {
          console.error('重新计算失败:', error)
          toast.error(`重新计算失败: ${error.message || '未知错误'}`)
        }
        finally {
          isRecalculating.value = false
        }
      },
    },
    cancel: {
      label: '取消',
    },
  })
}

onMounted(() => {
  loadData()
})
</script>

<template>
  <div class="h-full overflow-y-auto bg-muted/5">
    <!-- 头部 -->
    <AppPageHeader title="成就中心" class="bg-background/80 backdrop-blur-md sticky top-0 z-20 border-b" />

    <div class="p-4 md:p-6 max-w-6xl mx-auto space-y-8 pb-12">
      <!-- 用户档案卡片 -->
      <div v-if="profile" class="relative overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm transition-all hover:shadow-md">
        <!-- 装饰背景 -->
        <div class="absolute top-0 right-0 -mt-24 -mr-24 w-80 h-80 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div class="absolute bottom-0 left-0 -mb-16 -ml-16 w-48 h-48 bg-secondary/20 rounded-full blur-2xl pointer-events-none" />

        <div class="p-5 md:p-8 relative z-10">
          <div class="flex flex-col md:flex-row gap-6 md:gap-8 items-center md:items-start">
            <!-- Mobile Top Row: Level + Stats -->
            <div class="flex flex-row md:flex-col items-center md:items-start justify-between w-full md:w-auto gap-6">
              <!-- 左侧：等级徽章 -->
              <div class="relative shrink-0 group cursor-default">
                <div class="w-20 h-20 md:w-28 md:h-28 rounded-full bg-gradient-to-br from-background to-muted flex items-center justify-center border-4 border-background shadow-xl ring-1 ring-border/50 relative overflow-hidden">
                  <div class="absolute inset-0 bg-primary/5 group-hover:bg-primary/10 transition-colors" />
                  <div class="text-center relative z-10">
                    <div class="text-[8px] md:text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">
                      Level
                    </div>
                    <div class="text-3xl md:text-5xl font-black text-primary tracking-tighter">
                      {{ profile.current_level }}
                    </div>
                  </div>
                </div>
                <div class="absolute -bottom-2 md:-bottom-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] md:text-xs font-bold px-2 md:px-3 py-0.5 md:py-1 rounded-full whitespace-nowrap shadow-lg border-2 border-background z-20">
                  {{ profile.title || '初出茅庐' }}
                </div>
              </div>

              <!-- Mobile Stats (Right side of level badge) -->
              <div class="flex md:hidden flex-1 justify-around gap-2 items-center">
                <div class="text-center">
                  <div class="text-xl font-bold text-foreground tracking-tight">
                    {{ profile.total_points.toLocaleString() }}
                  </div>
                  <div class="text-xs text-muted-foreground font-medium">
                    总积分
                  </div>
                </div>
                <div class="w-px h-8 bg-border/60" />
                <div class="text-center">
                  <div class="text-xl font-bold text-foreground tracking-tight">
                    {{ profile.achievements_count }}
                  </div>
                  <div class="text-xs text-muted-foreground font-medium">
                    已解锁
                  </div>
                </div>
              </div>
            </div>

            <!-- 中间：经验与信息 -->
            <div class="flex-1 w-full space-y-4 md:pt-2">
              <!-- Desktop Header (Hidden on mobile) -->
              <div class="hidden md:block">
                <h2 class="text-2xl font-bold tracking-tight flex items-center justify-start gap-2">
                  我的生涯
                  <Icon name="lucide:sparkles" class="w-5 h-5 text-yellow-500" />
                </h2>
                <p class="text-muted-foreground text-sm mt-1">
                  探索、记录、分享，每一个脚印都值得铭记。
                </p>
              </div>

              <div class="space-y-2 w-full">
                <div class="flex justify-between text-sm font-medium px-1">
                  <span class="text-muted-foreground text-xs md:text-sm">EXP 进度</span>
                  <span class="font-mono text-primary text-xs md:text-sm">{{ levelProgress.current }} <span class="text-muted-foreground/60">/ {{ levelProgress.max }}</span></span>
                </div>
                <div class="relative h-2.5 md:h-3 w-full overflow-hidden rounded-full bg-secondary/50">
                  <div
                    class="h-full bg-primary transition-all duration-500 ease-out rounded-full"
                    :style="{ width: `${levelProgress.percentage}%` }"
                  />
                </div>
                <p class="text-[10px] md:text-xs text-muted-foreground text-right px-1">
                  距离下一级还需 <span class="font-bold text-foreground">{{ levelProgress.max - levelProgress.current }}</span> EXP
                </p>
              </div>
            </div>

            <!-- 右侧：统计数据 (Desktop Only) -->
            <div class="hidden md:grid grid-cols-2 gap-4 w-auto shrink-0 pt-2">
              <div class="bg-background/60 backdrop-blur-sm rounded-xl p-4 border shadow-sm text-center min-w-[110px] flex flex-col items-center justify-center gap-1 transition-colors hover:bg-background/80">
                <div class="p-2 rounded-full bg-primary/10 text-primary mb-1">
                  <Icon name="lucide:trophy" class="w-5 h-5" />
                </div>
                <div class="text-2xl font-bold tracking-tight">
                  {{ profile.total_points.toLocaleString() }}
                </div>
                <div class="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                  总积分
                </div>
              </div>
              <div class="bg-background/60 backdrop-blur-sm rounded-xl p-4 border shadow-sm text-center min-w-[110px] flex flex-col items-center justify-center gap-1 transition-colors hover:bg-background/80">
                <div class="p-2 rounded-full bg-blue-500/10 text-blue-500 mb-1">
                  <Icon name="lucide:medal" class="w-5 h-5" />
                </div>
                <div class="text-2xl font-bold tracking-tight">
                  {{ profile.achievements_count }}
                </div>
                <div class="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                  已解锁
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 分类 Tab -->
      <Tabs v-model="activeCategory" class="w-full">
        <TabsList class="w-full justify-start h-auto p-1 bg-muted/50 overflow-x-auto scrollbar-hide mb-6">
          <TabsTrigger value="all" class="px-4 py-2 min-w-[4rem]">
            全部
          </TabsTrigger>
          <TabsTrigger value="writing" class="px-4 py-2 min-w-[4rem]">
            <span class="mr-2">📝</span>写作
          </TabsTrigger>
          <TabsTrigger value="social" class="px-4 py-2 min-w-[4rem]">
            <span class="mr-2">💬</span>社交
          </TabsTrigger>
          <TabsTrigger value="asset" class="px-4 py-2 min-w-[4rem]">
            <span class="mr-2">📦</span>资源
          </TabsTrigger>
        </TabsList>

        <!-- 成就列表 - Grid 布局 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          <div
            v-for="achievement in filteredAchievements"
            :key="achievement.key"
            class="group relative flex flex-col rounded-lg border bg-card p-3 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5"
            :class="[
              achievement.unlocked ? 'border-border' : 'border-dashed border-muted-foreground/20 bg-muted/30 opacity-80',
            ]"
          >
            <!-- 顶部：图标与标题 -->
            <div class="flex items-start gap-3 mb-2">
              <div
                class="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-2xl shadow-sm transition-transform duration-300 group-hover:scale-105 overflow-hidden"
                :class="achievement.unlocked ? 'bg-gradient-to-br from-primary/10 to-background ring-1 ring-primary/20' : 'bg-muted grayscale'"
              >
                <span class="relative z-10">{{ achievement.icon || '🏆' }}</span>

                <!-- 未解锁遮罩 -->
                <div v-if="!achievement.unlocked" class="absolute inset-0 flex items-center justify-center bg-background/40 backdrop-blur-[1px] z-20">
                  <Icon name="lucide:lock" class="w-4 h-4 text-muted-foreground/60" />
                </div>

                <!-- 解锁光效 -->
                <div v-if="achievement.unlocked" class="absolute inset-0 bg-gradient-to-tr from-primary/0 via-primary/0 to-primary/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>

              <div class="min-w-0 flex-1 pt-0.5">
                <div class="flex items-start justify-between gap-2">
                  <h3 class="font-bold truncate text-sm" :class="achievement.unlocked ? 'text-foreground' : 'text-muted-foreground'">
                    {{ achievement.name }}
                  </h3>
                  <!-- 状态指示 -->
                  <div v-if="achievement.unlocked" class="text-primary shrink-0">
                    <Icon name="lucide:check-circle-2" class="w-4 h-4" />
                  </div>
                </div>

                <div class="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" class="h-4 px-1.5 text-[10px] font-medium bg-secondary/50 hover:bg-secondary/70 transition-colors">
                    +{{ achievement.points }} pts
                  </Badge>
                  <span v-if="achievement.level > 0" class="text-[10px] font-bold text-primary flex items-center gap-0.5">
                    <Icon name="lucide:chevrons-up" class="w-3 h-3" />
                    Lv.{{ achievement.level }}
                  </span>
                </div>
              </div>
            </div>

            <!-- 描述 -->
            <p class="text-xs text-muted-foreground line-clamp-2 mb-3 flex-1 leading-relaxed">
              {{ achievement.description }}
            </p>

            <!-- 底部：进度与时间 -->
            <div class="mt-auto pt-2 border-t border-border/40">
              <!-- 进阶成就进度条 -->
              <div v-if="achievement.type === 'progressive'" class="space-y-2">
                <div class="flex justify-between text-xs text-muted-foreground font-medium">
                  <span>当前进度</span>
                  <span class="font-mono text-foreground">{{ achievement.progress }} / {{ getNextLevelTarget(achievement) }}</span>
                </div>
                <div class="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    class="h-full bg-primary transition-all duration-500 ease-out rounded-full"
                    :style="{ width: `${getProgressPercentage(achievement)}%` }"
                    :class="achievement.unlocked ? '' : 'opacity-50 grayscale'"
                  />
                </div>
              </div>

              <!-- 解锁时间 -->
              <div v-else-if="achievement.unlocked" class="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon name="lucide:calendar-days" class="w-3.5 h-3.5 opacity-70" />
                <span>{{ formatUnlockTime(achievement.unlocked_at) }} 解锁</span>
              </div>

              <!-- 未解锁提示 -->
              <div v-else class="flex items-center gap-1.5 text-xs text-muted-foreground/60 italic">
                <Icon name="lucide:lock" class="w-3.5 h-3.5 opacity-70" />
                <span>继续探索以解锁此成就</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-if="filteredAchievements.length === 0" class="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <div class="w-20 h-20 bg-muted/50 rounded-full flex items-center justify-center mb-4 ring-1 ring-border">
            <Icon name="lucide:trophy" class="w-10 h-10 opacity-40" />
          </div>
          <p class="font-medium">
            该分类下暂无成就
          </p>
          <p class="text-sm opacity-60 mt-1">
            去其他地方看看吧
          </p>
        </div>
      </Tabs>

      <!-- 积分变动记录 -->
      <div class="bg-card/50 backdrop-blur-sm border rounded-xl shadow-sm overflow-hidden">
        <div class="px-6 py-4 border-b bg-muted/20">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-primary/10 text-primary">
                <Icon name="lucide:activity" class="w-5 h-5" />
              </div>
              <div>
                <h3 class="font-bold text-lg">
                  积分变动记录
                </h3>
                <p class="text-sm text-muted-foreground">
                  最近的积分和经验值获取记录
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" @click="loadData">
              <Icon name="lucide:refresh-cw" class="w-4 h-4 mr-1" />
              刷新
            </Button>
            <Button
              variant="default"
              size="sm"
              :disabled="isRecalculating"
              @click="handleRecalculate"
            >
              <Icon
                :name="isRecalculating ? 'lucide:loader-2' : 'lucide:calculator'"
                class="w-4 h-4 mr-1"
                :class="{ 'animate-spin': isRecalculating }"
              />
              {{ isRecalculating ? '计算中...' : '重新计算' }}
            </Button>
          </div>
        </div>

        <div class="max-h-96 overflow-y-auto">
          <!-- 积分日志列表 -->
          <div v-if="pointsLog.length > 0" class="divide-y divide-border/30">
            <div
              v-for="log in pointsLog"
              :key="log.id"
              class="group flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors"
            >
              <!-- 来源图标 -->
              <div class="w-10 h-10 rounded-lg bg-background border flex items-center justify-center text-lg shrink-0 shadow-sm">
                {{ getSourceIcon(log.source_type) }}
              </div>

              <!-- 主要信息 -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <span class="font-medium text-sm">
                    {{ getSourceName(log.source_type) }}
                  </span>
                  <span class="text-xs text-muted-foreground">
                    #{{ log.source_id }}
                  </span>
                  <div v-if="log.achievement_key" class="flex items-center gap-1">
                    <Icon name="lucide:trophy" class="w-3 h-3 text-yellow-500" />
                    <span class="text-xs text-yellow-600 font-medium">成就</span>
                  </div>
                </div>

                <p v-if="log.reason" class="text-xs text-muted-foreground line-clamp-1 mb-1">
                  {{ log.reason }}
                </p>

                <div class="text-xs text-muted-foreground font-mono">
                  {{ formatLogTime(log.created_at) }}
                </div>
              </div>

              <!-- 积分显示 -->
              <div class="flex flex-col items-end gap-0.5 shrink-0">
                <div class="flex items-center gap-1">
                  <span class="text-sm font-bold text-primary">
                    +{{ log.points }}
                  </span>
                  <span class="text-xs text-muted-foreground">积分</span>
                </div>
                <div class="flex items-center gap-1">
                  <span class="text-sm font-bold text-blue-600">
                    +{{ log.exp }}
                  </span>
                  <span class="text-xs text-muted-foreground">EXP</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 空状态 -->
          <div v-else class="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <div class="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mb-4">
              <Icon name="lucide:activity" class="w-8 h-8 opacity-40" />
            </div>
            <p class="font-medium mb-1">
              暂无积分记录
            </p>
            <p class="text-sm opacity-60 mb-2">
              开始创建内容来获取积分吧
            </p>
            <p class="text-xs text-muted-foreground/50">
              用户ID: {{ userId }} | 日志条数: {{ pointsLog.length }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
