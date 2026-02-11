# Phase 4: 博客 API 集成

> **所属计划**: UI 重构：个人数据中心仪表盘
> **阶段**: 4 of 4 (扩展阶段)
> **前置依赖**: [Phase 2: 核心功能](./ui-refactor-phase2-core.md) (仪表盘、快速记录)
> **后续阶段**: 无

---

## TL;DR

> **目标**: 将博客 API 内置到 ZotePad，用户无需理解"流"概念，直接在使用场景中触发
> 
> **Deliverables**:
> - 内置流配置文件 (`builtin-workflows.json`)
> - 内置流加载/执行 composable
> - 文章发布按钮组件
> - 动态同步按钮组件
> - 仪表盘博客统计卡片
> - 快速记录增加"同步到博客"选项
> - 设置页 API 配置入口
> 
> **Estimated Effort**: Medium (6-7 tasks, ~5-6 小时)
> **Parallel Execution**: YES - Wave 2 可并行
> **Critical Path**: Task 12 → Task 13 → (Task 14-17 并行) → Task 18

---

## Context

### 背景
用户希望把常用的博客 API 内置到 ZotePad，不再需要手动创建流。核心原则：
1. **场景嵌入**：不做"工具列表"，功能直接嵌入使用场景
2. **可替换性**：所有 API 定义在 JSON 配置中，定制时替换文件即可
3. **复用现有**：基于现有 Workflow 执行引擎

### 设计决策

**配置策略（游客模式优先）**：
- `BLOG_API_BASE_URL`：**构建时注入**（`nuxt.config.ts` → `runtimeConfig.public`），用户零配置
- `BLOG_PAT`：**运行时可选**（workflow_envs），仅写入操作需要

**权限矩阵**：
| 操作 | 需要 Token | 游客可用 |
|-----|-----------|---------|
| 获取文章列表 | ❌ | ✅ |
| 获取平台任务 | ❌ | ✅ |
| 查看评论/动态 | ❌ | ✅ |
| 获取统计数据 | ❌ | ✅ |
| 发布文章 | ✅ | ❌ |
| 同步动态 | ✅ | ❌ |

**架构说明（本地 + 云端双层）**：
- **本地私有**：Todos、草稿、个人统计、链接度计算
- **云端共享**：发布的文章/动态、评论、平台任务、博客统计
- 博客数据库 = 共享中心，App = 多端客户端

**其他决策**：
- 存储方式：JSON 配置文件 (`app/config/builtin-workflows.json`)
- 认证方式：Bearer Token (PAT)
- 内置流权限：仅运行，不可编辑

---

## Guardrails (Must NOT Do)

- ❌ 不创建"工具列表"页面
- ❌ 不允许用户编辑内置流
- ❌ 不硬编码 API endpoint 到代码中
- ❌ 不修改现有 `useWorkflowRunner.ts` 核心逻辑
- ❌ 不修改现有用户创建的流

---

## Execution Waves

```
Wave 1 (基础设施 - 独立):
├── Task 12: 创建内置流配置文件和类型定义
└── Task 13: 创建 useBuiltinWorkflows composable

Wave 2 (UI 入口 - Task 13 完成后并行):
├── Task 14: 文章编辑页 - 发布按钮
├── Task 15: 动态列表 - 同步按钮
├── Task 16: 快速记录 - 同步选项
└── Task 17: 仪表盘 - 博客统计卡片

Wave 3 (配置入口 - 收尾):
└── Task 18: 设置页 - API 配置入口
```

---

## TODOs

### Task 12: 创建内置流配置文件和类型定义

**What to do**:
- 创建 `app/config/builtin-workflows.json`
  - 定义 provider 信息
  - 定义 envSchema（BLOG_API_BASE_URL, BLOG_PAT）
  - 定义 workflows 数组（占位，具体 endpoint 待用户提供）
- 创建 `app/types/builtin-workflow.ts`
  - `BuiltinWorkflowConfig` 接口
  - `BuiltinWorkflow` 接口
  - `EnvSchemaItem` 接口
  - `WorkflowTrigger` 接口

**Recommended Agent Profile**:
- **Category**: `quick`
  - Reason: 创建配置文件和类型定义
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: NO
- **Blocks**: Task 13
- **Blocked By**: None

**References**:
- `app/types/workflow.ts` - 现有 Workflow 类型定义
- 草稿文件中的 JSON 结构设计

