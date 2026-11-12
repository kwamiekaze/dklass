import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { profileFirstName } from "@/lib/nameUtils";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { ProtectedRoute } from "@/components/portal/ProtectedRoute";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Filter, User, Ban, Trash2 } from "lucide-react";
import { SessionTypeBadge } from "@/components/portal/SessionTypeBadge";
import { format } from "date-fns";
import { Session, Profile } from "@/types/portal";
import { toast } from "sonner";
import { getDisplayName } from "@/lib/profileUtils";
import { SessionCalendar } from "@/components/portal/SessionCalendar";
import { StudentPickerModal } from "@/components/portal/StudentPickerModal";
import type { CalendarEvent } from "@/components/portal/FullCalendarView";
import { StudentFullScheduleSection } from "@/components/portal/StudentFullScheduleSection";
import { usePortalAuth } from "@/hooks/usePortalAuth";
import { DdsLocationPicker } from "@/components/portal/DdsLocationPicker";

export default function AdminSchedule() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'staff']}>
      <PortalLayout>
        <AdminScheduleContent />
      </PortalLayout>
    </ProtectedRoute>
  );
}

function AdminScheduleContent() {
  const { user, role } = usePortalAuth();
  const isAdmin = role === 'admin';
  const [sessions, setSessions] = useState<Session[]>([]);
  const [students, setStudents] = useState<Profile[]>([]);
  const [instructors, setInstructors] = useState<Profile[]>([]);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<any | null>(null);

  // Conflict override state (admin only)
  const [sessionConflictMsg, setSessionConflictMsg] = useState<string | null>(null);
  const [sessionOverride, setSessionOverride] = useState(false);
  const [blockConflictMsg, setBlockConflictMsg] = useState<string | null>(null);
  const [blockOverride, setBlockOverride] = useState(false);

  // Filters
  const [filterInstructor, setFilterInstructor] = useState<string>("all");
  const [filterStudent, setFilterStudent] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    student_id: "",
    instructor_id: "",
    date: "",
    start_time: "",
    pickup_time: "",
    duration_minutes: "120",
    session_type: "driving",
    pickup_address: "",
    dropoff_address: "",
    note_for_student: "",
    note_for_instructor: "",
    dds_location: "",
    is_pending: false,
  });

  // Block form state
  const [blockForm, setBlockForm] = useState({
    title: "Unavailable",
    notes: "",
    date: "",
    start_time: "",
    duration_minutes: "60",
    instructor_id: "all",
  });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    const { data: sessionsData } = await supabase
      .from('sessions')
      .select('*, student:profiles!sessions_student_id_fkey(*), instructor:profiles!sessions_instructor_id_fkey(*)')
      .order('starts_at', { ascending: true });
    setSessions((sessionsData || []) as Session[]);

    const { data: studentRoles } = await supabase.from('user_roles').select('user_id').eq('role', 'student');
    if (studentRoles && studentRoles.length > 0) {
      const { data: studentProfiles } = await supabase.from('profiles')
        .select('id, first_name, last_name, full_name, email, phone, approval_status, approved_at, hours_remaining, last_sign_in_at, pickup_address, dropoff_address, created_at, updated_at, approved, intake_submitted, public_id, permit_number, permit_issue_date, permit_expiration_date, guardian_name, guardian_phone, guardian_email, permit_file_url')
        .in('id', studentRoles.map(r => r.user_id))
        .eq('approval_status', 'approved');
      setStudents((studentProfiles || []) as Profile[]);
    } else { setStudents([]); }

    const { data: instructorRoles } = await supabase.from('user_roles').select('user_id').eq('role', 'instructor');
    if (instructorRoles && instructorRoles.length > 0) {
      const { data: instructorProfiles } = await supabase.from('profiles').select('*').in('id', instructorRoles.map(r => r.user_id)).eq('approval_status', 'approved');
      setInstructors((instructorProfiles || []) as Profile[]);
    } else { setInstructors([]); }

    const { data: blockData } = await (supabase as any)
      .from('schedule_blocks')
      .select('*')
      .order('starts_at', { ascending: true });
    setBlocks(blockData || []);

    setLoading(false);
  };

  // When a student is selected, prefill their pickup/dropoff
  const handleStudentSelect = (student: Profile) => {
    setFormData(f => ({
      ...f,
      student_id: student.id,
      pickup_address: student.pickup_address || "",
      dropoff_address: student.dropoff_address || "",
    }));
  };

  const selectedStudent = useMemo(
    () => students.find(s => s.id === formData.student_id),
    [students, formData.student_id]
  );

  const handleCreateSession = async () => {
    if (!formData.student_id || !formData.instructor_id || !formData.date || !formData.start_time) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (formData.session_type === 'testing' && !formData.dds_location) {
      toast.error("Please select a DDS testing location for the road test");
      return;
    }
    const startsAt = new Date(`${formData.date}T${formData.start_time}`);
    const durationMinutes = parseInt(formData.duration_minutes);
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60000);

    // Pre-check for conflicts (UX; DB trigger is the hard rule)
    const { data: conflicts } = await supabase.rpc('check_schedule_conflicts', {
      _instructor_id: formData.instructor_id,
      _student_id: formData.student_id,
      _starts_at: startsAt.toISOString(),
      _ends_at: endsAt.toISOString(),
    });
    if (conflicts && conflicts.length > 0) {
      const c: any = conflicts[0];
      const msg = `Conflict: ${c.label} from ${format(new Date(c.starts_at), 'MMM d h:mm a')} to ${format(new Date(c.ends_at), 'h:mm a')}`;
      setSessionConflictMsg(msg);
      if (!(isAdmin && sessionOverride)) {
        if (!isAdmin) toast.error(msg);
        return;
      }
    } else {
      setSessionConflictMsg(null);
    }

    const useOverride = isAdmin && sessionOverride && !!sessionConflictMsg;
    const rpcName = formData.is_pending ? 'create_pending_session_admin' : 'create_session_admin';
    const rpcArgs: Record<string, any> = {
      _student_id: formData.student_id,
      _instructor_id: formData.instructor_id,
      _starts_at: startsAt.toISOString(),
      _duration_minutes: durationMinutes,
    };
    if (useOverride) rpcArgs._override_conflicts = true;
    const { data: newSession, error } = await supabase.rpc(rpcName as any, rpcArgs as any);

    if (error) {
      toast.error(`Failed to create session: ${error.message}`);
      return;
    }

    // Update session type, addresses, and notes if needed
    const updates: Record<string, any> = {};
    if (formData.session_type !== 'driving') updates.session_type = formData.session_type;
    if (formData.pickup_address.trim()) updates.pickup_address = formData.pickup_address.trim();
    if (formData.dropoff_address.trim()) updates.dropoff_address = formData.dropoff_address.trim();
    if (formData.note_for_student.trim()) updates.note_for_student = formData.note_for_student.trim();
    if (formData.note_for_instructor.trim()) updates.note_for_instructor = formData.note_for_instructor.trim();
    if (formData.session_type === 'testing' && formData.dds_location) {
      updates.dds_location = formData.dds_location;
    }
    if (formData.session_type === 'testing' && formData.pickup_time) {
      const pickupIso = new Date(`${formData.date}T${formData.pickup_time}`).toISOString();
      updates.pickup_time = pickupIso;
    }

    if (Object.keys(updates).length > 0 && (newSession as any)?.id) {
      await supabase.from('sessions').update(updates as any).eq('id', (newSession as any).id);
    }

    // Fire road test scheduling emails only for confirmed (non-pending) road tests
    if (!formData.is_pending && formData.session_type === 'testing' && (newSession as any)?.id && formData.dds_location) {
      supabase.functions.invoke('send-road-test-scheduling-emails', {
        body: { sessionId: (newSession as any).id },
      }).then(({ error: e }) => {
        if (e) toast.error(`Road test emails failed: ${e.message}`);
        else toast.success("Road test scheduling emails sent");
      });
    }

    // Fire pending-slot notification email to the student when a pending slot is created
    if (formData.is_pending && (newSession as any)?.id) {
      const { data: studentProfile } = await supabase
        .from('profiles')
        .select('email, full_name, first_name')
        .eq('id', formData.student_id)
        .maybeSingle();
      const recipientEmail = (studentProfile as any)?.email;
      if (recipientEmail) {
        const recipientName = profileFirstName(studentProfile as any) || 'there';
        const dateLabel = format(startsAt, 'EEEE, MMMM d, yyyy');
        const timeLabel = format(startsAt, 'h:mm a');
        const pickupTimeLabel = formData.session_type === 'testing' && formData.pickup_time
          ? format(new Date(`${formData.date}T${formData.pickup_time}`), 'h:mm a')
          : undefined;
        supabase.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'pending-slot-notice',
            recipientEmail,
            idempotencyKey: `pending-notice-${(newSession as any).id}`,
            templateData: {
              recipientName,
              sessionType: formData.session_type,
              dateLabel,
              timeLabel,
              pickupTimeLabel,
              locationLabel: formData.session_type === 'testing' ? (formData.dds_location || undefined) : undefined,
              paymentUrl: 'https://drivingklass.com/#packages',
            },
          },
        }).then(({ error: e }) => {
          if (e) toast.error(`Pending email failed: ${e.message}`);
        });
      }
    }


    toast.success(formData.is_pending ? "Pending slot created" : "Session created successfully");
    setDialogOpen(false);
    resetForm();
    fetchData();
  };

  const resetForm = () => {
    setFormData({ student_id: "", instructor_id: "", date: "", start_time: "", pickup_time: "", duration_minutes: "120", session_type: "driving", pickup_address: "", dropoff_address: "", note_for_student: "", note_for_instructor: "", dds_location: "", is_pending: false });
    setSessionConflictMsg(null);
    setSessionOverride(false);
  };

  const openCreateFromSlot = (date: Date) => {
    setFormData(f => ({
      ...f,
      date: format(date, 'yyyy-MM-dd'),
      start_time: format(date, 'HH:mm'),
    }));
    setEditingSession(null);
    setDialogOpen(true);
  };

  // Apply filters
  const filteredSessions = sessions.filter(s => {
    if (filterInstructor !== 'all' && s.instructor_id !== filterInstructor) return false;
    if (filterStudent !== 'all' && s.student_id !== filterStudent) return false;
    if (filterType !== 'all' && s.session_type !== filterType) return false;
    if (filterStatus !== 'all' && s.status !== filterStatus) return false;
    return true;
  });

  const activeFilterCount = [filterInstructor, filterStudent, filterType, filterStatus].filter(f => f !== 'all').length;

  // Filter blocks by instructor filter and convert to CalendarEvents
  const filteredBlocks = blocks.filter(b => {
    if (filterInstructor !== 'all' && b.instructor_id && b.instructor_id !== filterInstructor) return false;
    return true;
  });

  const blockEvents: CalendarEvent[] = filteredBlocks.map(b => {
    const inst = instructors.find(i => i.id === b.instructor_id);
    const who = b.instructor_id ? getDisplayName(inst, 'Instructor') : 'All instructors';
    const overrideTag = b.conflict_override ? ' • ⚠ OVERRIDE' : '';
    return {
      id: `block-${b.id}`,
      title: (b.conflict_override ? '⚠ ' : '') + (b.title || 'Unavailable'),
      subtitle: `🚫 ${who}${overrideTag}`,
      start: b.starts_at,
      end: b.ends_at,
      color: 'bg-muted text-muted-foreground border-l-4 border-muted-foreground/60',
      dotColor: 'bg-muted-foreground',
      meta: { type: 'block', block: b },
    };
  });

  const handleBlockEventClick = (event: CalendarEvent) => {
    const b = event.meta?.block;
    if (!b) return;
    const start = new Date(b.starts_at);
    const end = new Date(b.ends_at);
    const duration = Math.round((end.getTime() - start.getTime()) / 60000);
    setEditingBlock(b);
    setBlockForm({
      title: b.title || 'Unavailable',
      notes: b.notes || '',
      date: format(start, 'yyyy-MM-dd'),
      start_time: format(start, 'HH:mm'),
      duration_minutes: String(duration),
      instructor_id: b.instructor_id || 'all',
    });
    setBlockDialogOpen(true);
  };

  const resetBlockForm = () => {
    setBlockForm({ title: "Unavailable", notes: "", date: "", start_time: "", duration_minutes: "60", instructor_id: "all" });
    setEditingBlock(null);
    setBlockConflictMsg(null);
    setBlockOverride(false);
  };

  const handleSaveBlock = async () => {
    if (!blockForm.date || !blockForm.start_time) {
      toast.error("Please pick a date and start time");
      return;
    }
    const startsAt = new Date(`${blockForm.date}T${blockForm.start_time}`);
    const endsAt = new Date(startsAt.getTime() + parseInt(blockForm.duration_minutes) * 60000);
    const targetInstructor = blockForm.instructor_id === 'all' ? null : blockForm.instructor_id;
    const payload: any = {
      title: blockForm.title.trim() || 'Unavailable',
      notes: blockForm.notes.trim() || null,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      instructor_id: targetInstructor,
    };

    // Pre-check for conflicts (UX; DB trigger is the hard rule)
    const { data: conflicts } = await supabase.rpc('check_schedule_conflicts', {
      _instructor_id: targetInstructor,
      _student_id: null,
      _starts_at: startsAt.toISOString(),
      _ends_at: endsAt.toISOString(),
      _exclude_block_id: editingBlock?.id ?? null,
    });
    let hasConflict = false;
    if (conflicts && conflicts.length > 0) {
      const c: any = conflicts[0];
      const msg = `Conflict: ${c.label} from ${format(new Date(c.starts_at), 'MMM d h:mm a')} to ${format(new Date(c.ends_at), 'h:mm a')}`;
      setBlockConflictMsg(msg);
      hasConflict = true;
      if (!(isAdmin && blockOverride)) {
        if (!isAdmin) toast.error(msg);
        return;
      }
    } else {
      setBlockConflictMsg(null);
    }

    if (isAdmin && blockOverride && hasConflict) {
      payload.conflict_override = true;
    }

    if (editingBlock) {
      const { error } = await (supabase as any).from('schedule_blocks').update(payload).eq('id', editingBlock.id);
      if (error) { toast.error(`Failed to update block: ${error.message}`); return; }
      toast.success("Unavailable block updated");
    } else {
      const { error } = await (supabase as any).from('schedule_blocks').insert(payload);
      if (error) { toast.error(`Failed to create block: ${error.message}`); return; }
      toast.success("Unavailable block created");
    }
    setBlockDialogOpen(false);
    resetBlockForm();
    fetchData();
  };

  const handleDeleteBlock = async () => {
    if (!editingBlock) return;
    const { error } = await (supabase as any).from('schedule_blocks').delete().eq('id', editingBlock.id);
    if (error) { toast.error(`Failed to delete: ${error.message}`); return; }
    toast.success("Unavailable block removed");
    setBlockDialogOpen(false);
    resetBlockForm();
    fetchData();
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold theme-heading">Schedule Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {sessions.length} total sessions • {sessions.filter(s => s.status === 'scheduled').length} scheduled
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={showFilters ? "secondary" : "outline"}
            size="sm"
            className="gap-1.5 min-h-[40px]"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="h-5 w-5 p-0 flex items-center justify-center text-[10px]">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
          <Button
            variant="outline"
            className="gap-2 min-h-[40px]"
            onClick={() => { resetBlockForm(); setBlockDialogOpen(true); }}
          >
            <Ban className="h-4 w-4" />
            Block Time
          </Button>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditingSession(null); resetForm(); } }}>
            <DialogTrigger asChild>
              <Button className="gap-2 min-h-[40px]">
                <Plus className="h-4 w-4" />
                New Session
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[min(92vw,520px)] max-w-[520px] max-h-[85vh] overflow-y-auto p-4 sm:p-6">
              <DialogHeader>
                <DialogTitle>{editingSession ? 'Edit Session' : 'Create New Session'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Student Picker */}
                <div className="space-y-2">
                  <Label className="text-sm">Student</Label>
                  <button
                    type="button"
                    onClick={() => setStudentPickerOpen(true)}
                    className="w-full flex items-center gap-3 min-h-[44px] px-3 py-2 rounded-md border border-input bg-background text-sm hover:bg-accent/30 transition-colors text-left"
                  >
                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                    {selectedStudent ? (
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{getDisplayName(selectedStudent, 'Unknown')}</span>
                        {selectedStudent.email && (
                          <span className="text-muted-foreground ml-2 text-xs">{selectedStudent.email}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Select student...</span>
                    )}
                  </button>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">Instructor</Label>
                  <Select value={formData.instructor_id} onValueChange={v => setFormData(f => ({ ...f, instructor_id: v }))}>
                    <SelectTrigger className="min-h-[44px]"><SelectValue placeholder="Select instructor" /></SelectTrigger>
                    <SelectContent className="bg-popover border z-50">
                      {instructors.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">No approved instructors</div>
                      ) : instructors.map(i => (
                        <SelectItem key={i.id} value={i.id}>{getDisplayName(i, 'Unknown')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-sm">Date</Label>
                    <Input type="date" value={formData.date} onChange={e => setFormData(f => ({ ...f, date: e.target.value }))} className="min-h-[44px]" />
                  </div>
                  {formData.session_type !== 'testing' ? (
                    <div className="space-y-2">
                      <Label className="text-sm">Start Time</Label>
                      <Input
                        type="time"
                        step={60}
                        value={formData.start_time}
                        onChange={e => setFormData(f => ({ ...f, start_time: e.target.value }))}
                        className="min-h-[44px]"
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label className="text-sm">Session Type</Label>
                      <Select value={formData.session_type} onValueChange={v => setFormData(f => ({ ...f, session_type: v }))}>
                        <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-popover border z-50">
                          <SelectItem value="driving">Driving Session</SelectItem>
                          <SelectItem value="testing">Road Test</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {formData.session_type === 'testing' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-sm">Pickup Time</Label>
                      <Input
                        type="time"
                        step={60}
                        value={formData.pickup_time}
                        onChange={e => setFormData(f => ({ ...f, pickup_time: e.target.value }))}
                        className="min-h-[44px]"
                      />
                      <p className="text-[11px] text-muted-foreground">When the instructor picks the student up.</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Road Test Start Time</Label>
                      <Input
                        type="time"
                        step={60}
                        value={formData.start_time}
                        onChange={e => setFormData(f => ({ ...f, start_time: e.target.value }))}
                        className="min-h-[44px]"
                      />
                      <p className="text-[11px] text-muted-foreground">Official DDS road test time.</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-sm">Duration</Label>
                    <Select value={formData.duration_minutes} onValueChange={v => setFormData(f => ({ ...f, duration_minutes: v }))}>
                      <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-popover border z-50">
                        <SelectItem value="30">30 min</SelectItem>
                        <SelectItem value="60">1 hour</SelectItem>
                        <SelectItem value="90">1.5 hours</SelectItem>
                        <SelectItem value="120">2 hours</SelectItem>
                        <SelectItem value="180">3 hours</SelectItem>
                        <SelectItem value="240">4 hours</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {formData.session_type !== 'testing' ? (
                    <div className="space-y-2">
                      <Label className="text-sm">Session Type</Label>
                      <Select value={formData.session_type} onValueChange={v => setFormData(f => ({ ...f, session_type: v }))}>
                        <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-popover border z-50">
                          <SelectItem value="driving">Driving Session</SelectItem>
                          <SelectItem value="testing">Road Test</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="space-y-2 sm:col-span-1" />
                  )}
                </div>

                {formData.session_type === 'testing' && (
                  <div className="space-y-2">
                    <Label className="text-sm">
                      DDS Testing Location <span className="text-destructive">*</span>
                    </Label>
                    <DdsLocationPicker
                      value={formData.dds_location}
                      onChange={(v) => setFormData(f => ({ ...f, dds_location: v }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      This location is included in the student's DDS 2 GO scheduling instructions.
                    </p>
                  </div>
                )}


                {/* Pickup / Drop-off */}
                <div className="space-y-2">
                  <Label className="text-sm">Pickup Address</Label>
                  <Input
                    placeholder="Enter pickup address"
                    value={formData.pickup_address}
                    onChange={e => setFormData(f => ({ ...f, pickup_address: e.target.value }))}
                    className="min-h-[44px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Drop-Off Address</Label>
                  <Input
                    placeholder="Enter drop-off address"
                    value={formData.dropoff_address}
                    onChange={e => setFormData(f => ({ ...f, dropoff_address: e.target.value }))}
                    className="min-h-[44px]"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">Note for Student & Parent</Label>
                  <textarea
                    placeholder="Visible to the student and their parent/guardian"
                    value={formData.note_for_student}
                    onChange={e => setFormData(f => ({ ...f, note_for_student: e.target.value }))}
                    className="w-full min-h-[72px] rounded-md border bg-background p-2 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Note for Instructor</Label>
                  <textarea
                    placeholder="Visible only to the assigned instructor"
                    value={formData.note_for_instructor}
                    onChange={e => setFormData(f => ({ ...f, note_for_instructor: e.target.value }))}
                    className="w-full min-h-[72px] rounded-md border bg-background p-2 text-sm"
                  />
                </div>

                <label className="flex items-start gap-2 p-3 rounded-md border border-gold/40 bg-gold/5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_pending}
                    onChange={e => setFormData(f => ({ ...f, is_pending: e.target.checked }))}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span className="text-sm">
                    <span className="font-medium">Save as pending slot</span>
                    <span className="block text-xs text-muted-foreground">
                      Hold this slot for a student who hasn't paid yet. Approve later to confirm.
                    </span>
                  </span>
                </label>

                {sessionConflictMsg && (
                  <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm space-y-2">
                    <div className="font-medium text-destructive">Schedule conflict detected</div>
                    <div className="text-xs text-destructive/90">{sessionConflictMsg}</div>
                    {isAdmin && (
                      <label className="flex items-start gap-2 mt-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={sessionOverride}
                          onChange={e => setSessionOverride(e.target.checked)}
                          className="mt-0.5 h-4 w-4 accent-primary"
                        />
                        <span className="text-xs">
                          <span className="font-medium">Schedule anyway (override conflict)</span>
                          <span className="block text-muted-foreground">
                            This will double-book the selected time. Use only when you're sure.
                          </span>
                        </span>
                      </label>
                    )}
                  </div>
                )}

                <Button
                  className="w-full min-h-[44px]"
                  onClick={handleCreateSession}
                  disabled={!!sessionConflictMsg && !(isAdmin && sessionOverride)}
                >
                  {formData.is_pending ? 'Create Pending Slot' : 'Create Session'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Student Picker Modal */}
      <StudentPickerModal
        open={studentPickerOpen}
        onOpenChange={setStudentPickerOpen}
        students={students}
        selectedId={formData.student_id}
        onSelect={handleStudentSelect}
      />

      {/* Filters Panel */}
      {showFilters && (
        <Card className="portal-card">
          <CardContent className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Instructor</Label>
                <Select value={filterInstructor} onValueChange={setFilterInstructor}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-popover border z-50">
                    <SelectItem value="all">All Instructors</SelectItem>
                    {instructors.map(i => <SelectItem key={i.id} value={i.id}>{getDisplayName(i, 'Unknown')}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Student</Label>
                <Select value={filterStudent} onValueChange={setFilterStudent}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-popover border z-50">
                    <SelectItem value="all">All Students</SelectItem>
                    {students.map(s => <SelectItem key={s.id} value={s.id}>{getDisplayName(s, 'Unknown')}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Type</Label>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-popover border z-50">
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="driving">Driving</SelectItem>
                    <SelectItem value="testing">Road Test</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-popover border z-50">
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" className="mt-2 text-xs h-7" onClick={() => { setFilterInstructor('all'); setFilterStudent('all'); setFilterType('all'); setFilterStatus('all'); }}>
                Clear All Filters
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Calendar */}
      <SessionCalendar
        sessions={filteredSessions}
        userRole="admin"
        onSessionUpdate={fetchData}
        defaultView="month"
        onSlotClick={openCreateFromSlot}
        extraEvents={blockEvents}
        onExtraEventClick={handleBlockEventClick}
      />

      <StudentFullScheduleSection students={students} currentUserId={user?.id} />

      {/* Unavailable Block Dialog */}
      <Dialog open={blockDialogOpen} onOpenChange={(open) => { setBlockDialogOpen(open); if (!open) resetBlockForm(); }}>
        <DialogContent className="w-[min(92vw,520px)] max-w-[520px] max-h-[85vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5" />
              {editingBlock ? 'Edit Unavailable Block' : 'Block Time (Unavailable)'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">Title</Label>
              <Input
                placeholder="e.g. Personal, Day Off, Doctor's Appt"
                value={blockForm.title}
                onChange={e => setBlockForm(f => ({ ...f, title: e.target.value }))}
                className="min-h-[44px]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Applies To</Label>
              <Select value={blockForm.instructor_id} onValueChange={v => setBlockForm(f => ({ ...f, instructor_id: v }))}>
                <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover border z-50">
                  <SelectItem value="all">All instructors (global block)</SelectItem>
                  {instructors.map(i => (
                    <SelectItem key={i.id} value={i.id}>{getDisplayName(i, 'Unknown')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm">Date</Label>
                <Input type="date" value={blockForm.date} onChange={e => setBlockForm(f => ({ ...f, date: e.target.value }))} className="min-h-[44px]" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Start Time</Label>
                <Input
                  type="time"
                  step={60}
                  value={blockForm.start_time}
                  onChange={e => setBlockForm(f => ({ ...f, start_time: e.target.value }))}
                  className="min-h-[44px]"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Duration</Label>
              <Select value={blockForm.duration_minutes} onValueChange={v => setBlockForm(f => ({ ...f, duration_minutes: v }))}>
                <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover border z-50">
                  <SelectItem value="30">30 min</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="90">1.5 hours</SelectItem>
                  <SelectItem value="120">2 hours</SelectItem>
                  <SelectItem value="180">3 hours</SelectItem>
                  <SelectItem value="240">4 hours</SelectItem>
                  <SelectItem value="360">6 hours</SelectItem>
                  <SelectItem value="480">8 hours (full day)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Notes (optional)</Label>
              <Input
                placeholder="Any extra context"
                value={blockForm.notes}
                onChange={e => setBlockForm(f => ({ ...f, notes: e.target.value }))}
                className="min-h-[44px]"
              />
            </div>
            {blockConflictMsg && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm space-y-2">
                <div className="font-medium text-destructive">Schedule conflict detected</div>
                <div className="text-xs text-destructive/90">{blockConflictMsg}</div>
                {isAdmin && (
                  <label className="flex items-start gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={blockOverride}
                      onChange={e => setBlockOverride(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-primary"
                    />
                    <span className="text-xs">
                      <span className="font-medium">Schedule anyway (override conflict)</span>
                      <span className="block text-muted-foreground">
                        This will double-book the selected time. Use only when you're sure.
                      </span>
                    </span>
                  </label>
                )}
              </div>
            )}
            <div className="flex gap-2 pt-2">
              {editingBlock && (
                <Button variant="destructive" onClick={handleDeleteBlock} className="gap-2 min-h-[44px]">
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              )}
              <Button
                className="flex-1 min-h-[44px]"
                onClick={handleSaveBlock}
                disabled={!!blockConflictMsg && !(isAdmin && blockOverride)}
              >
                {editingBlock ? 'Save Changes' : 'Create Block'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
