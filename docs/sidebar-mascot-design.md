# ZotePad 侧边栏吉祥物系统设计文档

> **版本**: v1.0  
> **日期**: 2025-12-11  
> **状态**: 设计阶段

---

## 📋 目录

1. [功能概述](#功能概述)
2. [技术架构](#技术架构)
3. [分步实现计划](#分步实现计划)
4. [数据结构设计](#数据结构设计)
5. [组件架构](#组件架构)
6. [交互设计](#交互设计)
7. [性能优化策略](#性能优化策略)
8. [素材资源清单](#素材资源清单)
9. [配置面板设计](#配置面板设计)
10. [扩展性规划](#扩展性规划)

---

## 功能概述

### 核心目标
在侧边栏顶部 Logo 区域集成一个可交互的动画吉祥物系统，增强产品趣味性和用户情感连接。

### 功能特性

#### MVP 版本 (Phase 1)
- ✅ 基础 Lottie 动画播放
- ✅ 3-5 个随机动作循环（idle/sleep/stretch/scratch）
- ✅ 成就触发简单庆祝动画
- ✅ 展开/折叠状态适配

#### V2 版本 (Phase 2)
- ✅ 眼球跟踪编辑器区域（SVG + GSAP）
- ✅ 状态联动（同步中/错误/长时间无操作）
- ✅ 配置面板（Settings 页）
- ✅ 持久化配置

#### V3 版本 (Phase 3)
- ✅ 自定义吉祥物上传（本地文件/URL）
- ✅ 多套内置吉祥物切换
- ✅ 节日主题自动切换
- ✅ 社区分享功能

---

## 技术架构

### 技术栈选型

| 技术 | 用途 | 许可 |
|------|------|------|
| **@lottiefiles/vue-lottie-player** | 身体动画播放 | MIT |
| **SVG + Refs** | 眼球绘制与控制 | - |
| **GSAP** | 眼球动画插值 | 已集成 |
| **@vueuse/core** | 鼠标位置追踪 | MIT |
| **useTauriStore** | 配置持久化 | 已有 |

### 架构图

```
┌─────────────────────────────────────────────────────┐
│              SidebarNavigation.vue                  │
├─────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────┐   │
│  │         SidebarMascot.vue (容器)            │   │
│  │  ┌──────────────────┐  ┌─────────────────┐ │   │
│  │  │ LottieMascot.vue │  │  ImageMascot    │ │   │
│  │  │ (动画播放器)      │  │  (静态/GIF)     │ │   │
│  │  └──────────────────┘  └─────────────────┘ │   │
│  │  ┌──────────────────────────────────────┐  │   │
│  │  │       EyeTrackingLayer.vue           │  │   │
│  │  │       (SVG 眼球覆盖层)                │  │   │
│  │  └──────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────┘   │
│                        ↕                            │
│           useMascotController (状态管理)            │
│                        ↕                            │
│             useTauriStore (持久化)                  │
└─────────────────────────────────────────────────────┘
```

---

## 分步实现计划

### Phase 1: MVP 基础版 (预估 4-5h)

**目标**: 展示可交互的动画吉祥物

#### 任务清单
- [ ] 1.1 安装依赖 `@lottiefiles/vue-lottie-player`
- [ ] 1.2 创建 `composables/useMascotController.ts`
- [ ] 1.3 创建 `components/app/sidebar/mascot/SidebarMascot.vue`
- [ ] 1.4 创建 `components/app/sidebar/mascot/LottieMascot.vue`
- [ ] 1.5 集成到 `SidebarNavigation.vue`
- [ ] 1.6 实现随机动作系统
- [ ] 1.7 实现成就触发动画

#### 依赖安装
```bash
pnpm add @lottiefiles/vue-lottie-player
```

#### 素材需求
- `cat-idle.json` (呼吸待机，循环)
- `cat-sleep.json` (睡觉)
- `cat-stretch.json` (伸懒腰)
- `cat-celebrate.json` (庆祝)

---

### Phase 2: 眼球跟踪 + 配置 (预估 6h)

**目标**: 增强交互性和可配置性

#### 任务清单
- [ ] 2.1 创建 `components/app/sidebar/mascot/EyeTrackingLayer.vue`
- [ ] 2.2 实现眼球角度计算算法
- [ ] 2.3 集成 `useMouseInElement` 追踪编辑器
- [ ] 2.4 实现状态联动（同步/错误）
- [ ] 2.5 创建 `types/mascot.ts` 配置类型
- [ ] 2.6 扩展 `useMascotController` 支持配置
- [ ] 2.7 创建配置面板组件（Settings 页）
- [ ] 2.8 持久化配置到 `useTauriStore`

#### 素材需求
- `cat-work.json` (工作中，同步时播放)
- `cat-error.json` (错误抖动)

---

### Phase 3: 高级功能 (预估 8h)

**目标**: 用户深度定制

#### 任务清单
- [ ] 3.1 创建 `components/app/sidebar/mascot/ImageMascot.vue`
- [ ] 3.2 实现 Tauri 文件选择上传
- [ ] 3.3 支持 GIF URL 输入
- [ ] 3.4 创建吉祥物预设库（3套）
- [ ] 3.5 实现节日主题检测与切换
- [ ] 3.6 设计吉祥物社区分享协议
- [ ] 3.7 实现导入/导出功能

---

## 数据结构设计

### 配置接口 (`types/mascot.ts`)

```typescript
export type MascotType = 'builtin' | 'custom' | 'gif' | 'image'
export type BuiltinMascotId = 'cat' | 'dog' | 'fox'
export type MascotAction = 
  | 'idle' 
  | 'sleep' 
  | 'stretch' 
  | 'scratch' 
  | 'celebrate_small' 
  | 'celebrate_big' 
  | 'work' 
  | 'error'

export interface MascotConfig {
  // 基础配置
  type: MascotType
  enabled: boolean
  
  // 吉祥物选择
  builtinId?: BuiltinMascotId
  customUrl?: string
  customPath?: string
  
  // 动画配置
  animationSpeed: number  // 0.5 - 2.0
  randomActions: boolean
  actionInterval: [number, number]  // [min, max] 秒
  
  // 眼球跟踪
  eyeTracking: {
    enabled: boolean
    trackTarget: 'editor' | 'mouse'
    sensitivity: number  // 0.5 - 2.0
    maxAngle: number     // 最大转动角度（度）
  }
  
  // 成就反馈
  achievementFeedback: {
    enabled: boolean
    smallThreshold: number    // 小成就积分
    bigThreshold: number      // 大成就积分
    cooldown: number          // 冷却时间（ms）
  }
  
  // 状态联动
  statusBinding: {
    syncing: boolean    // 同步时播放 work 动画
    error: boolean      // 错误时播放 error 动画
    idle: boolean       // 长时间无操作播放 sleep 动画
    idleTimeout: number // 无操作超时时间（分钟）
  }
}

export interface BuiltinMascot {
  id: BuiltinMascotId
  name: string
  description: string
  author: string
  license: string  // 'CC0' | 'CC BY 4.0' | 'MIT'
  animations: Record<MascotAction, string>  // 动画文件路径
  eyeConfig?: {
    leftEyePosition: [number, number]
    rightEyePosition: [number, number]
    eyeRadius: number
  }
}

export interface MascotState {
  currentAction: MascotAction
  isPlaying: boolean
  lastAchievementTime: number
  idleStartTime: number
}
```

### 默认配置

```typescript
export const DEFAULT_MASCOT_CONFIG: MascotConfig = {
  type: 'builtin',
  enabled: true,
  builtinId: 'cat',
  animationSpeed: 1.0,
  randomActions: true,
  actionInterval: [8, 20],
  eyeTracking: {
    enabled: true,
    trackTarget: 'editor',
    sensitivity: 1.0,
    maxAngle: 30
  },
  achievementFeedback: {
    enabled: true,
    smallThreshold: 1,
    bigThreshold: 100,
    cooldown: 5000
  },
  statusBinding: {
    syncing: true,
    error: true,
    idle: true,
    idleTimeout: 5
  }
}
```

---

## 组件架构

### 组件文件树

```
app/components/app/sidebar/
├── SidebarNavigation.vue          # 导航容器（已有）
└── mascot/
    ├── SidebarMascot.vue          # 吉祥物主容器
    ├── LottieMascot.vue           # Lottie 动画渲染器
    ├── ImageMascot.vue            # 静态图片/GIF 渲染器
    └── EyeTrackingLayer.vue       # SVG 眼球覆盖层
```

### 核心组件职责

#### `SidebarMascot.vue` (主容器)
- 根据配置切换渲染类型（Lottie/Image）
- 管理展开/折叠状态适配
- 监听 `useMascotController` 状态变化
- 响应点击事件触发特殊动画

#### `LottieMascot.vue` (Lottie 渲染器)
- 封装 `@lottiefiles/vue-lottie-player`
- 控制动画播放/暂停/速度
- 支持动作切换

#### `EyeTrackingLayer.vue` (眼球层)
- SVG 绘制眼球
- 计算眼球跟踪角度
- GSAP 动画插值

---

## 交互设计

### 用户交互矩阵

| 触发条件 | 吉祥物反馈 | 动画 |
|---------|-----------|------|
| **侧边栏展开** | 从缩略图放大 | Scale + Fade |
| **侧边栏折叠** | 缩小到头像 | Scale + Fade |
| **点击吉祥物** | 随机特殊动作 | stretch/scratch |
| **写文章 +1 分** | 小庆祝 | celebrate_small |
| **完成成就 +100 分** | 大庆祝 | celebrate_big + 粒子特效 |
| **同步中** | 工作状态 | work (循环) |
| **同步错误** | 抖动 | error (单次) |
| **5 分钟无操作** | 睡觉 | sleep (循环) |
| **鼠标进入编辑器** | 眼睛注视 | 眼球旋转 |
| **鼠标离开编辑器** | 眼睛回中 | 眼球归位 |

### 动画状态机

```
        ┌──────────┐
        │   idle   │ ◄─── 默认状态
        └─────┬────┘
              │
    ┌─────────┼─────────┬──────────┐
    │         │         │          │
    ▼         ▼         ▼          ▼
┌────────┐ ┌────────┐ ┌──────┐ ┌──────┐
│ sleep  │ │stretch │ │work  │ │error │
└────────┘ └────────┘ └──────┘ └──────┘
                          │
                          ▼
                    ┌──────────┐
                    │celebrate │
                    └──────────┘
                          │
                          └──────► 返回 idle
```

---

## 性能优化策略

### 渲染优化

```typescript
// 1. 条件渲染
const shouldRenderMascot = computed(() => {
  return mascotConfig.enabled && !isLowEndDevice.value
})

// 2. 帧率控制
const targetFPS = computed(() => {
  if (isMobile.value) return 15
  if (isLowEndDevice.value) return 30
  return 60
})

// 3. 懒加载动画
const loadAnimationLazy = async (action: MascotAction) => {
  if (!animationCache.has(action)) {
    const animation = await import(`~/assets/mascots/cat/${action}.json`)
    animationCache.set(action, animation)
  }
  return animationCache.get(action)
}
```

### 降级策略

| 设备条件 | 降级方案 |
|---------|---------|
| 移动端 | 禁用眼球跟踪，保留基础动画 |
| CPU 核心 < 4 | 降至 15 FPS |
| 电池 < 20% | 显示静态图片 |
| 后台运行 | 暂停所有动画 |
| 侧边栏折叠 | 仅显示头像，停止身体动画 |

### 内存管理

```typescript
// 动画资源预加载
const preloadAnimations = async () => {
  const critical = ['idle', 'celebrate_small']
  await Promise.all(critical.map(loadAnimationLazy))
}

// 卸载未使用动画
const cleanupAnimationCache = () => {
  const keepActions = ['idle', currentAction.value]
  for (const [action, animation] of animationCache.entries()) {
    if (!keepActions.includes(action)) {
      animationCache.delete(action)
    }
  }
}
```

---

## 素材资源清单

### MVP 必需素材 (Phase 1)

| 文件名 | 描述 | 用途 | 优先级 |
|--------|------|------|--------|
| `cat-idle.json` | 呼吸待机动画（循环） | 默认状态 | 🔴 必需 |
| `cat-sleep.json` | 睡觉动画（循环） | 长时间无操作 | 🟡 推荐 |
| `cat-stretch.json` | 伸懒腰（单次） | 随机动作 | 🟡 推荐 |
| `cat-celebrate.json` | 庆祝动画（单次） | 成就触发 | 🔴 必需 |

### 完整素材列表 (Phase 2-3)

| 文件名 | 描述 | 尺寸 | 帧数 | 格式 |
|--------|------|------|------|------|
| `cat-idle.json` | 呼吸待机 | 200x200 | Loop | Lottie JSON |
| `cat-sleep.json` | 睡觉 | 200x200 | Loop | Lottie JSON |
| `cat-stretch.json` | 伸懒腰 | 200x200 | 60 | Lottie JSON |
| `cat-scratch.json` | 挠东西 | 200x200 | 45 | Lottie JSON |
| `cat-celebrate-small.json` | 小庆祝 | 200x200 | 30 | Lottie JSON |
| `cat-celebrate-big.json` | 大庆祝 | 200x200 | 90 | Lottie JSON |
| `cat-work.json` | 工作中 | 200x200 | Loop | Lottie JSON |
| `cat-error.json` | 错误抖动 | 200x200 | 20 | Lottie JSON |

### 素材存储位置

```
public/mascots/
├── cat/
│   ├── idle.json
│   ├── sleep.json
│   ├── stretch.json
│   ├── celebrate.json
│   └── ...
├── dog/       # 未来扩展
└── fox/       # 未来扩展
```

---

## 配置面板设计

### Settings 页面布局

```vue
<template>
  <div class="space-y-6">
    <div class="space-y-4">
      <h2 class="text-lg font-semibold">侧边栏吉祥物</h2>
      
      <!-- 启用开关 -->
      <div class="flex items-center justify-between">
        <Label>启用吉祥物</Label>
        <Switch v-model="config.enabled" />
      </div>

      <!-- 吉祥物类型选择 -->
      <div class="space-y-2">
        <Label>吉祥物类型</Label>
        <RadioGroup v-model="config.type">
          <div class="flex items-center space-x-2">
            <RadioGroupItem value="builtin" />
            <Label>内置动画</Label>
          </div>
          <div class="flex items-center space-x-2">
            <RadioGroupItem value="custom" />
            <Label>自定义</Label>
          </div>
        </RadioGroup>
      </div>

      <!-- 内置吉祥物选择 -->
      <div v-if="config.type === 'builtin'">
        <Select v-model="config.builtinId">
          <SelectTrigger>
            <SelectValue placeholder="选择吉祥物" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cat">简约小猫</SelectItem>
            <SelectItem value="dog">可爱小狗</SelectItem>
            <SelectItem value="fox">灵动小狐</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <!-- 自定义上传 -->
      <div v-if="config.type === 'custom'" class="space-y-2">
        <Button variant="outline" @click="selectCustomFile">
          <Icon name="lucide:upload" class="mr-2" />
          选择本地文件
        </Button>
        <Input 
          v-model="config.customUrl" 
          placeholder="或粘贴图片/GIF URL"
        />
      </div>

      <Separator />

      <!-- 动画设置 -->
      <div class="space-y-3">
        <Label>动画设置</Label>
        
        <div class="flex items-center justify-between">
          <span class="text-sm">随机动作</span>
          <Switch v-model="config.randomActions" />
        </div>

        <div class="space-y-2">
          <div class="flex justify-between text-sm">
            <span>动画速度</span>
            <span>{{ config.animationSpeed }}x</span>
          </div>
          <Slider 
            v-model="config.animationSpeed" 
            :min="0.5" 
            :max="2" 
            :step="0.1"
          />
        </div>
      </div>

      <Separator />

      <!-- 眼球跟踪 -->
      <div class="space-y-3">
        <Label>眼球跟踪</Label>
        
        <div class="flex items-center justify-between">
          <span class="text-sm">启用跟踪</span>
          <Switch v-model="config.eyeTracking.enabled" />
        </div>

        <div v-if="config.eyeTracking.enabled">
          <Select v-model="config.eyeTracking.trackTarget">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="editor">跟踪编辑器</SelectItem>
              <SelectItem value="mouse">跟踪鼠标</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      <!-- 成就反馈 -->
      <div class="space-y-3">
        <Label>成就反馈</Label>
        
        <div class="flex items-center justify-between">
          <span class="text-sm">启用成就动画</span>
          <Switch v-model="config.achievementFeedback.enabled" />
        </div>
      </div>

      <Separator />

      <!-- 状态联动 -->
      <div class="space-y-3">
        <Label>状态联动</Label>
        
        <div class="flex items-center justify-between">
          <span class="text-sm">同步时动画</span>
          <Switch v-model="config.statusBinding.syncing" />
        </div>
        
        <div class="flex items-center justify-between">
          <span class="text-sm">错误时动画</span>
          <Switch v-model="config.statusBinding.error" />
        </div>
        
        <div class="flex items-center justify-between">
          <span class="text-sm">长时间无操作睡觉</span>
          <Switch v-model="config.statusBinding.idle" />
        </div>
      </div>
    </div>
  </div>
</template>
```

---

## 扩展性规划

### 社区分享协议 (V3)

```typescript
interface SharedMascot {
  id: string
  name: string
  author: string
  description: string
  tags: string[]
  downloads: number
  rating: number
  
  // 打包格式
  package: {
    version: '1.0',
    animations: Record<MascotAction, string>  // Base64 encoded Lottie JSON
    thumbnail: string  // Base64 encoded image
    eyeConfig?: EyeConfig
  }
}
```

### 节日主题切换 (V3)

```typescript
const HOLIDAY_THEMES: Record<string, BuiltinMascotId> = {
  '12-25': 'cat-christmas',  // 圣诞节
  '01-01': 'cat-newyear',    // 新年
  '10-31': 'cat-halloween',  // 万圣节
}

const checkHolidayTheme = () => {
  const today = new Date()
  const key = `${today.getMonth() + 1}-${today.getDate()}`
  return HOLIDAY_THEMES[key]
}
```

### 成就系统集成

```typescript
// 在 composables/useAchievement.ts
export const useAchievement = () => {
  const { celebrateAchievement } = useMascotController()
  
  const addPoints = (points: number, reason: string) => {
    userPoints.value += points
    
    // 触发吉祥物动画
    celebrateAchievement(points)
    
    // 显示 Toast
    toast.success(`+${points} 分：${reason}`)
  }
  
  return { addPoints }
}

// 在编辑器页面使用
const { addPoints } = useAchievement()

watch(wordCount, (newCount, oldCount) => {
  if (Math.floor(newCount / 100) > Math.floor(oldCount / 100)) {
    addPoints(1, '写作 100 字')
  }
})
```

---

## 实施检查清单

### Phase 1 完成标准
- [ ] 吉祥物在侧边栏正常显示
- [ ] 至少 3 个动作循环播放
- [ ] 成就触发能播放庆祝动画
- [ ] 展开/折叠状态适配正常
- [ ] 无明显性能问题

### Phase 2 完成标准
- [ ] 眼球能跟踪编辑器区域
- [ ] 同步/错误状态能触发对应动画
- [ ] 配置面板能正常保存设置
- [ ] 配置能持久化到本地

### Phase 3 完成标准
- [ ] 支持上传自定义图片/GIF
- [ ] 提供 3 套内置吉祥物切换
- [ ] 节日主题自动切换生效

---

## 附录

### 依赖列表

```json
{
  "dependencies": {
    "@lottiefiles/vue-lottie-player": "^2.0.2"
  }
}
```

### 参考资源

- [LottieFiles 官网](https://lottiefiles.com/)
- [Vue Lottie 文档](https://github.com/LottieFiles/lottie-player)
- [GSAP 官方文档](https://gsap.com/)
- [VueUse - useMouseInElement](https://vueuse.org/core/useMouseInElement/)

---

**文档版本**: v1.0  
**最后更新**: 2025-12-11  
**维护者**: ZotePad Team