**JSON 结构（模板）**:
```json
{
  "$schema": "./builtin-workflows.schema.json",
  "version": "1.0.0",
  "provider": {
    "id": "zangzang-blog",
    "name": "臧臧的博客",
    "description": "全栈博客 API 集成"
  },
  "envSchema": [
    {
      "key": "BLOG_API_BASE_URL",
      "label": "博客 API 地址",
      "placeholder": "https://api.example.com",
      "required": true,
      "secret": false
    },
    {
      "key": "BLOG_PAT",
      "label": "访问令牌 (PAT)",
      "placeholder": "pat_xxxxxxxxxxxx",
      "required": true,
      "secret": true
    }
  ],
  "workflows": [
    {
      "id": "blog-publish-article",
      "name": "发布文章到博客",
      "icon": "lucide:globe",
      "category": "publish",
      "trigger": {
        "type": "button",
        "location": "article-editor"
      },
      "steps": [
        {
          "id": "publish",
          "type": "api",
          "method": "POST",
          "url": "{{env.BLOG_API_BASE_URL}}/api/v1/articles",
          "headers": {
            "Authorization": "Bearer {{env.BLOG_PAT}}",
            "Content-Type": "application/json"
          },
          "body": "{{input}}"
        }
      ]
    }
  ]
}
```

**Acceptance Criteria**:

```
Scenario: JSON 文件格式正确
  Tool: Bash
  Steps:
    1. cat app/config/builtin-workflows.json | jq .
  Expected Result: JSON 解析成功，无语法错误
  Evidence: 命令输出

Scenario: TypeScript 类型检查通过
  Tool: Bash
  Steps:
    1. pnpm nuxi typecheck
  Expected Result: 无类型错误
  Evidence: 命令退出码 0
```

**Commit**: YES
- Message: `feat(workflow): add builtin workflow config and types`
- Files: `app/config/builtin-workflows.json`, `app/types/builtin-workflow.ts`
- Pre-commit: `pnpm lint`

---

### Task 13: 创建 useBuiltinWorkflows composable

**What to do**:
- 创建 `app/composables/useBuiltinWorkflows.ts`
- 实现功能：
  - `loadConfig()`: 加载 builtin-workflows.json
  - `getWorkflowsByLocation(location)`: 按触发位置筛选流
  - `getWorkflowById(id)`: 获取指定流
  - `executeWorkflow(id, inputData)`: 执行内置流
    - 复用 `useWorkflowRunner`
    - 自动注入 env 变量
  - `isConfigured()`: 检查必需的环境变量是否已配置
  - `getEnvSchema()`: 获取需要配置的环境变量列表
- 创建 `app/composables/useBlogAPI.ts`（高层封装）
  - `publishArticle(article)`: 发布文章
  - `syncMoment(content)`: 同步动态
  - `getStats()`: 获取统计
  - `configured`: 是否已配置

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: NO
- **Blocks**: Task 14, 15, 16, 17
- **Blocked By**: Task 12

**References**:
- `app/composables/useWorkflowRunner.ts` - 现有流执行器
- `app/composables/repositories/useEnvironmentRepository.ts` - 环境变量读取
- `app/types/builtin-workflow.ts` - 类型定义

**Acceptance Criteria**:

```
Scenario: Composable 导出正确
  Tool: Bash
  Steps:
    1. grep "export function useBuiltinWorkflows" app/composables/useBuiltinWorkflows.ts
    2. grep "export function useBlogAPI" app/composables/useBlogAPI.ts
  Expected Result: 两个函数都存在
  Evidence: grep 输出

Scenario: 类型检查通过
  Tool: Bash
  Steps:
    1. pnpm nuxi typecheck
  Expected Result: 无类型错误
  Evidence: 命令退出码 0
```

**Commit**: YES
- Message: `feat(workflow): add useBuiltinWorkflows and useBlogAPI composables`
- Files: `app/composables/useBuiltinWorkflows.ts`, `app/composables/useBlogAPI.ts`
- Pre-commit: `pnpm lint`

---

### Task 14: 文章编辑页 - 发布按钮

**What to do**:
- 创建 `app/components/app/BlogPublishButton.vue`
  - 使用 `useBlogAPI().publishArticle`
  - 按钮样式参考现有工具栏按钮
  - 未配置时显示提示，引导去设置页
  - 发布中显示 loading 状态
  - 成功/失败显示 toast
- 在文章编辑页工具栏集成此按钮
  - 找到合适的位置（可能在保存按钮旁边）

**Recommended Agent Profile**:
- **Category**: `visual-engineering`
- **Skills**: [`frontend-ui-ux`]

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 15, 16, 17)
- **Blocks**: None
- **Blocked By**: Task 13

**References**:
- `app/pages/write/article/[id].vue` - 文章编辑页
- `app/components/md-editor/` - 编辑器工具栏参考
- `app/composables/useBlogAPI.ts` - API 调用

