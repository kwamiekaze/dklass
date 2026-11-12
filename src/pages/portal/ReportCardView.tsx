import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { SkillHighlightsDisplay } from "@/components/portal/SkillHighlightsDisplay";
import { ReportCardViewLog } from "@/components/portal/ReportCardViewLog";
import { TimeSplitChart, type TimeSplitEntry } from "@/components/portal/TimeSplitChart";
import { usePortalAuth } from "@/hooks/usePortalAuth";
import { supabase } from "@/integrations/supabase/client";
import { PortalLayout, type PortalLook } from "@/components/portal/PortalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, FileText, Calendar, User, Star, MessageSquare, Clock, Copy, Check, ShieldX, Share2, Lock, Link2, BarChart3, Eye, EyeOff } from "lucide-react";
import { format, parseISO } from "date-fns";
import { RATING_CATEGORIES } from "@/types/portal";
import { useTheme } from "@/components/ThemeProvider";
import { DarkModeBackground } from "@/components/DarkModeBackground";
import { LightModeBackground } from "@/components/LightModeBackground";
import { StudentProgressSection } from "@/components/portal/StudentProgressSection";
import { LessonRating } from "@/components/portal/LessonRating";
import { ReportCardHistoryList } from "@/components/portal/ReportCardHistoryList";
import { fetchSessionNumberForStudent } from "@/lib/sessionNumbering";
import { useTranslation } from "react-i18next";
import { useSkillLabel } from "@/i18n/skills";
import { RichTextDisplay } from "@/components/portal/RichTextDisplay";
import { InstructorProfileModal } from "@/components/portal/InstructorProfileModal";
import type { Profile } from "@/types/portal";

/**
 * Which look the report card uses, for everyone (students, instructors, admins):
 *   V1  the original portal theme, with the animated road videos playing behind the cards
 *   V2  the navy and gold student look with its sky
 * Phones get V1 and desktops V2. To switch, change these two lines.
 */
const REPORT_CARD_LOOK: { mobile: PortalLook; desktop: PortalLook } = { mobile: 'v1', desktop: 'v2' };
const MOBILE_MAX = 767;
function useReportCardLook(): PortalLook {
  const query = `(max-width: ${MOBILE_MAX}px)`;
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query), on = () => setMobile(m.matches);
    on(); m.addEventListener('change', on); return () => m.removeEventListener('change', on);
  }, [query]);
  return mobile ? REPORT_CARD_LOOK.mobile : REPORT_CARD_LOOK.desktop;
}

interface ReportCardDetails {
  id: string;
  created_at: string;
  session_id: string;
  student_id: string;
  instructor_id: string;
  transcription_summary: string | null;
  message_to_student: string | null;
  internal_message: string | null;
  acceleration: number | null;
  braking: number | null;
  left_turns: number | null;
  right_turns: number | null;
  speed_maintenance: number | null;
  lane_maintenance: number | null;
  blind_spots: number | null;
  signal_usage: number | null;
  changing_lanes: number | null;
  following_distance: number | null;
  road_sign_awareness: number | null;
  distractions: number | null;
  general_parking: number | null;
  reverse_parking: number | null;
  parallel_parking: number | null;
  straight_line_backing: number | null;
  turn_about: number | null;
  merging: number | null;
  interstate: number | null;
  overall: number | null;
  session_starts_at: string | null;
  session_ends_at: string | null;
  session_status: string | null;
  student_name: string;
  instructor_name: string;
  student_email: string | null;
  instructor_email: string | null;
  can_see_internal: boolean;
  first_viewed_at?: string | null;
  last_viewed_at?: string | null;
  view_count?: number | null;
  first_viewed_via?: string | null;
  last_viewed_via?: string | null;
  student_view_count?: number | null;
  public_view_count?: number | null;
  student_first_viewed_at?: string | null;
  student_last_viewed_at?: string | null;
  public_first_viewed_at?: string | null;
  public_last_viewed_at?: string | null;
}


type StaffViewMode = "normal" | "student" | "accessed";

