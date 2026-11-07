CREATE OR REPLACE FUNCTION public.refresh_ticket_request_installment_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  request_id_to_update uuid;
  approved_total numeric;
  target_total numeric;
BEGIN
  request_id_to_update := COALESCE(NEW.request_id, OLD.request_id);

  IF request_id_to_update IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(t.amount), 0),
         (SELECT r.target_amount
          FROM public.ticket_requests r
          WHERE r.id = request_id_to_update)
    INTO approved_total, target_total
  FROM public.ticket_payment_tranches t
  WHERE t.request_id = request_id_to_update
    AND t.status = 'approved';

  UPDATE public.ticket_requests
  SET approved_amount = round(COALESCE(approved_total, 0), 2),
      payment_status = CASE
        WHEN round(COALESCE(target_total, 0) - COALESCE(approved_total, 0), 2) <= 0 THEN 'paid'
        ELSE 'partial'
      END,
      updated_at = now()
  WHERE id = request_id_to_update;

  RETURN COALESCE(NEW, OLD);
END;
$$;
