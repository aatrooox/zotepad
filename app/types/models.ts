export interface User {
  id: number
  name: string
  email: string
  created_at?: string
  updated_at?: string
}

export interface AppSetting {
  key: string
  value: string
  category?: string
  updated_at?: string
}

export interface Asset {
  id: number
  url: string
  path: string
  filename: string
  size?: number
  mime_type?: string
  storage_type: string
  created_at?: string
}

export interface Note {
  id: number
  title: string
  content: string
  tags?: string // JSON string of string[]
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export interface Moment {
  id: number
  content: string
  images?: string // JSON string of string[]
  tags?: string // JSON string of string[]
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}
