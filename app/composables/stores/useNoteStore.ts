import type { Note } from '~/types/models'
import { useNoteRepository } from '~/composables/repositories/useNoteRepository'

export const useNoteStore = () => {
  const notes = useState<Note[]>('store_notes', () => [])
  const isLoading = useState<boolean>('store_notes_loading', () => false)
  const isInitialized = useState<boolean>('store_notes_initialized', () => false)

  const { getAllNotes } = useNoteRepository()

  const fetchNotes = async (force = false) => {
    if (isInitialized.value && !force)
      return notes.value

    isLoading.value = true
    try {
      const data = await getAllNotes()
      if (data) {
        notes.value = data
        isInitialized.value = true
      }
    }
    catch (e) {
      console.error('Failed to fetch notes in store', e)
    }
    finally {
      isLoading.value = false
    }
    return notes.value
  }

  // Optimistic updates helpers
  const removeNote = (id: number) => {
    const index = notes.value.findIndex(n => n.id === id)
    if (index !== -1)
      notes.value.splice(index, 1)
  }

  const addNote = (note: Note) => {
    notes.value.unshift(note)
  }

  const updateNote = (updatedNote: Note) => {
    const index = notes.value.findIndex(n => n.id === updatedNote.id)
    if (index !== -1) {
      notes.value[index] = updatedNote
    }
  }

  return {
    notes,
    isLoading,
    fetchNotes,
    removeNote,
    addNote,
    updateNote,
  }
}
