import { useState, useEffect } from "react";
import { usePortalAuth } from "@/hooks/usePortalAuth";
import { supabase } from "@/integrations/supabase/client";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { ProtectedRoute } from "@/components/portal/ProtectedRoute";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar, Check, X, Clock, Edit3, Send, MapPin } from "lucide-react";
import { SessionTypeBadge } from "@/components/portal/SessionTypeBadge";
import { format, parseISO } from "date-fns";
import { getDisplayName } from "@/lib/profileUtils";
import { toast } from "sonner";
import { resolveProposalPackages, sumProposalHours } from "@/lib/packageSelection";

/** Convert "HH:MM" or "HH:MM:SS" (24h) to "h:MM AM/PM" display */
function formatTime24to12(time: string): string {
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr);
  const m = mStr?.padStart(2, '0') || '00';
  const ampm = h < 12 ? 'AM' : 'PM';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${m} ${ampm}`;
}

export default function StudentProposals() {
  return (
    <ProtectedRoute allowedRoles={['student']}>
      <PortalLayout>
        <StudentProposalsContent />
      </PortalLayout>
    </ProtectedRoute>
  );
}

function StudentProposalsContent() {
  const { user } = usePortalAuth();
  const [proposals, setProposals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProposal, setSelectedProposal] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [declineReason, setDeclineReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  // Edit request state
  const [editRequestOpen, setEditRequestOpen] = useState(false);
  const [editRequestNote, setEditRequestNote] = useState('');
  const [editRequestLoading, setEditRequestLoading] = useState(false);

  useEffect(() => { if (user) fetchProposals(); }, [user]);

  const fetchProposals = async () => {
    const { data } = await supabase
      .from('schedule_proposals')
      .select('*, instructor:profiles!schedule_proposals_instructor_id_fkey(*)')
      .eq('student_id', user!.id)
      .order('created_at', { ascending: false });
    setProposals(data || []);
    setLoading(false);
  };

  const openProposal = async (proposal: any) => {
    setSelectedProposal(proposal);
    setResultMessage(null);
    const { data } = await supabase
      .from('schedule_proposal_items')
      .select('*')
      .eq('proposal_id', proposal.id)
      .order('proposed_date', { ascending: true });
    setItems(data || []);
  };

  const handleAction = async (action: 'accept' | 'decline') => {
    setActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('handle-proposal-action', {
        body: {
          action,
          proposal_id: selectedProposal.id,
          reason: action === 'decline' ? declineReason : undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (action === 'accept') {
        setResultMessage(data.message);
        toast.success('Proposal accepted');
      } else {
        toast.success('Proposal declined');
        setSelectedProposal(null);
      }
      fetchProposals();
    } catch (err: any) {
      toast.error(err.message || 'Failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditRequest = async () => {
    if (!editRequestNote.trim()) {
      toast.error('Please describe your requested changes');
      return;
    }
    setEditRequestLoading(true);
    try {
      // Insert edit request
      const { error: insertErr } = await supabase
        .from('proposal_edit_requests')
        .insert({
          proposal_id: selectedProposal.id,
          student_id: user!.id,
          note_text: editRequestNote.trim(),
          status: 'open',
        });
      if (insertErr) throw insertErr;

      // Update proposal status
      const { error: updateErr } = await supabase
        .from('schedule_proposals')
        .update({
          proposal_status: 'edit_requested',
          latest_edit_request_note: editRequestNote.trim(),
          latest_edit_request_at: new Date().toISOString(),
        })
        .eq('id', selectedProposal.id);
      if (updateErr) throw updateErr;

      // Notify admins
      const { data: staffUsers } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('role', ['admin', 'staff']);

      const studentName = user?.user_metadata?.full_name || user?.email || 'Student';

      if (staffUsers?.length) {
        await supabase.from('notifications').insert(
          staffUsers.map(su => ({
            user_id: su.user_id,
            title: 'Schedule Edit Requested',
            message: `${studentName} requested edits to a schedule proposal.`,
            type: 'schedule',
            severity: 'info',
            link: '/admin/proposals',
          }))
        );
      }

      // Notify instructor
      if (selectedProposal.instructor_id) {
        await supabase.from('notifications').insert({
          user_id: selectedProposal.instructor_id,
          title: 'Schedule Edit Requested',
          message: `${studentName} requested schedule changes.`,
          type: 'schedule',
          severity: 'info',
          link: '/instructor',
        });
      }

      toast.success('Your schedule edit request has been sent to staff.');
      setEditRequestOpen(false);
      setEditRequestNote('');
      setSelectedProposal(null);
      fetchProposals();
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit edit request');
    } finally {
      setEditRequestLoading(false);
    }
  };

  const canRespondToProposal = (status: string) =>
    ['sent', 'revised_and_resent'].includes(status);

  const statusColor = (status: string) => {
    switch (status) {
      case 'sent': case 'revised_and_resent': return 'bg-primary/10 text-primary';
      case 'pending_admin_finalize': return 'bg-orange-500/10 text-orange-500';
      case 'auto_scheduled': case 'finalized': case 'revised_and_finalized': return 'bg-green-500/10 text-green-500';
      case 'declined': return 'bg-destructive/10 text-destructive';
      case 'edit_requested': case 'under_revision': return 'bg-yellow-500/10 text-yellow-500';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'sent': return 'Awaiting Your Review';
      case 'revised_and_resent': return 'Revised — Review Again';
      case 'pending_admin_finalize': return 'Accepted — Pending';
      case 'auto_scheduled': return 'Scheduled';
      case 'finalized': case 'revised_and_finalized': return 'Finalized';
      case 'declined': return 'Declined';
      case 'edit_requested': return 'Edit Requested';
      case 'under_revision': return 'Under Revision';
      case 'partially_scheduled': return 'Partially Scheduled';
      default: return status;
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold theme-heading">Proposed Schedules</h1>
        <p className="text-sm text-muted-foreground mt-1">Review and respond to schedule proposals from your instructor</p>
      </div>

      {loading ? (
        <Card className="portal-card"><CardContent className="p-6 text-center text-muted-foreground">Loading...</CardContent></Card>
      ) : proposals.length === 0 ? (
        <Card className="portal-card">
          <CardContent className="p-8 text-center">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No schedule proposals yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {proposals.map(p => (
            <Card key={p.id} className="portal-card cursor-pointer hover:border-primary/50 transition-colors" onClick={() => openProposal(p)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm sm:text-base truncate">
                      From {getDisplayName(p.instructor, 'Instructor')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(p.created_at), 'MMM d, yyyy h:mm a')}
                    </p>
                  </div>
                  <Badge className={`shrink-0 text-xs ${statusColor(p.proposal_status)}`}>
                    {statusLabel(p.proposal_status)}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Proposal Detail Dialog */}
      <Dialog open={!!selectedProposal} onOpenChange={(o) => { if (!o) setSelectedProposal(null); }}>
        <DialogContent className="w-[min(95vw,560px)] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Schedule Proposal
            </DialogTitle>
          </DialogHeader>

          {selectedProposal && (
            <div className="space-y-4">
              {/* Info */}
              <div className="space-y-1 text-sm">
                <p><span className="text-muted-foreground">Instructor:</span> {getDisplayName(selectedProposal.instructor, 'Instructor')}</p>
                <p><span className="text-muted-foreground">Sent:</span> {format(parseISO(selectedProposal.created_at), 'MMM d, yyyy h:mm a')}</p>
                <Badge className={`text-xs mt-1 ${statusColor(selectedProposal.proposal_status)}`}>
                  {statusLabel(selectedProposal.proposal_status)}
                </Badge>
              </div>

              {selectedProposal.note_to_student && (
                <Card className="border-primary/20">
                  <CardContent className="p-3 text-sm">
                    <p className="text-xs text-muted-foreground mb-1">Note from instructor</p>
                    {selectedProposal.note_to_student}
                  </CardContent>
                </Card>
              )}

              {/* Payment CTA — show for any active/pending/finalized proposal */}
              {items.length > 0 && !['declined'].includes(selectedProposal.proposal_status) && (() => {
                const { totalHours, includesRoadTest } = sumProposalHours(items as any);
                const { pkgs, totalPrice } = resolveProposalPackages({
                  packageId: selectedProposal.package_id,
                  totalHours,
                  includesRoadTest,
                });
                return (
                  <Card className="border-primary/40 bg-primary/5">
                    <CardContent className="p-3 space-y-2">
                      {pkgs.map((pkg, i) => (
                        <div key={`${pkg.id}-${i}`} className="space-y-2">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-sm font-semibold">
                              Package{pkgs.length > 1 ? ` ${i + 1}` : ''}: {pkg.label.replace(/\n/g, ' ')} · {pkg.price}
                            </p>
                            {i === 0 && <span className="text-xs text-muted-foreground">{totalHours} hr</span>}
                          </div>
                          <Button asChild className="w-full min-h-[44px] gap-2">
                            <a href={pkg.squareUrl} target="_blank" rel="noopener noreferrer">
                              {pkgs.length > 1 ? `Pay for Package ${i + 1}` : 'Complete Your Payment'}
                            </a>
                          </Button>
                        </div>
                      ))}
                      {pkgs.length > 1 && (
                        <p className="text-sm font-semibold">Total: {totalPrice}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Your slot is confirmed once payment is received.
                      </p>
                    </CardContent>
                  </Card>
                );
              })()}

              {/* Mode info */}
              {canRespondToProposal(selectedProposal.proposal_status) && (
                <Card className="border-border/50 bg-muted/30">
                  <CardContent className="p-3 text-xs text-muted-foreground">
                    {selectedProposal.acceptance_mode === 'auto_schedule_on_accept'
                      ? 'After you accept, these dates will be added directly to your schedule.'
                      : 'After you accept, these dates will be marked as pending until an admin finalizes your schedule.'}
                  </CardContent>
                </Card>
              )}

              {/* Edit requested status */}
              {selectedProposal.proposal_status === 'edit_requested' && (
                <Card className="border-yellow-500/30 bg-yellow-500/5">
                  <CardContent className="p-3 text-sm">
                    <p className="text-xs text-yellow-500 font-medium mb-1">Edit Request Submitted</p>
                    <p className="text-muted-foreground text-xs">Staff is reviewing your requested changes. You'll be notified when a revised proposal is ready.</p>
                  </CardContent>
                </Card>
              )}

              {/* Result message */}
              {resultMessage && (
                <Card className="border-primary/50 bg-primary/5">
                  <CardContent className="p-4 text-sm">{resultMessage}</CardContent>
                </Card>
              )}

              {/* Items */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Proposed Dates ({items.length})</Label>
                <div className="space-y-2 max-h-[250px] overflow-y-auto">
                  {items.map((item, idx) => (
                    <div key={item.id} className="flex items-center gap-3 p-3 border rounded-lg text-sm">
                      <Badge variant="secondary" className="text-[10px] shrink-0">{idx + 1}</Badge>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">
                          {format(parseISO(item.proposed_date), 'EEE, MMM d, yyyy')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatTime24to12(item.start_time)} – {formatTime24to12(item.end_time)}
                        </p>
                        {item.session_type === 'testing' && (item as any).dds_location && (
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-start gap-1">
                            <MapPin className="h-3 w-3 mt-0.5 shrink-0 text-primary" />
                            <span className="break-words">{(item as any).dds_location}</span>
                          </p>
                        )}
                      </div>
                      <SessionTypeBadge sessionType={item.session_type} />
                      {item.item_status === 'conflict' && (
                        <Badge variant="destructive" className="text-[10px]">Conflict</Badge>
                      )}
                      {(item.item_status === 'auto_scheduled' || item.item_status === 'finalized') && (
                        <Check className="h-4 w-4 text-green-500 shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions - show for 'sent' or 'revised_and_resent' proposals */}
              {canRespondToProposal(selectedProposal.proposal_status) && !resultMessage && (
                <div className="space-y-3 pt-2">
                  <Button
                    className="w-full min-h-[44px] gap-2"
                    onClick={() => handleAction('accept')}
                    disabled={actionLoading}
                  >
                    <Check className="h-4 w-4" />
                    Accept Proposed Schedule
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full min-h-[44px] gap-2 border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10"
                    onClick={() => setEditRequestOpen(true)}
                    disabled={actionLoading}
                  >
                    <Edit3 className="h-4 w-4" />
                    Request Edit
                  </Button>

                  <div className="space-y-1.5">
                    <Textarea
                      value={declineReason}
                      onChange={e => setDeclineReason(e.target.value)}
                      placeholder="Reason for declining (optional)"
                      className="min-h-[50px] text-sm"
                    />
                    <Button
                      variant="outline"
                      className="w-full min-h-[44px] gap-2"
                      onClick={() => handleAction('decline')}
                      disabled={actionLoading}
                    >
                      <X className="h-4 w-4" />
                      Decline Proposal
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Request Modal */}
      <Dialog open={editRequestOpen} onOpenChange={setEditRequestOpen}>
        <DialogContent className="w-[min(95vw,500px)] p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="h-5 w-5 text-primary" />
              Request Schedule Edits
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Let us know what dates, times, or other schedule changes you would like. Staff will review your requested edits and send you an updated schedule proposal.
            </p>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Requested edits *</Label>
              <Textarea
                value={editRequestNote}
                onChange={e => setEditRequestNote(e.target.value)}
                placeholder="Please move the Tuesday sessions to Thursday after 4 PM and avoid Saturdays."
                className="min-h-[120px] text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Mention any date/time changes, unavailable days, preferred time windows, or road test timing requests.
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 min-h-[44px]"
                onClick={() => setEditRequestOpen(false)}
                disabled={editRequestLoading}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 min-h-[44px] gap-2"
                onClick={handleEditRequest}
                disabled={editRequestLoading || !editRequestNote.trim()}
              >
                <Send className="h-4 w-4" />
                {editRequestLoading ? 'Submitting...' : 'Submit Edit Request'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
