export interface EventSettings {
  id: string
  event_name: string
  event_date: string | null
  event_location: string
  event_description: string
  contact_phone: string
  contact_email: string
  banner_url: string
  created_at: string
  updated_at: string
}

export interface TableSeat {
  id: string
  name: string
  capacity: number
  price: number
  is_active: boolean
  created_at: string
}

export interface PaymentMethod {
  id: string
  name: string
  account_details: string
  instructions: string
  is_active: boolean
  created_at: string
}

export type TicketStatus = 'pending' | 'approved' | 'rejected' | 'used'

export interface Ticket {
  id: string
  full_name: string
  phone: string
  table_id: string | null
  payment_method_id: string | null
  payment_proof_path: string | null
  qr_token: string
  status: TicketStatus
  quantity: number
  admin_notes: string
  scanned_at: string | null
  scanned_by: string | null
  created_at: string
  updated_at: string
  table?: TableSeat | null
  payment_method?: PaymentMethod | null
}

export interface TicketWithRelations extends Ticket {
  table?: TableSeat | null
  payment_method?: PaymentMethod | null
}
