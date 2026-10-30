import { useState, useEffect } from "react";
import { effectiveDocStatus, fetchDocSummaries, hasDocumentOnFile, type DocSummary } from "@/lib/documentStatus";
import { StudentDocumentSection } from "./StudentDocumentSection";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { User, Mail, Phone, MapPin, Clock, Save, Loader2, FileImage, AlertTriangle, Calendar, Shield, ClipboardList, CheckCircle, XCircle, Star, FileText, BarChart3, GitMerge } from "lucide-react";
import { getDisplayName, getProfileInitials } from "@/lib/profileUtils";
import { cn } from "@/lib/utils";
import { Profile } from "@/types/portal";
import { PermitViewerModal } from "./PermitViewerModal";
import { SessionTypeBadge } from "./SessionTypeBadge";
import { format, parseISO, isAfter } from "date-fns";
import { Link, useNavigate } from "react-router-dom";
import { StudentProgressSection } from "./StudentProgressSection";
import { SecondaryEmailsSection } from "./SecondaryEmailsSection";
import { MergeAccountDialog } from "./MergeAccountDialog";
import { StudentHoursBreakdown } from "./StudentHoursBreakdown";

interface AdminUserProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  onProfileUpdated?: () => void;
}

interface FullProfile extends Profile {
  hours_remaining?: number;
  purchased_hours?: number;
  role?: string;
  last_sign_in_at?: string | null;
  intake_updated_at?: string | null;
}

interface StudentSession {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  session_type: string;
  duration_minutes: number;
  pickup_address: string | null;
  dropoff_address: string | null;
  report_card_id: string | null;
  actual_minutes?: number | null;
  instructor: { full_name: string | null; first_name: string | null; last_name: string | null; email: string | null } | null;
}