**Acceptance Criteria**:

```
Scenario: 发布按钮显示
  Tool: Playwright
  Preconditions: 开发服务器运行
  Steps:
    1. 导航到 /write/article/new
    2. 等待编辑器加载
    3. 查找发布按钮 (.blog-publish-btn 或类似)
  Expected Result: 按钮存在且可见
  Evidence: .sisyphus/evidence/phase4-task14-button.png

Scenario: 未配置时显示提示
  Tool: Playwright
  Preconditions: 未设置 BLOG_PAT 环境变量
  Steps:
    1. 点击发布按钮
    2. 观察提示信息
  Expected Result: 显示配置引导提示
  Evidence: 截图
```

**Commit**: YES
- Message: `feat(blog): add publish button to article editor`
- Files: `app/components/app/BlogPublishButton.vue`, 编辑页相关文件
- Pre-commit: `pnpm lint`

---

### Task 15: 动态列表 - 同步按钮

**What to do**:
- 创建 `app/components/app/BlogSyncButton.vue`
  - 接收 `content` prop
  - 使用 `useBlogAPI().syncMoment`
  - 同步中显示 loading
  - 成功后可标记该动态已同步
- 在动态列表项中集成
  - 可能在操作菜单中，或作为独立按钮

**Recommended Agent Profile**:
- **Category**: `visual-engineering`
- **Skills**: [`frontend-ui-ux`]

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 14, 16, 17)
- **Blocks**: None
- **Blocked By**: Task 13

**References**:
- `app/pages/notes/moments/index.vue` - 动态列表页
- `app/composables/useBlogAPI.ts` - API 调用

**Acceptance Criteria**:

```
Scenario: 同步按钮显示
  Tool: Playwright
  Preconditions: 开发服务器运行，有动态数据
  Steps:
    1. 导航到 /notes/moments
    2. 找到动态列表项
    3. 查找同步按钮
  Expected Result: 每个动态项有同步按钮
  Evidence: .sisyphus/evidence/phase4-task15-button.png

Scenario: 点击同步触发 API
  Tool: Playwright
  Preconditions: 已配置 BLOG_PAT
  Steps:
    1. 点击某个动态的同步按钮
    2. 观察 loading 状态
    3. 等待完成
  Expected Result: 显示成功/失败 toast
  Evidence: 截图
```

**Commit**: YES
- Message: `feat(blog): add sync button to moment list`
- Files: `app/components/app/BlogSyncButton.vue`, 动态列表相关文件
- Pre-commit: `pnpm lint`

---

### Task 16: 快速记录 - 同步选项

**What to do**:
- 修改 `app/components/app/dashboard/QuickCapture.vue`
- 在保存目标多选中增加「同步到博客」选项
  - 仅当 API 已配置时显示此选项
  - 勾选后，保存时同时调用 `useBlogAPI().syncMoment`
- 处理同步失败的情况（本地保存成功但同步失败）

**Recommended Agent Profile**:
- **Category**: `visual-engineering`
- **Skills**: [`frontend-ui-ux`]

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 14, 15, 17)
- **Blocks**: None
- **Blocked By**: Task 13, Phase 2 Task 8 (QuickCapture 组件)

**References**:
- `app/components/app/dashboard/QuickCapture.vue` - 快速记录组件
- `app/composables/useBlogAPI.ts` - API 调用

**Acceptance Criteria**:

```
Scenario: 同步选项显示（已配置时）
  Tool: Playwright
  Preconditions: 已配置 BLOG_PAT
  Steps:
    1. 导航到首页
    2. 打开快速记录 Sheet
    3. 查找保存目标选项
  Expected Result: 显示"同步到博客"选项
  Evidence: .sisyphus/evidence/phase4-task16-option.png

Scenario: 同步选项隐藏（未配置时）
  Tool: Playwright
  Preconditions: 未配置 BLOG_PAT
  Steps:
    1. 打开快速记录 Sheet
    2. 查找保存目标选项
  Expected Result: 不显示"同步到博客"选项
  Evidence: 截图
```

**Commit**: YES
- Message: `feat(blog): add sync option to quick capture`
- Files: `app/components/app/dashboard/QuickCapture.vue`
- Pre-commit: `pnpm lint`

---

### Task 17: 仪表盘 - 博客统计卡片

**What to do**:
- 创建 `app/components/app/dashboard/DashboardBlogStats.vue`
  - 使用 `useBlogAPI().getStats()`
  - 显示博客统计数据（文章数、评论数等）
  - 未配置时显示引导卡片
  - 支持 loading 和 error 状态
