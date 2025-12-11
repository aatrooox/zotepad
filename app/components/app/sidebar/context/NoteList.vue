<script setup lang="ts">
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { useNoteRepository } from '~/composables/repositories/useNoteRepository'
import { useNoteStore } from '~/composables/stores/useNoteStore'
import { useSidebar } from '~/composables/useSidebar'
import SidebarMascot from '../mascot/SidebarMascot.vue'

const { notes, fetchNotes } = useNoteStore()
const { setNavigation, contextData } = useSidebar()
const router = useRouter()
const { createNote, deleteNote } = useNoteRepository()
const searchQuery = ref('')

// Fetch notes if empty
onMounted(() => {
  fetchNotes()
})

const activeNoteId = computed(() => contextData.value?.id)

const filteredNotes = computed(() => {
  if (!searchQuery.value)
    return notes.value
  const q = searchQuery.value.toLowerCase()
  return notes.value.filter(n =>
    (n.title?.toLowerCase().includes(q))
    || (n.content?.toLowerCase().includes(q)),
  )
})

const handleNoteClick = (id: number) => {
  router.push(`/notes/${id}`)
}

const handleBack = () => {
  setNavigation()
  router.push('/')
}

const handleCreateNote = async () => {
  try {
    const id = await createNote('无标题笔记', '')
    if (id) {
      await fetchNotes(true) // 刷新笔记列表
      router.push(`/notes/${id}`)
    }
  }
  catch {
    toast.error('创建笔记失败')
  }
}

const handleCreate = () => {
  handleCreateNote()
}

const confirmDelete = async (id: number) => {
  try {
    // 找到当前笔记在列表中的位置
    const currentIndex = filteredNotes.value.findIndex(n => n.id === id)
    const isCurrentNote = activeNoteId.value === id

    await deleteNote(id)
    await fetchNotes(true)

    toast.success('笔记已删除')

    // 如果删除的是当前打开的笔记，需要跳转
    if (isCurrentNote && filteredNotes.value.length > 0) {
      // 优先打开相邻的下一篇，如果没有则打开上一篇，都没有则打开第一篇
      let targetNote = filteredNotes.value[currentIndex] // 删除后当前索引会指向下一篇
      if (!targetNote && currentIndex > 0) {
        targetNote = filteredNotes.value[currentIndex - 1] // 如果是最后一篇，打开上一篇
      }
      if (!targetNote) {
        targetNote = filteredNotes.value[0] // 兜底打开第一篇
      }

      if (targetNote) {
        router.push(`/notes/${targetNote.id}`)
      }
      else {
        // 如果一篇笔记都没有了，返回首页
        setNavigation()
        router.push('/')
      }
    }
  }
  catch {
    toast.error('删除笔记失败')
  }
}

const handleDeleteNote = (id: number, event: MouseEvent) => {
  event.stopPropagation()

  // const note = filteredNotes.value.find(n => n.id === id)

  toast('确认删除该文章？', {
    action: {
      label: '确认删除',
      onClick: () => confirmDelete(id),
    },
    cancel: {
      label: '取消',
    },
  })
}
</script>

<template>
  <div class="h-full flex flex-col bg-muted/30">
    <!-- Header -->
    <div class="h-14 flex items-center justify-between px-3 border-b border-border/40 shrink-0 gap-2">
      <Button variant="ghost" size="icon" class="h-8 w-8 shrink-0" title="返回首页" @click="handleBack">
        <Icon name="lucide:arrow-left" class="w-4 h-4" />
      </Button>
      <div class="flex-1 font-medium text-sm text-center flex items-center justify-center">
        <SidebarMascot :is-compact="false" />
      </div>
      <Button variant="ghost" size="icon" class="h-8 w-8 shrink-0" title="新建笔记" @click="handleCreate">
        <Icon name="lucide:plus" class="w-4 h-4" />
      </Button>
    </div>

    <!-- Search -->
    <div class="p-2">
      <div class="relative">
        <Icon name="lucide:search" class="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索..."
          class="w-full bg-background/50 border border-border/50 rounded-lg pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
        >
      </div>
    </div>

    <!-- List -->
    <div class="flex-1 overflow-y-auto p-2 space-y-1">
      <div
        v-for="note in filteredNotes"
        :key="note.id"
        class="group flex items-center gap-2 p-3 rounded-lg cursor-pointer transition-all duration-200 border border-transparent relative"
        :class="activeNoteId === note.id
          ? 'bg-background shadow-sm border-border/50'
          : 'hover:bg-background/50 hover:shadow-sm'"
        @click="handleNoteClick(note.id)"
      >
        <div class="flex-1 font-medium text-sm truncate" :class="activeNoteId === note.id ? 'text-primary' : 'text-foreground'">
          {{ note.title || '无标题' }}
        </div>
        <Button
          variant="ghost"
          size="icon"
          class="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          title="删除笔记"
          @click="(e: MouseEvent) => handleDeleteNote(note.id, e)"
        >
          <Icon name="lucide:trash-2" class="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
        </Button>
      </div>

      <div v-if="filteredNotes.length === 0" class="text-center py-8 text-muted-foreground text-sm">
        无笔记
      </div>
    </div>
  </div>
</template>
