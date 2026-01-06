# Nuxt.js Integration Guide

Integrating Milkdown with Nuxt 3 (and Nuxt 4) is straightforward since it provides official Vue support. However, there is one CRITICAL consideration regarding Server-Side Rendering (SSR).

## ⚠️ Important: Client-Side Only

Milkdown relies on browser DOM APIs (like `ProseMirror` and `document` access). **It will crash if instantiated on the server.**

### Strategy 1: `<ClientOnly>` (Recommended)

Wrap your editor component usage with Nuxt's built-in `<ClientOnly>` component.

```vue
<!-- Page.vue -->
<template>
  <ClientOnly fallback-tag="div" fallback="Loading editor...">
    <MilkdownEditor />
  </ClientOnly>
</template>
```

### Strategy 2: `.client.vue` Suffix

You can name your component file `MilkdownEditor.client.vue` to force Nuxt to load it only on the client side.

## Dependency Transpilation (Troubleshooting)

Sometimes Nuxt's build process (using Vite/Nitropack) might trip over ESM/CJS compatibility for Milkdown's internal packages due to the plugin architecture.

If you encounter "require is not defined" or similar export errors, add the following to `nuxt.config.ts`:

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  ssr: false, // If your whole app is SPA mode (like ZotePad), this is standard
  build: {
    transpile: [
      '@milkdown/vue',
      '@milkdown/kit',
      '@milkdown/crepe'
    ]
  },
  vite: {
    // Usually not needed for latest Milkdown v7, but good to know
    optimizeDeps: {
      include: ['@milkdown/crepe', '@milkdown/vue']
    }
  }
})
```

## Component Structure

For Nuxt, it is best to separate the **Provider** and the **Editor** to avoid context issues, or ensure the Provider wraps the Editor within the same client-side boundary.

```vue
<!-- components/MdEditor/index.vue -->
<template>
  <MilkdownProvider>
    <MdEditorInner :model-value="modelValue" @update:modelValue="e => $emit('update:modelValue', e)" />
  </MilkdownProvider>
</template>

<script setup lang="ts">
import { MilkdownProvider } from '@milkdown/vue';
import MdEditorInner from './MdEditorInner.vue'; // The actual editor implementation

defineProps(['modelValue']);
defineEmits(['update:modelValue']);
</script>
```
