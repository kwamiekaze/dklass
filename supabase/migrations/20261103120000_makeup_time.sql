-- Makeup time: hours a student still has to make up (missed / cut-short lessons). Admins, staff and the student's instructors add it; the student and staff track it.
CREATE TABLE IF NOT EXISTS public.makeup_time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  hours numeric(5,2) NOT NULL CHECK (hours > 0 AND hours <= 100),
  reason text,
  status text NOT NULL DEFAULT 'owed' CHECK (status IN ('owed', 'made_up')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  made_up_at timestamptz,
  made_up_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_makeup_time_student ON public.makeup_time_entries(student_id, created_at DESC);

ALTER TABLE public.makeup_time_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students read own makeup time" ON public.makeup_time_entries;
CREATE POLICY "Students read own makeup time" ON public.makeup_time_entries
FOR SELECT TO authenticated USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Staff and admin manage makeup time" ON public.makeup_time_entries;
CREATE POLICY "Staff and admin manage makeup time" ON public.makeup_time_entries
FOR ALL TO authenticated
USING (public.is_staff_or_admin(auth.uid()))
WITH CHECK (public.is_staff_or_admin(auth.uid()));

DROP POLICY IF EXISTS "Instructors read their students makeup time" ON public.makeup_time_entries;
CREATE POLICY "Instructors read their students makeup time" ON public.makeup_time_entries
FOR SELECT TO authenticated USING (public.instructor_teaches_student(auth.uid(), student_id));

DROP POLICY IF EXISTS "Instructors add makeup time" ON public.makeup_time_entries;
CREATE POLICY "Instructors add makeup time" ON public.makeup_time_entries
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'instructor') AND created_by = auth.uid() AND public.instructor_teaches_student(auth.uid(), student_id));

DROP POLICY IF EXISTS "Instructors update their students makeup time" ON public.makeup_time_entries;
CREATE POLICY "Instructors update their students makeup time" ON public.makeup_time_entries
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'instructor') AND public.instructor_teaches_student(auth.uid(), student_id))
WITH CHECK (public.has_role(auth.uid(), 'instructor') AND public.instructor_teaches_student(auth.uid(), student_id));

DROP POLICY IF EXISTS "Instructors delete makeup time they added" ON public.makeup_time_entries;
CREATE POLICY "Instructors delete makeup time they added" ON public.makeup_time_entries
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'instructor') AND created_by = auth.uid() AND public.instructor_teaches_student(auth.uid(), student_id));