interface AssignedInstructor {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

export function AdminUserProfileModal({ 
  open, 
  onOpenChange, 
  userId,
  onProfileUpdated 
}: AdminUserProfileModalProps) {
  const { toast } = useToast();
  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [permitViewerOpen, setPermitViewerOpen] = useState(false);
  const [docSummary, setDocSummary] = useState<DocSummary | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [studentSessions, setStudentSessions] = useState<StudentSession[]>([]);
  const [assignedInstructors, setAssignedInstructors] = useState<AssignedInstructor[]>([]);
  const [sessionFilter, setSessionFilter] = useState<'all' | 'upcoming' | 'completed' | 'cancelled'>('all');
  
  // Editable fields
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [hoursRemaining, setHoursRemaining] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [initialGuardianEmail, setInitialGuardianEmail] = useState("");

  useEffect(() => {
    if (open && userId) {
      fetchProfile(userId);
      fetchStudentSessions(userId);
      fetchAssignedInstructors(userId);
    }
  }, [open, userId]);

  const fetchProfile = async (id: string) => {
    setLoading(true);
    try {
      // Fetch profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single();

      if (profileError) throw profileError;

      // Fetch role
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', id)
        .limit(1)
        .maybeSingle();

      const fullProfile: FullProfile = {
        ...profileData,
        approval_status: profileData.approval_status as any,
        avatar_media_type: profileData.avatar_media_type as any,
        role: roleData?.role || undefined,
      };

      setProfile(fullProfile);
      fetchDocSummaries([id]).then((m) => setDocSummary(m.get(id) ?? { count: 0, status: null }));
      setFullName(fullProfile.full_name || `${fullProfile.first_name || ''} ${fullProfile.last_name || ''}`.trim());
      setPhone(fullProfile.phone || "");
      setHoursRemaining((fullProfile.hours_remaining ?? 0).toString());
      setPickupAddress(fullProfile.pickup_address || "");
      setDropoffAddress(fullProfile.dropoff_address || "");
      setGuardianName(fullProfile.guardian_name || "");
      setGuardianPhone(fullProfile.guardian_phone || "");
      setGuardianEmail(fullProfile.guardian_email || "");
      setInitialGuardianEmail(fullProfile.guardian_email || "");
    } catch (err: any) {
      console.error('Error fetching profile:', err);
      toast({ title: "Error", description: "Failed to load profile", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fetchStudentSessions = async (id: string) => {
    const { data } = await supabase
      .from('sessions')
      .select('id, starts_at, ends_at, status, session_type, duration_minutes, pickup_address, dropoff_address, report_card_id, actual_minutes, instructor:profiles!sessions_instructor_id_fkey(full_name, first_name, last_name, email)')
      .eq('student_id', id)
      .order('starts_at', { ascending: false });
    if (data) setStudentSessions(data as unknown as StudentSession[]);
  };

  const fetchAssignedInstructors = async (id: string) => {
    const { data } = await supabase
      .from('instructor_students')
      .select('instructor:profiles!instructor_students_instructor_id_fkey(id, full_name, first_name, last_name, email)')
      .eq('student_id', id);
    if (data) {
      const instructors = data.map((d: any) => d.instructor).filter(Boolean) as AssignedInstructor[];
      setAssignedInstructors(instructors);
    }
  };

  const filteredSessions = studentSessions.filter(s => {
    if (sessionFilter === 'upcoming') return s.status === 'scheduled' && isAfter(parseISO(s.starts_at), new Date());
    if (sessionFilter === 'completed') return s.status === 'completed';
    if (sessionFilter === 'cancelled') return s.status === 'cancelled';
    return true;
  });

  const handleSave = async () => {
    if (!profile) return;
    
    setSaving(true);
    try {
      const numericHours = parseFloat(hoursRemaining);
      if (isNaN(numericHours) || numericHours < 0) {
        toast({ title: "Invalid Hours", description: "Please enter a valid number", variant: "destructive" });
        setSaving(false);
        return;
      }

      // Parse full name into first/last
      const nameParts = fullName.trim().split(' ');
      const firstName = nameParts[0] || null;
      const lastName = nameParts.slice(1).join(' ') || null;

      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim() || null,
          first_name: firstName,
          last_name: lastName,
          phone: phone.trim() || null,
          hours_remaining: numericHours,
          pickup_address: pickupAddress.trim() || null,
          dropoff_address: dropoffAddress.trim() || null,
          guardian_name: guardianName.trim() || null,
          guardian_phone: guardianPhone.trim() || null,
          guardian_email: guardianEmail.trim() || null,
        })
        .eq('id', profile.id);

      if (error) throw error;

      // Notify guardian + instructor when guardian email is added/changed
      const newGuardianEmail = guardianEmail.trim().toLowerCase();
      const oldGuardianEmail = (initialGuardianEmail || '').trim().toLowerCase();
      if (newGuardianEmail && newGuardianEmail !== oldGuardianEmail) {
        const studentDisplay = fullName.trim() || profile.email || 'a student';
        const ts = Date.now();
        // Guardian email
        supabase.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'guardian-added',
            recipientEmail: newGuardianEmail,
            idempotencyKey: `guardian-added-${profile.id}-${ts}`,
            templateData: {
              guardianName: guardianName.trim() || undefined,
              studentName: studentDisplay,
              studentEmail: profile.email || undefined,
              audience: 'guardian',
            },
          },
        }).catch((e) => console.warn('guardian email failed', e));

        // Notify assigned instructor(s)
        assignedInstructors.forEach((inst) => {
          if (!inst.email) return;
          const instName = inst.full_name || `${inst.first_name || ''} ${inst.last_name || ''}`.trim() || undefined;
          supabase.functions.invoke('send-transactional-email', {
            body: {
              templateName: 'guardian-added',
              recipientEmail: inst.email,
              idempotencyKey: `guardian-updated-instr-${profile.id}-${inst.id}-${ts}`,
              templateData: {
                instructorName: instName,
                studentName: studentDisplay,
                studentEmail: profile.email || undefined,
                audience: 'instructor',
              },
            },
          }).catch((e) => console.warn('instructor guardian email failed', e));
        });
        setInitialGuardianEmail(newGuardianEmail);
      }

      toast({ title: "Profile Updated", description: "Changes saved successfully" });
      onProfileUpdated?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error('Error updating profile:', err);
      toast({ title: "Error", description: err.message || "Failed to save changes", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Approved</Badge>;
      case 'pending':
        return <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/20">Pending</Badge>;
      case 'rejected':
        return <Badge className="bg-red-500/10 text-red-600 border-red-500/20">Rejected</Badge>;
      default:
        return <Badge variant="secondary">{status || 'Unknown'}</Badge>;
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[560px] p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              User Profile
            </DialogTitle>
            <DialogDescription>
              View and edit user information
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-4">
                <Skeleton className="h-16 w-16 rounded-full" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-56" />
                </div>
              </div>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : profile ? (
            <div className="space-y-5 py-2">
              {/* Profile Header */}
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={profile.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-lg">
                    {getProfileInitials(profile)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-lg truncate">
                    {getDisplayName(profile, 'Unknown User')}
                  </p>
                  <p className="text-sm text-muted-foreground truncate">
                    {profile.email}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {getStatusBadge(profile.approval_status)}
                    {profile.role && (
                      <Badge variant="outline" className="capitalize">
                        {profile.role}
                      </Badge>
                    )}
                  </div>
                  {/* Assigned Instructor Label */}
                  {assignedInstructors.length > 0 ? (
                    <div className="mt-1.5">
                      {assignedInstructors.map((inst) => (
                        <p key={inst.id} className="text-xs text-primary font-medium">
                          Assigned Instructor: {inst.full_name || `${inst.first_name || ''} ${inst.last_name || ''}`.trim() || inst.email || 'Unknown'}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1.5">No instructor assigned</p>
                  )}
                </div>
              </div>

              {/* Editable Fields */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm">Full Name</Label>
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter full name"
                    className="min-h-[44px]"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    Email
                  </Label>
                  <Input
                    value={profile.email || ""}
                    disabled
                    className="min-h-[44px] bg-muted/50"
                  />
                  <p className="text-xs text-muted-foreground">Email cannot be changed here</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    Phone
                  </Label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Enter phone number"
                    className="min-h-[44px]"
                  />
                </div>

                {/* Hours Remaining - prominent gold styling */}
                <div className="space-y-2 p-4 rounded-xl border-2 border-primary/30 bg-primary/5">
                  <Label className="text-sm flex items-center gap-1.5 font-medium">
                    <Clock className="h-4 w-4 text-primary" />
                    Hours Remaining
                  </Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 shrink-0"
                      onClick={() => {
                        const val = parseFloat(hoursRemaining) || 0;
                        setHoursRemaining(Math.max(0, val - 0.5).toString());
                      }}
                    >
                      -
                    </Button>
                    <Input
                      type="number"
                      step="0.5"
                      min="0"
                      value={hoursRemaining}
                      onChange={(e) => setHoursRemaining(e.target.value)}
                      className="min-h-[44px] text-center text-lg font-bold"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 shrink-0"
                      onClick={() => {
                        const val = parseFloat(hoursRemaining) || 0;
                        setHoursRemaining((val + 0.5).toString());
                      }}
                    >
                      +
                    </Button>
                  </div>
                </div>
              </div>

              {/* Editable Addresses Section */}
              <div className="space-y-3 p-4 rounded-xl bg-muted/30">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-primary" />
                  Pickup & Drop-Off
                </p>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Pickup Address</Label>
                    <Input
                      value={pickupAddress}
                      onChange={(e) => setPickupAddress(e.target.value)}
                      placeholder="Enter pickup address"
                      className="min-h-[44px]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Drop-Off Address</Label>
                    <Input
                      value={dropoffAddress}
                      onChange={(e) => setDropoffAddress(e.target.value)}
                      placeholder="Enter drop-off address"
                      className="min-h-[44px]"
                    />
                  </div>
                </div>
              </div>

              {/* Parent / Guardian / Emergency Contact (editable) */}
              <div className="space-y-3 p-4 rounded-xl bg-muted/30">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Shield className="h-4 w-4 text-primary" />
                  Parent / Guardian / Emergency Contact
                </p>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Guardian Name</Label>
                    <Input
                      value={guardianName}
                      onChange={(e) => setGuardianName(e.target.value)}
                      placeholder="Full name"
                      className="min-h-[44px]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Guardian Phone</Label>
                    <Input
                      type="tel"
                      value={guardianPhone}
                      onChange={(e) => setGuardianPhone(e.target.value)}
                      placeholder="(555) 123-4567"
                      className="min-h-[44px]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Guardian Email</Label>
                    <Input
                      type="email"
                      value={guardianEmail}
                      onChange={(e) => setGuardianEmail(e.target.value)}
                      placeholder="guardian@example.com"
                      className="min-h-[44px]"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Adding or changing this email sends a notification to the guardian and the student's assigned instructor.
                    </p>
                  </div>
                </div>
              </div>


              {/* Permit Section */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30">
                <div>
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    <FileImage className="h-4 w-4 text-muted-foreground" />
                    Permit Documents
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {(() => {
                      const onFile = hasDocumentOnFile(docSummary, profile.permit_file_url);
                      const st = effectiveDocStatus(docSummary, profile.permit_file_url);
                      const label = !onFile ? 'No document uploaded yet' : `${docSummary?.count && docSummary.count > 1 ? `${docSummary.count} documents` : 'Document'} on file${st === 'approved' ? ', verified' : st === 'rejected' ? ', rejected' : ', awaiting review'}`;
                      return profile.permit_number ? `${label} · Permit #${profile.permit_number}` : label;
                    })()}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPermitViewerOpen(true)}
                  className="gap-1.5"
                >
                  <FileImage className="h-4 w-4" />
                  View Permits
                </Button>
              </div>

              {/* Document History Section */}
              {profile && (
                <StudentDocumentSection
                  studentId={profile.id}
                  isOwnProfile={false}
                  isStaffOrAdmin={true}
                  onDocumentUploaded={() => fetchProfile(profile.id)}
                />
              )}

              {/* Meta info */}
              <div className="grid grid-cols-2 gap-3 text-sm p-4 rounded-xl bg-muted/30">
                <div>
                  <span className="text-muted-foreground text-xs">Signed Up</span>
                  <p className="font-medium">{profile.created_at ? format(parseISO(profile.created_at), 'MMM d, yyyy') : '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Approved</span>
                  <p className="font-medium">{profile.approved_at ? format(parseISO(profile.approved_at), 'MMM d, yyyy') : '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Last Sign-in</span>
                  <p className="font-medium">{profile.last_sign_in_at ? format(parseISO(profile.last_sign_in_at), 'MMM d, yyyy') : 'Never'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Purchased Hours</span>
                  <p className="font-medium">{(profile.purchased_hours ?? 0).toFixed(1)}h</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Hours Completed</span>
                  <p className="font-medium">
                    {Number((profile as any)?.hours_completed ?? 0).toLocaleString('en-US', { maximumFractionDigits: 1 })}h
                  </p>
                </div>
              </div>

              {profile.role === 'student' && (
                <StudentHoursBreakdown
                  studentId={profile.id}
                  sessions={studentSessions}
                  hoursRemaining={Number(profile.hours_remaining ?? 0)}
                  purchasedHours={Number(profile.purchased_hours ?? 0)}
                  hoursCompletedStored={Number((profile as any)?.hours_completed ?? 0)}
                />
              )}

              {/* Scheduled Sessions Section */}
              {profile.role === 'student' && (
                <div className="space-y-3 p-4 rounded-xl border border-primary/20 bg-primary/5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-primary" />
                      Scheduled Sessions ({studentSessions.length})
                    </p>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {(['all', 'upcoming', 'completed', 'cancelled'] as const).map(f => (
                      <Button
                        key={f}
                        size="sm"
                        variant={sessionFilter === f ? 'default' : 'outline'}
                        className="h-7 text-xs capitalize"
                        onClick={() => setSessionFilter(f)}
                      >
                        {f}
                      </Button>
                    ))}
                  </div>
                  {filteredSessions.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">No sessions found.</p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {filteredSessions.slice(0, 20).map(s => {
                        const instructorName = s.instructor
                          ? (s.instructor.full_name || `${s.instructor.first_name || ''} ${s.instructor.last_name || ''}`.trim() || s.instructor.email || 'Instructor')
                          : 'Unknown';
                        return (
                          <div key={s.id} className="p-2.5 rounded-lg border bg-background/50 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <SessionTypeBadge sessionType={s.session_type} size="sm" />
                                <span className="text-xs font-medium truncate">
                                  {format(parseISO(s.starts_at), 'EEE, MMM d, yyyy')}
                                </span>
                              </div>
                              <Badge
                                className={cn(
                                  "text-[10px] shrink-0 border-0",
                                  s.status === 'completed' ? "bg-green-500/20 text-green-700 dark:text-green-300" :
                                  s.status === 'cancelled' ? "bg-red-500/20 text-red-700 dark:text-red-300" :
                                  "bg-muted text-muted-foreground"
                                )}
                              >
                                {s.status === 'completed' ? <><CheckCircle className="h-2.5 w-2.5 mr-0.5" />Done</> :
                                 s.status === 'cancelled' ? <><XCircle className="h-2.5 w-2.5 mr-0.5" />Cancelled</> :
                                 <><Clock className="h-2.5 w-2.5 mr-0.5" />Scheduled</>}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {format(parseISO(s.starts_at), 'h:mm a')} – {format(parseISO(s.ends_at), 'h:mm a')} · {instructorName}
                            </div>
                            {s.report_card_id && (
                              <Link to={`/report-cards/${s.report_card_id}`} className="text-xs text-primary hover:underline">
                                View Report Card
                              </Link>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Report Cards & Progress Section */}
              {profile.role === 'student' && (
                <div className="space-y-3 p-4 rounded-xl border border-primary/20 bg-primary/5">
                  <p className="text-sm font-semibold flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-primary" />
                    Driving Reports
                  </p>
                  
                  {/* Progress Graph */}
                  <StudentProgressSection studentId={profile.id} compact />
                  
                  {/* Report card links from sessions */}
                  {studentSessions.filter(s => s.report_card_id).length > 0 ? (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {studentSessions.filter(s => s.report_card_id).map(s => (
                        <div key={s.id} className="flex items-center justify-between p-2 rounded-lg bg-background/50 border">
                          <div className="flex items-center gap-2 min-w-0">
                            <Star className="h-3 w-3 text-primary shrink-0" />
                            <span className="text-xs truncate">
                              {format(parseISO(s.starts_at), 'MMM d, yyyy')}
                            </span>
                          </div>
                          <Link
                            to={`/report-cards/${s.report_card_id}`}
                            className="text-xs text-primary hover:underline shrink-0"
                          >
                            View
                          </Link>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No report cards yet.</p>
                  )}
                </div>
              )}

              <div className="space-y-3 p-4 rounded-xl border border-primary/20 bg-primary/5">
                <p className="text-sm font-semibold flex items-center gap-1.5">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  Intake Information
                </p>
                {profile.intake_submitted ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground text-xs">Full Name</span>
                      <p>{profile.full_name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Not provided'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Email</span>
                      <p>{profile.email || 'Not provided'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Phone</span>
                      <p>{profile.phone || 'Not provided'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Pickup Address</span>
                      <p>{profile.pickup_address || 'Not provided'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Drop-off Address</span>
                      <p>{profile.dropoff_address || 'Not provided'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Permit Number</span>
                      <p>{profile.permit_number || 'Not provided'}</p>
                    </div>
                    {profile.permit_issue_date && (
                      <div>
                        <span className="text-muted-foreground text-xs">Permit Issue Date</span>
                        <p>{format(parseISO(profile.permit_issue_date), 'MMM d, yyyy')}</p>
                      </div>
                    )}
                    {profile.permit_expiration_date && (
                      <div>
                        <span className="text-muted-foreground text-xs">Permit Expiration</span>
                        <p>{format(parseISO(profile.permit_expiration_date), 'MMM d, yyyy')}</p>
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground text-xs">Guardian Name</span>
                      <p>{profile.guardian_name || 'Not provided'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Guardian Phone</span>
                      <p>{profile.guardian_phone ? <a href={`tel:${profile.guardian_phone}`} className="text-primary hover:underline">{profile.guardian_phone}</a> : 'Not provided'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Guardian Email</span>
                      <p>{profile.guardian_email ? <a href={`mailto:${profile.guardian_email}`} className="text-primary hover:underline">{profile.guardian_email}</a> : 'Not provided'}</p>
                    </div>
                    {profile.intake_updated_at && (
                      <div>
                        <span className="text-muted-foreground text-xs">Intake Last Updated</span>
                        <p>{format(parseISO(profile.intake_updated_at), 'MMM d, yyyy h:mm a')}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No intake information found.</p>
                )}
              </div>

              {/* Secondary Emails (aliases) */}
              <SecondaryEmailsSection userId={profile.id} onMergeClick={() => setMergeOpen(true)} />

              {/* Merge pending account into an approved one */}
              {profile.approval_status === 'pending' && (
                <div className="space-y-2 rounded-xl border p-3">
                  <div className="flex items-center gap-2">
                    <GitMerge className="h-4 w-4 text-primary" />
                    <h4 className="text-sm font-semibold">Duplicate account?</h4>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Move all of this pending account's records into an existing approved student
                    account. Nothing is deleted and this email keeps working.
                  </p>
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => setMergeOpen(true)}
                  >
                    <GitMerge className="h-4 w-4" />
                    Merge into existing account
                  </Button>
                </div>
              )}

              {/* Save Button */}

              <Button
                onClick={handleSave}
                disabled={saving}
                className="w-full min-h-[48px] gap-2"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Changes
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <AlertTriangle className="h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">Profile not found</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Merge Account Dialog */}
      {profile && (
        <MergeAccountDialog
          open={mergeOpen}
          onOpenChange={setMergeOpen}
          sourceUserId={profile.id}
          sourceLabel={getDisplayName(profile, profile.email || 'this account')}
          onMerged={() => {
            onOpenChange(false);
            onProfileUpdated?.();
          }}
        />
      )}

      {/* Permit Viewer Modal */}
      {profile && (
        <PermitViewerModal
          open={permitViewerOpen}
          onOpenChange={setPermitViewerOpen}
          userId={profile.id}
          userName={getDisplayName(profile, 'User')}
          onStatusChange={() => fetchDocSummaries([profile.id]).then((m) => setDocSummary(m.get(profile.id) ?? { count: 0, status: null }))}
        />
      )}
    </>
  );
}

// Small button component for opening profile from anywhere
interface OpenProfileButtonProps {
  userId: string;
  userName?: string;
  variant?: 'icon' | 'text' | 'both';
  className?: string;
  onOpenProfile: (userId: string) => void;
}

export function OpenProfileButton({ 
  userId, 
  userName,
  variant = 'icon',
  className,
  onOpenProfile 
}: OpenProfileButtonProps) {
  return (
    <Button
      variant="ghost"
      size={variant === 'icon' ? 'icon' : 'sm'}
      onClick={(e) => {
        e.stopPropagation();
        onOpenProfile(userId);
      }}
      className={className}
      title="Open Profile"
    >
      <User className="h-4 w-4" />
      {variant !== 'icon' && <span className="ml-1.5">{variant === 'both' ? 'Profile' : (userName || 'View Profile')}</span>}
    </Button>
  );
}

// Clickable name that opens profile
interface ClickableUserNameProps {
  userId: string;
  name: string;
  className?: string;
  onOpenProfile: (userId: string) => void;
}

export function ClickableUserName({ 
  userId, 
  name, 
  className,
  onOpenProfile 
}: ClickableUserNameProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onOpenProfile(userId);
      }}
      className={`hover:underline hover:text-primary cursor-pointer text-left ${className || ''}`}
      title="Open Profile"
    >
      {name}
    </button>
  );
}
