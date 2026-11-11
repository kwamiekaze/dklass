import { useState, useEffect, useCallback, useMemo } from "react";
import { computeSessionNumbers } from "@/lib/sessionNumbering";
import { Session, SessionDetails } from "@/types/portal";
import { supabase } from "@/integrations/supabase/client";
import { usePortalAuth } from "@/hooks/usePortalAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Clock, CheckCircle, XCircle, User, AlertTriangle, FileText, MessageSquare, Loader2, Phone, ClipboardCheck, Pencil } from "lucide-react";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { getDisplayName } from "@/lib/profileUtils";
import { SessionAddressSection } from "./SessionAddressSection";
import { AdminUserProfileModal, ClickableUserName, OpenProfileButton } from "./AdminUserProfileModal";
import { IntakePreviewModal } from "./IntakePreviewModal";
import { SessionTypeBadge } from "./SessionTypeBadge";
import { RoadTestResultModal } from "./RoadTestResultModal";
import { CancelConfirmationModal } from "./CancelConfirmationModal";
import { FullCalendarView, CalendarEvent, CalendarViewMode } from "./FullCalendarView";
import { LatestReportSnapshot } from "./LatestReportSnapshot";
import { DdsLocationPicker } from "./DdsLocationPicker";
import { RoadTestSentEmails } from "./RoadTestSentEmails";
import { PartialCompleteModal } from "./PartialCompleteModal";
import { SessionContactActions } from "./SessionContactActions";
import { SessionSkillChips } from "./SessionSkillChips";
import { usePreviousAccessCode } from "@/hooks/usePreviousAccessCode";

interface SessionCalendarProps {
  sessions: Session[];
  userRole: 'student' | 'instructor' | 'staff' | 'admin';
  onSessionUpdate?: () => void;
  defaultView?: CalendarViewMode;
  onSlotClick?: (date: Date) => void;
  extraEvents?: CalendarEvent[];
  onExtraEventClick?: (event: CalendarEvent) => void;
}

