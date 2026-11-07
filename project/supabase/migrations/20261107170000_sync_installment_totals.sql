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

  SELECT COALESCE(SUM(amount), 0), target_amount
    INTO approved_total, target_total
  FROM public.ticket_payment_tranches t
  JOIN public.ticket_requests r ON r.id = t.request_id
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

DROP TRIGGER IF EXISTS ticket_payment_tranches_refresh_totals ON public.ticket_payment_tranches;
CREATE TRIGGER ticket_payment_tranches_refresh_totals
AFTER INSERT OR UPDATE OF status, amount OR DELETE
ON public.ticket_payment_tranches
FOR EACH ROW
EXECUTE FUNCTION public.refresh_ticket_request_installment_totals();

UPDATE public.ticket_requests tr
SET approved_amount = round(COALESCE((
      SELECT SUM(t.amount)
      FROM public.ticket_payment_tranches t
      WHERE t.request_id = tr.id
        AND t.status = 'approved'
    ), 0), 2),
    payment_status = CASE
      WHEN round(COALESCE(tr.target_amount, 0) - COALESCE((
        SELECT SUM(t.amount)
        FROM public.ticket_payment_tranches t
        WHERE t.request_id = tr.id
          AND t.status = 'approved'
      ), 0), 2) <= 0 THEN 'paid'
      ELSE 'partial'
    END,
    updated_at = now()
WHERE tr.payment_mode = 'installment';
