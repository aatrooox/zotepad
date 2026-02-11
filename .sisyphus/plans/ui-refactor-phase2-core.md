# Phase 2: 核心功能

> **所属计划**: UI 重构：个人数据中心仪表盘
> **阶段**: 2 of 4
> **前置依赖**: [Phase 1: 基础设施](./ui-refactor-phase1-infrastructure.md)
> **后续阶段**: [Phase 3: 导航收尾](./ui-refactor-phase3-navigation.md)

---

## TL;DR

> **目标**: 构建仪表盘首页的核心 UI 组件
> 
> **Deliverables**:
> - 仪表盘首页骨架布局
> - Profile 卡片组件（等级/积分/EXP）
> - 写作统计区块
> - 待办清单 UI（CRUD）
> - 最近活动区块
> - 快速记录组件（多选保存）
> 
> **Estimated Effort**: Medium-Large (6 tasks, ~6-8 小时)
> **Parallel Execution**: YES - 分 2 个 Wave
> **Critical Path**: Task 5 → (Task 6, 7, 8, 9 并行) → Task 10

---

## Context

### 背景
Phase 1 完成了数据基础设施（todos 表 + link_relations 表 + Repository）。本阶段专注于构建用户可见的仪表盘界面，包括个人信息展示、统计数据、待办清单交互和快速记录功能。

### ⚠️ 重要约束：UI 重构 ≠ 功能删除

**用户明确要求**：
> "现在已有的功能是不删除的。只是完全的重构UI。调整其跳转逻辑。只是没用的入口隐藏掉。"

本阶段的核心是**添加新的仪表盘首页**，而非删除现有功能：
- ✅ 首页 `/` 从重定向改为仪表盘
- ✅ 添加新的仪表盘组件
- ✅ 现有页面（notes, moments, assets, workflows, settings）保持不变
- ❌ 不删除任何现有页面代码
- ❌ 不删除任何现有导航入口（Phase 3 处理入口调整）

### 设计原则
- **复用优先**: 充分利用现有的 `usePointsSystem`, `useStatsCollector`, `useMomentRepository`
- **组件化**: 每个区块独立成组件，便于维护和测试
- **响应式**: 移动端单列，桌面端网格布局
- **空状态友好**: 处理无数据场景
- **非破坏性**: 只新增，不删除

### 页面备份策略

重构页面时，先将原页面备份到 `_backup/` 目录，再创建新页面：

```
app/pages/
├── _backup/              # 备份目录（Nuxt 忽略 _ 开头的目录）
│   └── index.vue         # 原首页（重定向逻辑）
├── index.vue             # 新仪表盘页面
└── ...
```

**好处**：
- 原代码不丢失，随时可回滚
- 方便对比新旧实现
- 新页面直接用正常路径，无临时路由

---

## Guardrails (Must NOT Do)

- ❌ 不修改 `app/components/md-editor/MdEditorCrepe.vue`
- ❌ 不修改 `app/composables/useWorkflowRunner.ts`
- ❌ 不修改现有 repository CRUD 逻辑
- ❌ 不修改 `useSyncManager.ts` 或 sync 相关代码
- ❌ 快速记录不做图片上传
- ❌ 待办不做子任务/优先级 UI/截止提醒/重复规则
- ❌ 不删除任何现有页面或路由
- ❌ 不修改 `MobileTabBar.vue` 或 `SidebarNavigation.vue`（Phase 3 处理）
- ❌ 不展示链接度分数（数据已存储，UI 后续迭代）

---

## Execution Waves

```
Wave 1 (首页骨架 - 独立):
└── Task 5: 仪表盘首页骨架

Wave 2 (功能区块 - Task 5 完成后并行):
├── Task 6: Profile 卡片组件
├── Task 7: 写作统计区块
├── Task 8: 待办清单区块
└── Task 9: 最近活动区块

Wave 3 (快速记录 - Task 8 完成后):
└── Task 10: 快速记录组件
```

---

## TODOs

### Task 5: 创建仪表盘首页骨架

**What to do**:
- **先备份原页面**：`mv app/pages/index.vue app/pages/_backup/index.vue`
- 创建 `app/pages/_backup/` 目录（如不存在）
- 创建新的 `app/pages/index.vue`，作为仪表盘页面
- 创建响应式布局骨架：
  - 顶部：Profile 区域（占位）
  - 中间：内容网格（统计、待办、活动）
  - 底部：快速记录 FAB（占位）
- 移动端单列布局，桌面端 2-3 列网格
- 添加页面标题和基本 Tailwind 样式
- **暂不实现具体内容组件**，只做布局框架

**Recommended Agent Profile**:
- **Category**: `visual-engineering`
  - Reason: UI 布局设计，需要视觉感知
- **Skills**: [`frontend-ui-ux`]

