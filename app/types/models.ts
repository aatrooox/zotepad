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
  updated_at?: string
}
