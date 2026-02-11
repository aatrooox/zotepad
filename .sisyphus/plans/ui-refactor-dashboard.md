# UI 重构：个人数据中心仪表盘

## TL;DR

> **Quick Summary**: 将 ZotePad 从「笔记管理工具」重构为「个人本地数据中心 + 轻量写作工具」。首页从文章列表变为个人仪表盘，新增待办清单功能，添加快速记录入口（支持多选保存目标），简化导航结构。纯 UI 层重构，保留所有现有功能代码逻辑。
> 
> **Deliverables**:
> - 全新首页仪表盘（写作统计、成就、待办、最近活动、快速记录）
> - 待办清单功能（新 todos 表 + Repository + UI）
> - 快速记录组件（单输入框 → 多选保存到动态/待办/文章）
> - 导航结构重构（简化 Tab，弱化文章列表入口）
> - 文章编辑小入口（首页角落按钮）
> 
> **Estimated Effort**: Large (5 phases, ~15-20 tasks)
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: DB Migration → Repository → 仪表盘骨架 → 待办 UI → 快速记录 → 导航重构

---

## Context

### Original Request
用户希望对 ZotePad 进行 UI 重构。核心痛点是：写完文章就发出去，很少回看文章列表；功能入口过多，认知负担重。希望将首页变成「个人数据中心仪表盘」风格，突出写作统计、待办清单、成就激励，弱化文章列表入口。

### Interview Summary
**Key Discussions**:
- 定位转变：从「笔记管理工具」→「个人本地数据中心 + 轻量写作」
- 首页核心：写作统计、待办清单、成就/激励、快速记录入口、最近活动
- 待办清单：全新功能，需要新建 todos 表
- 快速记录：一个输入框，多选保存目标（动态/待办/文章）
- 保存到文章：按「前缀+日期+时间」自动命名，直接保存
- 所有现有功能保留，代码逻辑不变，只做 UI 层重构
- 导航可以创新，不必循规蹈矩
- MVP 先行策略

**Research Findings**:
- 现有 19 个页面，`index.vue` 仅做重定向
- 现有 `useStatsCollector`, `usePointsSystem`, `useAchievementSystem` 可复用
- `achievements.vue` 有完整的 Profile 卡片、等级进度条、积分展示，可参考
- `useMomentRepository.ts` 展示了完整的 Repository 模式
- `src-tauri/src/lib.rs` 中 moments 表结构可参考设计 todos 表
- MobileTabBar 当前 5 个 Tab，可简化

### Metis Review
**Identified Gaps** (addressed):
- 快速记录交互形式 → 默认：浮动按钮 → Bottom Sheet
- 待办 MVP 字段 → 默认：标题 + 完成状态 + 时间
- 最近活动展示 → 默认：积分变动 + 最近内容
- Todos 是否同步 → 默认：MVP 不同步，纯本地
- 完成待办触发积分 → 默认：MVP 不触发

---

## Work Objectives

### Core Objective
将首页从「内容列表入口」重构为「个人数据仪表盘」，新增待办清单功能，添加快速记录入口，简化导航结构，同时保持所有现有功能可用。

### Concrete Deliverables
1. **新 todos 表** - SQLite Migration + useTodoRepository
2. **仪表盘首页** - 重写 `app/pages/index.vue`
3. **待办清单 UI** - 首页区块 + CRUD 交互
4. **快速记录组件** - 输入框 + 多选保存目标
5. **导航重构** - MobileTabBar + Sidebar 简化

### Definition of Done
- [ ] 首页显示用户 Profile、等级、写作统计、待办清单、最近活动
- [ ] 可创建、完成、删除待办事项
- [ ] 快速记录可保存到动态/待办/文章（多选）
- [ ] 所有原有 19 个页面路由仍可访问
- [ ] 移动端和桌面端 UI 均可正常使用

### Must Have
- 仪表盘显示写作统计（复用现有 Stats API）
- 仪表盘显示成就/等级（复用现有 Achievement API）
- 待办清单 CRUD 功能
- 快速记录多选保存
- 文章编辑入口（首页小按钮）
- 所有现有功能入口保留

