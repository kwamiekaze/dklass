-- Instructors could open a student's permit only by luck: the permits bucket and the permit tables were readable by admin/staff and by the student,
-- never by the student's own instructor. Give an instructor read access to the permit files and records of the students they teach.

-- Is the signed-in user an instructor of this student (assigned to them, or teaching them a session)?
CREATE OR REPLACE FUNCTION public.instructor_teaches_student(_instructor_id uuid, _student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _instructor_id IS NOT NULL AND _student_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.instructor_students s WHERE s.instructor_id = _instructor_id AND s.student_id = _student_id)
    OR EXISTS (SELECT 1 FROM public.sessions x WHERE x.instructor_id = _instructor_id AND x.student_id = _student_id)
  )
$$;

-- May this instructor read this object of the permits bucket? Its first folder is the student's id, or a permit record of one of their students points at it.
CREATE OR REPLACE FUNCTION public.instructor_can_read_permit_object(_instructor_id uuid, _name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _instructor_id IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.instructor_students s
      WHERE s.instructor_id = _instructor_id AND s.student_id::text = split_part(_name, '/', 1)
    )
    OR EXISTS (
      SELECT 1 FROM public.sessions x
      WHERE x.instructor_id = _instructor_id AND x.student_id::text = split_part(_name, '/', 1)
    )
    OR EXISTS (
      SELECT 1 FROM public.permit_documents d
      WHERE d.file_path = _name AND public.instructor_teaches_student(_instructor_id, d.student_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.permits p
      WHERE p.file_path = _name AND public.instructor_teaches_student(_instructor_id, p.user_id)
    )
  )
$$;

DROP POLICY IF EXISTS "Instructors read their students permit files" ON storage.objects;
CREATE POLICY "Instructors read their students permit files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'permits'
  AND public.has_role(auth.uid(), 'instructor')
  AND public.instructor_can_read_permit_object(auth.uid(), name)
);

DROP POLICY IF EXISTS "Instructors read their students permit documents" ON public.permit_documents;
CREATE POLICY "Instructors read their students permit documents"
ON public.permit_documents
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'instructor')
  AND public.instructor_teaches_student(auth.uid(), student_id)
);

DROP POLICY IF EXISTS "Instructors read their students permits" ON public.permits;
CREATE POLICY "Instructors read their students permits"
ON public.permits
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'instructor')
  AND public.instructor_teaches_student(auth.uid(), user_id)
);
