import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePortalAuth } from "@/hooks/usePortalAuth";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { ProtectedRoute } from "@/components/portal/ProtectedRoute";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar, CalendarCheck, Check, Clock, Send, Eye, CheckCircle, XCircle, Plus, Edit3, AlertTriangle, RotateCcw, MapPin } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { SessionTypeBadge } from "@/components/portal/SessionTypeBadge";
import { ProposalBuilder } from "@/components/portal/ProposalBuilder";
import { format, parseISO } from "date-fns";
import { getDisplayName } from "@/lib/profileUtils";
import { resolveProposalPackages, sumProposalHours } from "@/lib/packageSelection";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

function formatTime24to12(time: string): string {
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr);
  const m = mStr?.padStart(2, '0') || '00';
  const ampm = h < 12 ? 'AM' : 'PM';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${m} ${ampm}`;
}

export default function AdminProposals() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'staff']}>
      <PortalLayout>
        <AdminProposalsContent />
      </PortalLayout>
    </ProtectedRoute>
  );
}

function AdminProposalsContent() {
  const { user, role } = usePortalAuth();
  const [proposals, setProposals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProposal, setSelectedProposal] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [finalizing, setFinalizing] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editBuilderOpen, setEditBuilderOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [savingItem, setSavingItem] = useState(false);
  const [scheduleConfirmOpen, setScheduleConfirmOpen] = useState(false);
  const [scheduleConflicts, setScheduleConflicts] = useState<any[]>([]);
  const [overrideConflicts, setOverrideConflicts] = useState(false);


  const startEditItem = (item: any) => {
    setEditingItemId(item.id);
    setEditDate(item.proposed_date);
    setEditStart((item.start_time || '').slice(0, 5));
    setEditEnd((item.end_time || '').slice(0, 5));
  };

  const cancelEditItem = () => {
    setEditingItemId(null);
  };

  const saveEditItem = async (item: any) => {
    if (!editDate || !editStart || !editEnd) {
      toast.error('Date, start and end are required');
      return;
    }
    if (editEnd <= editStart) {
      toast.error('End time must be after start time');
      return;
    }
    setSavingItem(true);
    try {
      const [sh, sm] = editStart.split(':').map(Number);
      const [eh, em] = editEnd.split(':').map(Number);
      const durationMinutes = (eh * 60 + em) - (sh * 60 + sm);
      const nextStatus = item.item_status === 'conflict' ? 'pending_admin_finalize' : item.item_status;
      const { error } = await supabase
        .from('schedule_proposal_items')
        .update({
          proposed_date: editDate,
          start_time: `${editStart}:00`,
          end_time: `${editEnd}:00`,
          duration_minutes: durationMinutes,
          item_status: nextStatus,
          conflict_reason: null,
        })
        .eq('id', item.id);
      if (error) throw error;
      toast.success('Date updated');
      setEditingItemId(null);
      if (selectedProposal) await openProposal(selectedProposal);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update');
    } finally {
      setSavingItem(false);
    }
  };

  useEffect(() => { fetchProposals(); }, []);

  const fetchProposals = async () => {
    const { data } = await supabase
      .from('schedule_proposals')
      .select('*, student:profiles!schedule_proposals_student_id_fkey(*), instructor:profiles!schedule_proposals_instructor_id_fkey(*)')
      .order('created_at', { ascending: false });
    setProposals(data || []);
    setLoading(false);
  };

  const openProposal = async (proposal: any) => {
    setSelectedProposal(proposal);
    const { data } = await supabase
      .from('schedule_proposal_items')
      .select('*')
      .eq('proposal_id', proposal.id)
      .order('proposed_date', { ascending: true });
    setItems(data || []);
  };

  const handleFinalize = async () => {
    if (!selectedProposal) return;
    setFinalizing(true);
    try {
      const { data, error } = await supabase.functions.invoke('handle-proposal-action', {
        body: { action: 'finalize', proposal_id: selectedProposal.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`${data.scheduled} session(s) finalized${data.conflicts > 0 ? `, ${data.conflicts} conflict(s)` : ''}`);
      setSelectedProposal(null);
      fetchProposals();
    } catch (err: any) {
      toast.error(err.message || 'Failed to finalize');
    } finally {
      setFinalizing(false);
    }
  };

  const handleDirectFinalize = async () => {
    if (!selectedProposal) return;
    setFinalizing(true);
    try {
      const { data, error } = await supabase.functions.invoke('handle-proposal-action', {
        body: { action: 'finalize_edited', proposal_id: selectedProposal.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`${data.scheduled} session(s) scheduled${data.conflicts > 0 ? `, ${data.conflicts} conflict(s)` : ''}`);
      setSelectedProposal(null);
      fetchProposals();
    } catch (err: any) {
      toast.error(err.message || 'Failed to finalize');
    } finally {
      setFinalizing(false);
    }
  };

  const handleMarkFinalizedNoSchedule = async () => {
    if (!selectedProposal) return;
    setFinalizing(true);
    try {
      const { error: iErr } = await supabase
        .from('schedule_proposal_items')
        .update({ item_status: 'finalized' })
        .eq('proposal_id', selectedProposal.id)
        .in('item_status', ['proposed', 'pending_admin_finalize', 'conflict']);
      if (iErr) throw iErr;

      const { error: pErr } = await supabase
        .from('schedule_proposals')
        .update({ proposal_status: 'finalized', finalized_at: new Date().toISOString() })
        .eq('id', selectedProposal.id);
      if (pErr) throw pErr;

      toast.success('Proposal marked as finalized (no new sessions created)');
      setSelectedProposal(null);
      fetchProposals();
    } catch (err: any) {
      toast.error(err.message || 'Failed to mark as finalized');
    } finally {
      setFinalizing(false);
    }
  };

  const openScheduleConfirm = () => {
    setScheduleConflicts([]);
    setOverrideConflicts(false);
    setScheduleConfirmOpen(true);
  };

  const handleFinalizeAndSchedule = async () => {
    if (!selectedProposal) return;
    setFinalizing(true);
    try {
      const { data, error } = await supabase.functions.invoke('handle-proposal-action', {
        body: {
          action: 'admin_finalize_and_schedule',
          proposal_id: selectedProposal.id,
          override: overrideConflicts,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.conflict_detected) {
        setScheduleConflicts(data.conflicts || []);
        toast.error(`${data.conflicts?.length || 0} date(s) conflict with existing sessions`);
        return;
      }
      toast.success(`${data.scheduled} session(s) created and schedule finalized${data.conflicts > 0 ? `, ${data.conflicts} conflict(s)` : ''}`);
      setScheduleConfirmOpen(false);
      setSelectedProposal(null);
      fetchProposals();
    } catch (err: any) {
      toast.error(err.message || 'Failed to finalize and schedule');
    } finally {
      setFinalizing(false);
    }
  };



  const handleMarkUnderRevision = async () => {
    if (!selectedProposal) return;
    await supabase
      .from('schedule_proposals')
      .update({ proposal_status: 'under_revision' })
      .eq('id', selectedProposal.id);
    toast.success('Marked as under revision');
    setSelectedProposal(null);
    fetchProposals();
  };


  const statusColor = (status: string) => {
    switch (status) {
      case 'sent': return 'bg-blue-500/10 text-blue-500';
      case 'pending_admin_finalize': return 'bg-orange-500/10 text-orange-500';
      case 'auto_scheduled': case 'finalized': case 'revised_and_finalized': return 'bg-green-500/10 text-green-500';
      case 'declined': return 'bg-destructive/10 text-destructive';
      case 'edit_requested': return 'bg-yellow-500/10 text-yellow-500';
      case 'under_revision': return 'bg-purple-500/10 text-purple-500';
      case 'revised_and_resent': return 'bg-blue-500/10 text-blue-500';
      case 'partially_scheduled': case 'partially_finalized': return 'bg-yellow-500/10 text-yellow-500';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'sent': return 'Sent';
      case 'pending_admin_finalize': return 'Pending Finalization';
      case 'auto_scheduled': return 'Auto-Scheduled';
      case 'finalized': case 'revised_and_finalized': return 'Finalized';
      case 'declined': return 'Declined';
      case 'edit_requested': return 'Edit Requested';
      case 'under_revision': return 'Under Revision';
      case 'revised_and_resent': return 'Revised & Resent';
      case 'partially_scheduled': case 'partially_finalized': return 'Partial';
      default: return status;
    }
  };

  const pendingProposals = proposals.filter(p => p.proposal_status === 'pending_admin_finalize');
  const editRequestedProposals = proposals.filter(p => ['edit_requested', 'under_revision'].includes(p.proposal_status));
  const activeProposals = proposals.filter(p => ['sent', 'revised_and_resent'].includes(p.proposal_status));
  const completedProposals = proposals.filter(p => ['auto_scheduled', 'finalized', 'revised_and_finalized', 'declined', 'partially_scheduled', 'partially_finalized'].includes(p.proposal_status));

  const renderProposalCard = (p: any) => (
    <Card key={p.id} className="portal-card cursor-pointer hover:border-primary/50 transition-colors" onClick={() => openProposal(p)}>
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{getDisplayName(p.student, 'Student')}</p>
            <p className="text-xs text-muted-foreground">
              Instructor: {getDisplayName(p.instructor, 'Instructor')} • {format(parseISO(p.created_at), 'MMM d, yyyy')}
            </p>
            {p.latest_edit_request_note && ['edit_requested', 'under_revision'].includes(p.proposal_status) && (
              <p className="text-xs text-yellow-500 mt-1 truncate">
                Edit: "{p.latest_edit_request_note.slice(0, 60)}{p.latest_edit_request_note.length > 60 ? '...' : ''}"
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge className={`text-xs ${statusColor(p.proposal_status)}`}>
              {statusLabel(p.proposal_status)}
            </Badge>
            {p.acceptance_mode === 'auto_schedule_on_accept' && (
              <Badge variant="outline" className="text-[10px]">Auto</Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const canFinalize = selectedProposal && ['pending_admin_finalize'].includes(selectedProposal.proposal_status);
  const canFinalizeAndSchedule = selectedProposal && ['sent', 'revised_and_resent', 'pending_admin_finalize', 'edit_requested', 'under_revision', 'partially_finalized', 'partially_scheduled', 'conflict'].includes(selectedProposal.proposal_status);
  const schedulableItems = items.filter((i) => ['proposed', 'pending_admin_finalize', 'conflict'].includes(i.item_status));

  const canEditAndResend = selectedProposal && ['edit_requested', 'under_revision', 'sent', 'revised_and_resent'].includes(selectedProposal.proposal_status);
  const canDirectFinalize = selectedProposal && ['edit_requested', 'under_revision'].includes(selectedProposal.proposal_status);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold theme-heading">Schedule Proposals</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {pendingProposals.length} pending • {editRequestedProposals.length} edit requested
          </p>
        </div>
        <Button className="gap-2 min-h-[40px]" onClick={() => setBuilderOpen(true)}>
          <Plus className="h-4 w-4" />
          New Proposal
        </Button>
      </div>

      <Tabs defaultValue={editRequestedProposals.length > 0 ? "edits" : pendingProposals.length > 0 ? "pending" : "all"} className="space-y-4">
        <TabsList className="w-full sm:w-auto grid grid-cols-4 sm:inline-flex">
          <TabsTrigger value="edits" className="gap-1 text-xs sm:text-sm min-h-[40px]">
            <Edit3 className="h-3.5 w-3.5" />
            Edits ({editRequestedProposals.length})
          </TabsTrigger>
          <TabsTrigger value="pending" className="gap-1 text-xs sm:text-sm min-h-[40px]">
            <Clock className="h-3.5 w-3.5" />
            Pending ({pendingProposals.length})
          </TabsTrigger>
          <TabsTrigger value="active" className="gap-1 text-xs sm:text-sm min-h-[40px]">
            <Send className="h-3.5 w-3.5" />
            Sent ({activeProposals.length})
          </TabsTrigger>
          <TabsTrigger value="all" className="gap-1 text-xs sm:text-sm min-h-[40px]">
            <Calendar className="h-3.5 w-3.5" />
            All ({proposals.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="edits">
          {editRequestedProposals.length === 0 ? (
            <Card className="portal-card"><CardContent className="p-6 text-center text-muted-foreground">No edit requests</CardContent></Card>
          ) : (
            <div className="space-y-3">{editRequestedProposals.map(renderProposalCard)}</div>
          )}
        </TabsContent>
        <TabsContent value="pending">
          {pendingProposals.length === 0 ? (
            <Card className="portal-card"><CardContent className="p-6 text-center text-muted-foreground">No pending proposals</CardContent></Card>
          ) : (
            <div className="space-y-3">{pendingProposals.map(renderProposalCard)}</div>
          )}
        </TabsContent>
        <TabsContent value="active">
          {activeProposals.length === 0 ? (
            <Card className="portal-card"><CardContent className="p-6 text-center text-muted-foreground">No active proposals</CardContent></Card>
          ) : (
            <div className="space-y-3">{activeProposals.map(renderProposalCard)}</div>
          )}
        </TabsContent>
        <TabsContent value="all">
          {proposals.length === 0 ? (
            <Card className="portal-card"><CardContent className="p-6 text-center text-muted-foreground">No proposals</CardContent></Card>
          ) : (
            <div className="space-y-3">{proposals.map(renderProposalCard)}</div>
          )}
        </TabsContent>
      </Tabs>

      {/* Proposal Detail */}
      <Dialog open={!!selectedProposal} onOpenChange={(o) => { if (!o) setSelectedProposal(null); }}>
        <DialogContent className="w-[min(95vw,560px)] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              Proposal Details
            </DialogTitle>
          </DialogHeader>

          {selectedProposal && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Student</p>
                  <p className="font-medium">{getDisplayName(selectedProposal.student, 'Student')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Instructor</p>
                  <p className="font-medium">{getDisplayName(selectedProposal.instructor, 'Instructor')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge className={`text-xs ${statusColor(selectedProposal.proposal_status)}`}>
                    {statusLabel(selectedProposal.proposal_status)}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Mode</p>
                  <Badge variant="outline" className="text-xs">
                    {selectedProposal.acceptance_mode === 'auto_schedule_on_accept' ? 'Auto-Schedule' : 'Pending Admin'}
                  </Badge>
                </div>
              </div>

              {items.length > 0 && (() => {
                const { totalHours, includesRoadTest } = sumProposalHours(items as any);
                const { pkgs, isExplicit, totalPrice } = resolveProposalPackages({
                  packageId: selectedProposal.package_id,
                  totalHours,
                  includesRoadTest,
                });
                return (
                  <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                    <p className="text-xs text-muted-foreground">
                      {pkgs.length > 1 ? `Packages sent to student (${pkgs.length})` : 'Package sent to student'}
                      <span className="ml-2">{isExplicit ? 'Selected by admin' : 'Auto-matched'}</span>
                    </p>
                    {pkgs.map((pkg, i) => (
                      <p key={`${pkg.id}-${i}`} className="text-sm font-medium">
                        {pkg.label.replace(/\n/g, ' ')} · {pkg.price}
                      </p>
                    ))}
                    {pkgs.length > 1 && <p className="text-sm font-semibold mt-1">Total: {totalPrice}</p>}
                  </div>
                );
              })()}

              {selectedProposal.accepted_at && (
                <p className="text-xs text-muted-foreground">
                  Accepted: {format(parseISO(selectedProposal.accepted_at), 'MMM d, yyyy h:mm a')}
                </p>
              )}

              {/* Edit request note */}
              {selectedProposal.latest_edit_request_note && ['edit_requested', 'under_revision'].includes(selectedProposal.proposal_status) && (
                <Card className="border-yellow-500/30 bg-yellow-500/5">
                  <CardContent className="p-3">
                    <p className="text-xs font-medium text-yellow-500 mb-1 flex items-center gap-1">
                      <Edit3 className="h-3 w-3" />
                      Student Requested Edits
                    </p>
                    <p className="text-sm">{selectedProposal.latest_edit_request_note}</p>
                    {selectedProposal.latest_edit_request_at && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {format(parseISO(selectedProposal.latest_edit_request_at), 'MMM d, yyyy h:mm a')}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Items */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Dates ({items.length})</Label>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {items.map((item, idx) => {
                    const isEditing = editingItemId === item.id;
                    const canEditItem = ['pending_admin_finalize', 'proposed', 'conflict'].includes(item.item_status)
                      && ['pending_admin_finalize', 'edit_requested', 'under_revision', 'sent', 'revised_and_resent'].includes(selectedProposal.proposal_status);
                    return (
                      <div key={item.id} className="p-3 border rounded-lg text-sm space-y-2">
                        <div className="flex items-center gap-3">
                          <Badge variant="secondary" className="text-[10px] shrink-0">{idx + 1}</Badge>
                          <div className="flex-1 min-w-0">
                            {!isEditing ? (
                              <>
                                <p className="font-medium">{format(parseISO(item.proposed_date), 'EEE, MMM d, yyyy')}</p>
                                <p className="text-xs text-muted-foreground">{formatTime24to12(item.start_time)} – {formatTime24to12(item.end_time)}</p>
                                {item.session_type === 'testing' && (item as any).dds_location && (
                                  <p className="text-xs text-muted-foreground mt-0.5 flex items-start gap-1">
                                    <MapPin className="h-3 w-3 mt-0.5 shrink-0 text-primary" />
                                    <span className="break-words">{(item as any).dds_location}</span>
                                  </p>
                                )}
                              </>
                            ) : (
                              <div className="grid grid-cols-3 gap-2">
                                <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="h-9 text-xs" />
                                <Input type="time" value={editStart} onChange={(e) => setEditStart(e.target.value)} className="h-9 text-xs" />
                                <Input type="time" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} className="h-9 text-xs" />
                              </div>
                            )}
                          </div>
                          <SessionTypeBadge sessionType={item.session_type} />
                          {!isEditing && item.item_status === 'pending_admin_finalize' && (
                            <XCircle className="h-4 w-4 text-destructive shrink-0" />
                          )}
                          {!isEditing && (item.item_status === 'auto_scheduled' || item.item_status === 'finalized') && (
                            <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                          )}
                          {!isEditing && item.item_status === 'conflict' && (
                            <Badge variant="destructive" className="text-[10px]">Conflict</Badge>
                          )}
                        </div>
                        {canEditItem && (
                          <div className="flex gap-2 justify-end">
                            {!isEditing ? (
                              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => startEditItem(item)}>
                                <Edit3 className="h-3 w-3" /> Edit
                              </Button>
                            ) : (
                              <>
                                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={cancelEditItem} disabled={savingItem}>
                                  Cancel
                                </Button>
                                <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => saveEditItem(item)} disabled={savingItem}>
                                  <Check className="h-3 w-3" /> {savingItem ? 'Saving…' : 'Save'}
                                </Button>
                              </>
                            )}
                          </div>
                        )}
                        {item.conflict_reason && !isEditing && (
                          <p className="text-[11px] text-destructive">{item.conflict_reason}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2 pt-2">
                {/* Edit & Resend */}
                {canEditAndResend && (
                  <Button
                    variant="outline"
                    className="w-full min-h-[44px] gap-2"
                    onClick={() => {
                      setEditBuilderOpen(true);
                    }}
                  >
                    <Edit3 className="h-4 w-4" />
                    Edit & Resend Proposal
                  </Button>
                )}

                {/* Mark as under revision */}
                {selectedProposal.proposal_status === 'edit_requested' && (
                  <Button
                    variant="outline"
                    className="w-full min-h-[44px] gap-2"
                    onClick={handleMarkUnderRevision}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Mark Under Revision
                  </Button>
                )}

                {/* Direct finalize edited proposal */}
                {canDirectFinalize && (
                  <Button
                    className="w-full min-h-[44px] gap-2"
                    onClick={handleDirectFinalize}
                    disabled={finalizing}
                  >
                    <CheckCircle className="h-4 w-4" />
                    {finalizing ? 'Finalizing...' : 'Finalize & Schedule Edited Proposal'}
                  </Button>
                )}

                {/* Standard finalize for pending */}
                {canFinalize && (
                  <Button
                    className="w-full min-h-[44px] gap-2"
                    onClick={handleFinalize}
                    disabled={finalizing}
                  >
                    <CheckCircle className="h-4 w-4" />
                    {finalizing ? 'Finalizing...' : 'Confirm Payment & Finalize Schedule'}
                  </Button>
                )}

                {/* Finalize AND create the real sessions */}
                {canFinalizeAndSchedule && schedulableItems.length > 0 && (
                  <div className="space-y-1">
                    <Button
                      className="w-full min-h-[44px] gap-2"
                      onClick={openScheduleConfirm}
                      disabled={finalizing}
                    >
                      <CalendarCheck className="h-4 w-4" />
                      Mark as Finalized (schedule new sessions)
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      Creates real sessions from the dates below and confirms the schedule.
                    </p>
                  </div>
                )}

                {/* Close out a proposal without creating sessions */}

                {['sent', 'revised_and_resent', 'edit_requested', 'under_revision', 'pending_admin_finalize'].includes(selectedProposal.proposal_status) && (
                  <div className="space-y-1">
                    <Button
                      variant="outline"
                      className="w-full min-h-[44px] gap-2"
                      onClick={handleMarkFinalizedNoSchedule}
                      disabled={finalizing}
                    >
                      <Check className="h-4 w-4" />
                      Mark as Finalized (no new sessions)
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      Closes this pending proposal without scheduling anything — use when the student is already scheduled.
                    </p>
                  </div>
                )}

              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm finalize & schedule */}
      <Dialog open={scheduleConfirmOpen} onOpenChange={(o) => { if (!finalizing) setScheduleConfirmOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Finalize & create sessions?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This will create {schedulableItems.length} real session{schedulableItems.length === 1 ? '' : 's'} and confirm the schedule for{' '}
              {selectedProposal ? getDisplayName(selectedProposal.student, 'the student') : 'the student'}. Emails and notifications will be sent.
            </p>
            <div className="space-y-1 max-h-[200px] overflow-y-auto rounded-lg border p-3">
              {schedulableItems.map((i) => (
                <p key={i.id} className="text-xs">
                  {format(parseISO(i.proposed_date), 'EEE, MMM d, yyyy')} • {formatTime24to12(i.start_time)} – {formatTime24to12(i.end_time)}
                </p>
              ))}
            </div>

            {scheduleConflicts.length > 0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 space-y-2">
                <p className="text-sm font-medium text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  {scheduleConflicts.length} conflicting date{scheduleConflicts.length === 1 ? '' : 's'}
                </p>
                {scheduleConflicts.map((c) => (
                  <p key={c.item_id} className="text-xs text-destructive">
                    {format(parseISO(c.proposed_date), 'EEE, MMM d')} {formatTime24to12(c.start_time)} – {formatTime24to12(c.end_time)} overlaps {c.conflicting_sessions?.length || 1} existing session(s)
                  </p>
                ))}
                {role === 'admin' ? (
                  <label className="flex items-start gap-2 pt-1 cursor-pointer">
                    <Checkbox checked={overrideConflicts} onCheckedChange={(v) => setOverrideConflicts(v === true)} className="mt-0.5" />
                    <span className="text-xs">
                      Schedule anyway (override conflict)
                      <span className="block text-muted-foreground">This will double-book the selected time. Use only when you're sure.</span>
                    </span>
                  </label>
                ) : (
                  <p className="text-xs text-muted-foreground">Only an admin can override scheduling conflicts.</p>
                )}
              </div>
            )}

            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" onClick={() => setScheduleConfirmOpen(false)} disabled={finalizing}>Cancel</Button>
              <Button
                onClick={handleFinalizeAndSchedule}
                disabled={finalizing || (scheduleConflicts.length > 0 && !overrideConflicts)}
                className="gap-2"
              >
                <CalendarCheck className="h-4 w-4" />
                {finalizing ? 'Scheduling…' : scheduleConflicts.length > 0 ? 'Override & Schedule' : 'Confirm & Schedule'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ProposalBuilder

        open={builderOpen}
        onOpenChange={setBuilderOpen}
        onProposalSent={fetchProposals}
      />

      {/* Edit Proposal Builder - preloaded with existing proposal data */}
      {selectedProposal && (
        <ProposalBuilder
          open={editBuilderOpen}
          onOpenChange={setEditBuilderOpen}
          preselectedStudentId={selectedProposal.student_id}
          preselectedInstructorId={selectedProposal.instructor_id}
          editingProposalId={selectedProposal.id}
          existingItems={items}
          existingNote={selectedProposal.note_to_student || ''}
          existingAcceptanceMode={selectedProposal.acceptance_mode}
          existingPackageId={selectedProposal.package_id}
          onProposalSent={() => {
            setSelectedProposal(null);
            fetchProposals();
          }}
        />
      )}
    </div>
  );
}