**Parallelization**:
- **Can Run In Parallel**: NO (本阶段起点)
- **Blocks**: Task 6, 7, 8, 9
- **Blocked By**: Phase 1 完成

**References**:
- `app/pages/achievements.vue:173-290` - Profile 卡片布局参考
- `app/layouts/default.vue` - 现有布局结构理解
- `app/assets/css/tailwind.css` - 现有样式变量

**Acceptance Criteria**:

```
Scenario: 备份目录存在且原页面已备份
  Tool: Bash
  Steps:
    1. ls -la app/pages/_backup/
    2. cat app/pages/_backup/index.vue | head -20
  Expected Result: _backup 目录存在，index.vue 包含原重定向逻辑
  Evidence: 命令输出

Scenario: 首页不再重定向
  Tool: Playwright
  Preconditions: 开发服务器运行在 localhost:4577
  Steps:
    1. 导航到 http://localhost:4577/
    2. 等待页面加载完成 (timeout: 5s)
    3. 获取当前 URL
  Expected Result: URL 仍为 "/" 而非 "/notes"
  Evidence: .sisyphus/evidence/phase2-task5-no-redirect.png

Scenario: 布局响应式 - 移动端
  Tool: Playwright
  Preconditions: 开发服务器运行
  Steps:
    1. 设置视口为移动端 (375x667)
    2. 导航到 http://localhost:4577/
    3. 截图保存
  Expected Result: 单列布局
  Evidence: .sisyphus/evidence/phase2-task5-mobile.png

Scenario: 布局响应式 - 桌面端
  Tool: Playwright
  Preconditions: 开发服务器运行
  Steps:
    1. 设置视口为桌面端 (1280x800)
    2. 导航到 http://localhost:4577/
    3. 截图保存
  Expected Result: 多列网格布局
  Evidence: .sisyphus/evidence/phase2-task5-desktop.png
```

**Commit**: YES
- Message: `refactor(pages): backup old index and create dashboard skeleton`
- Files: `app/pages/_backup/index.vue`, `app/pages/index.vue`
- Pre-commit: `pnpm lint`

---

### Task 6: 实现 Profile 卡片组件

**What to do**:
- 创建 `app/components/app/dashboard/DashboardProfile.vue`
- 复用 `usePointsSystem` 获取数据：
  - `getProfile()` - 获取用户等级、总积分
  - `getLevelProgress()` - 获取 EXP 进度
- 显示元素：
  - 等级徽章（Level X）
  - EXP 进度条
  - 总积分数
  - 成就数量（可选）
- 参考 `achievements.vue` 的 Profile 卡片样式
- 在 `index.vue` 中集成此组件

**Recommended Agent Profile**:
- **Category**: `visual-engineering`
- **Skills**: [`frontend-ui-ux`]

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 7, 8, 9)
- **Blocks**: None
- **Blocked By**: Task 5

**References**:
- `app/pages/achievements.vue:179-286` - 完整 Profile 卡片 UI 代码
- `app/composables/usePointsSystem.ts` - getProfile, getLevelProgress API
- `app/composables/useCurrentUser.ts` - getCurrentUserId

**Acceptance Criteria**:

```
Scenario: Profile 卡片显示等级
  Tool: Playwright
  Preconditions: 开发服务器运行，用户有积分数据
  Steps:
    1. 导航到 http://localhost:4577/
    2. 等待 .dashboard-profile 或 [data-testid="dashboard-profile"] 可见 (timeout: 5s)
    3. 检查是否包含 "Level" 或 "Lv" 文字
    4. 检查是否有进度条元素 (progress bar)
  Expected Result: Profile 卡片显示等级和进度条
  Evidence: .sisyphus/evidence/phase2-task6-profile.png

Scenario: Profile 显示积分
  Tool: Playwright
  Steps:
    1. 导航到首页
    2. 检查 Profile 区域是否显示数字（积分）
  Expected Result: 显示积分数值
  Evidence: 截图
```

**Commit**: YES
- Message: `feat(dashboard): add profile card component`
- Files: `app/components/app/dashboard/DashboardProfile.vue`, `app/pages/index.vue`
- Pre-commit: `pnpm lint`

---

### Task 7: 实现写作统计区块

**What to do**:
- 创建 `app/components/app/dashboard/DashboardStats.vue`
- 复用 `useStatsCollector` 获取数据：
  - 总字数
  - 本周字数
  - 文章数
  - 动态数
- 卡片式 UI 设计，每个统计项一个小卡片
- 支持响应式：移动端 2x2 网格，桌面端横排
- 在 `index.vue` 中集成此组件

**Recommended Agent Profile**:
- **Category**: `visual-engineering`
- **Skills**: [`frontend-ui-ux`]

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 6, 8, 9)
- **Blocks**: None
- **Blocked By**: Task 5

