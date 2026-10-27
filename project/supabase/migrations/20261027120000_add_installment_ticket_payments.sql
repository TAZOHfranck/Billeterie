ALTER TABLE public.event_settings
  ADD COLUMN IF NOT EXISTS installment_payments_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.ticket_requests
  ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'full'
    CHECK (payment_mode IN ('full', 'installment')),
  ADD COLUMN IF NOT EXISTS target_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approved_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'full'
    CHECK (payment_status IN ('full', 'partial', 'paid'));

CREATE TABLE IF NOT EXISTS public.ticket_payment_tranches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.ticket_requests(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  receipt_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  payment_proof_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes text NOT NULL DEFAULT '',
  push_status text NOT NULL DEFAULT 'pending' CHECK (push_status IN ('pending', 'sending', 'sent', 'failed')),
  push_error text,
  push_attempted_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_payment_tranches_request ON public.ticket_payment_tranches(request_id);
CREATE INDEX IF NOT EXISTS idx_ticket_payment_tranches_status ON public.ticket_payment_tranches(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_payment_tranches_receipt_token ON public.ticket_payment_tranches(receipt_token);

ALTER TABLE public.ticket_payment_tranches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ticket_payment_tranches_owner_read" ON public.ticket_payment_tranches;
CREATE POLICY "ticket_payment_tranches_owner_read"
ON public.ticket_payment_tranches FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.ticket_requests r
    WHERE r.id = request_id
      AND (r.user_id = auth.uid() OR public.is_authenticated_user())
  )
);
REVOKE INSERT, UPDATE, DELETE ON public.ticket_payment_tranches FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ticket_payment_tranches TO authenticated;

DROP FUNCTION IF EXISTS public.submit_ticket_request(text, text, text, uuid, uuid, text, integer);

