<script setup lang="ts">
import type { FileNode } from '~/composables/useLocalWorkspace'

defineProps<{
  tree: FileNode[]
  activePath?: string | null
}>()

const emit = defineEmits<{
  (e: 'select', node: FileNode): void
  (e: 'toggle', node: FileNode): void
  (e: 'create', parentPath: string): void
}>()

const handleCreate = (node: FileNode) => {
  emit('create', node.path)
}
</script>

<template>
  <div class="py-2">
    <div v-if="tree.length === 0" class="text-xs text-muted-foreground px-4 py-8 text-center">
      目录为空
    </div>

    <AppFileTreeItem
      v-for="node in tree"
      :key="node.path"
      :node="node"
      :level="0"
      :active-path="activePath"
      @select="emit('select', $event)"
      @toggle="emit('toggle', $event)"
      @create="handleCreate"
    />
  </div>
</template>
