CREATE OR REPLACE FUNCTION public.set_default_auth_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(NEW.raw_app_meta_data ->> 'role', '') = '' THEN
    NEW.raw_app_meta_data := jsonb_set(
      COALESCE(NEW.raw_app_meta_data, '{}'::jsonb),
      '{role}',
      '"user"'::jsonb,
      true
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_default_auth_role() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS set_default_auth_role ON auth.users;
CREATE TRIGGER set_default_auth_role
BEFORE INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.set_default_auth_role();

CREATE OR REPLACE FUNCTION public.is_authenticated_user()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'role' = 'admin', false);
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
