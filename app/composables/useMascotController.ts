export type MascotAction
  = | 'idle'
    | 'sleep'
    | 'stretch'
    | 'scratch'
    | 'celebrate_small'
    | 'celebrate_big'
    | 'work'
    | 'error'

export interface MascotState {
  currentAction: MascotAction
  isPlaying: boolean
  lastInteractionTime: number
  achievementPoints: number
}

const ANIMATION_PATHS: Record<MascotAction, string> = {
  idle: '/mascots/cat/idle.json',
  sleep: '/mascots/cat/sleep.json',
  stretch: '/mascots/cat/stretch.json',
  scratch: '/mascots/cat/scratch.json',
  celebrate_small: '/mascots/cat/celebrate.json',
  celebrate_big: '/mascots/cat/celebrate.json',
  work: '/mascots/cat/idle.json', // 暂用 idle 代替
  error: '/mascots/cat/idle.json', // 暂用 idle 代替
}

export const useMascotController = () => {
  const state = useState<MascotState>('mascot_state', () => ({
    currentAction: 'idle',
    isPlaying: true,
    lastInteractionTime: Date.now(),
    achievementPoints: 0,
  }))

  // 动画缓存
  const animationCache = useState<Map<MascotAction, any>>('mascot_animation_cache', () => new Map())

  // 加载动画数据
  const loadAnimation = async (action: MascotAction): Promise<any> => {
    // 检查缓存
    if (animationCache.value.has(action)) {
      return animationCache.value.get(action)
    }

    try {
      const response = await fetch(ANIMATION_PATHS[action])
      if (!response.ok) {
        console.warn(`Animation ${action} not found, using idle`)
        return loadAnimation('idle')
      }
      const data = await response.json()
      animationCache.value.set(action, data)
      return data
    }
    catch (error) {
      console.error(`Failed to load animation ${action}:`, error)
      // 如果不是 idle 动画加载失败，回退到 idle
      if (action !== 'idle') {
        return loadAnimation('idle')
      }
      return null
    }
  }

  // 切换动作
  const playAction = async (action: MascotAction, options?: { duration?: number, onComplete?: () => void }) => {
    state.value.currentAction = action
    state.value.lastInteractionTime = Date.now()

    // 如果指定了持续时间，自动回到 idle
    if (options?.duration) {
      setTimeout(() => {
        if (state.value.currentAction === action) {
          playAction('idle')
        }
        options.onComplete?.()
      }, options.duration)
    }
  }

  // 庆祝成就
  const celebrateAchievement = (points: number) => {
    const now = Date.now()
    const timeSinceLastCelebration = now - state.value.lastInteractionTime

    // 冷却时间 5 秒
    if (timeSinceLastCelebration < 5000) {
      return
    }

    state.value.achievementPoints += points

    // 根据积分大小选择动画
    const action: MascotAction = points >= 100 ? 'celebrate_big' : 'celebrate_small'

    // 播放庆祝动画 2 秒后回到 idle
    playAction(action, {
      duration: 2000,
      onComplete: () => {
        console.log(`Achievement celebrated: +${points} points`)
      },
    })
  }

  // 触发工作状态（同步中）
  const setWorking = (isWorking: boolean) => {
    if (isWorking) {
      playAction('work')
    }
    else {
      playAction('idle')
    }
  }

  // 触发错误状态
  const showError = () => {
    playAction('error', {
      duration: 1000,
      onComplete: () => playAction('idle'),
    })
  }

  // 检测长时间无操作（睡觉）
  const checkIdleTimeout = (idleTimeoutMinutes = 5) => {
    const now = Date.now()
    const idleTime = now - state.value.lastInteractionTime
    const idleTimeoutMs = idleTimeoutMinutes * 60 * 1000

    if (idleTime > idleTimeoutMs && state.value.currentAction === 'idle') {
      playAction('sleep')
    }
  }

  // 用户交互（重置无操作计时）
  const recordInteraction = () => {
    state.value.lastInteractionTime = Date.now()

    // 如果正在睡觉，唤醒
    if (state.value.currentAction === 'sleep') {
      playAction('idle')
    }
  }

  return {
    state: readonly(state),
    loadAnimation,
    playAction,
    celebrateAchievement,
    setWorking,
    showError,
    checkIdleTimeout,
    recordInteraction,
  }
}
