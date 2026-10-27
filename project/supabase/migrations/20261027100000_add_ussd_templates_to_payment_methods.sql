ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS ussd_template text NOT NULL DEFAULT '';