### Must NOT Have (Guardrails)
- ❌ 不修改 `app/components/md-editor/MdEditorCrepe.vue`
- ❌ 不修改 `app/composables/useWorkflowRunner.ts`
- ❌ 不修改现有 repository CRUD 逻辑
- ❌ 不修改 `useSyncManager.ts` 或 sync 相关代码
- ❌ 快速记录不做图片上传
- ❌ 待办不做子任务/优先级/截止提醒/重复规则
- ❌ 不删除任何现有页面或路由

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
> ALL verification is executed by the agent using tools (Playwright, Bash, etc.).

### Test Decision
- **Infrastructure exists**: NO (无测试框架)
- **Automated tests**: None (MVP 阶段暂不添加)
- **Framework**: N/A

### Agent-Executed QA Scenarios (MANDATORY)
每个任务都包含详细的 QA 场景，使用 Playwright 或 Bash 验证。

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (基础设施 - Start Immediately):
├── Task 1: Todos 表 Migration (Rust)
└── Task 2: useTodoRepository (TypeScript)

Wave 2 (核心 UI - After Wave 1):
├── Task 3: 仪表盘首页骨架
├── Task 4: Profile 卡片组件
└── Task 5: 写作统计区块

Wave 3 (功能模块 - After Wave 2):
├── Task 6: 待办清单区块 + CRUD
├── Task 7: 最近活动区块
└── Task 8: 快速记录组件

Wave 4 (导航与入口 - After Wave 3):
├── Task 9: 导航结构重构
└── Task 10: 文章编辑小入口

Wave 5 (收尾 - After Wave 4):
└── Task 11: 响应式优化与边缘情况处理
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 2 | None |
| 2 | 1 | 6, 8 | None |
| 3 | None | 4, 5, 6, 7 | 1, 2 |
| 4 | 3 | None | 5 |
| 5 | 3 | None | 4 |
| 6 | 2, 3 | 8 | 7 |
| 7 | 3 | None | 6 |
| 8 | 2, 6 | None | None |
| 9 | 3 | None | 6, 7, 8 |
| 10 | 3 | None | 6, 7, 8, 9 |
| 11 | 6, 7, 8, 9, 10 | None | None |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Category |
|------|-------|---------------------|
| 1 | 1, 2 | quick (单文件修改) |
| 2 | 3, 4, 5 | visual-engineering |
| 3 | 6, 7, 8 | visual-engineering |
| 4 | 9, 10 | visual-engineering |
| 5 | 11 | visual-engineering |

---

## TODOs

### Phase 1: 基础设施

