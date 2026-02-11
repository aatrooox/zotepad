# Phase 3: 导航收尾

> **所属计划**: UI 重构：个人数据中心仪表盘
> **阶段**: 3 of 4
> **前置依赖**: [Phase 2: 核心功能](./ui-refactor-phase2-core.md)
> **后续阶段**: [Phase 4: 博客 API 集成](./ui-refactor-phase4-blog-api.md)（可并行）

---

## TL;DR

> **目标**: 重构导航结构，添加文章入口，优化边缘情况
> 
> **Deliverables**:
> - 简化的导航结构（3-4 Tab）
> - 文章编辑小入口
> - 响应式优化和边缘情况处理
> 
> **Estimated Effort**: Medium (3 tasks, ~3-4 小时)
> **Parallel Execution**: YES - Task 11, 12 可并行
> **Critical Path**: Task 11, 12 (并行) → Task 13

---

## Context

### 背景
Phase 2 完成了仪表盘的核心功能组件。本阶段专注于：
1. 简化导航，减少认知负担
2. 保留文章编辑入口但降低显眼度
3. 处理边缘情况确保产品质量

### 导航重构思路
- 原有 5 Tab 过多，用户常用的只有 2-3 个
- 新结构：首页（仪表盘）+ 工具（工作流/资源等）+ 设置
- 所有原有功能通过二级入口保留

### 页面备份策略

重构导航组件时，先将原组件备份到 `_backup/` 目录：

```
app/components/app/
├── _backup/                      # 备份目录
│   ├── MobileTabBar.vue          # 原 5 Tab 导航
│   └── sidebar/
│       └── SidebarNavigation.vue # 原侧边栏导航
├── MobileTabBar.vue              # 新简化导航
└── sidebar/
    └── SidebarNavigation.vue     # 新侧边栏导航
```

---

## Guardrails (Must NOT Do)

- ❌ 不删除任何页面路由
- ❌ 不改变页面 path
- ❌ 不修改编辑器本身
- ❌ 不改变写作流程
- ❌ 不添加新功能（仅优化）

---

## TODOs

### Task 11: 导航结构重构

**What to do**:
- **先备份原组件**：
  - `mkdir -p app/components/app/_backup/sidebar`
  - `cp app/components/app/MobileTabBar.vue app/components/app/_backup/`
  - `cp app/components/app/sidebar/SidebarNavigation.vue app/components/app/_backup/sidebar/`
- 重新设计 `app/components/app/MobileTabBar.vue`：
  - 简化为 3-4 个 Tab
  - 建议结构：首页(仪表盘) / 工具 / 设置
  - 工具 Tab 可展开二级菜单（工作流、资源、文章列表等）
- 更新 `app/components/app/sidebar/SidebarNavigation.vue` 匹配新结构
- 确保所有原有 19 个页面仍可通过某种方式访问
- 可以创新设计，不必沿用原有结构

**Recommended Agent Profile**:
- **Category**: `visual-engineering`
  - Reason: 导航是核心 UX，需要设计感
- **Skills**: [`frontend-ui-ux`]

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 12)
- **Blocks**: Task 13
- **Blocked By**: Phase 2 完成

**References**:
- `app/components/app/MobileTabBar.vue` - 当前 Tab 实现
- `app/components/app/sidebar/SidebarNavigation.vue` - 当前侧边栏导航
- `app/config/routes.ts` - 路由配置

**Design Considerations**:
```
选项 A: 3 Tab 极简
├── 首页 (仪表盘)
├── 工具 (点击展开菜单：工作流/资源/文章/动态)
└── 设置

选项 B: 4 Tab 平衡
├── 首页 (仪表盘)
├── 内容 (文章 + 动态列表)
├── 工具 (工作流 + 资源)
└── 设置
```

**Acceptance Criteria**:

