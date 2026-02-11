# Phase 1: 基础设施

> **所属计划**: UI 重构：个人数据中心仪表盘
> **阶段**: 1 of 4
> **前置依赖**: 无
> **后续阶段**: [Phase 2: 核心功能](./ui-refactor-phase2-core.md)

---

## TL;DR

> **目标**: 创建待办清单功能的数据基础设施，支持「链接度」元数据
> 
> **Deliverables**:
> - `todos` 表 SQLite Migration（含链接度字段）
> - `link_relations` 表 Migration（多态关系表）
> - `useTodoRepository` 数据访问层
> - `useLinkRelationRepository` 关系数据访问层
> - 在 `sync-tables.ts` 注册新表
> 
> **Estimated Effort**: Medium (4 tasks, ~3-4 小时)
> **Parallel Execution**: YES - Task 3 和 Task 4 可并行
> **Critical Path**: Task 1 → Task 2 → (Task 3 || Task 4)

---

## Context

### 背景
用户希望在新仪表盘首页添加待办清单功能，并为未来的「链接度」算法预留元数据字段。链接度用于量化用户与某个项目/人/事物之间的关联强度。

**现有数据模型参考**（来自代码分析）：
- `notes` 和 `moments` 表都有 `tags TEXT DEFAULT '[]'`（JSON 数组）
- `assets` 使用规范化的 `asset_tags` + `asset_tag_relations` 表
- 所有表遵循 `uuid/version/created_at/updated_at/deleted_at` 同步约定

### 技术约束
- 使用 Tauri v2 的 SQLite Migration 机制
- Repository 遵循项目现有模式：`useTauriSQL` + `useAsyncState`
- 新表需在 `sync-tables.ts` 注册以便未来同步

### 链接度设计原则
- **轻量元数据**: todos 表存储必要的关联字段 + 缓存分数
- **多态关系**: `link_relations` 表记录实体间关系（todo→note, todo→project 等）
- **渐进增强**: 当前版本只确保元数据存在，算法后续迭代

---

## Guardrails (Must NOT Do)

- ❌ 不修改现有的 Migration 结构（只追加新 Migration）
- ❌ 不修改现有 repository（notes/moments/assets）的 CRUD 逻辑
- ❌ 不实现链接度计算算法（只预留字段）
- ❌ 不在 UI 层展示链接度（Phase 2+ 处理）
- ❌ 不做 projects 表（如果需要关联项目，在 link_relations 中用 to_table='projects' 预留）

---

## TODOs

### Task 1: 创建 Todos 表 Migration（含链接度元数据）

**What to do**:
- 在 `src-tauri/src/lib.rs` 添加新的 Migration（找到最新版本号 +1）
- 创建 todos 表，包含字段：

```sql
CREATE TABLE todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,                          -- 任务详情（可选）
  status TEXT DEFAULT 'open',                -- 'open'|'in_progress'|'done'|'cancelled'
  priority INTEGER DEFAULT 0,                -- 数值优先级（0=无，1=低，2=中，3=高）
  due_date DATETIME,                         -- 截止日期（可选）
  completed_at DATETIME,                     -- 完成时间
  
  -- 链接度元数据
  target_type TEXT,                          -- 关联对象类型：'project'|'person'|'article' 等
  target_id TEXT,                            -- 关联对象 ID（可以是 uuid 或其他标识）
  target_name TEXT,                          -- 关联对象名称（冗余存储便于展示）
  tags TEXT DEFAULT '[]',                    -- JSON 标签数组，与 notes/moments 一致
  link_score REAL DEFAULT 0.0,               -- 缓存的链接度分数
  link_summary TEXT DEFAULT '{}',            -- JSON 链接统计：{"notes":3,"moments":2}
  
  -- 通用同步字段（与现有表一致）
  version INTEGER DEFAULT 0,
  deleted_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE UNIQUE INDEX idx_todos_uuid ON todos(uuid);
CREATE INDEX idx_todos_status ON todos(status);
CREATE INDEX idx_todos_target ON todos(target_type, target_id);
CREATE INDEX idx_todos_due_date ON todos(due_date);
CREATE INDEX idx_todos_version ON todos(version);
```

**Must NOT do**:
- ❌ 不添加 `assignee_id` / `creator_id`（当前单用户）
- ❌ 不添加 `project_uuid` 外键（通过 link_relations 处理）