- [ ] 1. 创建 Todos 表 Migration

  **What to do**:
  - 在 `src-tauri/src/lib.rs` 添加新的 Migration 结构
  - 创建 todos 表，包含字段：id, uuid, title, completed, completed_at, version, deleted_at, created_at, updated_at
  - 添加必要的索引

  **Must NOT do**:
  - 不修改现有的 Migration
  - 不添加 sync 相关字段（MVP 不同步）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 单文件修改，模式明确
  - **Skills**: []
    - 无需特殊技能，参考现有代码即可

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (sequential with Task 2)
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:
  - `src-tauri/src/lib.rs:739-758` - moments 表 Migration 模式，复制结构
  - `src-tauri/src/lib.rs:760-780` - assets 表 Migration，参考索引创建

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Todos 表创建成功
    Tool: Bash
    Preconditions: 清理现有数据库以触发 Migration
    Steps:
      1. rm -f ~/.tauri/zotepad/app_v*.db (清理旧数据库)
      2. pnpm tauri dev (启动应用触发 Migration)
      3. 等待应用启动完成
      4. sqlite3 ~/.tauri/zotepad/app_v*.db ".schema todos"
    Expected Result: 显示 todos 表结构，包含 id, uuid, title, completed 等字段
    Evidence: 命令输出保存到 .sisyphus/evidence/task-1-todos-schema.txt

  Scenario: 索引创建成功
    Tool: Bash
    Preconditions: 表已创建
    Steps:
      1. sqlite3 ~/.tauri/zotepad/app_v*.db ".indexes todos"
    Expected Result: 显示 idx_todos_uuid 索引
    Evidence: 命令输出
  ```

  **Commit**: YES
  - Message: `feat(db): add todos table migration`
  - Files: `src-tauri/src/lib.rs`
  - Pre-commit: `cd src-tauri && cargo check`

---

- [ ] 2. 创建 useTodoRepository

  **What to do**:
  - 创建 `app/composables/repositories/useTodoRepository.ts`
  - 实现 CRUD：createTodo, getTodo, getAllTodos, updateTodo, toggleTodo, deleteTodo (软删除)
  - 遵循 useMomentRepository 模式：使用 useTauriSQL + useAsyncState
  - 暂不集成成就系统（MVP 简化）

  **Must NOT do**:
  - 不集成成就系统
  - 不添加同步逻辑

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 单文件创建，模式明确
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (after Task 1)
  - **Blocks**: Task 6, Task 8
  - **Blocked By**: Task 1

  **References**:
  - `app/composables/repositories/useMomentRepository.ts:1-60` - Repository 模式完整示例
  - `app/utils/async.ts` - useAsyncState 使用方式
  - `app/utils/uuid.ts` - generateUUID 函数

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Repository 类型检查通过
    Tool: Bash
    Preconditions: 文件已创建
    Steps:
      1. pnpm nuxi typecheck
    Expected Result: 无类型错误
    Evidence: 命令退出码 0

  Scenario: Repository 导出正确
    Tool: Bash
    Preconditions: 文件已创建
    Steps:
      1. grep -l "useTodoRepository" app/composables/repositories/useTodoRepository.ts
      2. grep "export function useTodoRepository" app/composables/repositories/useTodoRepository.ts
    Expected Result: 文件存在且导出函数正确
    Evidence: grep 输出
  ```

  **Commit**: YES
  - Message: `feat(todo): add useTodoRepository composable`
  - Files: `app/composables/repositories/useTodoRepository.ts`
  - Pre-commit: `pnpm lint`

---

### Phase 2: 仪表盘核心

- [ ] 3. 创建仪表盘首页骨架

  **What to do**:
  - 重写 `app/pages/index.vue`，从重定向改为仪表盘页面
  - 创建响应式布局骨架：顶部 Profile 区 + 中间内容区 + 底部快速操作区
  - 移动端单列布局，桌面端网格布局
  - 添加页面标题和基本样式

  **Must NOT do**:
  - 暂不实现具体内容，只做布局骨架
  - 不删除任何现有页面

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI 布局设计，需要视觉感知
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: 需要设计感来创建美观的仪表盘布局

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 1, 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 4, 5, 6, 7
  - **Blocked By**: None

  **References**:
  - `app/pages/achievements.vue:173-290` - Profile 卡片布局参考
  - `app/layouts/default.vue` - 现有布局结构理解
  - `app/assets/css/tailwind.css` - 现有样式变量

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: 首页不再重定向
    Tool: Playwright
    Preconditions: 开发服务器运行在 localhost:4577
    Steps:
      1. 导航到 http://localhost:4577/
      2. 等待页面加载完成 (timeout: 5s)
      3. 获取当前 URL
    Expected Result: URL 仍为 "/" 而非 "/notes"
    Evidence: .sisyphus/evidence/task-3-no-redirect.png

  Scenario: 布局响应式
    Tool: Playwright
    Preconditions: 开发服务器运行
    Steps:
      1. 设置视口为移动端 (375x667)
      2. 截图保存
      3. 设置视口为桌面端 (1280x800)
      4. 截图保存
    Expected Result: 两个截图显示不同的布局
    Evidence: .sisyphus/evidence/task-3-mobile.png, .sisyphus/evidence/task-3-desktop.png
  ```

  **Commit**: YES
  - Message: `feat(dashboard): create homepage skeleton layout`
  - Files: `app/pages/index.vue`
  - Pre-commit: `pnpm lint`

---

- [ ] 4. 实现 Profile 卡片组件

  **What to do**:
  - 创建 `app/components/app/dashboard/DashboardProfile.vue`
  - 复用 `usePointsSystem` 获取用户等级、积分、EXP
  - 显示等级徽章、EXP 进度条、总积分、成就数量
  - 参考 `achievements.vue` 的 Profile 卡片样式

  **Must NOT do**:
  - 不修改 usePointsSystem 逻辑
  - 不重复实现已有的数据获取逻辑

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI 组件设计
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 5)
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: Task 3

  **References**:
  - `app/pages/achievements.vue:179-286` - 完整 Profile 卡片 UI 代码
  - `app/composables/usePointsSystem.ts` - getProfile, getLevelProgress API
  - `app/composables/useCurrentUser.ts` - getCurrentUserId

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Profile 卡片显示等级
    Tool: Playwright
    Preconditions: 开发服务器运行，用户有积分数据
    Steps:
      1. 导航到 http://localhost:4577/
      2. 等待 [data-testid="dashboard-profile"] 或 .dashboard-profile 可见
      3. 检查是否包含 "Level" 文字
      4. 检查是否有 EXP 进度条元素
    Expected Result: Profile 卡片显示等级和进度条
    Evidence: .sisyphus/evidence/task-4-profile.png
  ```

  **Commit**: YES
  - Message: `feat(dashboard): add profile card component`
  - Files: `app/components/app/dashboard/DashboardProfile.vue`, `app/pages/index.vue`
  - Pre-commit: `pnpm lint`

