DO $$
DECLARE def text;
BEGIN
  def := pg_get_functiondef('public.merge_student_account(uuid,uuid,text)'::regprocedure);
  def := replace(def,
    'UPDATE public.permit_documents SET student_id = p_target_user_id WHERE student_id = p_source_user_id;',
    'UPDATE public.permit_documents pd SET student_id = p_target_user_id WHERE pd.student_id = p_source_user_id AND NOT EXISTS (SELECT 1 FROM public.permit_documents x WHERE x.student_id = p_target_user_id AND x.source IS NOT DISTINCT FROM pd.source);');
  def := replace(def,
    'UPDATE public.student_schedule_shares SET student_id = p_target_user_id WHERE student_id = p_source_user_id;',
    'UPDATE public.student_schedule_shares ss SET student_id = p_target_user_id WHERE ss.student_id = p_source_user_id AND NOT EXISTS (SELECT 1 FROM public.student_schedule_shares x WHERE x.student_id = p_target_user_id);');
  IF position('x.source IS NOT DISTINCT FROM pd.source' in def) = 0 OR position('FROM public.student_schedule_shares x' in def) = 0 THEN
    RAISE EXCEPTION 'merge function patch did not apply';
  END IF;
  EXECUTE def;
END $$;