export default function ReportCardView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const skillLabel = useSkillLabel();
  
  const { user, role, isLoading: authLoading } = usePortalAuth();
  const { toast } = useToast();
  
  const [reportCard, setReportCard] = useState<ReportCardDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [instructorModalOpen, setInstructorModalOpen] = useState(false);
  const [instructorProfile, setInstructorProfile] = useState<Partial<Profile> | null>(null);

  useEffect(() => {
    if (!reportCard?.instructor_id) return;
    let cancelled = false;
    supabase
      .from('profiles')
      .select('id, first_name, last_name, full_name, email, avatar_url, avatar_media_type')
      .eq('id', reportCard.instructor_id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setInstructorProfile(data as any);
      });
    return () => { cancelled = true; };
  }, [reportCard?.instructor_id]);

  // Staff view mode
  const [viewMode, setViewMode] = useState<StaffViewMode>("normal");
  const isStaff = role === 'admin' || role === 'staff' || role === 'instructor';
  const look = useReportCardLook();

  // Public sharing state
  const [isPublic, setIsPublic] = useState(false);
  const [publicSlug, setPublicSlug] = useState<string | null>(null);
  const [accessCodeInput, setAccessCodeInput] = useState("");
  const [confirmCodeInput, setConfirmCodeInput] = useState("");
  const [sharingLoading, setSharingLoading] = useState(false);
  const [publicCopied, setPublicCopied] = useState(false);
  const [showGraphPublicly, setShowGraphPublicly] = useState(false);
  const [sessionNumber, setSessionNumber] = useState<number | null>(null);
  const [skillHighlights, setSkillHighlights] = useState<{
    strongest_skills?: any[];
    most_improved_skills?: any[];
    focus_areas?: any[];
  }>({});
  const [timeSplit, setTimeSplit] = useState<TimeSplitEntry[] | null>(null);

  const canCopyLink = isStaff;
  const canManagePublic = isStaff;
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const fetchReportCard = async () => {
    if (!id) {
      setFetchError(true);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setFetchError(false);
    setUnauthorized(false);

    const timeoutId = setTimeout(() => {
      setFetchError(true);
      setLoading(false);
    }, 10000);

    try {
      const { data, error } = await supabase.rpc('get_report_card_details', {
        p_report_card_id: id
      });

      clearTimeout(timeoutId);

      if (error) throw error;

      if (!data || data.length === 0) {
        setUnauthorized(true);
      } else {
        const rc = data[0] as ReportCardDetails;

        // Check if this report card belongs to a road test session — redirect to dedicated view
        if (rc.session_id) {
          const { data: sessionRow } = await supabase
            .from('sessions')
            .select('session_type')
            .eq('id', rc.session_id)
            .single();
          if (sessionRow?.session_type === 'testing') {
            navigate(`/road-test-results/${rc.session_id}`, { replace: true });
            return;
          }
        }

        setReportCard(rc);
        // Log the view (fire-and-forget). The RPC resolves the viewer type
        // server-side: owning student counts as a real view, instructor/admin
        // previews are logged separately and never mark the card as viewed.
        if (user?.id) {
          supabase.rpc('mark_report_card_viewed', {
            p_report_card_id: rc.id,
            p_via: 'student',
            p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
          }).then(({ error: rpcErr }) => {
            if (rpcErr) console.warn('mark_report_card_viewed failed', rpcErr);
          }, () => {});
        }


        // Fetch session number
        if (rc.session_id && rc.student_id) {
          fetchSessionNumberForStudent(supabase, rc.student_id, rc.session_id).then(num => {
            setSessionNumber(num);
          });
        }
        // Load skill highlights + public sharing state
        const { data: rcRow } = await supabase
          .from('report_cards')
          .select('is_public, public_share_slug, show_graph_publicly, strongest_skills, most_improved_skills, focus_areas, time_split')
          .eq('id', id)
          .single();
        if (rcRow) {
          if (canManagePublic) {
            setIsPublic(rcRow.is_public || false);
            setPublicSlug(rcRow.public_share_slug || null);
            setShowGraphPublicly((rcRow as any).show_graph_publicly || false);
          }
          setSkillHighlights({
            strongest_skills: Array.isArray((rcRow as any).strongest_skills) ? (rcRow as any).strongest_skills : [],
            most_improved_skills: Array.isArray((rcRow as any).most_improved_skills) ? (rcRow as any).most_improved_skills : [],
            focus_areas: Array.isArray((rcRow as any).focus_areas) ? (rcRow as any).focus_areas : [],
          });
          if (Array.isArray((rcRow as any).time_split)) {
            setTimeSplit((rcRow as any).time_split as TimeSplitEntry[]);
          }
        }
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error('Error fetching report card:', err);
      if (err?.code === 'PGRST116' || err?.message?.includes('permission')) {
        setUnauthorized(true);
      } else {
        setFetchError(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const generateSlug = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 12; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const handleEnablePublic = async () => {
    if (!id || !user) return;
    if (!accessCodeInput.trim()) {
      toast({ title: "Access code required", description: "Please enter an access code.", variant: "destructive" });
      return;
    }
    if (accessCodeInput !== confirmCodeInput) {
      toast({ title: "Codes don't match", description: "Access code and confirmation must match.", variant: "destructive" });
      return;
    }
    if (accessCodeInput.length < 4) {
      toast({ title: "Code too short", description: "Access code must be at least 4 characters.", variant: "destructive" });
      return;
    }

    setSharingLoading(true);
    const slug = publicSlug || generateSlug();
    
    const { error } = await supabase
      .from('report_cards')
      .update({
        is_public: true,
        public_access_code: accessCodeInput.trim(),
        public_share_slug: slug,
        public_enabled_at: new Date().toISOString(),
        public_enabled_by: user.id,
      })
      .eq('id', id);

    setSharingLoading(false);

    if (error) {
      toast({ title: "Error", description: "Failed to enable public access.", variant: "destructive" });
    } else {
      setIsPublic(true);
      setPublicSlug(slug);
      setAccessCodeInput("");
      setConfirmCodeInput("");
      toast({ title: "Public Access Enabled", description: "Report card is now publicly accessible with the access code." });
    }
  };

  const handleDisablePublic = async () => {
    if (!id) return;
    setSharingLoading(true);
    
    const { error } = await supabase
      .from('report_cards')
      .update({
        is_public: false,
        public_access_code: null,
        public_share_slug: null,
        public_enabled_at: null,
        public_enabled_by: null,
      })
      .eq('id', id);

    setSharingLoading(false);

    if (error) {
      toast({ title: "Error", description: "Failed to disable public access.", variant: "destructive" });
    } else {
      setIsPublic(false);
      setPublicSlug(null);
      toast({ title: "Public Access Disabled", description: "The public link will no longer work." });
    }
  };

  const handleUpdateCode = async () => {
    if (!id || !user) return;
    if (!accessCodeInput.trim()) {
      toast({ title: "Access code required", variant: "destructive" });
      return;
    }
    if (accessCodeInput !== confirmCodeInput) {
      toast({ title: "Codes don't match", variant: "destructive" });
      return;
    }

    setSharingLoading(true);
    const { error } = await supabase
      .from('report_cards')
      .update({ public_access_code: accessCodeInput.trim() })
      .eq('id', id);
    setSharingLoading(false);

    if (error) {
      toast({ title: "Error", description: "Failed to update access code.", variant: "destructive" });
    } else {
      setAccessCodeInput("");
      setConfirmCodeInput("");
      toast({ title: "Access Code Updated" });
    }
  };

  const handleCopyPublicLink = async () => {
    if (!publicSlug) return;
    const url = `${window.location.origin}/report/public/${publicSlug}`;
    try {
      await navigator.clipboard.writeText(url);
      setPublicCopied(true);
      toast({ title: "Public Link Copied", description: "Share this link along with the access code." });
      setTimeout(() => setPublicCopied(false), 2000);
    } catch {
      toast({ title: "Copy Failed", variant: "destructive" });
    }
  };

  // Trigger fetch on mount or when id changes
  useEffect(() => {
    if (user && id) {
      fetchReportCard();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id]);

  const getRatingColor = (rating: number | null) => {
    if (!rating) return 'bg-muted';
    if (rating >= 8) return 'bg-green-500';
    if (rating >= 6) return 'bg-yellow-500';
    if (rating >= 4) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const handleCopyLink = async () => {
    if (!isPublic || !publicSlug) {
      toast({
        title: "Enable public access first",
        description: "Set an access code in Sharing & Delivery below, then copy the public link.",
        variant: "destructive",
      });
      return;
    }
    const url = `${window.location.origin}/n/${publicSlug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({
        title: "Public Link Copied",
        description: "Share this link along with the access code you set.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: "Copy Failed",
        description: "Please copy the URL manually.",
        variant: "destructive",
      });
    }
  };

  const handleGoBack = () => {
    if (role === 'student') navigate('/student');
    else if (role === 'instructor') navigate('/instructor');
    else navigate('/admin');
  };

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      const redirectPath = encodeURIComponent(`/report-cards/${id}`);
      navigate(`/login?redirect=${redirectPath}`);
    }
  }, [user, authLoading, navigate, id]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // View mode visibility rules
  const showInternalNotes = viewMode === "normal" && isStaff;
  const showSharingSection = viewMode === "normal" && canManagePublic;
  const showEditButton = viewMode === "normal" && isStaff;
  const showCopyLink = viewMode === "normal" && canCopyLink;
  const showGraphSection = viewMode === "accessed" ? showGraphPublicly : true;

  return (
    <PortalLayout look={look}>
      {/* Background matching homepage theme */}
      <div className="fixed inset-0 -z-10" style={{ pointerEvents: 'none' }}>
        {isDark ? (
          <>
            <div 
              className="absolute inset-0 transition-colors duration-500"
              style={{
                background: 'linear-gradient(180deg, hsl(30 15% 4%) 0%, hsl(0 0% 2%) 30%, hsl(0 0% 1%) 100%)',
              }}
            />
            <div 
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse 80% 60% at 50% 35%, hsl(40 80% 30% / 0.12) 0%, transparent 60%)',
              }}
            />
            <DarkModeBackground />
          </>
        ) : (
          <LightModeBackground />
        )}
      </div>

      <div className="max-w-3xl mx-auto space-y-6 relative">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleGoBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold theme-heading flex items-center gap-2">
              <FileText className="h-5 w-5 sm:h-6 sm:w-6" />
              {sessionNumber ? t('report.sessionLabel', { n: sessionNumber }) : t('report.reportCard')}
            </h1>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : fetchError ? (
          <Card className="portal-card">
            <CardContent className="py-12 text-center">
              <ShieldX className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h2 className="text-xl font-semibold mb-2">{t('report.unableToLoad')}</h2>
              <p className="text-muted-foreground mb-6">
                {t('report.unableToLoadBody')}
              </p>
              <div className="flex gap-2 justify-center">
                <Button onClick={fetchReportCard} variant="outline">
                  {t('common.retry')}
                </Button>
                <Button onClick={handleGoBack} className="cta-button">
                  {t('report.goToDashboard')}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : unauthorized ? (
          <Card className="portal-card">
            <CardContent className="py-12 text-center">
              <ShieldX className="h-16 w-16 mx-auto mb-4 text-destructive opacity-50" />
              <h2 className="text-xl font-semibold mb-2">{t('report.accessDenied')}</h2>
              <p className="text-muted-foreground mb-6">
                {t('report.accessDeniedBody')}
              </p>
              <Button onClick={handleGoBack} className="cta-button">
                {t('report.goToDashboard')}
              </Button>
            </CardContent>
          </Card>
        ) : reportCard ? (
          <div className="space-y-4 sm:space-y-6">
            {/* Staff View Mode Toggle */}
            {isStaff && (
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant={viewMode === "normal" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("normal")}
                  className="gap-1.5"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Normal View
                </Button>
                <Button
                  variant={viewMode === "student" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("student")}
                  className="gap-1.5"
                >
                  <User className="h-3.5 w-3.5" />
                  View as Student
                </Button>
                <Button
                  variant={viewMode === "accessed" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("accessed")}
                  className="gap-1.5"
                >
                  <Lock className="h-3.5 w-3.5" />
                  View as Accessed
                </Button>
              </div>
            )}

            {/* View status (staff/instructor in normal mode) */}
            {isStaff && viewMode === "normal" && (
              <ReportCardViewLog reportCardId={reportCard.id} />
            )}





            {/* View Mode Banner */}
            {isStaff && viewMode !== "normal" && (
              <div className={`p-3 rounded-lg border text-sm font-medium text-center ${
                viewMode === "student"
                  ? "bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-300"
                  : "bg-purple-500/10 border-purple-500/20 text-purple-700 dark:text-purple-300"
              }`}>
                {viewMode === "student"
                  ? `👁️ Viewing as Student: ${reportCard.student_name}`
                  : "🔗 Viewing as Access-Granted Viewer"}
              </div>
            )}

            {/* Copy Link + Open Previous Report (admin/instructor/staff only, normal view) */}
            {showCopyLink && (
              <>
                <div className="flex justify-end gap-2 flex-wrap">
                  <PreviousReportButton
                    studentId={reportCard.student_id}
                    currentReportId={reportCard.id}
                    currentReportCreatedAt={reportCard.created_at}
                  />
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleCopyLink}
                    className="gap-2"
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Copy Link
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground text-right -mt-2">
                  Recipient enters the access code — no sign-in required.
                </p>
              </>
            )}

            {/* Header Info */}
            <Card className="portal-card">
              <CardContent className="p-4 sm:p-6">
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div className="flex items-start gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs sm:text-sm text-muted-foreground">{t('common.date')}</p>
                      <p className="font-medium text-sm sm:text-base report-text-sweep">
                        {reportCard.session_starts_at 
                          ? format(parseISO(reportCard.session_starts_at), 'MMMM d, yyyy')
                          : format(parseISO(reportCard.created_at), 'MMMM d, yyyy')
                        }
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground">{t('common.time')}</p>
                    <p className="font-medium text-sm sm:text-base report-text-sweep">
                      {reportCard.session_starts_at && reportCard.session_ends_at
                        ? `${format(parseISO(reportCard.session_starts_at), 'h:mm a')} - ${format(parseISO(reportCard.session_ends_at), 'h:mm a')}`
                        : t('common.na')
                      }
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <User className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs sm:text-sm text-muted-foreground">{t('common.instructor')}</p>
                      {role === 'student' ? (
                        <button
                          type="button"
                          onClick={() => setInstructorModalOpen(true)}
                          className="font-medium text-sm sm:text-base break-words report-text-sweep text-left hover:underline hover:text-primary transition-colors"
                        >
                          {reportCard.instructor_name}
                        </button>
                      ) : (
                        <p className="font-medium text-sm sm:text-base break-words report-text-sweep">{reportCard.instructor_name}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <User className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs sm:text-sm text-muted-foreground">{t('common.student')}</p>
                      <p className="font-medium text-sm sm:text-base break-words report-text-sweep">{reportCard.student_name}</p>
                    </div>
                  </div>
                  <div className="col-span-2 flex items-start gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs sm:text-sm text-muted-foreground">{t('common.submitted')}</p>
                      <p className="font-medium text-sm sm:text-base report-text-sweep">{format(parseISO(reportCard.created_at), 'MMMM d, yyyy h:mm a')}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Overall Rating */}
            <Card className="portal-card">
              <CardContent className="p-4 sm:p-6">
                <div className="text-center p-4 bg-primary/10 rounded-lg">
                  <p className="text-xs sm:text-sm text-muted-foreground mb-2">{t('report.overallRating')}</p>
                  <div className="flex items-center justify-center gap-2">
                    <Star className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
                    <span className="text-3xl sm:text-4xl font-bold report-text-sweep">{reportCard.overall || '-'}</span>
                    <span className="text-xl sm:text-2xl text-muted-foreground">/10</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Student Skill Progress Graph (hidden in accessed mode if not enabled publicly) */}
            {showGraphSection && (
              <div className="report-graph-section">
                <StudentProgressSection
                  studentId={reportCard.student_id}
                  reportCardId={reportCard.id}
                  anchorReport={reportCard}
                  savedHighlights={skillHighlights}
                />
              </div>
            )}

            {/* Skill Progress Highlights (hidden in accessed mode if graph not public) */}
            {showGraphSection && (
              <SkillHighlightsDisplay
                strongest={skillHighlights.strongest_skills}
                mostImproved={skillHighlights.most_improved_skills}
                focusAreas={skillHighlights.focus_areas}
              />
            )}

            {/* Time Spent During Lesson */}
            {timeSplit && timeSplit.length > 0 && (
              <Card className="portal-card">
                <CardContent className="p-4 sm:p-6">
                  <h4 className="font-medium mb-3 text-sm sm:text-base">Time spent during this lesson</h4>
                  <TimeSplitChart entries={timeSplit} />
                </CardContent>
              </Card>
            )}


            {/* Rating Categories */}
            <Card className="portal-card">
              <CardContent className="p-4 sm:p-6">
                <h4 className="font-medium mb-4 text-sm sm:text-base">{t('report.skillRatings')}</h4>
                <div className="grid gap-2">
                  {RATING_CATEGORIES.filter(cat => cat.key !== 'overall').map(category => {
                    const rating = reportCard[category.key as keyof ReportCardDetails] as number | null;
                    return (
                      <div key={category.key} className="flex items-center gap-2 sm:gap-3 report-skill-bar">
                        <span className="text-xs sm:text-sm w-28 sm:w-40 truncate report-text-sweep">{skillLabel(category.key, category.label)}</span>
                        <div className="flex-1">
                          <Progress 
                            value={rating ? rating * 10 : 0} 
                            className="h-2"
                          />
                        </div>
                        <span className="text-xs sm:text-sm font-medium w-6 sm:w-8 text-right report-text-sweep">
                          {rating || '-'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Transcription */}
            {reportCard.transcription_summary && (
              <Card className="portal-card">
                <CardContent className="p-4 sm:p-6">
                  <h4 className="font-medium mb-2 text-sm sm:text-base">{t('report.lessonSummary')}</h4>
                  <RichTextDisplay
                    value={reportCard.transcription_summary}
                    className="text-xs sm:text-sm report-text-sweep"
                  />
                </CardContent>
              </Card>
            )}

            {/* Message to Student */}
            {reportCard.message_to_student && (
              <Card className="portal-card">
                <CardContent className="p-4 sm:p-6 bg-muted/50">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="h-4 w-4" />
                    <span className="font-medium text-sm">{t('report.instructorsMessage')}</span>
                  </div>
                  <p className="text-xs sm:text-sm whitespace-pre-wrap report-text-sweep">{reportCard.message_to_student}</p>
                </CardContent>
              </Card>
            )}

            {/* Internal Message (staff/admin only, normal view only) */}
            {showInternalNotes && reportCard.can_see_internal && reportCard.internal_message && (
              <Card className="portal-card border-destructive/20">
                <CardContent className="p-4 sm:p-6 bg-destructive/10">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="h-4 w-4 text-destructive" />
                    <span className="font-medium text-sm text-destructive">Internal Notes (Staff Only)</span>
                  </div>
                  <p className="text-xs sm:text-sm whitespace-pre-wrap">{reportCard.internal_message}</p>
                </CardContent>
              </Card>
            )}

            {/* Public Sharing Section (admin/instructor/staff only, normal view) */}
            {showSharingSection && (
              <Card className="portal-card border-primary/20">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Share2 className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">Public Access</span>
                  </div>

                  {isPublic ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                        <Link2 className="h-4 w-4 text-green-500 shrink-0" />
                        <span className="text-sm text-green-500 font-medium">Public access is enabled</span>
                      </div>

                      <Button
                        onClick={handleCopyPublicLink}
                        variant="outline"
                        className="w-full gap-2 min-h-[44px]"
                      >
                        {publicCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {publicCopied ? "Copied!" : "Copy Public Link"}
                      </Button>

                      <p className="text-xs text-muted-foreground">
                        This public link is for viewers without a DrivingKlass account. They must enter the access code you set.
                      </p>

                      {/* Public Graph Toggle */}
                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
                        <div className="flex items-center gap-2">
                          <BarChart3 className="h-4 w-4 text-primary" />
                          <span className="text-xs sm:text-sm font-medium">Show progress graph on public report card</span>
                        </div>
                        <Switch
                          checked={showGraphPublicly}
                          onCheckedChange={async (checked) => {
                            setShowGraphPublicly(checked);
                            await supabase
                              .from('report_cards')
                              .update({ show_graph_publicly: checked } as any)
                              .eq('id', id!);
                            toast({ title: checked ? "Graph will be shown publicly" : "Graph hidden from public view" });
                          }}
                        />
                      </div>

                      {/* Update access code */}
                      <div className="border-t pt-4 space-y-3">
                        <p className="text-xs font-medium text-muted-foreground">Update Access Code</p>
                        <div className="space-y-2">
                          <Input
                            placeholder="New access code"
                            value={accessCodeInput}
                            onChange={(e) => setAccessCodeInput(e.target.value)}
                            autoComplete="off"
                          />
                          <Input
                            placeholder="Confirm new access code"
                            value={confirmCodeInput}
                            onChange={(e) => setConfirmCodeInput(e.target.value)}
                            autoComplete="off"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            onClick={handleUpdateCode}
                            variant="outline"
                            size="sm"
                            disabled={sharingLoading || !accessCodeInput.trim()}
                            className="flex-1"
                          >
                            {sharingLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Update Code"}
                          </Button>
                          <Button
                            onClick={handleDisablePublic}
                            variant="destructive"
                            size="sm"
                            disabled={sharingLoading}
                            className="flex-1"
                          >
                            Disable Public Access
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <Lock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">This report card is private</span>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs">Access Code</Label>
                        <Input
                          placeholder="Set access code (min 4 characters)"
                          value={accessCodeInput}
                          onChange={(e) => setAccessCodeInput(e.target.value)}
                          autoComplete="off"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Confirm Access Code</Label>
                        <Input
                          placeholder="Confirm access code"
                          value={confirmCodeInput}
                          onChange={(e) => setConfirmCodeInput(e.target.value)}
                          autoComplete="off"
                        />
                      </div>

                      <Button
                        onClick={handleEnablePublic}
                        className="w-full cta-button min-h-[44px] gap-2"
                        disabled={sharingLoading || !accessCodeInput.trim()}
                      >
                        {sharingLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                        Make this report card public
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Edit Button for instructor/admin (normal view only) */}
            {showEditButton && (
              <Button 
                onClick={() => navigate(`/instructor/report-cards/edit/${reportCard.id}`)} 
                className="w-full cta-button min-h-[44px]"
              >
                Edit Report Card
              </Button>
            )}

            {/* Report Card History */}
            <ReportCardHistoryList
              studentId={reportCard.student_id}
              currentReportCardId={reportCard.id}
            />

            {/* Lesson Rating — always at the very bottom */}
            <div className="pb-8">
              <LessonRating
                reportCardId={reportCard.id}
                studentId={role === 'student' ? user?.id : undefined}
                instructorId={reportCard.instructor_id}
                sessionId={reportCard.session_id}
                studentName={reportCard.student_name}
                readOnly={viewMode === "normal" && (role === 'admin' || role === 'staff' || role === 'instructor')}
                isPublicView={viewMode === "accessed"}
              />
            </div>
          </div>
        ) : null}
      </div>
      <InstructorProfileModal
        open={instructorModalOpen}
        onOpenChange={setInstructorModalOpen}
        instructor={instructorProfile}
      />
    </PortalLayout>
  );
}

function PreviousReportButton({ studentId, currentReportId, currentReportCreatedAt }: {
  studentId: string;
  currentReportId: string;
  currentReportCreatedAt: string;
}) {
  const [prevId, setPrevId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('report_cards')
        .select('id, created_at')
        .eq('student_id', studentId)
        .eq('report_card_status', 'completed')
        .lt('created_at', currentReportCreatedAt)
        .order('created_at', { ascending: false })
        .limit(1);
      if (data && data.length > 0 && data[0].id !== currentReportId) {
        setPrevId(data[0].id);
      }
    };
    load();
  }, [studentId, currentReportId, currentReportCreatedAt]);

  if (!prevId) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-2"
      onClick={() => navigate(`/report-cards/${prevId}`)}
    >
      <FileText className="h-4 w-4" />
      Previous Report
    </Button>
  );
}
