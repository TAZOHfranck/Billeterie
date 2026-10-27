export interface EventSettings {
  id: string
  event_name: string
  event_date: string | null
  event_location: string
  event_description: string
  contact_phone: string
  contact_email: string
  banner_url: string
  installment_payments_enabled: boolean
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
  receiver_number: string
  ussd_template: string
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

export type TicketRequestStatus = 'pending' | 'approved' | 'rejected'
export type TicketPaymentMode = 'full' | 'installment'
export type TicketPaymentStatus = 'full' | 'partial' | 'paid'
export type TicketPaymentTrancheStatus = 'pending' | 'approved' | 'rejected'
export type PushNotificationStatus = 'pending' | 'sending' | 'sent' | 'failed'

export interface TicketPaymentTranche {
  id: string
  request_id: string
  amount: number
  payment_proof_path: string
  status: TicketPaymentTrancheStatus
  admin_notes: string
  push_status: PushNotificationStatus
  push_error: string | null
  push_attempted_at: string | null
  decided_at: string | null
  created_at: string
  updated_at: string
}

export interface TicketRequest {
  id: string
  user_id: string
  full_name: string
  phone: string
  email: string
  table_id: string
  payment_method_id: string
  payment_proof_path: string
  quantity: number
  payment_mode: TicketPaymentMode
  target_amount: number
  approved_amount: number
  payment_status: TicketPaymentStatus
  status: TicketRequestStatus
  admin_notes: string
  ticket_id: string | null
  push_status: PushNotificationStatus
  push_error: string | null
  created_at: string
  updated_at: string
  decided_at: string | null
  table?: TableSeat | null
  payment_method?: PaymentMethod | null
  ticket?: { qr_token: string } | null
  tranches?: TicketPaymentTranche[]
}