- 在仪表盘 index.vue 中集成
  - 放在写作统计下方或旁边

**Recommended Agent Profile**:
- **Category**: `visual-engineering`
- **Skills**: [`frontend-ui-ux`]

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 14, 15, 16)
- **Blocks**: None
- **Blocked By**: Task 13, Phase 2 Task 3 (仪表盘骨架)

**References**:
- `app/components/app/dashboard/DashboardStats.vue` - 本地统计卡片参考
- `app/composables/useBlogAPI.ts` - API 调用

**Acceptance Criteria**:

```
Scenario: 博客统计卡片显示
  Tool: Playwright
  Preconditions: 已配置 BLOG_PAT
  Steps:
    1. 导航到首页
    2. 查找博客统计卡片 (.dashboard-blog-stats)
  Expected Result: 显示博客统计数据
  Evidence: .sisyphus/evidence/phase4-task17-stats.png

Scenario: 未配置时显示引导
  Tool: Playwright
  Preconditions: 未配置 BLOG_PAT
  Steps:
    1. 导航到首页
    2. 查找博客统计区域
  Expected Result: 显示"配置博客 API"引导
  Evidence: 截图
```

**Commit**: YES
- Message: `feat(blog): add blog stats card to dashboard`
- Files: `app/components/app/dashboard/DashboardBlogStats.vue`, `app/pages/index.vue`
- Pre-commit: `pnpm lint`

---

### Task 18: 设置页 - API 配置入口

**What to do**:
- 在设置页添加「博客 API」配置入口
  - 可能是新建 `app/pages/settings/api-config.vue`
  - 或在现有设置页增加一个 section
- 功能：
  - 读取 `envSchema` 显示需要配置的项
  - 表单输入，保存到 workflow_envs
  - 敏感字段（secret=true）用密码输入框
  - 测试连接按钮（可选）
- 显示当前配置的 provider 信息

**Recommended Agent Profile**:
- **Category**: `visual-engineering`
- **Skills**: [`frontend-ui-ux`]

**Parallelization**:
- **Can Run In Parallel**: NO (收尾任务)
- **Blocks**: None
- **Blocked By**: Task 12 (envSchema 定义)

**References**:
- `app/pages/settings/` - 现有设置页结构
- `app/composables/repositories/useEnvironmentRepository.ts` - 环境变量存取
- `app/composables/useBuiltinWorkflows.ts` - getEnvSchema()

**Acceptance Criteria**:

```
Scenario: 配置页面可访问
  Tool: Playwright
  Preconditions: 开发服务器运行
  Steps:
    1. 导航到设置页
    2. 找到「博客 API」入口
    3. 点击进入
  Expected Result: 显示配置表单
  Evidence: .sisyphus/evidence/phase4-task18-config.png

Scenario: 保存配置成功
  Tool: Playwright
  Steps:
    1. 填写 BLOG_API_BASE_URL
    2. 填写 BLOG_PAT
    3. 点击保存
    4. 刷新页面
  Expected Result: 配置值保持
  Evidence: 截图
```

**Commit**: YES
- Message: `feat(blog): add API config page in settings`
- Files: 设置页相关文件
- Pre-commit: `pnpm lint`

---

## Phase Completion Checklist

完成本阶段后验证：

### 功能验证
- [ ] 内置流配置文件存在且格式正确
- [ ] 文章编辑页有发布按钮
- [ ] 动态列表有同步按钮
- [ ] 快速记录有同步选项
- [ ] 仪表盘有博客统计卡片
- [ ] 设置页可配置 API

### 可替换性验证
- [ ] 替换 `builtin-workflows.json` 后功能正常
- [ ] 代码无硬编码的 API endpoint

### 质量验证
- [ ] `pnpm lint` 通过
- [ ] `pnpm nuxi typecheck` 通过
- [ ] 未配置时 UI 优雅降级（显示引导）

---

## 待用户提供

完成本 Phase 需要用户提供：

1. **博客 API 规格**
   - 发布文章 endpoint（URL、请求体格式、响应格式）
   - 同步动态 endpoint
   - 获取统计 endpoint
   - 认证方式详情

2. **确认 JSON 中的 endpoint 细节**

---

## 与其他 Phase 的关系

- **依赖 Phase 2**: 需要仪表盘骨架（Task 3）和快速记录组件（Task 8）
- **可与 Phase 3 并行**: 导航重构不影响此 Phase
- **建议执行顺序**: Phase 1 → Phase 2 → (Phase 3 & Phase 4 并行)

---

*创建时间: 2026-02-11*
