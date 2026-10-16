ALTER TABLE public.account_links
  ADD COLUMN IF NOT EXISTS relationship text,
  ADD COLUMN IF NOT EXISTS previous_status text,
  ADD COLUMN IF NOT EXISTS label text;

ALTER TABLE public.account_links DROP CONSTRAINT IF EXISTS account_links_relationship_chk;
ALTER TABLE public.account_links ADD CONSTRAINT account_links_relationship_chk
  CHECK (relationship IS NULL OR relationship IN ('student','parent','guardian','other'));

ALTER TABLE public.account_merge_log
  ADD COLUMN IF NOT EXISTS action text NOT NULL DEFAULT 'merge',
  ADD COLUMN IF NOT EXISTS relationship text;

DROP FUNCTION IF EXISTS public.merge_student_account(uuid, uuid);

CREATE OR REPLACE FUNCTION public.merge_student_account(p_source_user_id uuid, p_target_user_id uuid, p_relationship text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_source public.profiles;
  v_target public.profiles;
  v_moved jsonb := '{}'::jsonb;
  v_n bigint;
  v_src_status text;
  v_tgt_status text;
  v_rel text := NULLIF(lower(trim(p_relationship)), '');
BEGIN
  IF NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'Only admins can merge accounts';
  END IF;
  IF p_source_user_id IS NULL OR p_target_user_id IS NULL OR p_source_user_id = p_target_user_id THEN
    RAISE EXCEPTION 'Source and target must be two different accounts';
  END IF;
  IF v_rel IS NOT NULL AND v_rel NOT IN ('student','parent','guardian','other') THEN
    RAISE EXCEPTION 'Relationship must be student, parent, guardian or other';
  END IF;

  SELECT * INTO v_source FROM public.profiles WHERE id = p_source_user_id;
  SELECT * INTO v_target FROM public.profiles WHERE id = p_target_user_id;
  IF v_source.id IS NULL OR v_target.id IS NULL THEN
    RAISE EXCEPTION 'Both accounts must exist';
  END IF;

  -- Idempotency / alias rules
  IF EXISTS (SELECT 1 FROM public.account_links WHERE alias_user_id = p_source_user_id) THEN
    IF EXISTS (SELECT 1 FROM public.account_links
               WHERE alias_user_id = p_source_user_id AND canonical_user_id = p_target_user_id) THEN
      RETURN jsonb_build_object('ok', true, 'already_merged', true);
    END IF;
    RAISE EXCEPTION 'This account is already linked to a different account';
  END IF;
  IF EXISTS (SELECT 1 FROM public.account_links WHERE alias_user_id = p_target_user_id) THEN
    RAISE EXCEPTION 'The main account is itself a linked login; choose its main account instead';
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_roles
             WHERE user_id IN (p_source_user_id, p_target_user_id)
               AND role IN ('admin','staff','instructor')) THEN
    RAISE EXCEPTION 'Admin, staff and instructor accounts cannot be merged';
  END IF;

  v_src_status := COALESCE(v_source.approval_status, 'pending');
  v_tgt_status := COALESCE(v_target.approval_status, 'pending');
  IF v_src_status NOT IN ('pending','approved') OR v_tgt_status NOT IN ('pending','approved') THEN
    RAISE EXCEPTION 'Only pending or approved accounts can be merged (statuses: % and %)', v_src_status, v_tgt_status;
  END IF;

  -- Re-point the source's own linked logins to the new main account.
  UPDATE public.account_links SET canonical_user_id = p_target_user_id
   WHERE canonical_user_id = p_source_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('account_links_repointed', v_n);

  UPDATE public.sessions SET student_id = p_target_user_id WHERE student_id = p_source_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('sessions', v_n);

  UPDATE public.report_cards SET student_id = p_target_user_id WHERE student_id = p_source_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('report_cards', v_n);

  UPDATE public.report_card_ratings r SET student_id = p_target_user_id
   WHERE r.student_id = p_source_user_id
     AND NOT EXISTS (SELECT 1 FROM public.report_card_ratings x
                      WHERE x.report_card_id = r.report_card_id AND x.student_id = p_target_user_id);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('report_card_ratings', v_n);

  UPDATE public.road_test_results SET student_id = p_target_user_id WHERE student_id = p_source_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('road_test_results', v_n);

  UPDATE public.session_tracking SET student_id = p_target_user_id WHERE student_id = p_source_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('session_tracking', v_n);

  UPDATE public.session_hour_deductions SET student_id = p_target_user_id WHERE student_id = p_source_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('session_hour_deductions', v_n);

  UPDATE public.schedule_proposals SET student_id = p_target_user_id WHERE student_id = p_source_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('schedule_proposals', v_n);

  UPDATE public.proposal_edit_requests SET student_id = p_target_user_id WHERE student_id = p_source_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('proposal_edit_requests', v_n);

  UPDATE public.instructor_students i SET student_id = p_target_user_id
   WHERE i.student_id = p_source_user_id
     AND NOT EXISTS (SELECT 1 FROM public.instructor_students x
                      WHERE x.instructor_id = i.instructor_id AND x.student_id = p_target_user_id);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('instructor_students', v_n);

  UPDATE public.permits SET user_id = p_target_user_id WHERE user_id = p_source_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('permits', v_n);

  UPDATE public.permit_documents SET student_id = p_target_user_id WHERE student_id = p_source_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('permit_documents', v_n);

  UPDATE public.intake_form_revisions SET user_id = p_target_user_id WHERE user_id = p_source_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('intake_form_revisions', v_n);

  UPDATE public.approved_intakes SET user_id = p_target_user_id WHERE user_id = p_source_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('approved_intakes', v_n);

  UPDATE public.intake_drafts d SET user_id = p_target_user_id
   WHERE d.user_id = p_source_user_id
     AND NOT EXISTS (SELECT 1 FROM public.intake_drafts x WHERE x.user_id = p_target_user_id);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('intake_drafts', v_n);

  UPDATE public.notifications SET user_id = p_target_user_id WHERE user_id = p_source_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('notifications', v_n);

  UPDATE public.map_pins SET student_id = p_target_user_id WHERE student_id = p_source_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('map_pins', v_n);

  UPDATE public.student_schedule_shares SET student_id = p_target_user_id WHERE student_id = p_source_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('student_schedule_shares', v_n);

  UPDATE public.health_issues SET student_id = p_target_user_id WHERE student_id = p_source_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('health_issues', v_n);

  UPDATE public.internal_notes SET target_user_id = p_target_user_id WHERE target_user_id = p_source_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('internal_notes', v_n);

  UPDATE public.report_card_feedback SET sender_user_id = p_target_user_id WHERE sender_user_id = p_source_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('report_card_feedback', v_n);

  UPDATE public.leads SET converted_student_id = p_target_user_id WHERE converted_student_id = p_source_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved || jsonb_build_object('leads', v_n);

  UPDATE public.profiles t SET
    phone = COALESCE(NULLIF(t.phone, ''), v_source.phone),
    pickup_address = COALESCE(NULLIF(t.pickup_address, ''), v_source.pickup_address),
    dropoff_address = COALESCE(NULLIF(t.dropoff_address, ''), v_source.dropoff_address),
    permit_number = COALESCE(NULLIF(t.permit_number, ''), v_source.permit_number),
    permit_issue_date = COALESCE(t.permit_issue_date, v_source.permit_issue_date),
    permit_expiration_date = COALESCE(t.permit_expiration_date, v_source.permit_expiration_date),
    guardian_name = COALESCE(NULLIF(t.guardian_name, ''), v_source.guardian_name),
    guardian_phone = COALESCE(NULLIF(t.guardian_phone, ''), v_source.guardian_phone),
    guardian_email = COALESCE(NULLIF(t.guardian_email, ''), v_source.guardian_email),
    permit_file_url = COALESCE(NULLIF(t.permit_file_url, ''), v_source.permit_file_url),
    first_name = COALESCE(NULLIF(t.first_name, ''), v_source.first_name),
    last_name = COALESCE(NULLIF(t.last_name, ''), v_source.last_name),
    availability_days = COALESCE(t.availability_days, v_source.availability_days),
    availability_windows = COALESCE(t.availability_windows, v_source.availability_windows),
    availability_notes = COALESCE(NULLIF(t.availability_notes, ''), v_source.availability_notes),
    purchased_hours = COALESCE(t.purchased_hours, 0) + COALESCE(v_source.purchased_hours, 0),
    intake_submitted = COALESCE(t.intake_submitted, false) OR COALESCE(v_source.intake_submitted, false),
    approval_status = CASE WHEN v_src_status = 'approved' OR v_tgt_status = 'approved' THEN 'approved' ELSE t.approval_status END,
    approved = CASE WHEN v_src_status = 'approved' OR v_tgt_status = 'approved' THEN true ELSE t.approved END,
    approved_at = CASE WHEN v_tgt_status <> 'approved' AND v_src_status = 'approved' THEN COALESCE(t.approved_at, v_source.approved_at, now()) ELSE t.approved_at END,
    approved_by = CASE WHEN v_tgt_status <> 'approved' AND v_src_status = 'approved' THEN COALESCE(t.approved_by, v_source.approved_by, v_actor) ELSE t.approved_by END,
    updated_at = now()
  WHERE t.id = p_target_user_id;

  UPDATE public.profiles
     SET hours_completed = public.compute_completed_hours(p_target_user_id),
         hours_remaining = public.compute_remaining_hours(p_target_user_id),
         updated_at = now()
   WHERE id = p_target_user_id;

  UPDATE public.profiles
     SET purchased_hours = 0, hours_completed = 0, hours_remaining = 0,
         approval_status = 'merged', updated_at = now()
   WHERE id = p_source_user_id;

  INSERT INTO public.account_links (canonical_user_id, alias_user_id, created_by, relationship, previous_status)
  VALUES (p_target_user_id, p_source_user_id, v_actor, v_rel, v_src_status);

  INSERT INTO public.account_merge_log (source_user_id, target_user_id, performed_by, moved, action, relationship)
  VALUES (p_source_user_id, p_target_user_id, v_actor, v_moved, 'merge', v_rel);

  RETURN jsonb_build_object('ok', true, 'moved', v_moved, 'target_status',
    (SELECT approval_status FROM public.profiles WHERE id = p_target_user_id));
