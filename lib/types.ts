export type Role = 'admin' | 'subcontractor'

export type Profile = {
  id: string
  email: string
  full_name: string
  role: Role
  active: boolean
  created_at: string
}

export type AppModel = {
  id: string
  name: string
  description: string | null
  active: boolean
  created_at: string
}

export type State = {
  id: string
  name: string
  order: number
  color: string
  is_final: boolean
  created_at: string
}

export type PriceRule = {
  id: string
  from_state_id: string
  to_state_id: string
  price_per_piece: number
  model_id: string | null
  valid_from: string
  created_at: string
}

export type BatchStatus = 'draft' | 'sent' | 'open' | 'completed' | 'closed'

export type Batch = {
  id: string
  model_id: string
  from_state_id: string
  expected_state_id: string
  quantity: number
  subcontractor_id: string
  status: BatchStatus
  sent_at: string | null
  opened_at: string | null
  closed_at: string | null
  note: string | null
  created_at: string
  updated_at: string
}

export type BatchUpdate = {
  id: string
  batch_id: string
  to_state_id: string
  quantity: number
  price_per_piece: number
  amount: number
  duration_seconds: number | null
  updated_at?: string
  corrected_by: string | null
  comment: string | null
  original_update_id?: string | null
  created_at: string
}

export type AuditLog = {
  id: string
  table_name: string
  row_id: string
  action: string
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  user_id: string
  created_at: string
}

export type BatchWithRelations = Batch & {
  model: AppModel
  from_state: State
  expected_state: State
  subcontractor: Profile
}

export type BatchUpdateWithRelations = BatchUpdate & {
  to_state: State
}

export type PriceRuleWithRelations = PriceRule & {
  from_state: State
  to_state: State
  model: AppModel | null
}

export type RecordBatchUpdateItem = {
  to_state_id: string
  quantity: number
}

export type EarningsByModel = {
  model_name: string
  total: number
}

export type EarningsByTransition = {
  from_state: string
  to_state: string
  total: number
  count: number
}
