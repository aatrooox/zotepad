<script setup lang="ts">
import type { Note } from '~/types/models'
import gsap from 'gsap'
import { toast } from 'vue-sonner'
import { useNoteRepository } from '~/composables/repositories/useNoteRepository'
import { useSyncManager } from '~/composables/settings/useSyncManager'
import { useNoteStore } from '~/composables/stores/useNoteStore'

useHead({ title: '文章 - ZotePad' })

const router = useRouter()
const { workspacePath } = useLocalWorkspace()
const { fetchNotes } = useNoteStore()
const { getAllNotes, deleteNote, createNote } = useNoteRepository()
const { syncTable, syncMode } = useSyncManager()
const { isDesktop } = useEnvironment()

const notes = ref<Note[]>([])
const noteCardsRef = ref<HTMLElement[]>([])
const isLoading = ref(false)

const animateNoteCards = () => {
  if (noteCardsRef.value.length) {
    gsap.fromTo(
      noteCardsRef.value,
      { opacity: 0, y: 20, scale: 0.95 },
      { opacity: 1, y: 0, scale: 1, duration: 0.4, stagger: 0.05, ease: 'back.out(1.2)', clearProps: 'all' },
    )
  }
}

async function loadNotes(silent = false) {
  if (!silent)
    isLoading.value = true
  try {
    notes.value = await getAllNotes() || []
    if (!silent) {
      nextTick(() => animateNoteCards())
    }
  }
  catch (e) {
    console.error(e)
    if (!silent) {
      toast.error('加载笔记失败')
    }
  }
  finally {
    if (!silent)
      isLoading.value = false
  }
}

const handleCreateNote = async () => {
  try {
    const id = await createNote('无标题笔记', '')
    await fetchNotes(true)

    if (id) {
      router.push(`/write/article/${id}`)
    }
  }
  catch {
    toast.error('创建笔记失败')
  }
}

const handleDeleteNote = (id: number) => {
  toast('确定要删除这条笔记吗？', {
    action: {
      label: '删除',
      onClick: async () => {
        try {
          // Optimistic UI update
          const index = notes.value.findIndex(n => n.id === id)
          if (index !== -1) {
            notes.value.splice(index, 1)
          }

          await deleteNote(id)
          toast.success('笔记已删除')

          // Sync in background (mobile only)
          if (!isDesktop.value) {
            syncTable('notes', true).catch((e: any) => console.error('删除后同步失败:', e))
          }
        }
        catch {
          toast.error('删除笔记失败')
          await loadNotes(true)
        }
      },
    },
    cancel: { label: '取消' },
  })
}

