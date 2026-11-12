REVOKE SELECT ON public.guest_scores FROM anon, authenticated;
GRANT SELECT (id, display_name, level_id, difficulty, score, grade, distance, created_at) ON public.guest_scores TO anon, authenticated;