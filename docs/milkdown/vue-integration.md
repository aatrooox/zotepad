# Vue Integration Guide

Milkdown provides an official Vue adapter via `@milkdown/vue`. It uses a **Provider** pattern and Composition API hooks.

## Installation

```bash
pnpm add @milkdown/vue @milkdown/kit @milkdown/crepe
```

## Basic Component Structure

The typical usage involves wrapping your editor component in `<MilkdownProvider>` and using the `useEditor` hook.

```vue
<!-- EditorComponent.vue -->
<template>
  <Milkdown />
</template>

<script setup lang="ts">
import { Milkdown, useEditor } from '@milkdown/vue';
import { Crepe } from '@milkdown/crepe';
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

useEditor((root) => {
  return new Crepe({
    root,
    defaultValue: "Hello Milkdown",
    featureConfigs: {
      // ...config
    }
  });
});
</script>
```

```vue
<!-- Parent.vue -->
<template>
  <MilkdownProvider>
    <EditorComponent />
  </MilkdownProvider>
</template>

<script setup lang="ts">
import { MilkdownProvider } from '@milkdown/vue';
import EditorComponent from './EditorComponent.vue';
</script>
```

## Implementing `v-model` Support

To support `v-model`, you need to use the `listener` plugin to sync changes back to Vue.

```vue
<script setup lang="ts">
import { Milkdown, useEditor } from '@milkdown/vue';
import { Crepe } from '@milkdown/crepe';
import { listener, listenerCtx } from '@milkdown/plugin-listener';

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

useEditor((root) => {
  const crepe = new Crepe({
    root,
    defaultValue: props.modelValue,
  });

  // Configure listener
  crepe.config((ctx) => {
    ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
      emit('update:modelValue', markdown);
    });
  });

  return crepe;
});
</script>
```