```
Scenario: 备份文件存在
  Tool: Bash
  Steps:
    1. ls -la app/components/app/_backup/
    2. ls -la app/components/app/_backup/sidebar/
  Expected Result: 备份目录存在，包含原 MobileTabBar.vue 和 SidebarNavigation.vue
  Evidence: 命令输出

Scenario: 所有原入口仍可访问
  Tool: Bash
  Preconditions: 开发服务器运行
  Steps:
    1. 测试路由列表：
       /notes/articles
       /notes/moments
       /notes/assets
       /workflows
       /achievements
       /settings
       /canvas-editor
    2. 对每个路由发送 HTTP 请求
       curl -s -o /dev/null -w "%{http_code}" "http://localhost:4577{route}"
  Expected Result: 全部返回 200
  Evidence: 命令输出保存到 .sisyphus/evidence/phase3-task11-routes.txt

Scenario: 新导航在移动端显示
  Tool: Playwright
  Preconditions: 开发服务器运行
  Steps:
    1. 设置视口为移动端 (375x667)
    2. 导航到 http://localhost:4577/
    3. 检查底部 Tab 栏是否显示
    4. 计算 Tab 数量
  Expected Result: Tab 栏显示，数量为 3-4 个
  Evidence: .sisyphus/evidence/phase3-task11-mobile-nav.png

Scenario: Tab 可点击切换
  Tool: Playwright
  Steps:
    1. 点击每个 Tab
    2. 验证页面或菜单切换
  Expected Result: 所有 Tab 响应点击
  Evidence: 截图序列
```

**Commit**: YES
- Message: `refactor(nav): backup old nav and simplify structure`
- Files: `app/components/app/_backup/*`, `app/components/app/MobileTabBar.vue`, `app/components/app/sidebar/SidebarNavigation.vue`
- Pre-commit: `pnpm lint`

---

### Task 12: 文章编辑小入口

**What to do**:
- 在首页添加「写文章」入口按钮
- 位置选项：
  - Profile 卡片右侧
  - 快速记录 FAB 旁边（小图标）
  - 首页右上角
- 点击行为：创建新文章并跳转到 `/write/article/{newId}`
- 设计：小图标按钮，不抢眼但易发现
  - 建议图标：`lucide:file-plus` 或 `lucide:pencil`

**Recommended Agent Profile**:
- **Category**: `quick`
  - Reason: 简单的按钮添加
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 11)
- **Blocks**: Task 13
- **Blocked By**: Phase 2 Task 5 (首页骨架)

**References**:
- `app/pages/index.vue` - 首页，添加入口位置
- `app/pages/write/article/[id].vue` - 文章编辑页，理解跳转逻辑
- `app/composables/repositories/useNoteRepository.ts` - createNote 用于创建新文章

**Acceptance Criteria**:

```
Scenario: 入口按钮可见
  Tool: Playwright
  Preconditions: 开发服务器运行
  Steps:
    1. 导航到 http://localhost:4577/
    2. 等待页面加载
    3. 查找写文章入口按钮 (.write-article-btn 或 [aria-label*="写文章"])
  Expected Result: 按钮存在且可见
  Evidence: .sisyphus/evidence/phase3-task12-button.png

Scenario: 点击入口跳转到编辑器
  Tool: Playwright
  Steps:
    1. 导航到首页
    2. 点击「写文章」入口按钮
    3. 等待页面跳转 (timeout: 5s)
    4. 获取当前 URL
  Expected Result: URL 匹配 /write/article/* 格式
  Evidence: .sisyphus/evidence/phase3-task12-redirect.png
```

**Commit**: YES
- Message: `feat(dashboard): add article editor entry button`
- Files: `app/pages/index.vue`
- Pre-commit: `pnpm lint`

---

### Task 13: 响应式优化与边缘情况处理

**What to do**:
- **响应式验证与修复**：
  - 测试 375px (iPhone SE), 390px (iPhone 14), 768px (iPad), 1280px (Desktop)
  - 修复任何布局溢出或错位
  - 确保触摸目标足够大（≥44px）
- **空状态处理**：
  - 待办为空 → 显示友好提示 + 引导添加
  - 统计为空 → 显示 0 或引导开始写作
  - 活动为空 → 显示引导文案
