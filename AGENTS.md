# AGENTS.md - ZotePad Development Guide

> **Context**: ZotePad is a local-first cross-platform note-taking app built with **Tauri v2** + **Nuxt 4** + **Vue 3**. This guide provides coding agents with essential development patterns and commands.

---

## 1. Project Commands

### Development
```bash
pnpm install                          # Install dependencies
pnpm dev -p 4577                      # Frontend-only dev (Nuxt SPA mode)
pnpm tauri dev                        # Desktop app dev (Tauri + Nuxt)
pnpm tauri android dev --open         # Android dev (requires device/emulator)
```

### Building
```bash
pnpm generate                         # Generate static files (Tauri consumes)
pnpm tauri build                      # Desktop release build (.msi/.exe/.dmg)
pnpm tauri android build --apk        # Android release build (.apk)
```

### Linting & Formatting
```bash
pnpm lint                             # Check ESLint errors
pnpm lint:fix                         # Auto-fix ESLint errors
```

### Release Management
```bash
pnpm release:patch                    # Bump patch version (0.0.X)
pnpm release:minor                    # Bump minor version (0.X.0)
pnpm release:major                    # Bump major version (X.0.0)
# Auto-commits with format: chore(build): release vX.Y.Z
# Syncs version across package.json, tauri.conf.json, Cargo.toml
```

### Testing
- **No test framework configured yet** (no vitest/jest found)
- When adding tests, document the command here

---

## 2. Technology Stack

| Layer | Tech | Notes |
|-------|------|-------|
| **Shell** | Tauri v2 (Rust) | Cross-platform (Windows/macOS/Android) |
| **Frontend** | Nuxt 4 (Vue 3) | SSR disabled (`ssr: false`), SPA mode only |
| **Styling** | Tailwind CSS v4 | Injected via `@tailwindcss/vite` plugin |
| **UI Components** | Shadcn (Reka UI) | Auto-imported from `app/components/ui` |
| **Animation** | GSAP + motion-v | Use for complex UI transitions |
| **Database** | SQLite | Via `@tauri-apps/plugin-sql` |
| **Key-Value Store** | Tauri Store | Single file: `app_settings.bin` |
| **HTTP** | Tauri HTTP Plugin | Never use native `fetch` |
| **State** | Vue 3 Composition API | No Pinia/Vuex; composables only |

---

## 3. Code Style Guidelines

### 3.1 ESLint Configuration
- **Config**: Uses `@antfu/eslint-config` with Nuxt integration
- **Ignores**: `src-tauri/**`, `app/components/ui/**`, `app/components/vue-bits/**`
- **Key Rules**:
  - `ts/no-explicit-any`: OFF (project allows `any`)
  - `no-console`: OFF (logging via `useLog` composable instead)
  - Vue a11y rules mostly disabled for rapid prototyping
  - `antfu/top-level-function`: OFF

### 3.2 TypeScript
- **Strict Mode**: Enabled (via `.nuxt/tsconfig.*.json`)
- **Path Aliases**: `@/*` and `~/*` map to `./app/*`
- **Type Imports**: Use `import type { ... }` for types only
- **Never use**: `as any`, `@ts-ignore`, `@ts-expect-error` (per ESLint)

### 3.3 Naming Conventions
| Type | Convention | Example |
|------|-----------|---------|
| Components (UI) | PascalCase | `Button.vue`, `Dialog.vue` |
| Components (App) | PascalCase + `App` prefix | `AppNavBar.vue`, `AppDynamicIsland.vue` |
| Composables | camelCase + `use` prefix | `useTauriSQL.ts`, `useNoteRepository.ts` |
| Utils | camelCase | `async.ts`, `clientCrypto.ts` |
| Types/Interfaces | PascalCase | `DynamicIslandMessage`, `CanvasLayout` |
| Database Repos | `use<Entity>Repository` | `useAchievementRepository.ts` |

### 3.4 Import Patterns
```typescript
// 1. Type imports (always first)
import type { Ref } from 'vue'
import type { MyType } from '~/types'

// 2. External libraries
import { ref, computed } from 'vue'
import { toast } from 'vue-sonner'

// 3. Tauri plugins
import Database from '@tauri-apps/plugin-sql'
import { Store } from '@tauri-apps/plugin-store'

// 4. Local composables/utils
import { useAsyncState } from '~/utils/async'
import { useTauriSQL } from '~/composables/useTauriSQL'

// 5. Components (auto-imported, no explicit import needed)
// ✅ Just use: <Button />, <Dialog />, <AppNavBar />
```

### 3.5 File Structure
```
app/
├── components/
│   ├── ui/            # Shadcn components (prefix: none, auto-import)
│   ├── vue-bits/      # Third-party UI (prefix: VB, auto-import)
│   └── app/           # Custom components (prefix: App, auto-import)
├── composables/       # Reusable logic (auto-import)
│   ├── repositories/  # Database CRUD layers
│   ├── settings/      # Settings management
│   └── stores/        # State management (no Pinia)
├── pages/             # File-based routing
├── layouts/           # Layout wrappers (default.vue)
├── middleware/        # Route middleware
├── lib/               # Pure utilities (no Vue)
├── utils/             # Shared helpers
├── types/             # Global TypeScript types
└── assets/css/        # Global styles (tailwind.css)
```