---

- [ ] 5. 实现写作统计区块

  **What to do**:
  - 创建 `app/components/app/dashboard/DashboardStats.vue`
  - 复用 `useStatsCollector` 获取统计数据
  - 显示：总字数、本周字数、文章数、动态数
  - 卡片式设计，支持响应式

  **Must NOT do**:
  - 不修改 useStatsCollector 逻辑
  - 不添加新的统计维度

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 4)
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: Task 3

  **References**:
  - `app/composables/useStatsCollector.ts` - getAllStats, getStat API
  - `app/pages/achievements.vue:259-282` - 统计卡片样式参考

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: 统计数据显示
    Tool: Playwright
    Preconditions: 开发服务器运行
    Steps:
      1. 导航到 http://localhost:4577/
      2. 等待统计区块可见
      3. 检查是否显示数字（字数统计）
    Expected Result: 显示统计数据
    Evidence: .sisyphus/evidence/task-5-stats.png
  ```

  **Commit**: YES
  - Message: `feat(dashboard): add stats summary component`
  - Files: `app/components/app/dashboard/DashboardStats.vue`, `app/pages/index.vue`
  - Pre-commit: `pnpm lint`

---

### Phase 3: 功能模块

- [ ] 6. 实现待办清单区块

  **What to do**:
  - 创建 `app/components/app/dashboard/DashboardTodos.vue`
  - 使用 `useTodoRepository` 实现 CRUD
  - UI：列表展示 + 添加输入框 + 完成/删除操作
  - 支持空状态提示
  - 限制首页显示最近 10 条未完成

  **Must NOT do**:
  - 不实现子任务
  - 不实现优先级/标签
  - 不实现截止时间提醒

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 7)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 8
  - **Blocked By**: Task 2, Task 3

  **References**:
  - `app/composables/repositories/useTodoRepository.ts` - CRUD API
  - `app/pages/notes/moments/index.vue` - 列表 + 操作 UI 参考

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: 创建待办成功
    Tool: Playwright
    Preconditions: 开发服务器运行
    Steps:
      1. 导航到 http://localhost:4577/
      2. 找到待办输入框
      3. 输入 "测试待办项目"
      4. 点击添加按钮或按 Enter
      5. 等待列表更新
    Expected Result: 新待办项出现在列表中
    Evidence: .sisyphus/evidence/task-6-create-todo.png

  Scenario: 完成待办成功
    Tool: Playwright
    Preconditions: 已有待办项
    Steps:
      1. 找到待办项的完成按钮/复选框
      2. 点击完成
      3. 等待 UI 更新
    Expected Result: 待办项显示为已完成状态
    Evidence: .sisyphus/evidence/task-6-complete-todo.png

  Scenario: 删除待办成功
    Tool: Playwright
    Preconditions: 已有待办项
    Steps:
      1. 找到待办项的删除按钮
      2. 点击删除
      3. 等待 UI 更新
    Expected Result: 待办项从列表消失
    Evidence: .sisyphus/evidence/task-6-delete-todo.png
  ```

  **Commit**: YES
  - Message: `feat(dashboard): add todo list component with CRUD`
  - Files: `app/components/app/dashboard/DashboardTodos.vue`, `app/pages/index.vue`
  - Pre-commit: `pnpm lint`