const formatDate = (dateStr?: string) => {
  if (!dateStr)
    return ''
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const getTags = (tagsStr?: string) => {
  if (!tagsStr)
    return []
  try {
    return JSON.parse(tagsStr)
  }
  catch {
    return []
  }
}

const setNoteCardRef = (el: any) => {
  if (el && el.$el)
    noteCardsRef.value.push(el.$el)
  else if (el)
    noteCardsRef.value.push(el)
}

onBeforeUpdate(() => {
  noteCardsRef.value = []
})

// 初始化
onMounted(async () => {
  // 1. Load local data immediately
  await loadNotes()

  // 2. Sync in background (non-blocking) - 仅移动端且自动模式
  if (!isDesktop.value && syncMode.value === 'auto') {
    console.log('[Articles] 自动模式，触发 notes 表同步')
    syncTable('notes', true).then((result) => {
      console.log(`[Articles同步] notes: 拉取 ${result?.pulled || 0} 条, 推送 ${result?.pushed || 0} 条`)
      loadNotes(true)
    }).catch((e: any) => {
      console.error('Articles页面初始化同步失败:', e)
      if (e.message?.includes('配置') || e.message?.includes('网络')) {
        toast.warning('后台同步失败，可在设置中配置局域网同步')
      }
    })
  }
})
</script>

<template>
  <div class="p-4 md:p-4 lg:px-8 min-h-full">
    <!-- Action Buttons (Desktop only, Mobile in header) -->
    <div class="hidden md:flex items-center gap-2 mb-4">
      <Button
        size="sm"
        class="rounded-full shadow-sm hover:shadow-md transition-all"
        @click="handleCreateNote"
      >
        <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
        新建笔记
      </Button>
      <Button
        size="sm"
        variant="outline"
        class="rounded-full shadow-sm hover:shadow-md transition-all ml-1"
        @click="router.push('/local-workspace')"
      >
        <Icon name="lucide:folder-open" class="w-4 h-4 mr-1" />
        {{ workspacePath ? '本地目录' : '绑定本地目录' }}
      </Button>
      <!-- <Button
        size="sm"
        variant="ghost"
        class="rounded-full shadow-sm hover:shadow-md transition-all ml-1 text-xs text-muted-foreground"
        @click="router.push('/local-edit')"
      >
        <Icon name="lucide:file-edit" class="w-4 h-4 mr-1" />
        单文件编辑
      </Button> -->
    </div>

    <!-- Mobile Action Buttons -->
    <div class="md:hidden flex items-center gap-2 mb-4">
      <Button size="sm" class="rounded-full h-8 px-3" @click="handleCreateNote">
        <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
        新建
      </Button>
      <Button
        size="sm"
        variant="outline"
        class="rounded-full h-8 px-3"
        @click="router.push('/local-workspace')"
      >
        <Icon name="lucide:folder-open" class="w-4 h-4 mr-1" />
        {{ workspacePath ? '本地目录' : '绑定本地目录' }}
      </Button>
    </div>

    <!-- Header -->
    <header class="flex flex-col gap-1 animate-in fade-in slide-in-from-top-4 duration-500 mb-4">
      <p class="text-muted-foreground pb-1 text-xs md:text-sm max-w-2xl">
        记录和思考同样重要
      </p>
    </header>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center h-64">
      <Icon name="lucide:loader-2" class="w-8 h-8 animate-spin text-muted-foreground" />
    </div>

    <!-- Empty State -->
    <div v-else-if="notes.length === 0" class="h-[50vh] flex flex-col items-center justify-center text-muted-foreground space-y-6 animate-in fade-in zoom-in duration-500">
      <div class="w-20 h-20 bg-muted/50 rounded-full flex items-center justify-center mb-4 shadow-inner">
        <Icon name="lucide:file-plus" class="w-8 h-8 opacity-40" />
      </div>
      <div class="text-center space-y-1">
        <h3 class="text-base md:text-lg font-semibold text-foreground">
          暂无笔记
        </h3>
        <p class="max-w-xs mx-auto text-sm text-balance">
          创建您的第一篇笔记以开始记录想法。
        </p>
      </div>
      <Button variant="outline" size="default" class="mt-4 rounded-full shadow-sm hover:shadow-md transition-all" @click="handleCreateNote">
        创建笔记
      </Button>
    </div>

    <!-- Notes List -->
    <div v-else class="flex flex-col pb-20 max-w-5xl mx-auto">
      <div class="bg-card/50 backdrop-blur-sm rounded-xl border border-border/40 shadow-sm overflow-hidden">
        <TransitionGroup
          name="list"
          tag="div"
          class="divide-y divide-border/30"
        >
          <div
            v-for="note in notes"
            :key="note.id"
            :ref="setNoteCardRef"
            class="group relative flex items-center gap-4 p-4 transition-all duration-200 hover:bg-muted/40 active:bg-muted/60 cursor-pointer"
            @click="router.push(`/write/article/${note.id}`)"
          >
            <!-- Main Content -->
            <div class="flex-1 min-w-0 py-0.5">
              <div class="flex items-center justify-between mb-1.5">
                <h3 class="font-semibold text-sm md:text-base text-foreground truncate pr-4">
                  {{ note.title || '无标题' }}
                </h3>
                <!-- Date (Desktop: visible) -->
                <span class="hidden sm:flex text-xs text-muted-foreground font-medium tabular-nums shrink-0">
                  {{ formatDate(note.updated_at) }}
                </span>
              </div>

              <!-- Subtitle / Tags Row -->
              <div class="flex items-center gap-3">
                <!-- Date (Mobile only) -->
                <span class="sm:hidden text-xs text-muted-foreground tabular-nums shrink-0">
                  {{ formatDate(note.updated_at) }}
                </span>

                <!-- Tags -->
                <div v-if="getTags(note.tags).length > 0" class="flex flex-wrap gap-1.5 items-center">
                  <span
                    v-for="tag in getTags(note.tags).slice(0, 3)"
                    :key="tag"
                    class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-secondary/50 text-secondary-foreground"
                  >
                    #{{ tag }}
                  </span>
                  <span v-if="getTags(note.tags).length > 3" class="text-[10px] text-muted-foreground">
                    +{{ getTags(note.tags).length - 3 }}
                  </span>
                </div>
                <span v-else class="text-xs text-muted-foreground/50 italic">无标签</span>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex items-center pl-2 gap-2">
              <!-- Delete Button -->
              <button
                class="p-2 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 rounded-full transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 active:scale-90"
                @click.stop.prevent="handleDeleteNote(note.id)"
              >
                <Icon name="lucide:trash-2" class="w-4 h-4" />
              </button>

              <!-- Chevron -->
              <Icon name="lucide:chevron-right" class="w-4 h-4 text-muted-foreground/30" />
            </div>
          </div>
        </TransitionGroup>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* List Transitions */
.list-move,
.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  height: 0;
  margin: 0;
  padding: 0;
  transform: translateX(-20px);
}

.list-leave-active {
  position: absolute;
  width: 100%;
  z-index: 0;
}
</style>
