-- Game invite opt outs live apart from the shared suppression list, so a lead who stops invites
-- is never cut off from lesson reminders or sign in emails later.
CREATE TABLE IF NOT EXISTS public.invite_optouts (
  email TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  opted_out_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.invite_optouts ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.invite_optouts TO service_role;
-- no policies: only the service role (edge functions) can read or write
