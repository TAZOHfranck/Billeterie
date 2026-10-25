ALTER TABLE public.ticket_requests
  ADD COLUMN IF NOT EXISTS push_status text NOT NULL DEFAULT 'pending'
    CHECK (push_status IN ('pending', 'sending', 'sent', 'failed')),
  ADD COLUMN IF NOT EXISTS push_error text,
  ADD COLUMN IF NOT EXISTS push_attempted_at timestamptz;

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

DROP FUNCTION IF EXISTS public.claim_ticket_decision_email(uuid);
DROP FUNCTION IF EXISTS public.complete_ticket_decision_email(uuid, boolean, text);
ALTER TABLE public.ticket_requests
  DROP COLUMN IF EXISTS email_status,
  DROP COLUMN IF EXISTS email_error,
  DROP COLUMN IF EXISTS email_attempted_at;

CREATE OR REPLACE FUNCTION public.claim_ticket_decision_push(p_request_id uuid)
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
    RAISE EXCEPTION 'Administrator access is required';
  END IF;

  SELECT * INTO request_row
  FROM public.ticket_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND OR request_row.status = 'pending' THEN
    RAISE EXCEPTION 'A decided ticket request is required';
  END IF;

  IF request_row.push_status = 'sent' THEN
    RETURN jsonb_build_object('status', 'sent');
  END IF;

  IF request_row.push_status = 'sending'
    AND request_row.push_attempted_at > now() - interval '5 minutes' THEN
    RETURN jsonb_build_object('status', 'sending');
  END IF;

  UPDATE public.ticket_requests
  SET push_status = 'sending',
      push_attempted_at = now(),
      push_error = NULL,
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
    'user_id', request_row.user_id,
    'full_name', request_row.full_name,
    'decision', request_row.status,
    'admin_notes', request_row.admin_notes,
    'event_name', COALESCE(event_name, 'votre événement'),
    'ticket_token', ticket_token
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ticket_decision_push(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_ticket_decision_push(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_ticket_decision_push(
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
    RAISE EXCEPTION 'Administrator access is required';
  END IF;

  UPDATE public.ticket_requests
  SET push_status = CASE WHEN p_sent THEN 'sent' ELSE 'failed' END,
      push_error = CASE WHEN p_sent THEN NULL ELSE left(COALESCE(p_error, 'Push delivery failed'), 1000) END,
      updated_at = now()
  WHERE id = p_request_id
    AND push_status = 'sending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Push delivery is not currently in progress';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_ticket_decision_push(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_ticket_decision_push(uuid, boolean, text) TO authenticated;
