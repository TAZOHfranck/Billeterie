ALTER TABLE public.ticket_payment_tranches
  ADD COLUMN IF NOT EXISTS receipt_token uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS email_status text NOT NULL DEFAULT 'pending'
    CHECK (email_status IN ('pending', 'sending', 'sent', 'failed')),
  ADD COLUMN IF NOT EXISTS email_error text,
  ADD COLUMN IF NOT EXISTS email_attempted_at timestamptz;

UPDATE public.ticket_payment_tranches
SET receipt_token = gen_random_uuid()
WHERE receipt_token IS NULL;

ALTER TABLE public.ticket_payment_tranches
  ALTER COLUMN receipt_token SET DEFAULT gen_random_uuid(),
  ALTER COLUMN receipt_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_payment_tranches_receipt_token
  ON public.ticket_payment_tranches(receipt_token);

CREATE OR REPLACE FUNCTION public.get_user_initial_ticket_tranche(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  tranche_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  SELECT t.id INTO tranche_id
  FROM public.ticket_payment_tranches t
  JOIN public.ticket_requests r ON r.id = t.request_id
  WHERE r.id = p_request_id
    AND r.user_id = auth.uid()
    AND r.payment_mode = 'installment'
  ORDER BY t.created_at
  LIMIT 1;

  IF tranche_id IS NULL THEN
    RAISE EXCEPTION 'Initial payment tranche not found';
  END IF;

  RETURN tranche_id;
END;
$$;
REVOKE ALL ON FUNCTION public.get_user_initial_ticket_tranche(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_initial_ticket_tranche(uuid) TO authenticated;

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
  WHERE id = tranche_row.request_id
    AND user_id = auth.uid();

  IF NOT FOUND OR request_row.status <> 'pending' THEN
    RAISE EXCEPTION 'An owned pending installment request is required';
  END IF;

  IF tranche_row.email_status = 'sent' THEN
    RETURN jsonb_build_object('status', 'sent');
  END IF;

  IF tranche_row.email_status = 'sending'
    AND tranche_row.email_attempted_at > now() - interval '5 minutes' THEN
    RETURN jsonb_build_object('status', 'sending');
  END IF;

  UPDATE public.ticket_payment_tranches
  SET email_status = 'sending',
      email_attempted_at = now(),
      email_error = NULL,
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
  SET email_status = CASE WHEN p_sent THEN 'sent' ELSE 'failed' END,
      email_error = CASE WHEN p_sent THEN NULL ELSE left(COALESCE(p_error, 'Email delivery failed'), 1000) END,
      updated_at = now()
  FROM public.ticket_requests r
  WHERE t.id = p_tranche_id
    AND t.request_id = r.id
    AND r.user_id = auth.uid()
    AND t.email_status = 'sending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tranche email delivery is not currently in progress';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_ticket_payment_tranche_admin_email(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_ticket_payment_tranche_admin_email(uuid, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_approved_tranche_receipt(p_receipt_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result jsonb;
BEGIN
  IF p_receipt_token IS NULL THEN
    RAISE EXCEPTION 'A receipt token is required';
  END IF;

  SELECT jsonb_build_object(
    'receipt_token', t.receipt_token,
    'amount', t.amount,
    'decided_at', t.decided_at,
    'full_name', r.full_name,
    'phone', r.phone,
    'quantity', r.quantity,
    'target_amount', r.target_amount,
    'approved_amount', r.approved_amount,
    'table_name', table_row.name,
    'payment_method_name', payment_row.name
  ) INTO result
  FROM public.ticket_payment_tranches t
  JOIN public.ticket_requests r ON r.id = t.request_id
  LEFT JOIN public.tables table_row ON table_row.id = r.table_id
  LEFT JOIN public.payment_methods payment_row ON payment_row.id = r.payment_method_id
  WHERE t.receipt_token = p_receipt_token
    AND t.status = 'approved'
    AND t.decided_at IS NOT NULL;

  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_approved_tranche_receipt(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_approved_tranche_receipt(uuid) TO anon, authenticated;