---

- [ ] 7. 实现最近活动区块

  **What to do**:
  - 创建 `app/components/app/dashboard/DashboardActivity.vue`
  - 复用 `usePointsSystem.getPointsLog` 获取积分变动
  - 复用 `useMomentRepository.getAllMoments` 获取最近动态
  - 合并为时间线展示，最多显示 10 条

  **Must NOT do**:
  - 不创建新的活动日志表
  - 不修改现有数据结构

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 6)
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: Task 3

  **References**:
  - `app/composables/usePointsSystem.ts` - getPointsLog API
  - `app/composables/repositories/useMomentRepository.ts` - getAllMoments API
  - `app/pages/achievements.vue:420-500` - 积分日志展示参考

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: 活动列表显示
    Tool: Playwright
    Preconditions: 开发服务器运行，用户有历史数据
    Steps:
      1. 导航到 http://localhost:4577/
      2. 滚动到最近活动区块
      3. 检查是否有活动项
    Expected Result: 显示最近活动列表
    Evidence: .sisyphus/evidence/task-7-activity.png
  ```

  **Commit**: YES
  - Message: `feat(dashboard): add recent activity component`
  - Files: `app/components/app/dashboard/DashboardActivity.vue`, `app/pages/index.vue`
  - Pre-commit: `pnpm lint`

---

- [ ] 8. 实现快速记录组件

  **What to do**:
  - 创建 `app/components/app/dashboard/QuickCapture.vue`
  - 浮动按钮（FAB）触发 Bottom Sheet
  - 输入框 + 三个多选按钮（保存到动态/待办/文章）
  - 保存到动态：调用 `useMomentRepository.createMoment`
  - 保存到待办：调用 `useTodoRepository.createTodo`
  - 保存到文章：创建新文章，标题格式 `快记-YYYY-MM-DD-HH:mm`，调用 `useNoteRepository.createNote`
  - 支持多选同时保存

  **Must NOT do**:
  - 不支持图片上传
  - 不支持富文本
  - 不支持草稿保存

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 6)
  - **Blocks**: None
  - **Blocked By**: Task 2, Task 6

  **References**:
  - `app/composables/repositories/useMomentRepository.ts` - createMoment
  - `app/composables/repositories/useTodoRepository.ts` - createTodo
  - `app/composables/repositories/useNoteRepository.ts` - createNote
  - `app/components/ui/drawer/Drawer.vue` - Bottom Sheet 组件

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: 保存到动态成功
    Tool: Playwright
    Preconditions: 开发服务器运行
    Steps:
      1. 导航到 http://localhost:4577/
      2. 点击快速记录浮动按钮
      3. 等待 Bottom Sheet 出现
      4. 输入 "测试快速记录内容"
      5. 选中"保存到动态"
      6. 点击保存按钮
      7. 等待保存完成
    Expected Result: toast 提示保存成功
    Evidence: .sisyphus/evidence/task-8-save-moment.png

  Scenario: 多选保存成功
    Tool: Playwright
    Preconditions: 开发服务器运行
    Steps:
      1. 打开快速记录
      2. 输入 "多选测试内容"
      3. 同时选中"动态"和"待办"
      4. 点击保存
    Expected Result: 同时保存到两个目标，toast 显示保存成功
    Evidence: .sisyphus/evidence/task-8-multi-save.png

  Scenario: 保存到文章自动命名
    Tool: Playwright + Bash
    Preconditions: 开发服务器运行
    Steps:
      1. 打开快速记录
      2. 输入 "文章内容测试"
      3. 只选中"保存到文章"
      4. 点击保存
      5. Bash: sqlite3 查询最新文章标题
    Expected Result: 文章标题格式为 "快记-YYYY-MM-DD-HH:mm"
    Evidence: sqlite 查询结果
  ```

  **Commit**: YES
  - Message: `feat(dashboard): add quick capture component with multi-target save`
  - Files: `app/components/app/dashboard/QuickCapture.vue`, `app/pages/index.vue`
  - Pre-commit: `pnpm lint`