END;
$function$;

REVOKE ALL ON FUNCTION public.merge_student_account(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_student_account(uuid, uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.merge_preview(p_source_user_id uuid, p_target_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s uuid := p_source_user_id;
  t uuid := p_target_user_id;
  v_counts jsonb;
  v_warn jsonb := '[]'::jsonb;
  v_s public.profiles;
  v_t public.profiles;
  v_s_sessions int; v_t_sessions int;
  v_aliases int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can preview merges';
  END IF;
  SELECT * INTO v_s FROM public.profiles WHERE id = s;
  SELECT * INTO v_t FROM public.profiles WHERE id = t;
  IF v_s.id IS NULL OR v_t.id IS NULL THEN RAISE EXCEPTION 'Both accounts must exist'; END IF;

  SELECT count(*) INTO v_s_sessions FROM public.sessions WHERE student_id = s;
  SELECT count(*) INTO v_t_sessions FROM public.sessions WHERE student_id = t;
  SELECT count(*) INTO v_aliases FROM public.account_links WHERE canonical_user_id = s;

  v_counts := jsonb_build_object(
    'sessions', v_s_sessions,
    'report_cards', (SELECT count(*) FROM public.report_cards WHERE student_id = s),
    'report_card_ratings', (SELECT count(*) FROM public.report_card_ratings WHERE student_id = s),
    'road_test_results', (SELECT count(*) FROM public.road_test_results WHERE student_id = s),
    'session_tracking', (SELECT count(*) FROM public.session_tracking WHERE student_id = s),
    'session_hour_deductions', (SELECT count(*) FROM public.session_hour_deductions WHERE student_id = s),
    'schedule_proposals', (SELECT count(*) FROM public.schedule_proposals WHERE student_id = s),
    'proposal_edit_requests', (SELECT count(*) FROM public.proposal_edit_requests WHERE student_id = s),
    'instructor_students', (SELECT count(*) FROM public.instructor_students WHERE student_id = s),
    'permits', (SELECT count(*) FROM public.permits WHERE user_id = s),
    'permit_documents', (SELECT count(*) FROM public.permit_documents WHERE student_id = s),
    'intake_form_revisions', (SELECT count(*) FROM public.intake_form_revisions WHERE user_id = s),
    'approved_intakes', (SELECT count(*) FROM public.approved_intakes WHERE user_id = s),
    'intake_drafts', (SELECT count(*) FROM public.intake_drafts WHERE user_id = s),
    'notifications', (SELECT count(*) FROM public.notifications WHERE user_id = s),
    'map_pins', (SELECT count(*) FROM public.map_pins WHERE student_id = s),
    'student_schedule_shares', (SELECT count(*) FROM public.student_schedule_shares WHERE student_id = s),
    'internal_notes', (SELECT count(*) FROM public.internal_notes WHERE target_user_id = s),
    'report_card_feedback', (SELECT count(*) FROM public.report_card_feedback WHERE sender_user_id = s),
    'leads', (SELECT count(*) FROM public.leads WHERE converted_student_id = s),
    'linked_logins', v_aliases
  );

  IF v_s_sessions > 0 AND v_t_sessions > 0 THEN
    v_warn := v_warn || to_jsonb('Both accounts have lessons; they will be combined on the main account.'::text);
  END IF;
  IF COALESCE(v_s.intake_submitted,false) AND COALESCE(v_t.intake_submitted,false) THEN
    v_warn := v_warn || to_jsonb('Both accounts submitted an intake form; the main account''s details are kept and only blanks are filled.'::text);
  END IF;
  IF COALESCE(v_s.purchased_hours,0) > 0 AND COALESCE(v_t.purchased_hours,0) > 0 THEN
    v_warn := v_warn || to_jsonb('Both accounts have purchased hours; they will be added together.'::text);
  END IF;
  IF v_aliases > 0 THEN
    v_warn := v_warn || to_jsonb(format('The other account already has %s linked login(s); they will move to the main account.', v_aliases));
  END IF;
  IF COALESCE(v_s.approval_status,'pending') <> COALESCE(v_t.approval_status,'pending') THEN
    v_warn := v_warn || to_jsonb('The two accounts have different statuses; the main account will end up approved.'::text);
  END IF;

  RETURN jsonb_build_object(
    'source', jsonb_build_object('id', v_s.id, 'name', COALESCE(NULLIF(trim(concat_ws(' ', v_s.first_name, v_s.last_name)),''), v_s.full_name),
      'email', v_s.email, 'status', v_s.approval_status,
      'role', (SELECT role FROM public.user_roles WHERE user_id = s LIMIT 1),
      'purchased_hours', v_s.purchased_hours, 'hours_completed', v_s.hours_completed, 'hours_remaining', v_s.hours_remaining),
    'target', jsonb_build_object('id', v_t.id, 'name', COALESCE(NULLIF(trim(concat_ws(' ', v_t.first_name, v_t.last_name)),''), v_t.full_name),
      'email', v_t.email, 'status', v_t.approval_status,
      'role', (SELECT role FROM public.user_roles WHERE user_id = t LIMIT 1),
      'purchased_hours', v_t.purchased_hours, 'hours_completed', v_t.hours_completed, 'hours_remaining', v_t.hours_remaining),
    'counts', v_counts,
    'warnings', v_warn
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.merge_preview(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_preview(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_account_family()
 RETURNS TABLE(user_id uuid, full_name text, email text, relationship text, is_primary boolean, is_me boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH me AS (SELECT auth.uid() AS uid, public.canonical_user_id(auth.uid()) AS main),
  members AS (
    SELECT me.main AS uid, NULL::text AS rel, true AS prim FROM me WHERE me.uid IS NOT NULL
    UNION ALL
    SELECT al.alias_user_id, al.relationship, false
      FROM public.account_links al, me WHERE al.canonical_user_id = me.main
  )
  SELECT m.uid,
         COALESCE(NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''), p.full_name),
         COALESCE(p.email, u.email::text),
         m.rel,
         m.prim,
         m.uid = (SELECT uid FROM me)
    FROM members m
    LEFT JOIN public.profiles p ON p.id = m.uid
    LEFT JOIN auth.users u ON u.id = m.uid
   ORDER BY m.prim DESC, 2;
$function$;

REVOKE ALL ON FUNCTION public.get_account_family() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_account_family() TO authenticated, service_role;