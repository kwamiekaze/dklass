-- An uploaded permit or licence must never read as "missing". Files are recorded in permit_documents, but several screens (approvals badge, exports, the
-- older student views) still look at the link kept on the profile, which only some upload paths filled in. Keep the profile link in step with the
-- student's current document, and fill it in for everyone who already has a file but no link.

CREATE OR REPLACE FUNCTION public.sync_profile_permit_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_current = true AND COALESCE(NEW.file_path, '') <> '' THEN
    UPDATE public.profiles
       SET permit_file_url = NEW.file_path
     WHERE id = NEW.student_id
       AND permit_file_url IS DISTINCT FROM NEW.file_path;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_permit_link ON public.permit_documents;
CREATE TRIGGER sync_profile_permit_link
  AFTER INSERT OR UPDATE OF is_current, file_path ON public.permit_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_permit_link();

-- Backfill: anyone with a current document but no (or an empty) profile link gets the link to their newest current document.
UPDATE public.profiles p
   SET permit_file_url = d.file_path
  FROM (
    SELECT DISTINCT ON (student_id) student_id, file_path
      FROM public.permit_documents
     WHERE is_current = true AND COALESCE(file_path, '') <> ''
     ORDER BY student_id, uploaded_at DESC
  ) d
 WHERE p.id = d.student_id
   AND COALESCE(p.permit_file_url, '') = '';