---

### Phase 4: 导航与入口

- [ ] 9. 导航结构重构

  **What to do**:
  - 重新设计 `app/components/app/MobileTabBar.vue`
  - 简化为 3-4 个 Tab：首页(仪表盘) / 工具(工作流+资源等) / 设置
  - 更新 `app/components/app/sidebar/SidebarNavigation.vue` 匹配新结构
  - 确保所有原有功能可通过二级入口访问
  - 可以创新设计，不必沿用原有 5 Tab 结构

  **Must NOT do**:
  - 不删除任何页面路由
  - 不改变页面 path

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 6, 7, 8, 10)
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: Task 3

  **References**:
  - `app/components/app/MobileTabBar.vue` - 当前 Tab 实现
  - `app/components/app/sidebar/SidebarNavigation.vue` - 当前侧边栏导航
  - `app/config/routes.ts` - 路由配置

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: 所有原入口仍可访问
    Tool: Bash
    Preconditions: 开发服务器运行
    Steps:
      1. 遍历所有原有路由：/notes/articles, /notes/moments, /notes/assets, /workflows, /achievements, /settings, /canvas-editor
      2. 对每个路由发送 HTTP 请求检查状态码
    Expected Result: 全部返回 200
    Evidence: 命令输出

  Scenario: 新导航在移动端显示
    Tool: Playwright
    Preconditions: 开发服务器运行
    Steps:
      1. 设置视口为移动端 (375x667)
      2. 导航到 http://localhost:4577/
      3. 检查底部 Tab 栏是否显示
      4. 验证 Tab 数量
    Expected Result: Tab 栏显示，数量为设计的 3-4 个
    Evidence: .sisyphus/evidence/task-9-mobile-nav.png
  ```

  **Commit**: YES
  - Message: `refactor(nav): simplify navigation structure`
  - Files: `app/components/app/MobileTabBar.vue`, `app/components/app/sidebar/SidebarNavigation.vue`
  - Pre-commit: `pnpm lint`

---

- [ ] 10. 文章编辑小入口

  **What to do**:
  - 在首页添加「写文章」入口按钮
  - 位置：首页某个角落或快速记录旁边
  - 点击跳转到 `/write/article/new` 或创建新文章后跳转
  - 可以是小图标按钮，不需要很显眼

  **Must NOT do**:
  - 不修改编辑器本身
  - 不改变写作流程

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的按钮添加
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 6, 7, 8, 9)
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: Task 3

  **References**:
  - `app/pages/index.vue` - 首页，添加入口位置
  - `app/pages/write/article/[id].vue` - 文章编辑页，理解跳转逻辑

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: 点击入口跳转到编辑器
    Tool: Playwright
    Preconditions: 开发服务器运行
    Steps:
      1. 导航到 http://localhost:4577/
      2. 找到「写文章」入口按钮
      3. 点击按钮
      4. 等待页面跳转
    Expected Result: 跳转到文章编辑页 (/write/article/*)
    Evidence: .sisyphus/evidence/task-10-write-entry.png
  ```

  **Commit**: YES
  - Message: `feat(dashboard): add article editor entry button`
  - Files: `app/pages/index.vue`
  - Pre-commit: `pnpm lint`

