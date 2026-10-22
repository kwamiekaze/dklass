import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { profileFirstName } from "@/lib/nameUtils";
import { usePortalAuth } from "@/hooks/usePortalAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Send, Calendar, Info } from "lucide-react";
import { Profile } from "@/types/portal";
import { getDisplayName } from "@/lib/profileUtils";
import { ProfileCombobox } from "@/components/portal/ProfileCombobox";
import { DdsLocationPicker } from "@/components/portal/DdsLocationPicker";

import { toast } from "sonner";
import { parsePackageIds, resolveProposalPackages, serializePackageIds, sumProposalHours } from "@/lib/packageSelection";
import { PACKAGES } from "@/data/packages";
import { format, parseISO } from "date-fns";

function formatTime24to12(time: string): string {
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr);
  const m = mStr?.padStart(2, '0') || '00';
  const ampm = h < 12 ? 'AM' : 'PM';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${m} ${ampm}`;
}

interface ProposalItem {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_minutes: string;
  session_type: string;
  dds_location: string;
  pickup_time: string;
}

interface ProposalBuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedStudentId?: string;
  preselectedInstructorId?: string;
  editingProposalId?: string;
  existingItems?: any[];
  existingNote?: string;
  existingAcceptanceMode?: string;
  existingPackageId?: string | null;
  onProposalSent?: () => void;
}

function computeEndTime(startTime: string, durationMinutes: number): string {
  const [h, m] = startTime.split(':').map(Number);
  const totalMins = h * 60 + m + durationMinutes;
  const endH = Math.floor(totalMins / 60) % 24;
  const endM = totalMins % 60;
  return `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
}