- **加载状态处理**：
  - 各区块显示骨架屏或 loading 动画
  - 使用 composable 暴露的 `isLoading` 状态
- **错误状态处理**：
  - 数据加载失败显示错误提示
  - 提供重试按钮
- **Safe Area 适配**：
  - 刘海屏顶部安全区
  - 灵动岛适配
  - 底部导航栏安全区

**Recommended Agent Profile**:
- **Category**: `visual-engineering`
- **Skills**: [`frontend-ui-ux`]

**Parallelization**:
- **Can Run In Parallel**: NO (收尾任务)
- **Blocks**: None (Phase 3 最终任务)
- **Blocked By**: Task 11, Task 12

**References**:
- 所有新创建的 dashboard 组件
- `app/layouts/default.vue` - safe-area 处理参考
- `app/components/ui/skeleton` - 骨架屏组件（如有）

**Acceptance Criteria**:

```
Scenario: 空状态显示友好提示
  Tool: Playwright
  Preconditions: 清空数据库数据 (sqlite3 DELETE FROM todos)
  Steps:
    1. 导航到 http://localhost:4577/
    2. 检查待办区块内容
    3. 检查是否有空状态图标或提示文字
  Expected Result: 显示友好的空状态提示，而非空白
  Evidence: .sisyphus/evidence/phase3-task13-empty-state.png

Scenario: 加载状态显示
  Tool: Playwright
  Preconditions: 网络节流模式或大数据量
  Steps:
    1. 设置网络为 Slow 3G
    2. 导航到 http://localhost:4577/
    3. 快速截图捕获加载状态
  Expected Result: 显示加载指示器或骨架屏
  Evidence: .sisyphus/evidence/phase3-task13-loading.png

Scenario: 移动端布局无溢出
  Tool: Playwright
  Steps:
    1. 设置视口为 375x667
    2. 导航到首页
    3. 检查是否有水平滚动条
    4. 检查所有元素是否在视口内
  Expected Result: 无水平滚动，布局正常
  Evidence: .sisyphus/evidence/phase3-task13-mobile-ok.png

Scenario: 桌面端布局正常
  Tool: Playwright
  Steps:
    1. 设置视口为 1280x800
    2. 导航到首页
    3. 检查网格布局是否正确
  Expected Result: 多列布局正常显示
  Evidence: .sisyphus/evidence/phase3-task13-desktop-ok.png
```

**Commit**: YES
- Message: `fix(dashboard): improve responsive layout and edge cases`
- Files: 多个 dashboard 组件文件
- Pre-commit: `pnpm lint`

---

## Phase Completion Checklist

完成本阶段后验证：

### 功能验证
- [ ] 首页显示仪表盘（Profile + 统计 + 待办 + 活动 + 快速记录）
- [ ] 待办清单 CRUD 功能正常
- [ ] 快速记录可保存到 3 个目标
- [ ] 所有原有功能入口可访问
- [ ] 文章编辑入口可用

### 质量验证
- [ ] `pnpm lint` 通过
- [ ] `pnpm nuxi typecheck` 通过
- [ ] 移动端 (375px) 布局正常
- [ ] 桌面端 (1280px) 布局正常
- [ ] 空状态有友好提示
- [ ] 加载状态有指示器

### 备份验证
- [ ] `app/pages/_backup/index.vue` 存在
- [ ] `app/components/app/_backup/MobileTabBar.vue` 存在
- [ ] `app/components/app/_backup/sidebar/SidebarNavigation.vue` 存在

---

## Rollback Plan

如需回滚任何组件：

```bash
# 回滚首页
cp app/pages/_backup/index.vue app/pages/index.vue

# 回滚导航
cp app/components/app/_backup/MobileTabBar.vue app/components/app/MobileTabBar.vue
cp app/components/app/_backup/sidebar/SidebarNavigation.vue app/components/app/sidebar/SidebarNavigation.vue
```

---

## Next Phase

完成后可继续 [Phase 4: 博客 API 集成](./ui-refactor-phase4-blog-api.md)（可与 Phase 3 并行执行）
