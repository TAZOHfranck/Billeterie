CREATE OR REPLACE FUNCTION public.is_authenticated_user()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.is_authenticated_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_authenticated_user() TO authenticated;

CREATE TABLE IF NOT EXISTS public.ticket_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text NOT NULL,
  email text NOT NULL,
  table_id uuid NOT NULL REFERENCES public.tables(id) ON DELETE RESTRICT,
  payment_method_id uuid NOT NULL REFERENCES public.payment_methods(id) ON DELETE RESTRICT,
  payment_proof_path text NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes text NOT NULL DEFAULT '',
  ticket_id uuid UNIQUE REFERENCES public.tickets(id) ON DELETE SET NULL,
  email_status text CHECK (email_status IN ('pending', 'sending', 'sent', 'failed')),
  email_error text,
  email_attempted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  CONSTRAINT ticket_requests_email_format CHECK (email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);

CREATE INDEX IF NOT EXISTS idx_ticket_requests_user_id ON public.ticket_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_requests_status ON public.ticket_requests(status);

ALTER TABLE public.ticket_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "requesters_read_own_ticket_requests" ON public.ticket_requests;
CREATE POLICY "requesters_read_own_ticket_requests"
ON public.ticket_requests FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_authenticated_user());

GRANT SELECT ON public.ticket_requests TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ticket_requests FROM anon, authenticated;

DROP POLICY IF EXISTS "auth_update_event_settings" ON public.event_settings;
DROP POLICY IF EXISTS "admin_update_event_settings" ON public.event_settings;
CREATE POLICY "admin_update_event_settings"
ON public.event_settings FOR UPDATE
TO authenticated USING (public.is_authenticated_user()) WITH CHECK (public.is_authenticated_user());

DROP POLICY IF EXISTS "auth_insert_tables" ON public.tables;
DROP POLICY IF EXISTS "admin_insert_tables" ON public.tables;
CREATE POLICY "admin_insert_tables"
ON public.tables FOR INSERT
TO authenticated WITH CHECK (public.is_authenticated_user());

DROP POLICY IF EXISTS "auth_update_tables" ON public.tables;
DROP POLICY IF EXISTS "admin_update_tables" ON public.tables;
CREATE POLICY "admin_update_tables"
ON public.tables FOR UPDATE
TO authenticated USING (public.is_authenticated_user()) WITH CHECK (public.is_authenticated_user());

DROP POLICY IF EXISTS "auth_delete_tables" ON public.tables;
DROP POLICY IF EXISTS "admin_delete_tables" ON public.tables;
CREATE POLICY "admin_delete_tables"
ON public.tables FOR DELETE
TO authenticated USING (public.is_authenticated_user());

DROP POLICY IF EXISTS "auth_insert_payment_methods" ON public.payment_methods;
DROP POLICY IF EXISTS "admin_insert_payment_methods" ON public.payment_methods;
CREATE POLICY "admin_insert_payment_methods"
ON public.payment_methods FOR INSERT
TO authenticated WITH CHECK (public.is_authenticated_user());

DROP POLICY IF EXISTS "auth_update_payment_methods" ON public.payment_methods;
DROP POLICY IF EXISTS "admin_update_payment_methods" ON public.payment_methods;
CREATE POLICY "admin_update_payment_methods"
ON public.payment_methods FOR UPDATE
TO authenticated USING (public.is_authenticated_user()) WITH CHECK (public.is_authenticated_user());

DROP POLICY IF EXISTS "auth_delete_payment_methods" ON public.payment_methods;
DROP POLICY IF EXISTS "admin_delete_payment_methods" ON public.payment_methods;
CREATE POLICY "admin_delete_payment_methods"
ON public.payment_methods FOR DELETE
TO authenticated USING (public.is_authenticated_user());

DROP POLICY IF EXISTS "public_insert_tickets" ON public.tickets;
DROP POLICY IF EXISTS "authenticated_insert_own_tickets" ON public.tickets;

DROP POLICY IF EXISTS "auth_update_tickets" ON public.tickets;
DROP POLICY IF EXISTS "admin_update_tickets" ON public.tickets;
CREATE POLICY "admin_update_tickets"
ON public.tickets FOR UPDATE
TO authenticated USING (public.is_authenticated_user()) WITH CHECK (public.is_authenticated_user());

DROP POLICY IF EXISTS "auth_delete_tickets" ON public.tickets;
DROP POLICY IF EXISTS "admin_delete_tickets" ON public.tickets;
CREATE POLICY "admin_delete_tickets"
ON public.tickets FOR DELETE
TO authenticated USING (public.is_authenticated_user());

DROP POLICY IF EXISTS "auth_delete_payment_proofs" ON storage.objects;
DROP POLICY IF EXISTS "admin_delete_payment_proofs" ON storage.objects;
CREATE POLICY "admin_delete_payment_proofs"
ON storage.objects FOR DELETE
TO authenticated USING (bucket_id = 'payment-proofs' AND public.is_authenticated_user());