**References**:
- `app/composables/useStatsCollector.ts` - getAllStats, getStat API
- `app/pages/achievements.vue:259-282` - 统计卡片样式参考

**Acceptance Criteria**:

```
Scenario: 统计数据显示
  Tool: Playwright
  Preconditions: 开发服务器运行
  Steps:
    1. 导航到 http://localhost:4577/
    2. 等待统计区块可见 (.dashboard-stats)
    3. 检查是否显示 4 个统计卡片
    4. 检查卡片内是否有数字
  Expected Result: 显示 4 个统计卡片，各有数字
  Evidence: .sisyphus/evidence/phase2-task7-stats.png
```

**Commit**: YES
- Message: `feat(dashboard): add stats summary component`
- Files: `app/components/app/dashboard/DashboardStats.vue`, `app/pages/index.vue`
- Pre-commit: `pnpm lint`

---

### Task 8: 实现待办清单区块

**What to do**:
- 创建 `app/components/app/dashboard/DashboardTodos.vue`
- 使用 `useTodoRepository`（Phase 1 创建）实现 CRUD：
  - 显示待办列表（最多 10 条未完成）
  - 添加输入框 + 添加按钮
  - 每项有完成按钮（复选框）和删除按钮
- 空状态提示："暂无待办，添加一个吧！"
- 完成的待办显示删除线样式
- 在 `index.vue` 中集成此组件

**Recommended Agent Profile**:
- **Category**: `visual-engineering`
- **Skills**: [`frontend-ui-ux`]

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 6, 7, 9)
- **Blocks**: Task 10
- **Blocked By**: Task 5, Phase 1 (useTodoRepository)

**References**:
- `app/composables/repositories/useTodoRepository.ts` - CRUD API
- `app/pages/notes/moments/index.vue` - 列表 + 操作 UI 参考

**Acceptance Criteria**:

```
Scenario: 创建待办成功
  Tool: Playwright
  Preconditions: 开发服务器运行
  Steps:
    1. 导航到 http://localhost:4577/
    2. 找到待办输入框 (input[placeholder*="待办"] 或类似)
    3. 输入 "测试待办项目"
    4. 点击添加按钮或按 Enter
    5. 等待列表更新 (500ms)
  Expected Result: 新待办项出现在列表中
  Evidence: .sisyphus/evidence/phase2-task8-create-todo.png

Scenario: 完成待办成功
  Tool: Playwright
  Preconditions: 已有待办项
  Steps:
    1. 找到待办项的复选框或完成按钮
    2. 点击完成
    3. 等待 UI 更新
  Expected Result: 待办项显示删除线或已完成状态
  Evidence: .sisyphus/evidence/phase2-task8-complete-todo.png

Scenario: 删除待办成功
  Tool: Playwright
  Preconditions: 已有待办项
  Steps:
    1. Hover 待办项显示删除按钮
    2. 点击删除按钮
    3. 等待 UI 更新
  Expected Result: 待办项从列表消失
  Evidence: .sisyphus/evidence/phase2-task8-delete-todo.png

Scenario: 空状态显示
  Tool: Playwright
  Preconditions: 待办列表为空
  Steps:
    1. 导航到首页
    2. 检查待办区块内容
  Expected Result: 显示空状态提示文字
  Evidence: 截图
```

**Commit**: YES
- Message: `feat(dashboard): add todo list component with CRUD`
- Files: `app/components/app/dashboard/DashboardTodos.vue`, `app/pages/index.vue`
- Pre-commit: `pnpm lint`

---

### Task 9: 实现最近活动区块

**What to do**:
- 创建 `app/components/app/dashboard/DashboardActivity.vue`
- 数据来源（合并展示）：
  - `usePointsSystem.getPointsLog()` - 积分变动记录
  - `useMomentRepository.getAllMoments()` - 最近动态
- 合并为时间线展示，按时间倒序，最多显示 10 条
- 每条显示：图标 + 描述 + 时间
- 空状态提示："暂无活动记录"
- 在 `index.vue` 中集成此组件

**Recommended Agent Profile**:
- **Category**: `visual-engineering`
- **Skills**: [`frontend-ui-ux`]

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 6, 7, 8)
- **Blocks**: None
- **Blocked By**: Task 5

**References**:
- `app/composables/usePointsSystem.ts` - getPointsLog API
- `app/composables/repositories/useMomentRepository.ts` - getAllMoments API
- `app/pages/achievements.vue:420-500` - 积分日志展示参考

**Acceptance Criteria**:

```
Scenario: 活动列表显示
  Tool: Playwright
  Preconditions: 开发服务器运行，用户有历史数据
  Steps:
    1. 导航到 http://localhost:4577/
    2. 滚动到最近活动区块 (.dashboard-activity)
    3. 检查是否有活动项列表
  Expected Result: 显示最近活动列表或空状态
  Evidence: .sisyphus/evidence/phase2-task9-activity.png

Scenario: 活动项格式正确
  Tool: Playwright
  Steps:
    1. 检查活动项是否包含图标
    2. 检查活动项是否包含时间
  Expected Result: 每项有图标和时间显示
  Evidence: 截图
```

**Commit**: YES
- Message: `feat(dashboard): add recent activity component`
- Files: `app/components/app/dashboard/DashboardActivity.vue`, `app/pages/index.vue`
- Pre-commit: `pnpm lint`

---

### Task 10: 实现快速记录组件

**What to do**:
- 创建 `app/components/app/dashboard/QuickCapture.vue`
- UI 结构：
  - 浮动按钮（FAB）：固定在右下角，点击展开 Bottom Sheet
  - Bottom Sheet 内容：
    - 多行文本输入框
    - 三个多选按钮：保存到 [动态] [待办] [文章]
    - 保存按钮
- 保存逻辑（支持多选同时保存）：
  - 保存到动态：调用 `useMomentRepository.createMoment()`
  - 保存到待办：调用 `useTodoRepository.createTodo()`
  - 保存到文章：调用 `useNoteRepository.createNote()`，标题格式 `快记-YYYY-MM-DD-HH:mm`
- 保存成功后清空输入框，关闭 Sheet，显示 toast
- 在 `index.vue` 中集成此组件

**Recommended Agent Profile**:
- **Category**: `visual-engineering`
- **Skills**: [`frontend-ui-ux`]

**Parallelization**:
- **Can Run In Parallel**: NO
- **Blocks**: None
- **Blocked By**: Task 8 (需要 Todo UI 交互验证)

**References**:
- `app/composables/repositories/useMomentRepository.ts` - createMoment
- `app/composables/repositories/useTodoRepository.ts` - createTodo
- `app/composables/repositories/useNoteRepository.ts` - createNote
- `app/components/ui/drawer/Drawer.vue` - Bottom Sheet 组件

**Acceptance Criteria**:

```
Scenario: FAB 点击展开 Bottom Sheet
  Tool: Playwright
  Preconditions: 开发服务器运行
  Steps:
    1. 导航到 http://localhost:4577/
    2. 找到快速记录 FAB 按钮 (.quick-capture-fab)
    3. 点击按钮
    4. 等待 Bottom Sheet 动画完成
  Expected Result: Bottom Sheet 展开，显示输入框和选项
  Evidence: .sisyphus/evidence/phase2-task10-sheet-open.png

Scenario: 保存到动态成功
  Tool: Playwright
  Steps:
    1. 打开快速记录 Sheet
    2. 输入 "测试快速记录内容"
    3. 选中 "保存到动态" 按钮
    4. 点击保存按钮
    5. 等待保存完成
  Expected Result: toast 提示保存成功，Sheet 关闭
  Evidence: .sisyphus/evidence/phase2-task10-save-moment.png

Scenario: 多选保存成功
  Tool: Playwright
  Steps:
    1. 打开快速记录
    2. 输入 "多选测试内容"
    3. 同时选中 "动态" 和 "待办"
    4. 点击保存
  Expected Result: 同时保存到两个目标，toast 显示成功
  Evidence: .sisyphus/evidence/phase2-task10-multi-save.png

Scenario: 保存到文章自动命名
  Tool: Playwright + Bash
  Steps:
    1. 打开快速记录
    2. 输入 "文章内容测试"
    3. 只选中 "保存到文章"
    4. 点击保存
    5. Bash: sqlite3 查询最新文章 title
  Expected Result: 文章标题格式为 "快记-YYYY-MM-DD-HH:mm"
  Evidence: sqlite 查询结果
```

**Commit**: YES
- Message: `feat(dashboard): add quick capture component with multi-target save`
- Files: `app/components/app/dashboard/QuickCapture.vue`, `app/pages/index.vue`
- Pre-commit: `pnpm lint`

---

## Phase Completion Checklist

完成本阶段后，验证以下条件：

- [ ] `pnpm lint` 通过
- [ ] `pnpm nuxi typecheck` 通过
- [ ] 首页 `/` 显示仪表盘（不再重定向）
- [ ] Profile 卡片显示等级和积分
- [ ] 统计区块显示 4 项数据
- [ ] 待办清单支持添加、完成、删除
- [ ] 最近活动显示时间线
- [ ] 快速记录可保存到 3 个目标
- [ ] 移动端和桌面端布局正常

## Next Phase

完成后继续 [Phase 3: 导航收尾](./ui-refactor-phase3-navigation.md)，包含：
- 导航结构重构
- 文章编辑小入口
- 响应式优化与边缘情况处理
