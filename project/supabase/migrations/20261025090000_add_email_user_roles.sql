CREATE OR REPLACE FUNCTION public.is_authenticated_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users AS account
    WHERE account.id = auth.uid()
      AND account.email_confirmed_at IS NOT NULL
      AND lower(account.email) IN ('francktazoh@gmail.com', 'admin@gmail.com')
  );
$$;

REVOKE ALL ON FUNCTION public.is_authenticated_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_authenticated_user() TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_ticket_request_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  account_email text;
  email_confirmed_at timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NEW.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'The request must belong to the authenticated user';
  END IF;

  SELECT users.email, users.email_confirmed_at
  INTO account_email, email_confirmed_at
  FROM auth.users AS users
  WHERE users.id = auth.uid();

  IF email_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Confirm your email address before submitting a ticket request';
  END IF;

  IF lower(NEW.email) <> lower(COALESCE(account_email, '')) THEN
    RAISE EXCEPTION 'The request email must match your confirmed account email';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_ticket_request_email() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS validate_ticket_request_email ON public.ticket_requests;
CREATE TRIGGER validate_ticket_request_email
BEFORE INSERT OR UPDATE OF user_id, email ON public.ticket_requests
FOR EACH ROW
EXECUTE FUNCTION public.validate_ticket_request_email();
