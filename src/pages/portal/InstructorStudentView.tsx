import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { usePortalAuth } from "@/hooks/usePortalAuth";
import { supabase } from "@/integrations/supabase/client";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { ProtectedRoute } from "@/components/portal/ProtectedRoute";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, User, Calendar, FileText, Phone, Mail, MapPin, CreditCard, Loader2 } from "lucide-react";
import { Profile, Session, ReportCard } from "@/types/portal";
import { format, parseISO } from "date-fns";
import { SessionCalendar } from "@/components/portal/SessionCalendar";
import { ReportCardList } from "@/components/portal/ReportCardList";
import { getDisplayName } from "@/lib/profileUtils";
import { PermitPreview } from "@/components/portal/PermitPreview";
import { StudentDocumentSection } from "@/components/portal/StudentDocumentSection";

export default function InstructorStudentView() {
  return (
    <ProtectedRoute allowedRoles={['instructor', 'admin']}>
      <PortalLayout>
        <InstructorStudentViewContent />
      </PortalLayout>
    </ProtectedRoute>
  );
}

function InstructorStudentViewContent() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, role } = usePortalAuth();
  const [student, setStudent] = useState<Profile | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id && user) {
      fetchData();
    }
  }, [id, user]);

  const fetchData = async () => {
    if (!id || !user) return;

    // Fetch student profile
    const { data: studentData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (studentData) {
      setStudent(studentData as Profile);
    }

    // Fetch sessions for this student
    const sessionQuery = supabase
      .from('sessions')
      .select('*, instructor:profiles!sessions_instructor_id_fkey(*)')
      .eq('student_id', id)
      .order('starts_at', { ascending: false });

    // If instructor, only show their sessions with this student
    if (role === 'instructor') {
      sessionQuery.eq('instructor_id', user.id);
    }

    const { data: sessionsData } = await sessionQuery;
    if (sessionsData) {
      setSessions(sessionsData as Session[]);
    }

    // Fetch report cards
    const reportQuery = supabase
      .from('report_cards')
      .select('*, session:sessions(*), instructor:profiles!report_cards_instructor_id_fkey(*)')
      .eq('student_id', id)
      .order('created_at', { ascending: false });

    if (role === 'instructor') {
      reportQuery.eq('instructor_id', user.id);
    }

    const { data: reportCardsData } = await reportQuery;
    if (reportCardsData) {
      setReportCards(reportCardsData as ReportCard[]);
    }

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Student not found</p>
        <Button variant="link" onClick={() => navigate(-1)}>Go back</Button>
      </div>
    );
  }

  const averageRating = reportCards.length > 0 
    ? Math.round(reportCards.reduce((acc, rc) => acc + (rc.overall || 0), 0) / reportCards.length * 10) / 10
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold theme-heading">{getDisplayName(student, 'Student')}</h1>
          {student.public_id && (
            <p className="text-muted-foreground font-mono">ID: {student.public_id}</p>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{sessions.length}</p>
                <p className="text-xs text-muted-foreground">Sessions</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{reportCards.length}</p>
                <p className="text-xs text-muted-foreground">Reports</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{averageRating ?? '-'}</p>
                <p className="text-xs text-muted-foreground">Avg Rating</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <Badge variant={student.approved ? "default" : "secondary"}>
              {student.approved ? "Approved" : "Pending"}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="info" className="space-y-4">
        <TabsList>
          <TabsTrigger value="info" className="gap-2">
            <User className="h-4 w-4" />
            Info
          </TabsTrigger>
          <TabsTrigger value="sessions" className="gap-2">
            <Calendar className="h-4 w-4" />
            Sessions
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-2">
            <FileText className="h-4 w-4" />
            Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Contact Info */}
            <Card>
              <CardHeader>
                <CardTitle>Contact Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{student.email || 'Not provided'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{student.phone || 'Not provided'}</span>
                </div>
              </CardContent>
            </Card>

            {/* Addresses */}
            <Card>
              <CardHeader>
                <CardTitle>Pickup/Drop-off</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">Pickup</p>
                  <p className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    {student.pickup_address || 'Not provided'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Drop-off</p>
                  <p className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    {student.dropoff_address || 'Not provided'}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Permit Info */}
            <Card>
              <CardHeader>
                <CardTitle>Permit Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {student.permit_number && (
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    <span>#{student.permit_number}</span>
                  </div>
                )}
                {student.permit_issue_date && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Issued: </span>
                    {format(new Date(student.permit_issue_date), 'MMM d, yyyy')}
                  </p>
                )}
                {student.permit_expiration_date && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Expires: </span>
                    {format(new Date(student.permit_expiration_date), 'MMM d, yyyy')}
                  </p>
                )}
                <PermitPreview permitFileUrl={student.permit_file_url} studentId={student.id} className="max-w-full sm:max-w-md" />
              </CardContent>
            </Card>

            {/* Guardian Info */}
            <Card>
              <CardHeader>
                <CardTitle>Emergency Contact</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">Name</p>
                  <p>{student.guardian_name || 'Not provided'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{student.guardian_phone || 'Not provided'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{student.guardian_email || 'Not provided'}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Document History */}
          {id && (
            <StudentDocumentSection
              studentId={id}
              isOwnProfile={false}
              isStaffOrAdmin={true}
            />
          )}
        </TabsContent>

        <TabsContent value="sessions">
          <SessionCalendar 
            sessions={sessions}
            userRole={role as any}
            onSessionUpdate={fetchData}
          />
        </TabsContent>

        <TabsContent value="reports">
          <ReportCardList 
            reportCards={reportCards}
            userRole={role as any}
            onEdit={(card) => navigate(`/instructor/report-cards/edit/${card.id}`)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
