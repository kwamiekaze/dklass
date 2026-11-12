DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "Signed-in users can insert notifications" ON public.notifications FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND (actor_id IS NULL OR actor_id = auth.uid() OR actor_id = public.acting_user_id()));

DROP POLICY IF EXISTS "Anyone can insert ratings" ON public.report_card_ratings;
CREATE POLICY "Authors can insert ratings" ON public.report_card_ratings FOR INSERT TO anon, authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.report_cards rc WHERE rc.id = report_card_id)
  AND ((auth.uid() IS NOT NULL AND student_id = public.acting_user_id())
       OR (is_public_view = true AND student_id IS NULL AND EXISTS (SELECT 1 FROM public.report_cards rc WHERE rc.id = report_card_id AND rc.is_public)))
);
DROP POLICY IF EXISTS "Anyone can view ratings" ON public.report_card_ratings;
CREATE POLICY "Participants and public cards can view ratings" ON public.report_card_ratings FOR SELECT TO anon, authenticated
USING (
  (auth.uid() IS NOT NULL AND (student_id = public.acting_user_id() OR instructor_id = auth.uid()))
  OR EXISTS (SELECT 1 FROM public.report_cards rc WHERE rc.id = report_card_id AND rc.is_public)
);

DROP POLICY IF EXISTS "Anyone can submit report card feedback" ON public.report_card_feedback;
CREATE POLICY "Viewers can submit report card feedback" ON public.report_card_feedback FOR INSERT TO anon, authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.report_cards rc WHERE rc.id = report_card_id)
  AND (sender_user_id IS NULL OR sender_user_id = auth.uid())
  AND (is_authenticated = false OR auth.uid() IS NOT NULL)
  AND char_length(message) BETWEEN 1 AND 5000
  AND char_length(sender_name) BETWEEN 1 AND 200
  AND char_length(sender_email) BETWEEN 3 AND 320
);

DROP POLICY IF EXISTS "Any authenticated user can read matches" ON public.game_matches;
CREATE POLICY "Hosts, players and open lobbies are readable" ON public.game_matches FOR SELECT TO authenticated
USING (host_id = auth.uid() OR public.is_match_player(id, auth.uid()) OR status = 'lobby');

DROP POLICY IF EXISTS "Authenticated can read leaderboard" ON public.game_scores;
CREATE POLICY "Signed-in users can read leaderboard" ON public.game_scores FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

REVOKE SELECT (email) ON public.guest_scores FROM anon, authenticated;

DROP POLICY IF EXISTS "Admins can delete attachments" ON storage.objects;
CREATE POLICY "Admins can delete attachments" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'contact-attachments' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated can view profile media" ON storage.objects;
CREATE POLICY "Authenticated can view profile media" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'profile-media' AND auth.uid() IS NOT NULL);