**Recommended Agent Profile**:
- **Category**: `quick`
  - Reason: 单文件修改，模式明确，参考现有 Migration 即可
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: NO
- **Blocks**: Task 2, Task 3, Task 4
- **Blocked By**: None

**References**:
- `src-tauri/src/lib.rs:739-758` - moments 表 Migration 模式（包含 tags JSON 字段）
- `src-tauri/src/lib.rs:760-780` - assets 表 Migration，参考索引创建
- `src-tauri/src/lib.rs:678-736` - notes 表 Migration（version/deleted_at 等通用字段）

**Acceptance Criteria**:

```
Scenario: Todos 表创建成功
  Tool: Bash
  Preconditions: 清理现有数据库以触发 Migration
  Steps:
    1. rm -f ~/.tauri/zotepad/app_v*.db (清理旧数据库)
    2. pnpm tauri dev (启动应用触发 Migration)
    3. 等待应用启动完成 (约 30 秒)
    4. sqlite3 ~/.tauri/zotepad/app_v*.db ".schema todos"
  Expected Result: 显示 todos 表结构，包含 id, uuid, title, status, target_type, tags, link_score 等字段
  Evidence: .sisyphus/evidence/phase1-task1-todos-schema.txt

Scenario: 索引创建成功
  Tool: Bash
  Preconditions: 表已创建
  Steps:
    1. sqlite3 ~/.tauri/zotepad/app_v*.db ".indexes todos"
  Expected Result: 显示 idx_todos_uuid, idx_todos_status, idx_todos_target, idx_todos_due_date, idx_todos_version
  Evidence: 命令输出

Scenario: Rust 编译通过
  Tool: Bash
  Preconditions: 代码已修改
  Steps:
    1. cd src-tauri && cargo check
  Expected Result: 编译无错误
  Evidence: 命令退出码 0
```

**Commit**: YES
- Message: `feat(db): add todos table migration with linkage metadata`
- Files: `src-tauri/src/lib.rs`
- Pre-commit: `cd src-tauri && cargo check`

---

### Task 2: 创建 Link Relations 表 Migration

**What to do**:
- 在 `src-tauri/src/lib.rs` 添加 `link_relations` 表（紧跟 todos 表的 Migration 之后）
- 这是一个多态关系表，用于记录任意实体间的关系

```sql
CREATE TABLE link_relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  
  -- 来源实体
  from_table TEXT NOT NULL,                  -- 来源表名：'todos', 'notes', 'moments' 等
  from_uuid TEXT NOT NULL,                   -- 来源实体 uuid
  
  -- 目标实体
  to_table TEXT NOT NULL,                    -- 目标表名：'notes', 'moments', 'projects', 'users' 等
  to_uuid TEXT NOT NULL,                     -- 目标实体 uuid
  
  -- 关系元数据
  relation_type TEXT DEFAULT 'reference',    -- 语义：'reference'|'mention'|'depends_on'|'assigned_to'|'part_of'
  weight REAL DEFAULT 1.0,                   -- 权重（用于链接度计算）
  metadata TEXT DEFAULT '{}',                -- JSON 额外信息
  
  -- 通用同步字段
  version INTEGER DEFAULT 0,
  deleted_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE UNIQUE INDEX idx_lr_uuid ON link_relations(uuid);
CREATE INDEX idx_lr_from ON link_relations(from_table, from_uuid);
CREATE INDEX idx_lr_to ON link_relations(to_table, to_uuid);
CREATE INDEX idx_lr_type ON link_relations(relation_type);
CREATE INDEX idx_lr_version ON link_relations(version);
```

**Must NOT do**:
- ❌ 不添加外键约束（多态表无法约束）
- ❌ 不实现自动维护逻辑（删除来源时不自动删除关系）

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: NO
- **Blocks**: Task 4
- **Blocked By**: Task 1

**References**:
- `src-tauri/src/lib.rs` - asset_tag_relations 表作为关系表参考
- Task 1 的 todos 表 Migration（同一 Migration 版本内）

**Acceptance Criteria**:

```
Scenario: Link Relations 表创建成功
  Tool: Bash
  Preconditions: 应用已启动
  Steps:
    1. sqlite3 ~/.tauri/zotepad/app_v*.db ".schema link_relations"
  Expected Result: 显示 link_relations 表结构
  Evidence: .sisyphus/evidence/phase1-task2-link-relations-schema.txt

Scenario: 关系索引创建成功
  Tool: Bash
  Steps:
    1. sqlite3 ~/.tauri/zotepad/app_v*.db ".indexes link_relations"
  Expected Result: 显示 idx_lr_uuid, idx_lr_from, idx_lr_to 等索引
  Evidence: 命令输出
```