export function ProposalBuilder({
  open, onOpenChange, preselectedStudentId, preselectedInstructorId,
  editingProposalId, existingItems, existingNote, existingAcceptanceMode,
  existingPackageId, onProposalSent,
}: ProposalBuilderProps) {
  const { role, user } = usePortalAuth();
  const isAdmin = role === 'admin' || role === 'staff';
  const isEditing = !!editingProposalId;

  const [students, setStudents] = useState<Profile[]>([]);
  const [instructors, setInstructors] = useState<Profile[]>([]);
  const [studentId, setStudentId] = useState(preselectedStudentId || '');
  const [instructorId, setInstructorId] = useState(preselectedInstructorId || (role === 'instructor' ? user?.id || '' : ''));
  const [acceptanceMode, setAcceptanceMode] = useState(existingAcceptanceMode || 'pending_admin_finalize');
  const [noteToStudent, setNoteToStudent] = useState(existingNote || '');
  const [items, setItems] = useState<ProposalItem[]>([createEmptyItem()]);
  // the packages sent with the proposal (empty = auto-match by total hours)
  const [packageIds, setPackageIds] = useState<string[]>(() => parsePackageIds(existingPackageId));
  const [sending, setSending] = useState(false);
  const [locationErrors, setLocationErrors] = useState<string[]>([]);
  const [studentAvailability, setStudentAvailability] = useState<{days: string[], windows: string[], notes: string | null} | null>(null);

  useEffect(() => {
    if (open) fetchOptions();
  }, [open]);

  useEffect(() => {
    if (preselectedStudentId) setStudentId(preselectedStudentId);
    if (preselectedInstructorId) setInstructorId(preselectedInstructorId);
  }, [preselectedStudentId, preselectedInstructorId]);

  // Load existing items when editing
  useEffect(() => {
    if (isEditing && existingItems?.length) {
      setItems(existingItems.map(ei => ({
        id: crypto.randomUUID(),
        date: ei.proposed_date,
        start_time: ei.start_time?.slice(0, 5) || '09:00',
        end_time: ei.end_time?.slice(0, 5) || '11:00',
        duration_minutes: String(ei.duration_minutes || 120),
        session_type: ei.session_type || 'driving',
        dds_location: ei.dds_location || '',
        pickup_time: (ei.pickup_time || '').slice(0, 5),
      })));
    }
    if (existingNote !== undefined) setNoteToStudent(existingNote || '');
    if (existingAcceptanceMode) setAcceptanceMode(existingAcceptanceMode);
    if (isEditing) setPackageIds(parsePackageIds(existingPackageId));
  }, [isEditing, existingItems, existingNote, existingAcceptanceMode, existingPackageId]);

  // Fetch student availability when student is selected
  useEffect(() => {
    if (studentId) {
      supabase
        .from('profiles')
        .select('availability_days, availability_windows, availability_notes')
        .eq('id', studentId)
        .single()
        .then(({ data }) => {
          if (data) {
            setStudentAvailability({
              days: (data as any).availability_days || [],
              windows: (data as any).availability_windows || [],
              notes: (data as any).availability_notes || null,
            });
          } else {
            setStudentAvailability(null);
          }
        });
    }
  }, [studentId]);

  function createEmptyItem(): ProposalItem {
    return {
      id: crypto.randomUUID(),
      date: '',
      start_time: '09:00',
      end_time: '11:00',
      duration_minutes: '120',
      session_type: 'driving',
      dds_location: '',
      pickup_time: '',
    };
  }

  const fetchOptions = async () => {
    const { data: studentRoles } = await supabase.from('user_roles').select('user_id').eq('role', 'student');
    if (studentRoles?.length) {
      const { data: sp } = await supabase.from('profiles').select('*').in('id', studentRoles.map(r => r.user_id)).eq('approval_status', 'approved');
      setStudents((sp || []) as Profile[]);
    }
    const { data: instructorRoles } = await supabase.from('user_roles').select('user_id').eq('role', 'instructor');
    if (instructorRoles?.length) {
      const { data: ip } = await supabase.from('profiles').select('*').in('id', instructorRoles.map(r => r.user_id)).eq('approval_status', 'approved');
      setInstructors((ip || []) as Profile[]);
    }
  };

  const addItem = () => {
    if (items.length >= 20) { toast.error('Maximum 20 dates per proposal'); return; }
    setItems(prev => [...prev, createEmptyItem()]);
  };

  const removeItem = (id: string) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const updateItem = (id: string, field: keyof ProposalItem, value: string) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: value };
      if (field === 'dds_location' && value.trim()) {
        setLocationErrors(prev => prev.filter(e => e !== id));
      }
      if (field === 'start_time' || field === 'duration_minutes') {
        const st = field === 'start_time' ? value : item.start_time;
        const dur = field === 'duration_minutes' ? parseInt(value) : parseInt(item.duration_minutes);
        updated.end_time = /^\d{1,2}:\d{2}$/.test(st) && Number.isFinite(dur)
          ? computeEndTime(st, dur)
          : '';
      }
      return updated;
    }));
  };

  const handleSend = async () => {
    if (!studentId || !instructorId) { toast.error('Select student and instructor'); return; }
    const validItems = items.filter(i => i.date && i.start_time);
    if (validItems.length === 0) { toast.error('Add at least one date'); return; }
    const missingLocation = validItems.filter(i => i.session_type === 'testing' && !i.dds_location.trim());
    if (missingLocation.length > 0) {
      setLocationErrors(missingLocation.map(i => i.id));
      toast.error('Select a DDS testing location for each Road Test date');
      return;
    }
    setLocationErrors([]);

    setSending(true);
    try {
      const { data: studentProfile } = await supabase.from('profiles').select('pickup_address, dropoff_address, email, full_name, first_name, last_name').eq('id', studentId).single();

      // The proposal email (dates, package and the Square pay link): sent for a new proposal and again for a revised one. Fire and forget, so a mail hiccup never blocks the proposal itself.
      const sendProposalEmail = (proposalId: string, pkgs: { id: string; label: string; price: string; squareUrl: string }[], totalPrice: string, totalHours: number, revised: boolean) => {
        const pkg = pkgs[0]!;
        try {
          const instructorProfile = instructors.find(i => i.id === instructorId);
          const studentEmail = studentProfile?.email;
          if (!studentEmail) return;
          const emailItems = validItems.map(it => ({
            dateLabel: format(parseISO(it.date), 'EEE, MMM d, yyyy'),
            timeLabel: `${formatTime24to12(it.start_time)} – ${formatTime24to12(it.end_time)}`,
            sessionType: it.session_type === 'testing' ? 'testing' : 'driving',
            locationLabel: it.session_type === 'testing' ? (it.dds_location || undefined) : undefined,
          }));
          supabase.functions.invoke('send-transactional-email', {
            body: {
              templateName: 'schedule-proposal',
              recipientEmail: studentEmail,
              idempotencyKey: revised ? `schedule-proposal-${proposalId}-rev-${Date.now()}` : `schedule-proposal-${proposalId}`,
              templateData: {
                recipientName: profileFirstName(studentProfile as any),
                instructorName: instructorProfile ? (profileFirstName(instructorProfile as any) || 'Your Instructor') : undefined,
                noteToStudent: noteToStudent || undefined,
                items: emailItems,
                packageLabel: pkgs.map(p => p.label.replace(/\n/g, ' ')).join(' + '),
                packageHours: totalHours,
                packagePrice: pkgs.length > 1 ? totalPrice : pkg.price,
                paymentUrl: pkg.squareUrl,
                packages: pkgs.map(p => ({ label: p.label.replace(/\n/g, ' '), price: p.price, paymentUrl: p.squareUrl })),
                revised,
              },
            },
          }).catch(err => console.warn('[proposal] email dispatch failed', err));
        } catch (mailErr) {
          console.warn('[proposal] email preparation failed', mailErr);
        }
      };

      if (isEditing) {
        // Update existing proposal: delete old items, insert new ones, update status
        const { error: delErr } = await supabase
          .from('schedule_proposal_items')
          .delete()
          .eq('proposal_id', editingProposalId!);
        if (delErr) throw delErr;

        const itemRows = validItems.map(item => ({
          proposal_id: editingProposalId!,
          proposed_date: item.date,
          start_time: item.start_time,
          end_time: item.end_time,
          duration_minutes: parseInt(item.duration_minutes),
          session_type: item.session_type,
          dds_location: item.session_type === 'testing' ? (item.dds_location.trim() || null) : null,
          pickup_time: item.session_type === 'testing' && item.pickup_time ? `${item.pickup_time}:00` : null,
          pickup_address: studentProfile?.pickup_address || null,
          dropoff_address: studentProfile?.dropoff_address || null,
          item_status: 'proposed',
        }));

        const { error: iErr } = await supabase.from('schedule_proposal_items').insert(itemRows);
        if (iErr) throw iErr;

        const { error: uErr } = await supabase
          .from('schedule_proposals')
          .update({
            proposal_status: 'revised_and_resent',
            note_to_student: noteToStudent || null,
            acceptance_mode: acceptanceMode,
            package_id: serializePackageIds(packageIds),
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingProposalId!);
        if (uErr) throw uErr;

        // Mark edit requests as addressed
        await supabase
          .from('proposal_edit_requests')
          .update({ status: 'resent', resolved_by: user!.id, resolved_at: new Date().toISOString() })
          .eq('proposal_id', editingProposalId!)
          .eq('status', 'open');

        // Notify student
        await supabase.from('notifications').insert({
          user_id: studentId,
          title: 'Schedule Proposal Updated',
          message: 'Your schedule proposal has been updated. Please review the revised schedule.',
          type: 'schedule',
          severity: 'info',
          link: '/student/proposals',
        });

        {
          const { totalHours, includesRoadTest } = sumProposalHours(validItems);
          const { pkgs, totalPrice } = resolveProposalPackages({ packageId: serializePackageIds(packageIds), totalHours, includesRoadTest });
          sendProposalEmail(editingProposalId!, pkgs, totalPrice, totalHours, true);
        }

        toast.success(`Revised proposal sent with ${validItems.length} date(s)`);
      } else {
        // Create new proposal
        const { data: proposal, error: pErr } = await supabase
          .from('schedule_proposals')
          .insert({
            student_id: studentId,
            instructor_id: instructorId,
            created_by: user!.id,
            created_by_role: role,
            proposal_status: 'sent',
            acceptance_mode: acceptanceMode,
            note_to_student: noteToStudent || null,
            package_id: serializePackageIds(packageIds),
          })
          .select()
          .single();
        if (pErr) throw pErr;

        const itemRows = validItems.map(item => ({
          proposal_id: proposal.id,
          proposed_date: item.date,
          start_time: item.start_time,
          end_time: item.end_time,
          duration_minutes: parseInt(item.duration_minutes),
          session_type: item.session_type,
          dds_location: item.session_type === 'testing' ? (item.dds_location.trim() || null) : null,
          pickup_time: item.session_type === 'testing' && item.pickup_time ? `${item.pickup_time}:00` : null,
          pickup_address: studentProfile?.pickup_address || null,
          dropoff_address: studentProfile?.dropoff_address || null,
          item_status: 'proposed',
        }));

        const { error: iErr } = await supabase.from('schedule_proposal_items').insert(itemRows);
        if (iErr) throw iErr;

        // Resolve package + payment link based on total hours
        const { totalHours, includesRoadTest } = sumProposalHours(validItems);
        const { pkgs, totalPrice } = resolveProposalPackages({
          packageId: serializePackageIds(packageIds),
          totalHours,
          includesRoadTest,
        });
        const pkg = pkgs[0]!;
        const packageMsg = pkgs.length > 1
          ? `Packages: ${pkgs.map(p => `${p.label.replace(/\n/g, ' ')} (${p.price}): ${p.squareUrl}`).join('; ')}. Total ${totalPrice}. Complete payment to confirm your slot.`
          : `Recommended package: ${pkg.label.replace(/\n/g, ' ')} (${pkg.price}). Complete payment to confirm your slot: ${pkg.squareUrl}`;

        await supabase.from('notifications').insert({
          user_id: studentId,
          title: 'New Schedule Proposal',
          message: `You have a new proposed schedule with ${validItems.length} date(s). ${packageMsg}`,
          type: 'schedule',
          severity: 'info',
          link: '/student/proposals',
          metadata: {
            proposal_id: proposal.id,
            package_id: pkg.id,
            package_label: pkg.label,
            package_price: pkg.price,
            payment_url: pkg.squareUrl,
            total_hours: totalHours,
            packages: pkgs.map(p => ({ id: p.id, label: p.label, price: p.price, payment_url: p.squareUrl })),
            total_price: totalPrice,
          } as any,
        });

        sendProposalEmail(proposal.id, pkgs, totalPrice, totalHours, false);

        toast.success(`Proposal sent with ${validItems.length} date(s)`);
      }

      onOpenChange(false);
      onProposalSent?.();
      if (!isEditing) {
        setItems([createEmptyItem()]);
        setNoteToStudent('');
        setPackageIds([]);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to send proposal');
    } finally {
      setSending(false);
    }
  };

  const hasAvailability = studentAvailability && (studentAvailability.days.length > 0 || studentAvailability.windows.length > 0 || studentAvailability.notes);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(95vw,640px)] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            {isEditing ? 'Edit & Resend Proposal' : 'Propose Schedule'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Student & Instructor Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">Student</Label>
              <ProfileCombobox
                people={students}
                value={studentId}
                onChange={setStudentId}
                disabled={isEditing}
                placeholder="Select student"
                emptyText="No students found"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Instructor</Label>
              <ProfileCombobox
                people={instructors}
                value={instructorId}
                onChange={setInstructorId}
                disabled={role === 'instructor' || isEditing}
                placeholder="Select instructor"
                emptyText="No instructors found"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm">Packages</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1"
                  onClick={() => {
                    if (packageIds.length >= 10) { toast.error('Maximum 10 packages per proposal'); return; }
                    setPackageIds(prev => [...prev, PACKAGES[0]!.id]);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" /> Add package
                </Button>
              </div>
              {packageIds.length === 0 ? (
                <div className="rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
                  Auto (match by total hours)
                </div>
              ) : (
                <div className="space-y-2">
                  {packageIds.map((pid, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Select value={pid} onValueChange={(v) => setPackageIds(prev => prev.map((x, k) => (k === idx ? v : x)))}>
                        <SelectTrigger className="min-h-[44px] flex-1">
                          <SelectValue placeholder="Select package" />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {PACKAGES.map(p => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.label.replace(/\n/g, ' ')} — {p.price}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 shrink-0 text-destructive"
                        aria-label="Remove package"
                        onClick={() => setPackageIds(prev => prev.filter((_, k) => k !== idx))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {packageIds.length > 1 && (
                    <p className="text-xs font-medium">
                      Total: {resolveProposalPackages({ packageId: serializePackageIds(packageIds), totalHours: 0, includesRoadTest: false }).totalPrice}
                    </p>
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Sets the payment link(s) sent to the student. Add more than one package if needed; remove them all to auto-match by total hours.
              </p>
            </div>
          </div>

          {/* Student Availability Helper */}
          {hasAvailability && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-3">
                <p className="text-xs font-medium text-primary mb-1 flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  Student Availability
                </p>
                {studentAvailability!.days.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">Days:</span> {studentAvailability!.days.join(', ')}
                  </p>
                )}
                {studentAvailability!.windows.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">Times:</span> {studentAvailability!.windows.join(', ')}
                  </p>
                )}
                {studentAvailability!.notes && (
                  <p className="text-xs text-muted-foreground mt-1">
                    <span className="font-medium">Notes:</span> {studentAvailability!.notes}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Acceptance Mode */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">After student accepts</Label>
            <RadioGroup value={acceptanceMode} onValueChange={setAcceptanceMode} className="space-y-2">
              <div className="flex items-start gap-3 p-3 rounded-lg border">
                <RadioGroupItem value="pending_admin_finalize" id="mode-pending" className="mt-0.5" />
                <Label htmlFor="mode-pending" className="text-sm cursor-pointer leading-relaxed">
                  Mark accepted dates as pending for admin review
                </Label>
              </div>
              <div className={`flex items-start gap-3 p-3 rounded-lg border ${!isAdmin ? 'opacity-50' : ''}`}>
                <RadioGroupItem value="auto_schedule_on_accept" id="mode-auto" disabled={!isAdmin} className="mt-0.5" />
                <Label htmlFor="mode-auto" className={`text-sm cursor-pointer leading-relaxed ${!isAdmin ? 'cursor-not-allowed' : ''}`}>
                  Auto-schedule accepted dates immediately
                  {!isAdmin && <span className="text-xs text-muted-foreground block mt-0.5">Admin only</span>}
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <Label className="text-sm">Note to student (optional)</Label>
            <Textarea
              value={noteToStudent}
              onChange={e => setNoteToStudent(e.target.value)}
              placeholder="Add any notes for the student..."
              className="min-h-[60px]"
            />
          </div>

          {/* Date Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Proposed Dates ({items.length}/20)</Label>
              <Button type="button" variant="outline" size="sm" onClick={addItem} disabled={items.length >= 20} className="gap-1 min-h-[36px]">
                <Plus className="h-3.5 w-3.5" />
                Add Date
              </Button>
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {items.map((item, idx) => (
                <Card key={item.id} className="border-border/50">
                  <CardContent className="p-3">
                    <div className="flex items-start gap-2">
                      <Badge variant="secondary" className="text-[10px] shrink-0 mt-1">{idx + 1}</Badge>
                      <div className="flex-1 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Date</Label>
                            <Input type="date" value={item.date} onChange={e => updateItem(item.id, 'date', e.target.value)} className="h-9 text-sm" />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Start Time</Label>
                            <Input
                              type="time"
                              step={60}
                              value={item.start_time}
                              onChange={e => updateItem(item.id, 'start_time', e.target.value)}
                              className="h-9 text-sm"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Duration</Label>
                            <Select value={item.duration_minutes} onValueChange={v => updateItem(item.id, 'duration_minutes', v)}>
                              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent className="bg-popover border z-50 max-h-[240px]">
                                <SelectItem value="60">1 hour</SelectItem>
                                <SelectItem value="90">1.5 hours</SelectItem>
                                <SelectItem value="120">2 hours</SelectItem>
                                <SelectItem value="180">3 hours</SelectItem>
                                <SelectItem value="210">3.5 hours</SelectItem>
                                <SelectItem value="240">4 hours</SelectItem>
                                <SelectItem value="270">4.5 hours</SelectItem>
                                <SelectItem value="300">5 hours</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Type</Label>
                            <Select value={item.session_type} onValueChange={v => updateItem(item.id, 'session_type', v)}>
                              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent className="bg-popover border z-50">
                                <SelectItem value="driving">Driving</SelectItem>
                                <SelectItem value="testing">Road Test</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        {item.session_type === 'testing' && (
                          <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-2">
                            <div>
                              <Label className="text-[10px] text-muted-foreground">DDS Testing Location</Label>
                              <DdsLocationPicker
                                value={item.dds_location}
                                onChange={v => updateItem(item.id, 'dds_location', v)}
                              />
                              {locationErrors.includes(item.id) && (
                                <p className="text-[11px] text-destructive mt-1">Select a DDS testing location for this road test date.</p>
                              )}
                            </div>
                            <div>
                              <Label className="text-[10px] text-muted-foreground">Pickup Time (optional)</Label>
                              <Input
                                type="time"
                                step={60}
                                value={item.pickup_time}
                                onChange={e => updateItem(item.id, 'pickup_time', e.target.value)}
                                className="h-9 text-sm"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                      <Button
                        type="button" variant="ghost" size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => removeItem(item.id)}
                        disabled={items.length <= 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Send */}
          <Button className="w-full min-h-[44px] gap-2" onClick={handleSend} disabled={sending}>
            <Send className="h-4 w-4" />
            {sending ? 'Sending...' : isEditing
              ? `Resend Edited Proposal (${items.filter(i => i.date).length} dates)`
              : `Send Proposal (${items.filter(i => i.date).length} dates)`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