CREATE OR REPLACE FUNCTION public.submit_ticket_request(
  p_full_name text,
  p_phone text,
  p_email text,
  p_table_id uuid,
  p_payment_method_id uuid,
  p_payment_proof_path text,
  p_quantity integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  request_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to submit a ticket request';
  END IF;

  IF COALESCE(trim(p_full_name), '') = ''
    OR COALESCE(trim(p_phone), '') = ''
    OR COALESCE(trim(p_payment_proof_path), '') = ''
    OR COALESCE(trim(p_email), '') !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR p_quantity NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'Ticket request details are invalid';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tables WHERE id = p_table_id AND is_active) THEN
    RAISE EXCEPTION 'The selected table is not available';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE id = p_payment_method_id AND is_active) THEN
    RAISE EXCEPTION 'The selected payment method is not available';
  END IF;

  INSERT INTO public.ticket_requests (
    user_id, full_name, phone, email, table_id, payment_method_id,
    payment_proof_path, quantity
  )
  VALUES (
    auth.uid(), trim(p_full_name), trim(p_phone), lower(trim(p_email)),
    p_table_id, p_payment_method_id, p_payment_proof_path, p_quantity
  )
  RETURNING id INTO request_id;

  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_ticket_request(text, text, text, uuid, uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_ticket_request(text, text, text, uuid, uuid, text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.decide_ticket_request(
  p_request_id uuid,
  p_decision text,
  p_admin_notes text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  request_row public.ticket_requests%ROWTYPE;
  created_ticket public.tickets%ROWTYPE;
BEGIN
  IF NOT public.is_authenticated_user() THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected';
  END IF;

  SELECT * INTO request_row
  FROM public.ticket_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket request not found';
  END IF;

  IF request_row.status <> 'pending' THEN
    RAISE EXCEPTION 'Ticket request has already been decided';
  END IF;

  IF p_decision = 'approved' THEN
    INSERT INTO public.tickets (
      user_id, full_name, phone, table_id, payment_method_id,
      payment_proof_path, quantity, status
    )
    VALUES (
      request_row.user_id, request_row.full_name, request_row.phone,
      request_row.table_id, request_row.payment_method_id,
      request_row.payment_proof_path, request_row.quantity, 'approved'
    )
    RETURNING * INTO created_ticket;

    UPDATE public.ticket_requests
    SET status = 'approved',
        admin_notes = COALESCE(p_admin_notes, ''),
        ticket_id = created_ticket.id,
        email_status = 'pending',
        email_error = NULL,
        email_attempted_at = NULL,
        decided_at = now(),
        updated_at = now()
    WHERE id = p_request_id;
  ELSE
    UPDATE public.ticket_requests
    SET status = 'rejected',
        admin_notes = COALESCE(p_admin_notes, ''),
        email_status = 'pending',
        email_error = NULL,
        email_attempted_at = NULL,
        decided_at = now(),
        updated_at = now()
    WHERE id = p_request_id;
  END IF;

  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'status', p_decision,
    'ticket_id', created_ticket.id,
    'qr_token', created_ticket.qr_token
  );
END;
$$;

REVOKE ALL ON FUNCTION public.decide_ticket_request(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_ticket_request(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_ticket_decision_email(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  request_row public.ticket_requests%ROWTYPE;
  event_name text;
  ticket_token text;
BEGIN
  IF NOT public.is_authenticated_user() THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  SELECT * INTO request_row
  FROM public.ticket_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND OR request_row.status = 'pending' THEN
    RAISE EXCEPTION 'A decided ticket request is required';
  END IF;

  IF request_row.email_status = 'sent' THEN
    RETURN jsonb_build_object('status', 'sent');
  END IF;

  IF request_row.email_status = 'sending'
    AND request_row.email_attempted_at > now() - interval '5 minutes' THEN
    RETURN jsonb_build_object('status', 'sending');
  END IF;

  UPDATE public.ticket_requests
  SET email_status = 'sending',
      email_attempted_at = now(),
      email_error = NULL,
      updated_at = now()
  WHERE id = p_request_id;

  SELECT es.event_name INTO event_name
  FROM public.event_settings es
  ORDER BY es.created_at
  LIMIT 1;

  IF request_row.ticket_id IS NOT NULL THEN
    SELECT t.qr_token::text INTO ticket_token
    FROM public.tickets t
    WHERE t.id = request_row.ticket_id;
  END IF;

  RETURN jsonb_build_object(
    'status', 'sending',
    'request_id', request_row.id,
    'email', request_row.email,
    'full_name', request_row.full_name,
    'decision', request_row.status,
    'admin_notes', request_row.admin_notes,
    'event_name', COALESCE(event_name, 'votre événement'),
    'ticket_token', ticket_token
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ticket_decision_email(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_ticket_decision_email(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_ticket_decision_email(
  p_request_id uuid,
  p_sent boolean,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_authenticated_user() THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  UPDATE public.ticket_requests
  SET email_status = CASE WHEN p_sent THEN 'sent' ELSE 'failed' END,
      email_error = CASE WHEN p_sent THEN NULL ELSE left(COALESCE(p_error, 'Email delivery failed'), 1000) END,
      updated_at = now()
  WHERE id = p_request_id
    AND email_status = 'sending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Email delivery is not currently in progress';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_ticket_decision_email(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_ticket_decision_email(uuid, boolean, text) TO authenticated;
