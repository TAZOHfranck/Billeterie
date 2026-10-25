/*
# Attach tickets to customer accounts

1. New columns
- `tickets.user_id` — optional reference to the Supabase account that created the ticket; kept nullable so existing tickets remain intact.

2. Modified data
- New tickets created by a signed-in customer automatically receive the authenticated user's ID through a database default.
- Existing tickets are not changed or deleted and remain available to administration.

3. Security changes
- Public ticket creation is replaced by authenticated ticket creation.
- The insert policy only accepts a ticket whose owner is the current authenticated account.
- Ticket status lookup remains available by QR token so a customer can verify a ticket after signing in or from a saved link.

4. Important notes
- No custom password or account table is created; Supabase Auth remains the source of truth for accounts.
- The nullable ownership column preserves all existing ticket records while allowing future reservations to be linked to accounts.
*/

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE tickets
  ALTER COLUMN user_id SET DEFAULT auth.uid();

CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON tickets(user_id);

DROP POLICY IF EXISTS "public_insert_tickets" ON tickets;
CREATE POLICY "authenticated_insert_own_tickets"
ON tickets FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