CREATE OR REPLACE FUNCTION public.submit_ticket_request(
  p_full_name text,
  p_phone text,
  p_email text,
  p_table_id uuid,
  p_payment_method_id uuid,
  p_payment_proof_path text,
  p_quantity integer,
  p_payment_mode text DEFAULT 'full',
  p_payment_amount numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  request_id uuid;
  table_price numeric;
  target numeric;
  tranche_amount numeric;
  installment_enabled boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to submit a ticket request';
  END IF;

  IF COALESCE(trim(p_full_name), '') = ''
    OR COALESCE(trim(p_phone), '') = ''
    OR COALESCE(trim(p_payment_proof_path), '') = ''
    OR COALESCE(trim(p_email), '') !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR p_quantity NOT BETWEEN 1 AND 10
    OR p_payment_mode NOT IN ('full', 'installment') THEN
    RAISE EXCEPTION 'Ticket request details are invalid';
  END IF;

  SELECT t.price * p_quantity INTO table_price
  FROM public.tables t
  WHERE t.id = p_table_id AND t.is_active
  FOR SHARE;

  IF table_price IS NULL THEN
    RAISE EXCEPTION 'The selected table is not available';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.payment_methods
    WHERE id = p_payment_method_id AND is_active
  ) THEN
    RAISE EXCEPTION 'The selected payment method is not available';
  END IF;

  target := round(table_price, 2);
  SELECT COALESCE(es.installment_payments_enabled, false)
  INTO installment_enabled
  FROM public.event_settings es
  ORDER BY es.created_at ASC
  LIMIT 1;

  IF p_payment_mode = 'installment' AND NOT COALESCE(installment_enabled, false) THEN
    RAISE EXCEPTION 'Installment payments are not enabled';
  END IF;

  tranche_amount := CASE
    WHEN p_payment_mode = 'full' THEN target
    ELSE round(COALESCE(p_payment_amount, 0), 2)
  END;

  IF tranche_amount <= 0 OR tranche_amount > target THEN
    RAISE EXCEPTION 'The payment amount must be greater than zero and cannot exceed the total';
  END IF;

  INSERT INTO public.ticket_requests (
    user_id, full_name, phone, email, table_id, payment_method_id,
    payment_proof_path, quantity, payment_mode, target_amount,
    approved_amount, payment_status
  ) VALUES (
    auth.uid(), trim(p_full_name), trim(p_phone), lower(trim(p_email)),
    p_table_id, p_payment_method_id, p_payment_proof_path, p_quantity,
    p_payment_mode, target, 0,
    CASE WHEN p_payment_mode = 'full' THEN 'full' ELSE 'partial' END
  ) RETURNING id INTO request_id;

  INSERT INTO public.ticket_payment_tranches (
    request_id, amount, payment_proof_path
  ) VALUES (
    request_id, tranche_amount, p_payment_proof_path
  );

  RETURN request_id;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_ticket_request(text, text, text, uuid, uuid, text, integer, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_ticket_request(text, text, text, uuid, uuid, text, integer, text, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_ticket_payment_tranche(
  p_request_id uuid,
  p_payment_proof_path text,
  p_amount numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  request_row public.ticket_requests%ROWTYPE;
  remaining numeric;
  tranche_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  SELECT * INTO request_row
  FROM public.ticket_requests
  WHERE id = p_request_id
    AND user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket request not found';
  END IF;

  IF request_row.status <> 'pending'
    OR request_row.payment_mode <> 'installment'
    OR request_row.payment_status = 'paid' THEN
    RAISE EXCEPTION 'This request cannot accept another payment tranche';
  END IF;

  remaining := round(request_row.target_amount - request_row.approved_amount, 2);
  IF COALESCE(p_amount, 0) <= 0 OR round(p_amount, 2) > remaining THEN
    RAISE EXCEPTION 'The payment amount must be positive and cannot exceed the remaining balance';
  END IF;

  IF COALESCE(trim(p_payment_proof_path), '') = '' THEN
    RAISE EXCEPTION 'A payment proof is required';
  END IF;

  INSERT INTO public.ticket_payment_tranches (
    request_id, amount, payment_proof_path
  ) VALUES (
    p_request_id, round(p_amount, 2), p_payment_proof_path
  ) RETURNING id INTO tranche_id;

  RETURN tranche_id;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_ticket_payment_tranche(uuid, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_ticket_payment_tranche(uuid, text, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.decide_ticket_payment_tranche(
  p_tranche_id uuid,
  p_decision text,
  p_admin_notes text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  tranche_row public.ticket_payment_tranches%ROWTYPE;
  request_row public.ticket_requests%ROWTYPE;
  approved_total numeric;
  remaining numeric;
  created_ticket public.tickets%ROWTYPE;
BEGIN
  IF NOT public.is_authenticated_user() THEN
    RAISE EXCEPTION 'Administrator access is required';
  END IF;

  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected';
  END IF;

  SELECT * INTO tranche_row
  FROM public.ticket_payment_tranches
  WHERE id = p_tranche_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment tranche not found';
  END IF;

  IF tranche_row.status <> 'pending' THEN
    RAISE EXCEPTION 'Payment tranche has already been decided';
  END IF;

  SELECT * INTO request_row
  FROM public.ticket_requests
  WHERE id = tranche_row.request_id
  FOR UPDATE;

  IF request_row.status <> 'pending' OR request_row.payment_mode <> 'installment' THEN
    RAISE EXCEPTION 'Installment request is not pending';
  END IF;

  UPDATE public.ticket_payment_tranches
  SET status = p_decision,
      admin_notes = COALESCE(p_admin_notes, ''),
      push_status = 'pending',
      push_error = NULL,
      push_attempted_at = NULL,
      decided_at = now(),
      updated_at = now()
  WHERE id = p_tranche_id;

  IF p_decision = 'rejected' THEN
    RETURN jsonb_build_object(
      'tranche_id', p_tranche_id,
      'request_id', request_row.id,
      'status', 'rejected',
      'approved_amount', request_row.approved_amount,
      'remaining_amount', round(request_row.target_amount - request_row.approved_amount, 2),
      'ticket_id', NULL
    );
  END IF;

  SELECT round(COALESCE(SUM(amount), 0), 2)
  INTO approved_total
  FROM public.ticket_payment_tranches
  WHERE request_id = request_row.id AND status = 'approved';

  remaining := round(request_row.target_amount - approved_total, 2);

  UPDATE public.ticket_requests
  SET approved_amount = approved_total,
      payment_status = CASE WHEN remaining <= 0 THEN 'paid' ELSE 'partial' END,
      updated_at = now()
  WHERE id = request_row.id;

  IF remaining <= 0 THEN
    INSERT INTO public.tickets (
      user_id, full_name, phone, table_id, payment_method_id,
      payment_proof_path, quantity, status
    ) VALUES (
      request_row.user_id, request_row.full_name, request_row.phone,
      request_row.table_id, request_row.payment_method_id,
      tranche_row.payment_proof_path, request_row.quantity, 'approved'
    ) RETURNING * INTO created_ticket;

    UPDATE public.ticket_requests
    SET status = 'approved',
        admin_notes = COALESCE(p_admin_notes, ''),
        ticket_id = created_ticket.id,
        decided_at = now(),
        updated_at = now()
    WHERE id = request_row.id;
  END IF;

  RETURN jsonb_build_object(
    'tranche_id', p_tranche_id,
    'request_id', request_row.id,
    'status', 'approved',
    'approved_amount', approved_total,
    'remaining_amount', GREATEST(remaining, 0),
    'ticket_id', created_ticket.id
  );
END;
$$;
REVOKE ALL ON FUNCTION public.decide_ticket_payment_tranche(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_ticket_payment_tranche(uuid, text, text) TO authenticated;

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

  IF request_row.payment_mode = 'installment' AND p_decision = 'approved' THEN
    RAISE EXCEPTION 'Installment requests are approved only after every tranche is approved';
  END IF;

  IF p_decision = 'approved' THEN
    INSERT INTO public.tickets (
      user_id, full_name, phone, table_id, payment_method_id,
      payment_proof_path, quantity, status
    ) VALUES (
      request_row.user_id, request_row.full_name, request_row.phone,
      request_row.table_id, request_row.payment_method_id,
      request_row.payment_proof_path, request_row.quantity, 'approved'
    ) RETURNING * INTO created_ticket;

    UPDATE public.ticket_requests
    SET approved_amount = target_amount,
        payment_status = 'paid'
    WHERE id = p_request_id;
  END IF;

  UPDATE public.ticket_requests
  SET status = p_decision,
      admin_notes = COALESCE(p_admin_notes, ''),
      ticket_id = CASE WHEN p_decision = 'approved' THEN created_ticket.id ELSE NULL END,
      push_status = 'pending',
      push_error = NULL,
      push_attempted_at = NULL,
      decided_at = now(),
      updated_at = now()
  WHERE id = p_request_id;

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

CREATE OR REPLACE FUNCTION public.claim_ticket_payment_tranche_admin_email(p_tranche_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  tranche_row public.ticket_payment_tranches%ROWTYPE;
  request_row public.ticket_requests%ROWTYPE;
  table_name text;
  table_price numeric;
  payment_method_name text;
  event_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  SELECT * INTO tranche_row
  FROM public.ticket_payment_tranches
  WHERE id = p_tranche_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment tranche not found';
  END IF;

  SELECT * INTO request_row
  FROM public.ticket_requests
  WHERE id = tranche_row.request_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket request not owned by the user';
  END IF;

  IF tranche_row.push_status = 'sent' THEN
    RETURN jsonb_build_object('status', 'sent');
  END IF;

  IF tranche_row.push_status = 'sending'
    AND tranche_row.push_attempted_at > now() - interval '5 minutes' THEN
    RETURN jsonb_build_object('status', 'sending');
  END IF;

  UPDATE public.ticket_payment_tranches
  SET push_status = 'sending',
      push_attempted_at = now(),
      push_error = NULL,
      updated_at = now()
  WHERE id = p_tranche_id;

  SELECT t.name, t.price * request_row.quantity
  INTO table_name, table_price
  FROM public.tables t
  WHERE t.id = request_row.table_id;

  SELECT pm.name INTO payment_method_name
  FROM public.payment_methods pm
  WHERE pm.id = request_row.payment_method_id;

  SELECT es.event_name INTO event_name
  FROM public.event_settings es
  ORDER BY es.created_at
  LIMIT 1;

  RETURN jsonb_build_object(
    'status', 'sending',
    'request_id', request_row.id,
    'tranche_id', tranche_row.id,
    'email', request_row.email,
    'full_name', request_row.full_name,
    'phone', request_row.phone,
    'quantity', request_row.quantity,
    'table_name', COALESCE(table_name, 'N/A'),
    'table_price', COALESCE(table_price, 0),
    'tranche_amount', tranche_row.amount,
    'approved_amount', request_row.approved_amount,
    'remaining_amount', GREATEST(request_row.target_amount - request_row.approved_amount, 0),
    'payment_method_name', COALESCE(payment_method_name, 'N/A'),
    'event_name', COALESCE(event_name, 'votre événement')
  );
END;
$$;
REVOKE ALL ON FUNCTION public.claim_ticket_payment_tranche_admin_email(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_ticket_payment_tranche_admin_email(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_ticket_payment_tranche_admin_email(
  p_tranche_id uuid,
  p_sent boolean,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  UPDATE public.ticket_payment_tranches t
  SET push_status = CASE WHEN p_sent THEN 'sent' ELSE 'failed' END,
      push_error = CASE WHEN p_sent THEN NULL ELSE left(COALESCE(p_error, 'Email delivery failed'), 1000) END,
      updated_at = now()
  FROM public.ticket_requests r
  WHERE t.id = p_tranche_id
    AND t.request_id = r.id
    AND r.user_id = auth.uid()
    AND t.push_status = 'sending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tranche email delivery is not currently in progress';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_ticket_payment_tranche_admin_email(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_ticket_payment_tranche_admin_email(uuid, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_ticket_payment_tranche_push(p_tranche_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  tranche_row public.ticket_payment_tranches%ROWTYPE;
  request_row public.ticket_requests%ROWTYPE;
  event_name text;
BEGIN
  IF NOT public.is_authenticated_user() THEN
    RAISE EXCEPTION 'Administrator access is required';
  END IF;

  SELECT * INTO tranche_row
  FROM public.ticket_payment_tranches
  WHERE id = p_tranche_id
  FOR UPDATE;

  IF NOT FOUND OR tranche_row.status = 'pending' THEN
    RAISE EXCEPTION 'A decided payment tranche is required';
  END IF;

  SELECT * INTO request_row
  FROM public.ticket_requests
  WHERE id = tranche_row.request_id;

  IF tranche_row.push_status = 'sent' THEN
    RETURN jsonb_build_object('status', 'sent');
  END IF;

  IF tranche_row.push_status = 'sending'
    AND tranche_row.push_attempted_at > now() - interval '5 minutes' THEN
    RETURN jsonb_build_object('status', 'sending');
  END IF;

  UPDATE public.ticket_payment_tranches
  SET push_status = 'sending', push_attempted_at = now(), push_error = NULL, updated_at = now()
  WHERE id = p_tranche_id;

  SELECT es.event_name INTO event_name
  FROM public.event_settings es
  ORDER BY es.created_at
  LIMIT 1;

  RETURN jsonb_build_object(
    'status', 'sending',
    'tranche_id', tranche_row.id,
    'request_id', request_row.id,
    'user_id', request_row.user_id,
    'full_name', request_row.full_name,
    'decision', tranche_row.status,
    'admin_notes', tranche_row.admin_notes,
    'approved_amount', request_row.approved_amount,
    'target_amount', request_row.target_amount,
    'remaining_amount', GREATEST(request_row.target_amount - request_row.approved_amount, 0),
    'receipt_token', tranche_row.receipt_token,
    'ticket_token', CASE WHEN request_row.ticket_id IS NULL THEN NULL ELSE (SELECT qr_token::text FROM public.tickets WHERE id = request_row.ticket_id) END,
    'event_name', COALESCE(event_name, 'votre événement')
  );
END;
$$;
REVOKE ALL ON FUNCTION public.claim_ticket_payment_tranche_push(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_ticket_payment_tranche_push(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_ticket_payment_tranche_push(
  p_tranche_id uuid,
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
    RAISE EXCEPTION 'Administrator access is required';
  END IF;

  UPDATE public.ticket_payment_tranches
  SET push_status = CASE WHEN p_sent THEN 'sent' ELSE 'failed' END,
      push_error = CASE WHEN p_sent THEN NULL ELSE left(COALESCE(p_error, 'Push delivery failed'), 1000) END,
      updated_at = now()
  WHERE id = p_tranche_id AND push_status = 'sending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tranche push delivery is not currently in progress';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_ticket_payment_tranche_push(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_ticket_payment_tranche_push(uuid, boolean, text) TO authenticated;