**Commit**: YES（可与 Task 1 合并提交）
- Message: `feat(db): add link_relations table for polymorphic relationships`
- Files: `src-tauri/src/lib.rs`
- Pre-commit: `cd src-tauri && cargo check`

---

### Task 3: 创建 useTodoRepository

**What to do**:
- 创建 `app/composables/repositories/useTodoRepository.ts`
- 定义 Todo 类型接口（含所有新字段）
- 实现 CRUD 方法：
  - `createTodo(data: CreateTodoInput): Promise<Todo>`
  - `getTodo(uuid: string): Promise<Todo | null>`
  - `getAllTodos(options?: { status?: string, includeCompleted?: boolean }): Promise<Todo[]>`
  - `updateTodo(uuid: string, data: UpdateTodoInput): Promise<void>`
  - `toggleTodo(uuid: string): Promise<void>`
  - `deleteTodo(uuid: string): Promise<void>` (软删除)
  - `getByTarget(targetType: string, targetId: string): Promise<Todo[]>` (按关联对象查询)
- 遵循 useMomentRepository 模式：使用 `useTauriSQL` + `useAsyncState`
- 暴露 `isLoading` 和 `error` 状态

**Recommended Agent Profile**:
- **Category**: `quick`
  - Reason: 单文件创建，模式明确
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 4)
- **Blocks**: Phase 2 的 Task 6, Task 8
- **Blocked By**: Task 1

**References**:
- `app/composables/repositories/useMomentRepository.ts:1-80` - Repository 模式完整示例（含 tags JSON 处理）
- `app/composables/repositories/useNoteRepository.ts:1-100` - 另一个 Repository 参考
- `app/utils/async.ts` - useAsyncState 使用方式
- `app/utils/uuid.ts` - generateUUID 函数

**Expected File Structure**:
```typescript
// app/composables/repositories/useTodoRepository.ts

import type { ... } from '...'
import { useTauriSQL } from '~/composables/useTauriSQL'
import { useAsyncState } from '~/utils/async'
import { generateUUID } from '~/utils/uuid'

export interface Todo {
  id: number
  uuid: string
  title: string
  description: string | null
  status: 'open' | 'in_progress' | 'done' | 'cancelled'
  priority: number
  due_date: string | null
  completed_at: string | null
  // 链接度元数据
  target_type: string | null
  target_id: string | null
  target_name: string | null
  tags: string[]  // 解析后的数组
  link_score: number
  link_summary: Record<string, number>  // 解析后的对象
  // 通用字段
  version: number
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface CreateTodoInput {
  title: string
  description?: string
  priority?: number
  due_date?: string
  target_type?: string
  target_id?: string
  target_name?: string
  tags?: string[]
}

export interface UpdateTodoInput {
  title?: string
  description?: string
  status?: Todo['status']
  priority?: number
  due_date?: string
  target_type?: string
  target_id?: string
  target_name?: string
  tags?: string[]
}

export function useTodoRepository() {
  const { execute, select } = useTauriSQL()
  const { isLoading, error, runAsync } = useAsyncState()

  // 解析 JSON 字段
  function parseTodo(row: any): Todo {
    return {
      ...row,
      tags: JSON.parse(row.tags || '[]'),
      link_summary: JSON.parse(row.link_summary || '{}'),
    }
  }

  // CRUD methods...

  return {
    createTodo,
    getTodo,
    getAllTodos,
    updateTodo,
    toggleTodo,
    deleteTodo,
    getByTarget,
    isLoading,
    error
  }
}
```

**Acceptance Criteria**:

```
Scenario: TypeScript 类型检查通过
  Tool: Bash
  Preconditions: 文件已创建
  Steps:
    1. pnpm nuxi typecheck
  Expected Result: 无类型错误
  Evidence: 命令退出码 0

Scenario: ESLint 检查通过
  Tool: Bash
  Preconditions: 文件已创建
  Steps:
    1. pnpm lint
  Expected Result: 无 lint 错误
  Evidence: 命令退出码 0

Scenario: 导出函数和类型正确
  Tool: Bash
  Preconditions: 文件已创建
  Steps:
    1. grep -E "export (function|interface)" app/composables/repositories/useTodoRepository.ts
  Expected Result: 找到 useTodoRepository, Todo, CreateTodoInput, UpdateTodoInput 导出
  Evidence: grep 输出
```

