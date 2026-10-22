import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { ProtectedRoute } from "@/components/portal/ProtectedRoute";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, User, FileText, Loader2, Eye, Download, Pencil, AlertTriangle, FileImage, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { Profile, UserRole, ApprovalStatus } from "@/types/portal";
import { RejectUserModal } from "@/components/portal/RejectUserModal";
import { IntakePreviewModal } from "@/components/portal/IntakePreviewModal";
import { BatchDownloadModal } from "@/components/portal/BatchDownloadModal";
import { PermitViewerModal, PermitStatusBadge } from "@/components/portal/PermitViewerModal";
import { effectiveDocStatus, fetchDocSummaries, hasDocumentOnFile } from "@/lib/documentStatus";
import { AdminUserProfileModal, OpenProfileButton, ClickableUserName } from "@/components/portal/AdminUserProfileModal";
import { sendApprovalNotification, sendRejectionNotification } from "@/lib/notifications";
import { format } from "date-fns";
import { getDisplayName } from "@/lib/profileUtils";

export default function AdminApprovals() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <PortalLayout>
        <AdminApprovalsContent />
      </PortalLayout>
    </ProtectedRoute>
  );
}

function AdminApprovalsContent() {
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<(Profile & { role?: string; permitStatus?: string | null; hasPermitOnFile?: boolean })[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewProfile, setPreviewProfile] = useState<Profile | null>(null);
  const [showDownloadInPreview, setShowDownloadInPreview] = useState(false);
  const [batchDownloadOpen, setBatchDownloadOpen] = useState(false);
  const [permitViewerOpen, setPermitViewerOpen] = useState(false);
  const [permitViewerUserId, setPermitViewerUserId] = useState<string | null>(null);
  const [permitViewerUserName, setPermitViewerUserName] = useState<string>("");
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileModalUserId, setProfileModalUserId] = useState<string | null>(null);

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (data) {
      // One answer for "is a permit on file": the documents table, the older permits table and the profile link together
      const docSummaries = await fetchDocSummaries(data.map(p => p.id));

      const profilesWithRoles = await Promise.all(
        data.map(async (profile) => {
          const { data: roleData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', profile.id)
            .limit(1)
            .maybeSingle();
          return { 
            ...profile, 
            role: roleData?.role || undefined,
            approval_status: (profile as any).approval_status || (profile.approved ? 'approved' : 'pending'),
            permitStatus: effectiveDocStatus(docSummaries.get(profile.id), profile.permit_file_url),
            hasPermitOnFile: hasDocumentOnFile(docSummaries.get(profile.id), profile.permit_file_url),
          } as Profile & { role?: string; permitStatus?: string | null; hasPermitOnFile?: boolean };
        })
      );
      setProfiles(profilesWithRoles);
    }
    setLoading(false);
  };

  const openPermitViewer = (profile: Profile) => {
    setPermitViewerUserId(profile.id);
    setPermitViewerUserName(getDisplayName(profile, 'User'));
    setPermitViewerOpen(true);
  };

  const openProfileModal = (userId: string) => {
    setProfileModalUserId(userId);
    setProfileModalOpen(true);
  };

  const handlePreviewIntake = (profile: Profile, showDownload: boolean = false) => {
    setPreviewProfile(profile);
    setShowDownloadInPreview(showDownload);
    setPreviewModalOpen(true);
  };

  const saveApprovedIntake = async (profile: Profile, approvedBy: string) => {
    try {
      // Create snapshot of intake data
      const snapshotJson = {
        fullName: profile.full_name || `${(profile as any).first_name || ''} ${(profile as any).last_name || ''}`.trim(),
        firstName: (profile as any).first_name,
        lastName: (profile as any).last_name,
        email: profile.email,
        phone: profile.phone,
        pickupAddress: profile.pickup_address,
        dropoffAddress: profile.dropoff_address,
        permitNumber: profile.permit_number,
        permitIssueDate: profile.permit_issue_date,
        permitExpirationDate: profile.permit_expiration_date,
        guardianName: profile.guardian_name,
        guardianPhone: profile.guardian_phone,
        guardianEmail: profile.guardian_email,
        submittedAt: profile.created_at,
      };

      let permitFilePath: string | null = profile.permit_file_url || null;
      if (!permitFilePath) {
        const { data: cur } = await supabase.from('permit_documents').select('file_path').eq('student_id', profile.id).order('is_current', { ascending: false }).order('uploaded_at', { ascending: false }).limit(1).maybeSingle();
        permitFilePath = cur?.file_path || null;
      }
      const files = permitFilePath ? { permitFile: permitFilePath } : null;

      // Save to approved_intakes table
      const { error } = await supabase
        .from('approved_intakes')
        .insert({
          user_id: profile.id,
          approved_by: approvedBy,
          snapshot_json: snapshotJson,
          files: files,
        });

      if (error) {
        console.error('Failed to save approved intake:', error);
      }
    } catch (err) {
      console.error('Error saving approved intake:', err);
    }
  };

  const handleApprove = async (profile: Profile & { role?: string }) => {
    setActionLoading(profile.id);
    
    const { data: { user } } = await supabase.auth.getUser();
    
    const { error } = await supabase
      .from('profiles')
      .update({ 
        approved: true,
        approval_status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: user?.id || null,
        rejected_at: null,
        rejected_by: null,
        rejection_reason: null,
        intake_submitted: true, // Ensure intake_submitted is true when approving
      })
      .eq('id', profile.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      // Save approved intake record
      if (user?.id) {
        await saveApprovedIntake(profile, user.id);
      }
      
      await sendApprovalNotification(profile.id);

      // Send branded intake-accepted email
      try {
        await supabase.functions.invoke('send-intake-email', {
          body: { kind: 'intake-accepted', profile_id: profile.id },
        });
      } catch (e) {
        console.warn('intake-accepted email failed', e);
      }

      toast({ title: "Approved", description: "User has been approved and notified by email." });
      fetchProfiles();
    }
    
    setActionLoading(null);
  };

  const openRejectModal = (profile: Profile) => {
    setSelectedProfile(profile);
    setRejectModalOpen(true);
  };

  const handleReject = async (reason: string) => {
    if (!selectedProfile) return;
    
    setActionLoading(selectedProfile.id);
    setRejectModalOpen(false);
    
    const { data: { user } } = await supabase.auth.getUser();
    
    const { error } = await supabase
      .from('profiles')
      .update({ 
        approved: false,
        approval_status: 'rejected',
        rejected_at: new Date().toISOString(),
        rejected_by: user?.id || null,
        rejection_reason: reason || null,
        approved_at: null,
        approved_by: null,
      })
      .eq('id', selectedProfile.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      await sendRejectionNotification(selectedProfile.id, reason);
      toast({ title: "Rejected", description: "User has been rejected and notified." });
      fetchProfiles();
    }
    
    setActionLoading(null);
    setSelectedProfile(null);
  };

  const handleRoleChange = async (profileId: string, newRole: UserRole) => {
    // First check current role - if same, do nothing
    const { data: currentRoles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', profileId);

    // If user already has exactly this role and no others, skip
    if (currentRoles?.length === 1 && currentRoles[0].role === newRole) {
      toast({ title: "No Change", description: "User already has this role." });
      return;
    }

    // Delete ALL existing roles for this user first
    const { error: deleteError } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', profileId);

    if (deleteError) {
      toast({ title: "Error", description: `Failed to clear roles: ${deleteError.message}`, variant: "destructive" });
      return;
    }

    // Now insert the new single role
    const { error: insertError } = await supabase
      .from('user_roles')
      .insert({ user_id: profileId, role: newRole });

    if (insertError) {
      toast({ title: "Error", description: `Failed to set role: ${insertError.message}`, variant: "destructive" });
    } else {
      toast({ title: "Role Updated", description: `Role changed to ${newRole}.` });
      fetchProfiles();
    }
  };

  // Use approval_status as single source of truth
  const pendingProfiles = profiles.filter(p => p.approval_status === 'pending');
  const approvedProfiles = profiles.filter(p => p.approval_status === 'approved');
  const rejectedProfiles = profiles.filter(p => p.approval_status === 'rejected');

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold theme-heading">User Approvals</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Manage user registrations and roles
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setBatchDownloadOpen(true)}
          className="gap-2 self-start sm:self-auto"
        >
          <Download className="h-4 w-4" />
          Download Approved (Batch)
        </Button>
      </div>

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:inline-flex">
          <TabsTrigger value="pending" className="gap-1 text-xs sm:text-sm">
            Pending
            {pendingProfiles.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 text-[10px] flex items-center justify-center">
                {pendingProfiles.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved" className="text-xs sm:text-sm">Approved</TabsTrigger>
          <TabsTrigger value="rejected" className="text-xs sm:text-sm">Rejected</TabsTrigger>
        </TabsList>

        {/* Pending Tab */}
        <TabsContent value="pending" className="mt-4">
          <Card className="portal-card">
            <CardHeader className="pb-3 sm:pb-4">
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <span className="flex items-center justify-center h-6 w-6 rounded-full bg-orange-500/20 text-orange-500 text-sm font-bold">
                  {pendingProfiles.length}
                </span>
                Pending Approval
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pendingProfiles.length === 0 ? (
                <p className="text-muted-foreground text-center py-6 sm:py-8 text-sm sm:text-base">
                  No pending approvals
                </p>
              ) : (
                <div className="space-y-3 sm:space-y-4">
                  {pendingProfiles.map(profile => (
                    <UserApprovalCard
                      key={profile.id}
                      profile={profile}
                      onApprove={() => handleApprove(profile)}
                      onReject={() => openRejectModal(profile)}
                      onRoleChange={handleRoleChange}
                      onPreviewIntake={() => handlePreviewIntake(profile, false)}
                      onViewPermits={() => openPermitViewer(profile)}
                      onOpenProfile={() => openProfileModal(profile.id)}
                      isLoading={actionLoading === profile.id}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Approved Tab */}
        <TabsContent value="approved" className="mt-4">
          <Card className="portal-card">
            <CardHeader className="pb-3 sm:pb-4">
              <CardTitle className="text-lg sm:text-xl">
                Approved Users ({approvedProfiles.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {approvedProfiles.length === 0 ? (
                <p className="text-muted-foreground text-center py-6 text-sm">No approved users yet</p>
              ) : (
                <div className="space-y-3">
                  {approvedProfiles.slice(0, 20).map(profile => (
                    <ApprovedUserCard
                      key={profile.id}
                      profile={profile}
                      onRoleChange={handleRoleChange}
                      onPreviewIntake={() => handlePreviewIntake(profile, true)}
                      onViewPermits={() => openPermitViewer(profile)}
                      onOpenProfile={() => openProfileModal(profile.id)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rejected Tab */}
        <TabsContent value="rejected" className="mt-4">
          <Card className="portal-card">
            <CardHeader className="pb-3 sm:pb-4">
              <CardTitle className="text-lg sm:text-xl">
                Rejected Users ({rejectedProfiles.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {rejectedProfiles.length === 0 ? (
                <p className="text-muted-foreground text-center py-6 text-sm">No rejected users</p>
              ) : (
                <div className="space-y-3">
                  {rejectedProfiles.map(profile => (
                    <RejectedUserCard
                      key={profile.id}
                      profile={profile}
                      onReApprove={() => handleApprove(profile)}
                      onOpenProfile={() => openProfileModal(profile.id)}
                      isLoading={actionLoading === profile.id}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Reject Modal */}
      <RejectUserModal
        open={rejectModalOpen}
        onOpenChange={setRejectModalOpen}
        userName={getDisplayName(selectedProfile, 'Unknown User')}
        onConfirm={handleReject}
        isLoading={actionLoading === selectedProfile?.id}
      />

      {/* Intake Preview Modal */}
      <IntakePreviewModal
        open={previewModalOpen}
        onOpenChange={setPreviewModalOpen}
        profile={previewProfile}
        showDownload={showDownloadInPreview}
      />

      {/* Batch Download Modal */}
      <BatchDownloadModal
        open={batchDownloadOpen}
        onOpenChange={setBatchDownloadOpen}
      />

      {/* Permit Viewer Modal */}
      {permitViewerUserId && (
        <PermitViewerModal
          open={permitViewerOpen}
          onOpenChange={setPermitViewerOpen}
          userId={permitViewerUserId}
          userName={permitViewerUserName}
          onStatusChange={fetchProfiles}
        />
      )}

      {/* Admin User Profile Modal */}
      <AdminUserProfileModal
        open={profileModalOpen}
        onOpenChange={setProfileModalOpen}
        userId={profileModalUserId}
        onProfileUpdated={fetchProfiles}
      />
    </div>
  );
}

interface UserApprovalCardProps {
  profile: Profile & { role?: string; needs_review?: boolean; permitStatus?: string | null; hasPermitOnFile?: boolean };
  onApprove: () => void;
  onReject: () => void;
  onRoleChange: (id: string, role: UserRole) => void;
  onPreviewIntake: () => void;
  onViewPermits: () => void;
  onOpenProfile: () => void;
  isLoading: boolean;
}

function UserApprovalCard({ profile, onApprove, onReject, onRoleChange, onPreviewIntake, onViewPermits, onOpenProfile, isLoading }: UserApprovalCardProps) {
  return (
    <div className="flex flex-col gap-3 p-4 border rounded-xl bg-background/50">
      {/* User Info Row */}
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-primary/10 flex items-center justify-center">
          <User className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <ClickableUserName
            userId={profile.id}
            name={getDisplayName(profile, 'Unknown User')}
            className="font-semibold text-sm sm:text-base truncate block"
            onOpenProfile={onOpenProfile}
          />
          <p className="text-xs sm:text-sm text-muted-foreground break-words">
            {profile.email}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {profile.intake_submitted && (
              <Badge variant="outline" className="text-xs gap-1">
                <FileText className="h-3 w-3" />
                Intake Done
              </Badge>
            )}
            <PermitStatusBadge 
              hasPermit={profile.hasPermitOnFile ?? !!profile.permit_file_url} 
              verifiedStatus={profile.permitStatus} 
            />
          </div>
        </div>
        {/* Action icons */}
        <div className="flex items-center gap-1">
          <OpenProfileButton
            userId={profile.id}
            onOpenProfile={onOpenProfile}
            className="flex-shrink-0 h-9 w-9"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onViewPermits}
                className="flex-shrink-0 h-9 w-9"
              >
                <FileImage className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>View Permits</TooltipContent>
          </Tooltip>
          <Button
            variant="ghost"
            size="icon"
            onClick={onPreviewIntake}
            className="flex-shrink-0 h-9 w-9"
            title="View Intake Submission"
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            asChild
            className="flex-shrink-0 h-9 w-9"
            title="Edit Intake Form"
          >
            <Link to={`/admin/intake-edit?userId=${profile.id}`}>
              <Pencil className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Role Dropdown */}
      <div className="w-full">
        <label className="text-xs text-muted-foreground mb-1.5 block">Assign Role</label>
        <Select 
          value={profile.role} 
          onValueChange={(v) => onRoleChange(profile.id, v as UserRole)}
        >
          <SelectTrigger className="w-full min-h-[44px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover border z-50">
            <SelectItem value="student">Student</SelectItem>
            <SelectItem value="instructor">Instructor</SelectItem>
            <SelectItem value="staff">Staff</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-2 w-full">
        <Button 
          onClick={onApprove} 
          className="w-full min-h-[44px] gap-2"
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle className="h-4 w-4" />
          )}
          Approve User
        </Button>
        <Button 
          onClick={onReject}
          variant="destructive"
          className="w-full min-h-[44px] gap-2"
          disabled={isLoading}
        >
          <XCircle className="h-4 w-4" />
          Reject User
        </Button>
      </div>
    </div>
  );
}

interface ApprovedUserCardProps {
  profile: Profile & { role?: string; needs_review?: boolean; permitStatus?: string | null; hasPermitOnFile?: boolean };
  onRoleChange: (id: string, role: UserRole) => void;
  onPreviewIntake: () => void;
  onViewPermits: () => void;
  onOpenProfile: () => void;
}

function ApprovedUserCard({ profile, onRoleChange, onPreviewIntake, onViewPermits, onOpenProfile }: ApprovedUserCardProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 sm:p-4 border rounded-xl bg-background/50">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="flex-shrink-0 h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-green-500/10 flex items-center justify-center">
          <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-green-500" />
        </div>
        <div className="flex-1 min-w-0">
          <ClickableUserName
            userId={profile.id}
            name={getDisplayName(profile, 'Unknown')}
            className="font-medium text-sm sm:text-base truncate block"
            onOpenProfile={onOpenProfile}
          />
          <p className="text-xs sm:text-sm text-muted-foreground truncate">
            {profile.email}
          </p>
        </div>
        {/* Action icons */}
        <div className="flex items-center gap-1">
          <OpenProfileButton
            userId={profile.id}
            onOpenProfile={onOpenProfile}
            className="flex-shrink-0 h-9 w-9"
          />
          {(profile as any).needs_review && (
            <Badge variant="destructive" className="gap-1 text-xs mr-1">
              <AlertTriangle className="h-3 w-3" />
              Review
            </Badge>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onViewPermits}
                className="flex-shrink-0 h-9 w-9"
              >
                <FileImage className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>View Permits</TooltipContent>
          </Tooltip>
          <Button
            variant="ghost"
            size="icon"
            onClick={onPreviewIntake}
            className="flex-shrink-0 h-9 w-9"
            title="View & Download Intake"
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            asChild
            className="flex-shrink-0 h-9 w-9"
            title="Edit Intake Form"
          >
            <Link to={`/admin/intake-edit?userId=${profile.id}`}>
              <Pencil className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 w-full sm:w-auto">
        <Badge className="capitalize shrink-0" variant={profile.role ? "default" : "outline"}>
          {profile.role || 'No role'}
        </Badge>
        <Select 
          value={profile.role || ''} 
          onValueChange={(v) => onRoleChange(profile.id, v as UserRole)}
        >
          <SelectTrigger className="flex-1 sm:w-36 min-h-[40px] text-sm">
            <SelectValue placeholder="Set role" />
          </SelectTrigger>
          <SelectContent className="bg-popover border z-50">
            <SelectItem value="student">Student</SelectItem>
            <SelectItem value="instructor">Instructor</SelectItem>
            <SelectItem value="staff">Staff</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

interface RejectedUserCardProps {
  profile: Profile;
  onReApprove: () => void;
  onOpenProfile: () => void;
  isLoading: boolean;
}

function RejectedUserCard({ profile, onReApprove, onOpenProfile, isLoading }: RejectedUserCardProps) {
  return (
    <div className="flex flex-col gap-3 p-3 sm:p-4 border rounded-xl bg-background/50">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-destructive/10 flex items-center justify-center">
          <XCircle className="h-4 w-4 sm:h-5 sm:w-5 text-destructive" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <ClickableUserName
              userId={profile.id}
              name={getDisplayName(profile, 'Unknown')}
              className="font-medium text-sm sm:text-base truncate"
              onOpenProfile={onOpenProfile}
            />
            <OpenProfileButton
              userId={profile.id}
              onOpenProfile={onOpenProfile}
              className="h-7 w-7"
            />
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground truncate">
            {profile.email}
          </p>
          {(profile as any).rejection_reason && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              <span className="text-destructive">Reason:</span> {(profile as any).rejection_reason}
            </p>
          )}
          {(profile as any).rejected_at && (
            <p className="text-xs text-muted-foreground mt-1">
              Rejected: {format(new Date((profile as any).rejected_at), 'MMM d, yyyy')}
            </p>
          )}
        </div>
      </div>
      <Button 
        onClick={onReApprove}
        variant="outline"
        className="w-full min-h-[44px] gap-2"
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle className="h-4 w-4" />
        )}
        Re-Approve User
      </Button>
    </div>
  );
}