export function SessionCalendar({ sessions, userRole, onSessionUpdate, defaultView, onSlotClick, extraEvents, onExtraEventClick }: SessionCalendarProps) {
  const { user, role, isStaffOrAdmin } = usePortalAuth();
  const { toast } = useToast();
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [sessionDetails, setSessionDetails] = useState<SessionDetails | null>(null);
  const { previousCode: previousStudentCode } = usePreviousAccessCode(sessionDetails?.student_id);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [partialDialogOpen, setPartialDialogOpen] = useState(false);
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [noteForStudent, setNoteForStudent] = useState("");
  const [noteForInstructor, setNoteForInstructor] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileModalUserId, setProfileModalUserId] = useState<string | null>(null);
  const [roadTestModalOpen, setRoadTestModalOpen] = useState(false);
  const [roadTestResults, setRoadTestResults] = useState<Record<string, { result: string; notes: string | null }>>({});
  const [intakePreviewOpen, setIntakePreviewOpen] = useState(false);
  const [intakePreviewProfile, setIntakePreviewProfile] = useState<any>(null);

  // Edit session form state
  const [editDate, setEditDate] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editPickupTime, setEditPickupTime] = useState("");
  const [editPickupAddress, setEditPickupAddress] = useState("");
  const [editDropoffAddress, setEditDropoffAddress] = useState("");
  const [editSessionType, setEditSessionType] = useState<string>("driving");
  const [editDdsLocation, setEditDdsLocation] = useState<string>("");
  const [editStatus, setEditStatus] = useState<string>("scheduled");
  const [editConflictWarning, setEditConflictWarning] = useState<string | null>(null);
  const [editOverride, setEditOverride] = useState(false);
  const [approveConflictMsg, setApproveConflictMsg] = useState<string | null>(null);
  const [approveOverride, setApproveOverride] = useState(false);
  const isAdmin = role === 'admin';

  // Fetch session details via RPC
  const fetchSessionDetails = useCallback(async (sessionId: string) => {
    setDetailsLoading(true);
    setDetailsError(null);
    setSessionDetails(null);
    try {
      const { data, error } = await supabase.rpc('get_session_details', { p_session_id: sessionId });
      if (error) throw error;
      if (data && data.length > 0) {
        setSessionDetails(data[0] as SessionDetails);
      } else {
        setDetailsError('Unable to load session details');
      }
    } catch (err: any) {
      setDetailsError(err.message || 'Failed to load session details');
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  // Fetch road test results
  const fetchRoadTestResults = useCallback(async (sessionIds: string[]) => {
    if (sessionIds.length === 0) return;
    const { data } = await supabase.from('road_test_results').select('session_id, result, notes').in('session_id', sessionIds);
    if (data) {
      const map: Record<string, { result: string; notes: string | null }> = {};
      data.forEach((r) => { map[r.session_id] = { result: r.result, notes: r.notes }; });
      setRoadTestResults(map);
    }
  }, []);

  useEffect(() => {
    if (selectedSession?.id) fetchSessionDetails(selectedSession.id);
    else { setSessionDetails(null); setDetailsError(null); }
  }, [selectedSession?.id, fetchSessionDetails]);

  useEffect(() => {
    const testingSessions = sessions.filter(s => s.session_type === 'testing').map(s => s.id);
    fetchRoadTestResults(testingSessions);
  }, [sessions, fetchRoadTestResults]);

  // Compute per-student session numbering
  const sessionNumberMap = useMemo(() => {
    // Group by student and compute numbers for each
    const studentIds = [...new Set(sessions.map(s => s.student_id))];
    const combined: Record<string, number> = {};
    for (const sid of studentIds) {
      Object.assign(combined, computeSessionNumbers(sessions, sid));
    }
    return combined;
  }, [sessions]);

  // Convert sessions to CalendarEvents
  const calendarEvents: CalendarEvent[] = useMemo(() => {
    return sessions.map(s => {
      const color = getCalendarColor(s);
      const dotColor = getDotColor(s);
      const studentName = userRole === 'student'
        ? getDisplayName(s.instructor, 'Instructor')
        : getDisplayName(s.student, 'Student');
      const sessionNum = sessionNumberMap[s.id];
      const numLabel = sessionNum ? `Session ${sessionNum}` : '';
      const typeLabel = s.session_type === 'testing' ? '🏁 Road Test' : '🚗 Driving';
      const pendingLabel = s.status === 'pending' ? ' · ⏳ PENDING' : '';

      // For road tests, the calendar block should begin at the pickup time
      // (instructor picks up the student and drives to the DDS). The road
      // test start time itself is shown in the session details modal.
      const pickupTs = (s as any).pickup_time as string | null | undefined;
      const eventStart = s.session_type === 'testing' && pickupTs ? pickupTs : s.starts_at;

      return {
        id: s.id,
        title: studentName,
        subtitle: (numLabel ? `${numLabel} · ${typeLabel}` : typeLabel) + pendingLabel,
        start: eventStart,
        end: s.ends_at,
        color,
        dotColor,
        inactive: s.status === 'cancelled' || (s.status as string) === 'missed' || (s.status as string) === 'no_show',
        meta: { session: s },
      };
    });
  }, [sessions, userRole, sessionNumberMap]);

  const mergedEvents = useMemo(
    () => [...calendarEvents, ...(extraEvents || [])].sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
    ),
    [calendarEvents, extraEvents]
  );

  const handleEventClick = (event: CalendarEvent) => {
    if (event.meta?.type === 'block') {
      onExtraEventClick?.(event);
      return;
    }
    const session = (event.meta?.session as Session) || sessions.find(s => s.id === event.id);
    if (session) setSelectedSession(session);
  };

  // ── Action Handlers (kept from original) ──
  const handleCancelSession = async (reason: string, waiveFee?: boolean, suppressStudentNotification?: boolean) => {
    if (!selectedSession || !reason.trim() || !user) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('cancel-session-with-penalty', {
        body: { session_id: selectedSession.id, reason: reason.trim(), waive_fee: waiveFee || false, suppress_student_notification: suppressStudentNotification || false }
      });
      if (error) throw error;
      let desc = "The session has been cancelled successfully.";
      if (data?.fee_waived) desc += " Late cancellation fee was waived.";
      else if (data?.penalty_applied) desc += " A 30 minute reduction was applied to the student's hours.";
      toast({ title: "Session Cancelled", description: desc });
      setCancelDialogOpen(false);
      setSelectedSession(null);
      onSessionUpdate?.();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to cancel session", variant: "destructive" });
    } finally { setIsLoading(false); }
  };

  const handleRequestReschedule = async () => {
    if (!selectedSession || !user) return;
    try {
      const { data: adminRoles } = await supabase.from('user_roles').select('user_id').in('role', ['admin', 'staff']);
      if (adminRoles) {
        const notifications = adminRoles.map((r) => ({
          user_id: r.user_id, type: 'system' as const, title: 'Reschedule Request',
          message: `Student has requested to reschedule their session on ${format(parseISO(selectedSession.starts_at), 'MMM d, yyyy h:mm a')}.`,
          session_id: selectedSession.id, severity: 'info' as const, dedupe_key: `reschedule_${selectedSession.id}_${user.id}`,
        }));
        await supabase.from('notifications').insert(notifications);
      }
      toast({ title: "Reschedule Requested", description: "Your reschedule request has been sent to the admin team." });
    } catch (err) { console.error('Reschedule request error:', err); }
  };

  const handleCompleteSession = async () => {
    if (!selectedSession || !user) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('complete-session-deduct-hours', {
        body: { session_id: selectedSession.id }
      });
      if (error) throw error;
      if (data?.success) {
        toast({ title: "Session Completed", description: data.message || "The session has been marked as completed." });
      } else { throw new Error(data?.error || "Failed to complete session"); }
      setCompleteDialogOpen(false);
      setSelectedSession(null);
      onSessionUpdate?.();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to complete session", variant: "destructive" });
    } finally { setIsLoading(false); }
  };

  const handleSaveNotes = async () => {
    if (!selectedSession || !user) return;
    setIsLoading(true);
    try {
      const { error } = await supabase.rpc('update_session_notes', {
        _session_id: selectedSession.id, _note_for_student: noteForStudent || null, _note_for_instructor: noteForInstructor || null
      });
      if (error) throw error;
      toast({ title: "Notes Saved", description: "Session notes have been updated." });
      setNotesDialogOpen(false);
      onSessionUpdate?.();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to save notes", variant: "destructive" });
    } finally { setIsLoading(false); }
  };

  const openNotesDialog = (session: Session) => {
    setNoteForStudent(session.note_for_student || "");
    setNoteForInstructor(session.note_for_instructor || "");
    setNotesDialogOpen(true);
  };

  const openEditDialog = (session: Session) => {
    // Parse existing times and prefill - use formatInTimeZone-like approach
    // Display in ET by formatting the ISO string 
    const startDate = parseISO(session.starts_at);
    const endDate = parseISO(session.ends_at);
    // Format as ET using Intl
    const etFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
    const etTimeFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
    
    setEditDate(etFormatter.format(startDate));
    const startTimeParts = etTimeFormatter.format(startDate).replace(/\u200E/g, '');
    const endTimeParts = etTimeFormatter.format(endDate).replace(/\u200E/g, '');
    // Normalize "24:xx" to "00:xx"
    setEditStartTime(startTimeParts.startsWith('24') ? '00' + startTimeParts.slice(2) : startTimeParts);
    setEditEndTime(endTimeParts.startsWith('24') ? '00' + endTimeParts.slice(2) : endTimeParts);
    setEditConflictWarning(null);
    // Prefill pickup/dropoff from session-specific values
    setEditPickupAddress(sessionDetails?.pickup_address || '');
    setEditDropoffAddress(sessionDetails?.dropoff_address || '');
    setEditSessionType(session.session_type || 'driving');
    setEditDdsLocation((session as any).dds_location || '');
    setEditStatus(session.status || 'scheduled');
    const pickupTs = (session as any).pickup_time || (sessionDetails as any)?.pickup_time;
    if (pickupTs) {
      const pt = etTimeFormatter.format(parseISO(pickupTs)).replace(/\u200E/g, '');
      setEditPickupTime(pt.startsWith('24') ? '00' + pt.slice(2) : pt);
    } else {
      setEditPickupTime('');
    }
    setEditDialogOpen(true);
  };

  // Convert local ET date + time to UTC ISO string
  const toEasternISO = (dateStr: string, timeStr: string): string => {
    // Build a date string and use Intl to find the correct UTC offset
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hours, minutes] = timeStr.split(':').map(Number);
    
    // Create a rough UTC guess, then converge
    let guess = new Date(Date.UTC(year, month - 1, day, hours + 5, minutes));
    for (let i = 0; i < 3; i++) {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', hour12: false,
      }).formatToParts(guess);
      const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0');
      const etH = get('hour') === 24 ? 0 : get('hour');
      const diffMs = ((etH - hours) * 60 + (get('minute') - minutes)) * 60000;
      if (diffMs === 0) break;
      guess = new Date(guess.getTime() - diffMs);
    }
    return guess.toISOString();
  };

  const handleEditSession = async () => {
    if (!selectedSession || !editDate || !editStartTime || !editEndTime) {
      toast({ title: "Error", description: "Please fill in all fields", variant: "destructive" });
      return;
    }

    // Validate end > start
    const [sh, sm] = editStartTime.split(':').map(Number);
    const [eh, em] = editEndTime.split(':').map(Number);
    const startMins = sh * 60 + sm;
    const endMins = eh * 60 + em;
    if (endMins <= startMins) {
      toast({ title: "Error", description: "End time must be after start time", variant: "destructive" });
      return;
    }

    const durationMinutes = endMins - startMins;
    const newStartsAt = toEasternISO(editDate, editStartTime);
    const newEndsAt = toEasternISO(editDate, editEndTime);

    // Check for conflicts
    setIsLoading(true);
    setEditConflictWarning(null);
    try {
      // Check instructor conflicts
      const { data: instructorConflicts } = await supabase
        .from('sessions')
        .select('id, starts_at, ends_at')
        .eq('instructor_id', selectedSession.instructor_id)
        .neq('id', selectedSession.id)
        .neq('status', 'cancelled')
        .lt('starts_at', newEndsAt)
        .gt('ends_at', newStartsAt);

      // Check student conflicts
      const { data: studentConflicts } = await supabase
        .from('sessions')
        .select('id, starts_at, ends_at')
        .eq('student_id', selectedSession.student_id)
        .neq('id', selectedSession.id)
        .neq('status', 'cancelled')
        .lt('starts_at', newEndsAt)
        .gt('ends_at', newStartsAt);

      const conflicts = [
        ...(instructorConflicts || []).map(() => 'instructor'),
        ...(studentConflicts || []).map(() => 'student'),
      ];

      const hasConflict = conflicts.length > 0;
      if (hasConflict) {
        const who = [...new Set(conflicts)].join(' and ');
        setEditConflictWarning(`This updated time conflicts with another scheduled session for the ${who}.`);
        if (!(isAdmin && editOverride)) {
          setIsLoading(false);
          return;
        }
      } else {
        setEditConflictWarning(null);
      }

      // Update session including addresses
      if (editSessionType === 'testing' && !editDdsLocation) {
        setEditConflictWarning("Please select a DDS testing location for this road test.");
        setIsLoading(false);
        return;
      }
      const updatePayload: Record<string, any> = {
        starts_at: newStartsAt,
        ends_at: newEndsAt,
        duration_minutes: durationMinutes,
        pickup_address: editPickupAddress.trim() || null,
        dropoff_address: editDropoffAddress.trim() || null,
        session_type: editSessionType,
        dds_location: editSessionType === 'testing' ? editDdsLocation : null,
        pickup_time: editSessionType === 'testing' && editPickupTime
          ? toEasternISO(editDate, editPickupTime)
          : null,
      };

      // Allow staff/admin to toggle between scheduled and pending on the same session
      if (
        isStaffOrAdmin &&
        (selectedSession.status === 'scheduled' || selectedSession.status === 'pending') &&
        (editStatus === 'scheduled' || editStatus === 'pending')
      ) {
        updatePayload.status = editStatus;
      }

      // Admin override: mark record so the DB trigger allows the overlap
      if (isAdmin && editOverride && hasConflict) {
        updatePayload.conflict_override = true;
      }

      const previousLocation = (selectedSession as any).dds_location || null;
      const previousStartsAt = selectedSession.starts_at;
      const previousPickupTime = (selectedSession as any).pickup_time || null;
      const { error } = await supabase
        .from('sessions')
        .update(updatePayload)
        .eq('id', selectedSession.id);

      if (error) throw error;

      // Re-send road test scheduling emails if this is a testing session and
      // any scheduling detail (location, start time, or pickup time) changed.
      if (
        editSessionType === 'testing' &&
        editDdsLocation &&
        (
          editDdsLocation !== previousLocation ||
          newStartsAt !== previousStartsAt ||
          (updatePayload.pickup_time || null) !== previousPickupTime
        )
      ) {
        supabase.functions.invoke('send-road-test-scheduling-emails', {
          body: { sessionId: selectedSession.id },
        }).then(({ error: e }) => {
          if (e) toast({ title: 'Road test emails failed', description: e.message, variant: 'destructive' });
          else toast({ title: 'Road test emails sent', description: 'Student and instructor notified.' });
        });
      }

      toast({ title: "Session Updated", description: "Session updated successfully." });
      setEditDialogOpen(false);
      setSelectedSession(null);
      onSessionUpdate?.();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update session", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  // ── Permission helpers ──
  const canCancel = (session: Session) => {
    if (session.status === 'cancelled') return false;
    // Instructors and staff/admin can cancel completed/passed sessions too
    if (userRole === 'instructor' && session.instructor_id === user?.id) return true;
    if (isStaffOrAdmin) return true;
    // Students can only cancel scheduled sessions
    if (userRole === 'student' && session.student_id === user?.id && session.status === 'scheduled') return true;
    return false;
  };
  const canComplete = (session: Session) => {
    if (session.status !== 'scheduled') return false;
    if (userRole === 'student') return false;
    if (userRole === 'instructor' && session.instructor_id === user?.id) return true;
    if (isStaffOrAdmin) return true;
    return false;
  };
  const canPartialComplete = (session: Session) => canComplete(session);

  const handlePartialComplete = async (reason: string, actualMinutes: number) => {
    if (!selectedSession) return;
    setIsLoading(true);
    try {
      const { error } = await supabase.rpc('partially_complete_session', {
        _session_id: selectedSession.id,
        _reason: reason,
        _actual_minutes: actualMinutes,
      } as any);
      if (error) throw error;
      toast({ title: "Marked Partially Complete", description: "The student has been notified and hours were credited." });
      setPartialDialogOpen(false);
      setSelectedSession(null);
      onSessionUpdate?.();
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to update session", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const canGrade = (session: Session) => {
    if (session.session_type === 'testing') return false;
    if (session.report_card_id) return false;
    if (session.status === 'cancelled' || session.status === 'pending') return false;
    if (userRole === 'instructor' && session.instructor_id === user?.id) return true;
    if (isStaffOrAdmin) return true;
    return false;
  };

  const getStatusBadge = (session: Session) => {
    switch (session.status) {
      case 'completed': return <Badge className="bg-green-500 gap-1"><CheckCircle className="h-3 w-3" />Completed</Badge>;
      case 'partially_completed': return <Badge className="bg-amber-500 text-white gap-1"><AlertTriangle className="h-3 w-3" />Partially Complete</Badge>;
      case 'cancelled': return <Badge variant="secondary" className="bg-gray-500 text-white gap-1"><XCircle className="h-3 w-3" />Cancelled</Badge>;
      case 'pending': return <Badge variant="outline" className="border-2 border-dashed border-amber-500 text-amber-700 dark:text-amber-300 gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
      default: return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Scheduled</Badge>;
    }
  };

  const handleApprovePending = async () => {
    if (!selectedSession) return;
    setIsLoading(true);
    const useOverride = isAdmin && approveOverride;
    const { error } = await supabase.rpc('approve_pending_session', {
      _session_id: selectedSession.id,
      ...(useOverride ? { _override_conflicts: true } : {}),
    } as any);
    setIsLoading(false);
    if (error) {
      const isConflict = /conflict|exclusion/i.test(error.message || '');
      if (isConflict && isAdmin && !approveOverride) {
        setApproveConflictMsg(error.message);
        toast({ title: "Approve blocked", description: "Conflict detected — check the override box to approve anyway.", variant: "destructive" });
        return;
      }
      toast({ title: "Approve failed", description: error.message, variant: "destructive" });
      return;
    }
    setApproveConflictMsg(null);
    setApproveOverride(false);
    // Road test slots trigger the existing DDS 2 GO scheduling email flow once confirmed
    if ((selectedSession as any).session_type === 'testing' && (selectedSession as any).dds_location) {
      supabase.functions
        .invoke('send-road-test-scheduling-emails', { body: { sessionId: selectedSession.id } })
        .then(({ error: e }) => {
          if (e) toast({ title: "Road test emails failed", description: e.message, variant: "destructive" });
        });
    }
    toast({ title: "Pending slot approved", description: "Now scheduled." });
    setSelectedSession(null);
    onSessionUpdate?.();
  };

  const handleDeletePending = async () => {
    if (!selectedSession) return;
    if (!confirm('Delete this pending slot? This cannot be undone.')) return;
    setIsLoading(true);
    const { error } = await supabase.from('sessions').delete().eq('id', selectedSession.id);
    setIsLoading(false);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Pending slot deleted" });
    setSelectedSession(null);
    onSessionUpdate?.();
  };

  // Resolve default view
  const resolvedDefaultView = defaultView || (userRole === 'student' ? 'agenda' : 'month');

  return (
    <div className="space-y-4">
      <FullCalendarView
        events={mergedEvents}
        defaultView={resolvedDefaultView}
        onEventClick={handleEventClick}
        onSlotClick={onSlotClick}
      />

      {/* ── Session Details Dialog ── */}
      <Dialog open={!!selectedSession && !cancelDialogOpen && !completeDialogOpen && !notesDialogOpen && !editDialogOpen} onOpenChange={(open) => !open && setSelectedSession(null)}>
        <DialogContent className="w-[min(92vw,520px)] max-w-[520px] max-h-[80vh] overflow-y-auto mx-auto fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg">
              {selectedSession && sessionNumberMap[selectedSession.id]
                ? `Session ${sessionNumberMap[selectedSession.id]} Details`
                : 'Session Details'}
            </DialogTitle>
          </DialogHeader>
          {selectedSession && (
            <div className="space-y-4">
              {detailsLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              )}
              {detailsError && !detailsLoading && (
                <div className="flex flex-col items-center justify-center py-6 gap-2">
                  <AlertTriangle className="h-8 w-8 text-destructive" />
                  <p className="text-sm text-muted-foreground">{detailsError}</p>
                  <Button size="sm" variant="outline" onClick={() => fetchSessionDetails(selectedSession.id)}>Retry</Button>
                </div>
              )}
              {sessionDetails && !detailsLoading && !detailsError && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    {getStatusBadge(selectedSession)}
                    <SessionTypeBadge sessionType={selectedSession.session_type} />
                    {sessionDetails.report_card_id && (
                      <Badge variant="outline" className="gap-1"><FileText className="h-3 w-3" />Report Submitted</Badge>
                    )}
                    {roadTestResults[selectedSession.id] && (
                      <Badge className={cn("gap-1 border-0",
                        roadTestResults[selectedSession.id].result === 'passed'
                          ? "bg-green-500/20 text-green-700 dark:text-green-300"
                          : "bg-orange-500/20 text-orange-700 dark:text-orange-300"
                      )}>
                        {roadTestResults[selectedSession.id].result === 'passed' ? <><CheckCircle className="h-3 w-3" />Passed 🚀</> : <><XCircle className="h-3 w-3" />Must Retry</>}
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <p className="text-xs sm:text-sm text-muted-foreground">Date</p>
                      <p className="font-medium text-sm sm:text-base">{format(parseISO(sessionDetails.starts_at), 'EEEE, MMMM d, yyyy')}</p>
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        {selectedSession.session_type === 'testing' ? 'Road Test Start Time' : 'Time'}
                      </p>
                      <p className="font-medium text-sm sm:text-base">
                        {format(parseISO(sessionDetails.starts_at), 'h:mm a')} - {format(parseISO(sessionDetails.ends_at), 'h:mm a')}
                      </p>
                    </div>
                    {selectedSession.session_type === 'testing' && (selectedSession as any).pickup_time && (
                      <div>
                        <p className="text-xs sm:text-sm text-muted-foreground">Pickup Time</p>
                        <p className="font-medium text-sm sm:text-base">
                          {format(parseISO((selectedSession as any).pickup_time), 'h:mm a')}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs sm:text-sm text-muted-foreground">Student</p>
                      <div className="flex items-center gap-1">
                        {(isStaffOrAdmin || userRole === 'instructor') && sessionDetails.student_id ? (
                          <>
                            <ClickableUserName userId={sessionDetails.student_id} name={sessionDetails.student_name || 'Not assigned'} className="font-medium text-sm sm:text-base" onOpenProfile={(id) => { setProfileModalUserId(id); setProfileModalOpen(true); }} />
                            <OpenProfileButton userId={sessionDetails.student_id} onOpenProfile={(id) => { setProfileModalUserId(id); setProfileModalOpen(true); }} className="h-6 w-6" />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              title="View Intake Form"
                              onClick={async () => {
                                const { data } = await supabase.from('profiles').select('*').eq('id', sessionDetails.student_id).single();
                                if (data) {
                                  setIntakePreviewProfile(data);
                                  setIntakePreviewOpen(true);
                                }
                              }}
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : (
                          <p className="font-medium text-sm sm:text-base">{sessionDetails.student_name || 'Not assigned'}</p>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm text-muted-foreground">Instructor</p>
                      <div className="flex items-center gap-1">
                        {isStaffOrAdmin && sessionDetails.instructor_id ? (
                          <>
                            <ClickableUserName userId={sessionDetails.instructor_id} name={sessionDetails.instructor_name || 'Not assigned'} className="font-medium text-sm sm:text-base" onOpenProfile={(id) => { setProfileModalUserId(id); setProfileModalOpen(true); }} />
                            <OpenProfileButton userId={sessionDetails.instructor_id} onOpenProfile={(id) => { setProfileModalUserId(id); setProfileModalOpen(true); }} className="h-6 w-6" />
                          </>
                        ) : (
                          <p className="font-medium text-sm sm:text-base">{sessionDetails.instructor_name || 'Not assigned'}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <SessionAddressSection pickupAddress={sessionDetails.pickup_address} dropoffAddress={sessionDetails.dropoff_address} />

                  {(sessionDetails.student_phone || sessionDetails.guardian_phone) && (
                    <div className="p-3 bg-primary/10 rounded-lg space-y-2">
                      <p className="text-sm font-medium flex items-center gap-2"><Phone className="h-4 w-4 text-primary" />Contact Info</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                        {sessionDetails.student_phone && (
                          <div>
                            <p className="text-xs text-muted-foreground">Student Phone</p>
                            <a href={`tel:${sessionDetails.student_phone}`} className="font-medium text-primary hover:underline">{sessionDetails.student_phone}</a>
                          </div>
                        )}
                        {(sessionDetails.guardian_phone || sessionDetails.guardian_name) && (
                          <div>
                            <p className="text-xs text-muted-foreground">Guardian/Emergency</p>
                            {sessionDetails.guardian_name && (
                              <p className="font-medium text-sm">{sessionDetails.guardian_name}</p>
                            )}
                            {sessionDetails.guardian_phone && (
                              <a href={`tel:${sessionDetails.guardian_phone}`} className="font-medium text-primary hover:underline">{sessionDetails.guardian_phone}</a>
                            )}
                          </div>
                        )}
                      </div>
                      {(isStaffOrAdmin || userRole === 'instructor') && (
                        <SessionContactActions
                          studentPhone={sessionDetails.student_phone}
                          guardianPhone={sessionDetails.guardian_phone}
                          className="pt-1"
                        />
                      )}
                    </div>
                  )}

                  {(isStaffOrAdmin || userRole === 'instructor') && sessionDetails.student_id && (
                    <div className="p-3 bg-muted/40 rounded-lg space-y-2">
                      <p className="text-sm font-medium">Skill Summary</p>
                      <SessionSkillChips studentId={sessionDetails.student_id} />
                      {previousStudentCode && (
                        <p className="text-[11px] text-muted-foreground">
                          Previous code for this student:{' '}
                          <span className="font-mono font-semibold text-foreground">{previousStudentCode}</span>
                        </p>
                      )}
                    </div>
                  )}

                  {sessionDetails.status === 'partially_completed' && (
                    <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/30">
                      <p className="text-sm font-medium flex items-center gap-2 text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="h-4 w-4" />Partially Complete
                      </p>
                      {typeof sessionDetails.actual_minutes === 'number' && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {sessionDetails.actual_minutes} of {sessionDetails.duration_minutes} minutes completed
                        </p>
                      )}
                      {sessionDetails.partial_reason && (
                        <p className="text-sm text-muted-foreground mt-1">{sessionDetails.partial_reason}</p>
                      )}
                    </div>
                  )}

                  {sessionDetails.note_for_student && (userRole === 'student' || isStaffOrAdmin) && (
                    <div className="p-3 bg-blue-500/10 rounded-lg">
                      <p className="text-sm font-medium flex items-center gap-2"><MessageSquare className="h-4 w-4" />Note from Staff</p>
                      <p className="text-sm text-muted-foreground mt-1">{sessionDetails.note_for_student}</p>
                    </div>
                  )}
                  {sessionDetails.note_for_instructor && (userRole === 'instructor' || isStaffOrAdmin) && (
                    <div className="p-3 bg-orange-500/10 rounded-lg">
                      <p className="text-sm font-medium flex items-center gap-2"><MessageSquare className="h-4 w-4" />Staff Note (Instructor)</p>
                      <p className="text-sm text-muted-foreground mt-1">{sessionDetails.note_for_instructor}</p>
                    </div>
                  )}

                  {sessionDetails.status === 'cancelled' && (
                    <div className="space-y-2">
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-sm font-medium flex items-center gap-2"><AlertTriangle className="h-4 w-4" />
                          {userRole === 'student' && selectedSession.cancelled_by_role !== 'student'
                            ? 'Cancelled by DrivingKlass'
                            : 'Cancelled'}
                        </p>
                        {/* Staff/admin/instructor see internal details */}
                        {isStaffOrAdmin && sessionDetails.cancellation_reason && (
                          <p className="text-sm text-muted-foreground mt-1">Reason: {sessionDetails.cancellation_reason}</p>
                        )}
                        {isStaffOrAdmin && selectedSession.cancelled_by_role && (
                          <p className="text-xs text-muted-foreground mt-1">Cancelled by: {selectedSession.cancelled_by_role}</p>
                        )}
                        {isStaffOrAdmin && selectedSession.cancellation_fee_waived && (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">✅ Late cancellation fee was waived</p>
                        )}
                        {/* Student sees reason only if they cancelled */}
                        {userRole === 'student' && selectedSession.cancelled_by_role === 'student' && sessionDetails.cancellation_reason && (
                          <p className="text-sm text-muted-foreground mt-1">Reason: {sessionDetails.cancellation_reason}</p>
                        )}
                      </div>
                      {/* Student-facing fee messages */}
                      {userRole === 'student' && selectedSession.cancel_penalty_hours > 0 && !selectedSession.cancellation_fee_waived && (
                        <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-700 dark:text-amber-300">
                          Cancellation fee incurred due to late cancellation, cancellations made within 24 hours of a session are subject to a 30 minute reduction in remaining hours cancellation fee.
                        </div>
                      )}
                      {userRole === 'student' && selectedSession.cancellation_fee_waived && (
                        <div className="p-2 bg-green-500/10 border border-green-500/20 rounded-lg text-xs text-green-700 dark:text-green-300">
                          Cancellation waived by {selectedSession.cancelled_by_role === 'instructor' ? 'instructor' : 'admin'}
                        </div>
                      )}
                      {/* Staff sees penalty info */}
                      {isStaffOrAdmin && selectedSession.cancel_penalty_hours > 0 && !selectedSession.cancellation_fee_waived && (
                        <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-700 dark:text-amber-300">
                          ⚠️ A 30 minute reduction was applied due to late cancellation.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Open Report Card — prominent for completed sessions with report cards */}
                  {sessionDetails.report_card_id && selectedSession.session_type !== 'testing' && (
                    <Link to={`/report-cards/${sessionDetails.report_card_id}`}>
                      <Button className="w-full min-h-[44px] gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
                        <FileText className="h-4 w-4" />Open Report Card
                      </Button>
                    </Link>
                  )}

                  {/* Open Road Test Result — for completed road tests */}
                  {selectedSession.session_type === 'testing' && selectedSession.status === 'completed' && roadTestResults[selectedSession.id] && (
                    <Link to={`/road-test-results/${selectedSession.id}`}>
                      <Button className="w-full min-h-[44px] gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
                        <ClipboardCheck className="h-4 w-4" />View Road Test Result
                      </Button>
                    </Link>
                  )}

                  {/* DDS location + Sent Emails for road tests (staff/instructor) */}
                  {selectedSession.session_type === 'testing' && (isStaffOrAdmin || userRole === 'instructor') && (
                    <div className="space-y-2">
                      {(selectedSession as any).dds_location && (
                        <div className="rounded-lg border bg-card/40 p-3 text-sm">
                          <div className="text-xs text-muted-foreground mb-0.5">DDS Testing Location</div>
                          <div className="font-medium">{(selectedSession as any).dds_location}</div>
                        </div>
                      )}
                      <RoadTestSentEmails sessionId={selectedSession.id} />
                    </div>
                  )}


                  {/* Action Buttons */}
                  <div className="flex flex-col sm:flex-row gap-2">
                    {isStaffOrAdmin && selectedSession.status === 'pending' && (
                      <>
                        <div className="w-full space-y-2">
                          {approveConflictMsg && (
                            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm space-y-2">
                              <div className="font-medium text-destructive">Schedule conflict detected</div>
                              <div className="text-xs text-destructive/90">{approveConflictMsg}</div>
                              {isAdmin && (
                                <label className="flex items-start gap-2 mt-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={approveOverride}
                                    onChange={e => setApproveOverride(e.target.checked)}
                                    className="mt-0.5 h-4 w-4 accent-primary"
                                  />
                                  <span className="text-xs">
                                    <span className="font-medium">Approve anyway (override conflict)</span>
                                    <span className="block text-muted-foreground">
                                      This will double-book the selected time.
                                    </span>
                                  </span>
                                </label>
                              )}
                            </div>
                          )}
                          <div className="flex flex-col sm:flex-row gap-2">
                            <Button
                              className="flex-1 min-h-[44px] gap-2 bg-amber-500 hover:bg-amber-600 text-white"
                              onClick={handleApprovePending}
                              disabled={isLoading || (!!approveConflictMsg && !(isAdmin && approveOverride))}
                            >
                              <CheckCircle className="h-4 w-4" />Approve Pending Slot
                            </Button>
                            <Button variant="destructive" className="flex-1 min-h-[44px] gap-2" onClick={handleDeletePending} disabled={isLoading}>
                              <XCircle className="h-4 w-4" />Delete Pending
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                    {canGrade(selectedSession) && selectedSession.session_type !== 'testing' && (
                      <Link to={`/instructor/report-cards/new?session_id=${selectedSession.id}`} className="flex-1">
                        <Button className="w-full min-h-[44px] gap-2"><FileText className="h-4 w-4" />Grade Session</Button>
                      </Link>
                    )}
                    {selectedSession.session_type === 'testing' && selectedSession.status === 'scheduled' && !roadTestResults[selectedSession.id] && canComplete(selectedSession) && (
                      <Button className="flex-1 min-h-[44px] gap-2" onClick={() => setRoadTestModalOpen(true)}>
                        <ClipboardCheck className="h-4 w-4" />Grade Road Test
                      </Button>
                    )}
                    {canComplete(selectedSession) && selectedSession.session_type !== 'testing' && (
                      <Button variant="outline" onClick={() => setCompleteDialogOpen(true)} className="flex-1 min-h-[44px] gap-2">
                        <CheckCircle className="h-4 w-4" />Mark Completed
                      </Button>
                    )}
                    {canPartialComplete(selectedSession) && (
                      <Button
                        variant="outline"
                        onClick={() => setPartialDialogOpen(true)}
                        className="flex-1 min-h-[44px] gap-2 border-amber-500/60 text-amber-700 dark:text-amber-300"
                      >
                        <AlertTriangle className="h-4 w-4" />Mark Partially Complete
                      </Button>
                    )}
                    {isStaffOrAdmin && (
                      <Button variant="outline" onClick={() => openEditDialog(selectedSession)} className="flex-1 min-h-[44px] gap-2">
                        <Pencil className="h-4 w-4" />Edit Session
                      </Button>
                    )}
                    {isStaffOrAdmin && (
                      <Button variant="outline" onClick={() => openNotesDialog(selectedSession)} className="flex-1 min-h-[44px] gap-2">
                        <MessageSquare className="h-4 w-4" />Edit Notes
                      </Button>
                    )}
                    {canCancel(selectedSession) && (
                      <Button variant="destructive" onClick={() => setCancelDialogOpen(true)} className="flex-1 min-h-[44px]">
                        Cancel Session
                      </Button>
                    )}
                  </div>

                  {/* Latest Report Snapshot for coaching - admin/instructor only */}
                  <PartialCompleteModal
                    open={partialDialogOpen}
                    onOpenChange={setPartialDialogOpen}
                    studentName={sessionDetails.student_name || undefined}
                    scheduledMinutes={selectedSession.duration_minutes}
                    isLoading={isLoading}
                    onConfirm={handlePartialComplete}
                  />

                  {(isStaffOrAdmin || userRole === 'instructor') && sessionDetails.student_id && (
                    <LatestReportSnapshot
                      studentId={sessionDetails.student_id}
                      currentSessionId={selectedSession.id}
                    />
                  )}
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel Modal */}
      {selectedSession && (
        <CancelConfirmationModal
          open={cancelDialogOpen}
          onOpenChange={setCancelDialogOpen}
          sessionStartsAt={selectedSession.starts_at}
          sessionEndsAt={selectedSession.ends_at}
          studentName={sessionDetails?.student_name || getDisplayName(selectedSession.student, 'Student')}
          instructorName={sessionDetails?.instructor_name || getDisplayName(selectedSession.instructor, 'Instructor')}
          userRole={userRole}
          onConfirmCancel={handleCancelSession}
          onRequestReschedule={handleRequestReschedule}
          isLoading={isLoading}
        />
      )}

      {/* Complete Confirmation */}
      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent className="w-[min(92vw,520px)] max-w-[520px] p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Mark Session Complete</DialogTitle>
            <DialogDescription>Are you sure you want to mark this session as completed?</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCompleteDialogOpen(false)} className="min-h-[44px]">Go Back</Button>
            <Button onClick={handleCompleteSession} disabled={isLoading} className="min-h-[44px] gap-2">
              <CheckCircle className="h-4 w-4" />{isLoading ? "Completing..." : "Confirm Complete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notes Dialog */}
      <Dialog open={notesDialogOpen} onOpenChange={setNotesDialogOpen}>
        <DialogContent className="w-[min(92vw,520px)] max-w-[520px] p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Session Notes</DialogTitle>
            <DialogDescription>Add notes visible to the student or instructor.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">Note for Student</Label>
              <Textarea value={noteForStudent} onChange={(e) => setNoteForStudent(e.target.value)} placeholder="Visible to: Student, Admin, Staff" rows={3} className="text-sm" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Note for Instructor</Label>
              <Textarea value={noteForInstructor} onChange={(e) => setNoteForInstructor(e.target.value)} placeholder="Visible to: Instructor, Admin, Staff" rows={3} className="text-sm" />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setNotesDialogOpen(false)} className="min-h-[44px]">Cancel</Button>
            <Button onClick={handleSaveNotes} disabled={isLoading} className="min-h-[44px]">{isLoading ? "Saving..." : "Save Notes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Session Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="w-[min(92vw,520px)] max-w-[520px] max-h-[85vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg">Edit Session</DialogTitle>
            <DialogDescription>Update the date, time, and addresses for this session.</DialogDescription>
          </DialogHeader>
          {selectedSession && sessionDetails && (
            <div className="space-y-4">
              {/* Read-only context */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-muted/30 rounded-lg">
                <div>
                  <p className="text-xs text-muted-foreground">Student</p>
                  <p className="text-sm font-medium">{sessionDetails.student_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Instructor</p>
                  <p className="text-sm font-medium">{sessionDetails.instructor_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Type</p>
                  <Select value={editSessionType} onValueChange={setEditSessionType}>
                    <SelectTrigger className="min-h-[44px] mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-popover border z-50">
                      <SelectItem value="driving">Driving</SelectItem>
                      <SelectItem value="testing">Road Test</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  {isStaffOrAdmin && (selectedSession.status === 'scheduled' || selectedSession.status === 'pending') ? (
                    <Select value={editStatus} onValueChange={setEditStatus}>
                      <SelectTrigger className="min-h-[44px] mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-popover border z-50">
                        <SelectItem value="scheduled">Scheduled</SelectItem>
                        <SelectItem value="pending">Pending (awaiting payment)</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="secondary" className="text-xs">{selectedSession.status}</Badge>
                  )}
                </div>
              </div>

              {editSessionType === 'testing' && (
                <div className="space-y-2">
                  <Label className="text-sm">
                    DDS Testing Location <span className="text-destructive">*</span>
                  </Label>
                  <DdsLocationPicker value={editDdsLocation} onChange={setEditDdsLocation} />
                  <p className="text-xs text-muted-foreground">
                    Saving with a new location or time re-sends the DDS 2 GO instructions to the student and instructor.
                  </p>
                </div>
              )}


              {selectedSession.report_card_id && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-700 dark:text-amber-300">
                  ⚠️ This session has a submitted report card. Updating the date/time will keep the report linked.
                </div>
              )}

              {/* Editable fields */}
              <div className="space-y-2">
                <Label className="text-sm">Date</Label>
                <Input
                  type="date"
                  value={editDate}
                  onChange={(e) => { setEditDate(e.target.value); setEditConflictWarning(null); }}
                  className="min-h-[44px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-sm">
                    {editSessionType === 'testing' ? 'Road Test Start Time (ET)' : 'Start Time (ET)'}
                  </Label>
                  <Input
                    type="time"
                    step={60}
                    value={editStartTime}
                    onChange={(e) => { setEditStartTime(e.target.value); setEditConflictWarning(null); }}
                    className="min-h-[44px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">End Time (ET)</Label>
                  <Input
                    type="time"
                    step={60}
                    value={editEndTime}
                    onChange={(e) => { setEditEndTime(e.target.value); setEditConflictWarning(null); }}
                    className="min-h-[44px]"
                  />
                </div>
              </div>

              {editSessionType === 'testing' && (
                <div className="space-y-2">
                  <Label className="text-sm">Pickup Time (ET)</Label>
                  <Input
                    type="time"
                    step={60}
                    value={editPickupTime}
                    onChange={(e) => setEditPickupTime(e.target.value)}
                    className="min-h-[44px]"
                  />
                  <p className="text-[11px] text-muted-foreground">When the instructor picks the student up before the road test.</p>
                </div>
              )}

              {/* Pickup / Drop-off */}
              <div className="space-y-2">
                <Label className="text-sm">Pickup Address</Label>
                <Input
                  placeholder="Enter pickup address"
                  value={editPickupAddress}
                  onChange={(e) => setEditPickupAddress(e.target.value)}
                  className="min-h-[44px]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Drop-Off Address</Label>
                <Input
                  placeholder="Enter drop-off address"
                  value={editDropoffAddress}
                  onChange={(e) => setEditDropoffAddress(e.target.value)}
                  className="min-h-[44px]"
                />
              </div>

              {editConflictWarning && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{editConflictWarning}</span>
                  </div>
                  {isAdmin && (
                    <label className="flex items-start gap-2 mt-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editOverride}
                        onChange={e => setEditOverride(e.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-primary"
                      />
                      <span className="text-xs text-destructive/90">
                        <span className="font-medium">Save anyway (override conflict)</span>
                        <span className="block text-muted-foreground">
                          This will double-book the selected time. Use only when you're sure.
                        </span>
                      </span>
                    </label>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} className="min-h-[44px]">Cancel</Button>
            <Button onClick={handleEditSession} disabled={isLoading} className="min-h-[44px] gap-2">
              {isLoading ? <><Loader2 className="h-4 w-4 animate-spin" />Saving...</> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Profile Modal */}
      <AdminUserProfileModal open={profileModalOpen} onOpenChange={setProfileModalOpen} userId={profileModalUserId} onProfileUpdated={onSessionUpdate} />

      {/* Intake Preview Modal */}
      <IntakePreviewModal open={intakePreviewOpen} onOpenChange={setIntakePreviewOpen} profile={intakePreviewProfile} />

      {/* Road Test Result Modal */}
      {selectedSession && selectedSession.session_type === 'testing' && (
        <RoadTestResultModal
          open={roadTestModalOpen}
          onOpenChange={setRoadTestModalOpen}
          sessionId={selectedSession.id}
          studentId={selectedSession.student_id}
          instructorId={selectedSession.instructor_id}
          onSubmitted={() => { setSelectedSession(null); setRoadTestModalOpen(false); onSessionUpdate?.(); }}
        />
      )}
    </div>
  );
}

// ── Time options helper ──
function generateTimeOptions() {
  return Array.from({ length: 48 }, (_, i) => {
    const hours = Math.floor(i / 2);
    const mins = (i % 2) * 30;
    const timeValue = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    const ampm = hours < 12 ? 'AM' : 'PM';
    return <SelectItem key={timeValue} value={timeValue}>{`${displayHours}:${mins.toString().padStart(2, '0')} ${ampm}`}</SelectItem>;
  });
}

function getCalendarColor(session: Session): string {
  if (session.status === 'cancelled') return "bg-red-500/20 text-red-700 dark:text-red-300";
  if (session.status === 'partially_completed') return "bg-amber-500/25 text-amber-800 dark:text-amber-200";
  if (session.status === 'completed' || session.report_card_id) return "bg-green-500/20 text-green-700 dark:text-green-300";
  if (session.status === 'pending') return "bg-transparent text-amber-700 dark:text-amber-300 border-2 border-dashed border-amber-500";
  if (session.session_type === 'testing') return "bg-amber-500/20 text-amber-700 dark:text-amber-300";
  return "bg-gray-500/20 text-gray-700 dark:text-gray-300";
}

function getDotColor(session: Session): string {
  if (session.status === 'cancelled') return "bg-red-500";
  if (session.status === 'partially_completed') return "bg-amber-500";
  if (session.status === 'completed' || session.report_card_id) return "bg-green-500";
  if (session.status === 'pending') return "bg-amber-400 ring-2 ring-amber-500";
  if (session.session_type === 'testing') return "bg-amber-500";
  return "bg-gray-400";
}
