ALTER TABLE public.ticket_requests
  ADD COLUMN IF NOT EXISTS admin_email_status text NOT NULL DEFAULT 'pending'
    CHECK (admin_email_status IN ('pending', 'sending', 'sent', 'failed')),
  ADD COLUMN IF NOT EXISTS admin_email_error text,
  ADD COLUMN IF NOT EXISTS admin_email_attempted_at timestamptz;

CREATE OR REPLACE FUNCTION public.claim_ticket_request_admin_email(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  request_row public.ticket_requests%ROWTYPE;
  table_name text;
  table_price numeric;
  payment_method_name text;
  event_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  SELECT * INTO request_row
  FROM public.ticket_requests
  WHERE id = p_request_id
    AND user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND OR request_row.status <> 'pending' THEN
    RAISE EXCEPTION 'An owned pending ticket request is required';
  END IF;

  IF request_row.admin_email_status = 'sent' THEN
    RETURN jsonb_build_object('status', 'sent');
  END IF;

  IF request_row.admin_email_status = 'sending'
    AND request_row.admin_email_attempted_at > now() - interval '5 minutes' THEN
    RETURN jsonb_build_object('status', 'sending');
  END IF;

  UPDATE public.ticket_requests
  SET admin_email_status = 'sending',
      admin_email_attempted_at = now(),
      admin_email_error = NULL,
      updated_at = now()
  WHERE id = p_request_id;

  SELECT t.name, t.price INTO table_name, table_price
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
    'email', request_row.email,
    'full_name', request_row.full_name,
    'phone', request_row.phone,
    'quantity', request_row.quantity,
    'table_name', COALESCE(table_name, 'N/A'),
    'table_price', COALESCE(table_price, 0),
    'payment_method_name', COALESCE(payment_method_name, 'N/A'),
    'event_name', COALESCE(event_name, 'votre événement')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ticket_request_admin_email(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_ticket_request_admin_email(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_ticket_request_admin_email(
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  UPDATE public.ticket_requests
  SET admin_email_status = CASE WHEN p_sent THEN 'sent' ELSE 'failed' END,
      admin_email_error = CASE WHEN p_sent THEN NULL ELSE left(COALESCE(p_error, 'Email delivery failed'), 1000) END,
      updated_at = now()
  WHERE id = p_request_id
    AND user_id = auth.uid()
    AND admin_email_status = 'sending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Email delivery is not currently in progress for this request';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_ticket_request_admin_email(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_ticket_request_admin_email(uuid, boolean, text) TO authenticated;
