/*
# Create ticketing system schema

1. New Tables
- `event_settings` — single-row table for global settings (event name, date, location, description, contact info, banner image URL)
- `tables` — event tables/seats that users can choose when buying a ticket (name, capacity, price)
- `payment_methods` — available payment methods (name, account details, instructions, active)
- `tickets` — individual ticket requests: full name, phone, chosen table, payment method, proof of payment file path, status (pending/approved/rejected/used), QR code token, admin notes

2. Relationships
- tickets.table_id → tables.id (FK, ON DELETE RESTRICT)
- tickets.payment_method_id → payment_methods.id (FK, ON DELETE RESTRICT)

3. Security (RLS)
- `event_settings`: public read, authenticated update
- `tables`: public read, authenticated full CRUD
- `payment_methods`: public read, authenticated full CRUD
- `tickets`: public INSERT + SELECT, authenticated UPDATE/DELETE for admin
- Admin access is scoped to `authenticated` role (admin signs in via Supabase auth)

4. Important Notes
- Public users (anon) can submit tickets and check ticket status.
- Admin users (authenticated) can manage all data.
- QR tokens are unique UUIDs generated per ticket for secure verification.
- Ticket status flow: pending → approved → used (or rejected at any point)
*/

-- Event settings (single-row configuration table)
CREATE TABLE IF NOT EXISTS event_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL DEFAULT 'Mon Événement',
  event_date timestamptz,
  event_location text DEFAULT '',
  event_description text DEFAULT '',
  contact_phone text DEFAULT '',
  contact_email text DEFAULT '',
  banner_url text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Insert default row
INSERT INTO event_settings (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM event_settings);

-- Tables (seats available for the event)
CREATE TABLE IF NOT EXISTS tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  capacity integer NOT NULL DEFAULT 1,
  price numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Payment methods
CREATE TABLE IF NOT EXISTS payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  account_details text NOT NULL DEFAULT '',
  instructions text DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Tickets
CREATE TABLE IF NOT EXISTS tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text NOT NULL,
  table_id uuid REFERENCES tables(id) ON DELETE RESTRICT,
  payment_method_id uuid REFERENCES payment_methods(id) ON DELETE RESTRICT,
  payment_proof_path text,
  qr_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'used')),
  quantity integer NOT NULL DEFAULT 1,
  admin_notes text DEFAULT '',
  scanned_at timestamptz,
  scanned_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_qr_token ON tickets(qr_token);
CREATE INDEX IF NOT EXISTS idx_tickets_table_id ON tickets(table_id);
CREATE INDEX IF NOT EXISTS idx_tickets_phone ON tickets(phone);
CREATE INDEX IF NOT EXISTS idx_tables_active ON tables(is_active);
CREATE INDEX IF NOT EXISTS idx_payment_methods_active ON payment_methods(is_active);

-- Enable RLS on all tables
ALTER TABLE event_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

-- event_settings policies (public read, authenticated update)
DROP POLICY IF EXISTS "public_read_event_settings" ON event_settings;
CREATE POLICY "public_read_event_settings"
ON event_settings FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_update_event_settings" ON event_settings;
CREATE POLICY "auth_update_event_settings"
ON event_settings FOR UPDATE
TO authenticated USING (true) WITH CHECK (true);

-- tables policies (public read, authenticated full CRUD)
DROP POLICY IF EXISTS "public_read_tables" ON tables;
CREATE POLICY "public_read_tables"
ON tables FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_tables" ON tables;
CREATE POLICY "auth_insert_tables"
ON tables FOR INSERT
TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_tables" ON tables;
CREATE POLICY "auth_update_tables"
ON tables FOR UPDATE
TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_tables" ON tables;
CREATE POLICY "auth_delete_tables"
ON tables FOR DELETE
TO authenticated USING (true);

-- payment_methods policies (public read, authenticated full CRUD)
DROP POLICY IF EXISTS "public_read_payment_methods" ON payment_methods;
CREATE POLICY "public_read_payment_methods"
ON payment_methods FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_payment_methods" ON payment_methods;
CREATE POLICY "auth_insert_payment_methods"
ON payment_methods FOR INSERT
TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_payment_methods" ON payment_methods;
CREATE POLICY "auth_update_payment_methods"
ON payment_methods FOR UPDATE
TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_payment_methods" ON payment_methods;
CREATE POLICY "auth_delete_payment_methods"
ON payment_methods FOR DELETE
TO authenticated USING (true);

-- tickets policies
-- Public can insert (submit ticket request)
DROP POLICY IF EXISTS "public_insert_tickets" ON tickets;
CREATE POLICY "public_insert_tickets"
ON tickets FOR INSERT
TO anon, authenticated WITH CHECK (true);

-- Public can read tickets (for status lookup by token)
DROP POLICY IF EXISTS "public_read_tickets" ON tickets;
CREATE POLICY "public_read_tickets"
ON tickets FOR SELECT
TO anon, authenticated USING (true);

-- Authenticated (admin) can update and delete
DROP POLICY IF EXISTS "auth_update_tickets" ON tickets;
CREATE POLICY "auth_update_tickets"
ON tickets FOR UPDATE
TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_tickets" ON tickets;
CREATE POLICY "auth_delete_tickets"
ON tickets FOR DELETE
TO authenticated USING (true);

-- Storage bucket for payment proofs
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for payment-proofs bucket
DROP POLICY IF EXISTS "public_upload_payment_proofs" ON storage.objects;
CREATE POLICY "public_upload_payment_proofs"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'payment-proofs');

DROP POLICY IF EXISTS "public_read_payment_proofs" ON storage.objects;
CREATE POLICY "public_read_payment_proofs"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'payment-proofs');

DROP POLICY IF EXISTS "auth_delete_payment_proofs" ON storage.objects;
CREATE POLICY "auth_delete_payment_proofs"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'payment-proofs');
