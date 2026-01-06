<script setup lang="ts">
import type { FileNode } from '~/composables/useLocalWorkspace'
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen, Plus } from 'lucide-vue-next'

const props = defineProps<{
  node: FileNode
  level: number
  activePath?: string | null
}>()

const emit = defineEmits<{
  (e: 'select', node: FileNode): void
  (e: 'toggle', node: FileNode): void
  (e: 'create', node: FileNode): void // 在此文件夹下创建
}>()

const isHovered = ref(false)

const handleToggle = (e: MouseEvent) => {
  e.stopPropagation()
  emit('toggle', props.node)
}

const handleClick = () => {
  if (props.node.kind === 'directory') {
    emit('toggle', props.node)
  }
  else {
    emit('select', props.node)
  }
}

const handleCreate = (e: MouseEvent) => {
  e.stopPropagation()
  emit('create', props.node)
}

const isActive = computed(() => props.activePath === props.node.path)
</script>

<template>
  <div>
    <div
      class="flex items-center py-1 px-2 cursor-pointer select-none transition-colors group text-sm rounded-sm mx-1"
      :class="[
        isActive ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted/50 text-foreground/80',
      ]"
      :style="{ paddingLeft: `${level * 12 + 8}px` }"
      @click="handleClick"
      @mouseenter="isHovered = true"
      @mouseleave="isHovered = false"
    >
      <!-- Icon & Arrow for Folder -->
      <span
        v-if="node.kind === 'directory'"
        class="mr-1.5 p-0.5 rounded-sm hover:bg-muted/80 text-muted-foreground/70 shrink-0"
        @click.stop="handleToggle"
      >
        <ChevronDown v-if="node.isOpen" class="w-3.5 h-3.5" />
        <ChevronRight v-else class="w-3.5 h-3.5" />
      </span>
      <span v-else class="w-5 shrink-0" /> <!-- spacer for file -->

      <!-- Type Icon -->
      <component
        :is="node.kind === 'directory' ? (node.isOpen ? FolderOpen : Folder) : FileText"
        class="w-4 h-4 mr-2 shrink-0 transition-colors"
        :class="isActive ? 'text-primary' : 'text-muted-foreground'"
      />

      <!-- Name -->
      <span class="truncate flex-1">{{ node.name }}</span>

      <!-- Actions (Create File in Folder) -->
      <button
        v-if="node.kind === 'directory' && isHovered"
        class="p-1 hover:bg-background hover:text-primary rounded shadow-sm border border-border/50 ml-1 transition-all opacity-0 group-hover:opacity-100"
        title="在此新建文件"
        @click="handleCreate"
      >
        <Plus class="w-3 h-3" />
      </button>
    </div>

    <!-- Children -->
    <div v-if="node.kind === 'directory' && node.isOpen && node.children">
      <FileTreeItem
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :level="level + 1"
        :active-path="activePath"
        @select="emit('select', $event)"
        @toggle="emit('toggle', $event)"
        @create="emit('create', $event)"
      />
    </div>
  </div>
</template>