---

### Phase 5: 收尾

- [ ] 11. 响应式优化与边缘情况处理

  **What to do**:
  - 测试并优化移动端/桌面端响应式布局
  - 处理空状态（无待办、无统计数据、无活动）
  - 处理加载状态
  - 处理错误状态
  - 确保 safe-area 适配（刘海屏、灵动岛）

  **Must NOT do**:
  - 不添加新功能
  - 只做优化和边缘情况处理

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 5 (final)
  - **Blocks**: None
  - **Blocked By**: Task 6, 7, 8, 9, 10

  **References**:
  - 所有新创建的组件
  - `app/layouts/default.vue` - safe-area 处理参考

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: 空状态显示友好提示
    Tool: Playwright
    Preconditions: 清空数据库数据
    Steps:
      1. 导航到 http://localhost:4577/
      2. 检查待办区块是否显示空状态提示
      3. 检查最近活动是否显示空状态提示
    Expected Result: 显示友好的空状态提示，而非空白或错误
    Evidence: .sisyphus/evidence/task-11-empty-state.png

  Scenario: 加载状态显示
    Tool: Playwright
    Preconditions: 网络节流模式
    Steps:
      1. 设置网络为 Slow 3G
      2. 导航到 http://localhost:4577/
      3. 观察加载指示器
    Expected Result: 显示加载动画/骨架屏
    Evidence: .sisyphus/evidence/task-11-loading.png
  ```

  **Commit**: YES
  - Message: `fix(dashboard): improve responsive layout and edge cases`
  - Files: 多个组件文件
  - Pre-commit: `pnpm lint`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(db): add todos table migration` | src-tauri/src/lib.rs | cargo check |
| 2 | `feat(todo): add useTodoRepository composable` | app/composables/repositories/useTodoRepository.ts | pnpm lint |
| 3 | `feat(dashboard): create homepage skeleton layout` | app/pages/index.vue | pnpm lint |
| 4 | `feat(dashboard): add profile card component` | app/components/app/dashboard/DashboardProfile.vue | pnpm lint |
| 5 | `feat(dashboard): add stats summary component` | app/components/app/dashboard/DashboardStats.vue | pnpm lint |
| 6 | `feat(dashboard): add todo list component with CRUD` | app/components/app/dashboard/DashboardTodos.vue | pnpm lint |
| 7 | `feat(dashboard): add recent activity component` | app/components/app/dashboard/DashboardActivity.vue | pnpm lint |
| 8 | `feat(dashboard): add quick capture component with multi-target save` | app/components/app/dashboard/QuickCapture.vue | pnpm lint |
| 9 | `refactor(nav): simplify navigation structure` | MobileTabBar.vue, SidebarNavigation.vue | pnpm lint |
| 10 | `feat(dashboard): add article editor entry button` | app/pages/index.vue | pnpm lint |
| 11 | `fix(dashboard): improve responsive layout and edge cases` | 多个文件 | pnpm lint |

---

## Success Criteria

### Verification Commands
```bash
# 1. 类型检查通过
pnpm nuxi typecheck  # Expected: 无错误

# 2. Lint 检查通过
pnpm lint  # Expected: 无错误

# 3. 所有路由可访问
for route in / /notes/articles /notes/moments /notes/assets /workflows /achievements /settings; do
  curl -s -o /dev/null -w "%{http_code} $route\n" "http://localhost:4577$route"
done  # Expected: 全部 200

# 4. Tauri 构建通过
pnpm tauri build  # Expected: 无错误
```

### Final Checklist
- [ ] 首页显示仪表盘内容（Profile、统计、待办、活动）
- [ ] 待办清单 CRUD 功能正常
- [ ] 快速记录可保存到 3 个目标
- [ ] 所有原有功能入口可访问
- [ ] 移动端和桌面端 UI 正常
- [ ] 无 TypeScript 错误
- [ ] 无 ESLint 错误