---

## 4. Architecture Patterns

### 4.1 Data Layer (CRITICAL)

#### Database Access (SQLite)
```typescript
// ✅ CORRECT: Always use useTauriSQL wrapper
import { useTauriSQL } from '~/composables/useTauriSQL'

const { select, execute, isLoading, error } = useTauriSQL()

// Queries return isLoading/error states automatically
const notes = await select<Note[]>('SELECT * FROM notes WHERE id = ?', [id])
```

#### Key-Value Storage
```typescript
// ✅ CORRECT: Use useTauriStore (singleton pattern)
import { useTauriStore } from '~/composables/useTauriStore'

const { initStore, getItem, setItem } = useTauriStore()
await initStore() // Must init first
await setItem('theme', 'dark')
const theme = await getItem<string>('theme')
```

#### Repository Pattern
```typescript
// Example: app/composables/repositories/useAchievementRepository.ts
export function useAchievementRepository() {
  const { execute, select } = useTauriSQL()
  const { isLoading, error, runAsync } = useAsyncState()

  const addAchievement = (data: Achievement) =>
    runAsync(async () => {
      await execute('INSERT INTO achievements (...) VALUES (?)', [data])
    }, 'Failed to add achievement')

  return { addAchievement, isLoading, error }
}
```

**Rules**:
- NEVER call `@tauri-apps/plugin-sql` directly
- ALWAYS wrap SQL calls with `useAsyncState.runAsync`
- Expose `isLoading` and `error` for UI feedback

### 4.2 HTTP Requests

```typescript
// ✅ CORRECT: Use useTauriHTTP (with retry/timeout)
import { useTauriHTTP } from '~/composables/useTauriHTTP'

const { get, post } = useTauriHTTP()
const data = await get<ResponseType>('https://api.example.com/data')

// ❌ WRONG: Never use native fetch
// const data = await fetch('...') // ❌ BLOCKED
```

**API Service Pattern** (with caching):
```typescript
// For managed endpoints with token/cache
import { useAPIService } from '~/composables/useAPIService'

const api = useAPIService()
const result = await api.fetchEndpointData('my-endpoint')
```

### 4.3 Async State Management

**All async operations MUST use `useAsyncState`**:
```typescript
import { useAsyncState } from '~/utils/async'

const { isLoading, error, runAsync } = useAsyncState()

const fetchData = () =>
  runAsync(async () => {
    // Your async logic
    return data
  }, 'Custom error message')
```

**Benefits**:
- Automatic loading/error state tracking
- Consistent error handling
- UI components can bind to `isLoading` and `error`

### 4.4 Logging & Notifications

```typescript
// ✅ Logging (cross-platform)
import { useLog } from '~/composables/useLog'

const log = useLog()
await log.info('Message', { tag: 'MyFeature', context: { userId: 123 } })
await log.error('Error occurred', { tag: 'DB' })

// ❌ AVOID: Direct console usage (prefer useLog)
// console.log('...') // Only for quick debugging

// ✅ Notifications
import { useTauriNotification } from '~/composables/useTauriNotification'

const notification = useTauriNotification()
await notification.send('Title', 'Body text')
```

---

## 5. Vue Component Patterns

### 5.1 Composition API (Script Setup)
```vue
<script setup lang="ts">
// Types first
import type { Ref } from 'vue'

// Define props with defaults
interface Props {
  title: string
  count?: number
}
const props = withDefaults(defineProps<Props>(), {
  count: 0
})

// Define emits
const emit = defineEmits<{
  update: [value: number]
  close: []
}>()

// Composables
const { isLoading } = useMyComposable()

// Reactive state
const localState = ref(0)
const computed = computed(() => props.count * 2)

// Methods
function handleClick() {
  emit('update', localState.value)
}
</script>

<template>
  <div>
    <!-- Use v-if for conditional rendering -->
    <Button v-if="!isLoading" @click="handleClick">
      {{ title }}
    </Button>
    <Icon v-else name="lucide:loader-2" class="animate-spin" />
  </div>
</template>
```

### 5.2 Styling with Tailwind
```vue
<template>
  <!-- Use Tailwind utilities directly -->
  <div class="flex items-center gap-4 p-4 bg-background text-foreground">
    <!-- Use cn() for conditional classes -->
    <Button :class="cn('w-full', isActive && 'bg-primary')">
      Click
    </Button>
  </div>
</template>
```

**Mobile-First Utilities**:
- Use `safe-area-*` utilities for notch/island support
- Prefer bottom sheets (`Drawer` component) for mobile
- Check `useEnvironment().isMobile` for platform detection

### 5.3 Auto-Imported Components
```vue
<template>
  <!-- Shadcn UI (no prefix) -->
  <Button>Click</Button>
  <Dialog>...</Dialog>
  
  <!-- App Components (App prefix) -->
  <AppNavBar />
  <AppDynamicIsland />
  
  <!-- Vue Bits (VB prefix) -->
  <VBSomeComponent />
</template>
```