**Commit**: YES
- Message: `feat(todo): add useTodoRepository with linkage metadata support`
- Files: `app/composables/repositories/useTodoRepository.ts`
- Pre-commit: `pnpm lint`

---

### Task 4: 创建 useLinkRelationRepository + 注册 Sync Tables

**What to do**:

**Part A: 创建 useLinkRelationRepository**
- 创建 `app/composables/repositories/useLinkRelationRepository.ts`
- 实现关系 CRUD 方法：
  - `createRelation(data: CreateRelationInput): Promise<LinkRelation>`
  - `getRelationsFrom(fromTable: string, fromUuid: string): Promise<LinkRelation[]>`
  - `getRelationsTo(toTable: string, toUuid: string): Promise<LinkRelation[]>`
  - `deleteRelation(uuid: string): Promise<void>`
  - `deleteRelationsFrom(fromTable: string, fromUuid: string): Promise<void>`

**Part B: 注册 Sync Tables**
- 在 `app/config/sync-tables.ts` 添加 todos 和 link_relations 配置
- 参考现有表配置格式

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 3)
- **Blocks**: None (Phase 2+ 会用到)
- **Blocked By**: Task 2

**References**:
- `app/composables/repositories/useAssetTagRepository.ts` - 关系表 Repository 参考
- `app/config/sync-tables.ts` - 同步表配置格式

**Expected Additions to sync-tables.ts**:
```typescript
// 在 SYNC_TABLES 数组中添加：
{
  name: 'todos',
  fields: ['id', 'uuid', 'title', 'description', 'status', 'priority', 'due_date', 'completed_at', 'target_type', 'target_id', 'target_name', 'tags', 'link_score', 'link_summary', 'version', 'deleted_at', 'created_at', 'updated_at'],
  jsonFields: ['tags', 'link_summary'],
  primaryKey: 'uuid'
},
{
  name: 'link_relations',
  fields: ['id', 'uuid', 'from_table', 'from_uuid', 'to_table', 'to_uuid', 'relation_type', 'weight', 'metadata', 'version', 'deleted_at', 'created_at', 'updated_at'],
  jsonFields: ['metadata'],
  primaryKey: 'uuid'
}
```

**Acceptance Criteria**:

```
Scenario: Repository TypeScript 检查通过
  Tool: Bash
  Steps:
    1. pnpm nuxi typecheck
  Expected Result: 无类型错误
  Evidence: 命令退出码 0

Scenario: Sync Tables 配置正确
  Tool: Bash
  Steps:
    1. grep -A 5 "'todos'" app/config/sync-tables.ts
  Expected Result: 找到 todos 表配置，包含 jsonFields: ['tags', 'link_summary']
  Evidence: grep 输出

Scenario: ESLint 通过
  Tool: Bash
  Steps:
    1. pnpm lint
  Expected Result: 无错误
  Evidence: 命令退出码 0
```

**Commit**: YES
- Message: `feat(todo): add link relations repository and sync table config`
- Files: 
  - `app/composables/repositories/useLinkRelationRepository.ts`
  - `app/config/sync-tables.ts`
- Pre-commit: `pnpm lint`

---

## Phase Completion Checklist

完成本阶段后，验证以下条件：

- [ ] `cd src-tauri && cargo check` 通过
- [ ] `pnpm lint` 通过
- [ ] `pnpm nuxi typecheck` 通过
- [ ] SQLite 中存在 `todos` 表（含 16+ 字段）
- [ ] SQLite 中存在 `link_relations` 表
- [ ] `useTodoRepository` 导出所有 CRUD 方法 + 类型
- [ ] `useLinkRelationRepository` 导出所有关系方法
- [ ] `sync-tables.ts` 包含 todos 和 link_relations 配置

## Dependency Graph

```
Task 1: todos 表 Migration
    ↓
Task 2: link_relations 表 Migration
    ↓
    ├── Task 3: useTodoRepository (可并行)
    └── Task 4: useLinkRelationRepository + sync-tables (可并行)
```

## Next Phase

完成后继续 [Phase 2: 核心功能](./ui-refactor-phase2-core.md)，包含：
- 仪表盘首页骨架
- Profile 卡片组件
- 写作统计区块
- 待办清单 UI
- 最近活动区块
- 快速记录组件
