DROP TRIGGER IF EXISTS set_default_auth_role ON auth.users;
DROP FUNCTION IF EXISTS public.set_default_auth_role();

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