---

## 6. Environment & Platform Detection

```typescript
import { useEnvironment } from '~/composables/useEnvironment'

const env = useEnvironment()

if (env.isTauri) {
  // Tauri-specific code (desktop/mobile app)
}

if (env.isMobile) {
  // Mobile-specific UI (Android/iOS)
}

if (import.meta.client) {
  // Client-only code (Nuxt SPA mode)
}
```

**Route Protection**: `app/middleware/environment.global.ts` shows a toast if accessing Tauri-dependent routes in browser mode (non-blocking).

---

## 7. Error Handling

### 7.1 Async Operations
```typescript
// Repository/Composable level
const { runAsync } = useAsyncState()

const myOperation = () =>
  runAsync(async () => {
    // Logic that might throw
  }, 'User-friendly error message')

// Component level
async function handleAction() {
  try {
    await myOperation()
    toast.success('Success!')
  } catch (err) {
    // Error already captured by useAsyncState
    toast.error('Operation failed')
  }
}
```

### 7.2 UI Feedback
```vue
<script setup lang="ts">
const { isLoading, error, fetchData } = useMyRepository()

onMounted(async () => {
  await fetchData()
})
</script>

<template>
  <div v-if="isLoading">Loading...</div>
  <div v-else-if="error" class="text-destructive">{{ error }}</div>
  <div v-else>Content here</div>
</template>
```

---

## 8. Common Gotchas

### ❌ DON'T
```typescript
// Direct plugin usage
import Database from '@tauri-apps/plugin-sql'
const db = await Database.load('app.db') // ❌

// Native fetch
const res = await fetch('https://...') // ❌

// Direct console logging
console.log('Debug info') // ❌ (use useLog)

// Importing auto-imported components
import Button from '~/components/ui/button/Button.vue' // ❌

// Type suppressions
const x = value as any // ❌
// @ts-ignore // ❌
```

### ✅ DO
```typescript
// Use composable wrappers
const { select } = useTauriSQL()
await select('SELECT * FROM notes')

// Use Tauri HTTP
const { get } = useTauriHTTP()
await get('https://...')

// Use logging composable
const log = useLog()
await log.info('Debug info')

// Components are auto-imported
// Just use: <Button />

// Fix type errors properly
const x: MyType = value // ✅
```

---

## 9. Git Workflow

### Commit Message Format
```bash
# Standard commits
feat: add note export feature
fix: resolve SQLite connection timeout
refactor: simplify async state logic
docs: update AGENTS.md

# Release commits (triggers CI/CD)
chore(build): release v0.27.6
```

### CI/CD Trigger
- **Automatic build**: Commit message contains `chore(build): release vX.Y.Z`
- **Artifacts**: Windows (.msi/.exe), macOS (.dmg), Android (.apk)
- **Android signing**: Requires `ANDROID_KEYSTORE_BASE64` secret in GitHub

---

## 10. Cursor/Copilot Integration

This file is based on `.github/copilot-instructions.md`. Key points:
- **Data Layer**: Always use `useTauriSQL` + `useAsyncState` wrapper pattern
- **HTTP**: Use `useTauriHTTP`, never `fetch`
- **Logging**: Use `useLog` instead of `console`
- **UI Components**: Auto-imported (Shadcn, App prefixed)
- **Mobile UX**: Use bottom sheets, safe-area utilities, and icon-first design
- **Route Config**: Update `ROUTE_CONFIGS` when adding Tauri/DB-dependent pages

---

## 11. Development Workflow

1. **Start Dev Server**: `pnpm tauri dev` (full app) or `pnpm dev -p 4577` (frontend only)
2. **Check Linting**: `pnpm lint` (fix errors before committing)
3. **Test Changes**: Manual testing (no automated tests yet)
4. **Commit**: Use conventional commit format
5. **Release**: Run `pnpm release:patch` (auto-bumps version + creates commit)
6. **Push**: CI/CD builds artifacts on release commit

---

## 12. Quick Reference

| Task | Command/Pattern |
|------|----------------|
| Run desktop app | `pnpm tauri dev` |
| Run Android app | `pnpm tauri android dev --open` |
| Database query | `useTauriSQL().select<T>(sql, params)` |
| HTTP request | `useTauriHTTP().get<T>(url)` |
| Async operation | `useAsyncState().runAsync(fn, errorMsg)` |
| Logging | `useLog().info(msg, { tag, context })` |
| Toast notification | `toast.success('Message')` (vue-sonner) |
| Class merging | `cn('base-class', conditional && 'extra')` |
| Environment check | `useEnvironment().isTauri` |

---

## Notes for Agents

- **SSR is disabled**: All code runs client-side only (`ssr: false`)
- **No test runner**: Add tests only if requested by user
- **Version sync**: Release scripts auto-update Tauri configs
- **Android signing**: Local keystore not committed; CI uses secrets
- **Migration system**: Database schema changes go through Tauri migrations (see `src-tauri/migrations/`)
- **Dev port**: Frontend always runs on `:4577` (configured in `tauri.conf.json`)

---

**Last Updated**: 2026-01-16 (Generated for agent consumption)
