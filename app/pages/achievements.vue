<script setup lang="ts">
import { useAchievementSystem } from '~/composables/useAchievementSystem'
import { useCurrentUser } from '~/composables/useCurrentUser'
import { usePointsSystem } from '~/composables/usePointsSystem'

definePageMeta({
  layout: 'default',
})

// 获取当前用户 ID
const { getCurrentUserId, initCurrentUser } = useCurrentUser()
const userId = computed(() => getCurrentUserId())

const activeCategory = ref('all')

// 获取用户档案
const { getProfile, getLevelProgress } = usePointsSystem()
const profile = ref<any>(null)
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

onMounted(() => {
  loadData()
})
</script>

<template>
  <div class="h-full overflow-y-auto bg-muted/5">
    <!-- 头部 -->
    <PageHeader title="成就中心" class="bg-background/80 backdrop-blur-md sticky top-0 z-20 border-b" />

    <div class="p-4 md:p-6 max-w-6xl mx-auto space-y-8 pb-12">
      <!-- 用户档案卡片 -->
      <div v-if="profile" class="relative overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm transition-all hover:shadow-md">
        <!-- 装饰背景 -->
        <div class="absolute top-0 right-0 -mt-24 -mr-24 w-80 h-80 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div class="absolute bottom-0 left-0 -mb-16 -ml-16 w-48 h-48 bg-secondary/20 rounded-full blur-2xl pointer-events-none" />

        <div class="p-6 md:p-8 relative z-10">
          <div class="flex flex-col md:flex-row gap-8 items-center md:items-start">
            <!-- 左侧：等级徽章 -->
            <div class="relative shrink-0 group cursor-default">
              <div class="w-28 h-28 rounded-full bg-gradient-to-br from-background to-muted flex items-center justify-center border-4 border-background shadow-xl ring-1 ring-border/50 relative overflow-hidden">
                <div class="absolute inset-0 bg-primary/5 group-hover:bg-primary/10 transition-colors" />
                <div class="text-center relative z-10">
                  <div class="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">
                    Level
                  </div>
                  <div class="text-5xl font-black text-primary tracking-tighter">
                    {{ profile.current_level }}
                  </div>
                </div>
              </div>
              <div class="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap shadow-lg border-2 border-background">
                {{ profile.title || '初出茅庐' }}
              </div>
            </div>

            <!-- 中间：经验与信息 -->
            <div class="flex-1 w-full text-center md:text-left space-y-5 pt-2">
              <div>
                <h2 class="text-2xl font-bold tracking-tight flex items-center justify-center md:justify-start gap-2">
                  我的生涯
                  <Icon name="lucide:sparkles" class="w-5 h-5 text-yellow-500" />
                </h2>
                <p class="text-muted-foreground text-sm mt-1">
                  探索、记录、分享，每一个脚印都值得铭记。
                </p>
              </div>

              <div class="space-y-2 max-w-md mx-auto md:mx-0">
                <div class="flex justify-between text-sm font-medium px-1">
                  <span class="text-muted-foreground">EXP 进度</span>
                  <span class="font-mono text-primary">{{ levelProgress.current }} <span class="text-muted-foreground/60">/ {{ levelProgress.max }}</span></span>
                </div>
                <div class="relative h-3 w-full overflow-hidden rounded-full bg-secondary/50">
                  <div
                    class="h-full bg-primary transition-all duration-500 ease-out rounded-full"
                    :style="{ width: `${levelProgress.percentage}%` }"
                  />
                </div>
                <p class="text-xs text-muted-foreground text-right px-1">
                  距离下一级还需 <span class="font-bold text-foreground">{{ levelProgress.max - levelProgress.current }}</span> EXP
                </p>
              </div>
            </div>

            <!-- 右侧：统计数据 -->
            <div class="grid grid-cols-2 gap-4 w-full md:w-auto shrink-0 pt-2">
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
    </div>
  </div>
</template>
