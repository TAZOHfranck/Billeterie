ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS receiver_number text NOT NULL DEFAULT '';
