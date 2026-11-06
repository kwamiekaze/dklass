import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StudentShell } from "@/components/portal/StudentShell";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeDebugBadge } from "@/components/ThemeDebugBadge";
import { AuthProvider } from "@/hooks/useAuth";
import { PortalAuthProvider } from "@/hooks/usePortalAuth";
import { AnalyticsProvider } from "@/hooks/useAnalytics";

// Public pages
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Admin from "./pages/Admin";
import AdminAnalytics from "./pages/AdminAnalytics";
import NotFound from "./pages/NotFound";

// Portal pages
import Login from "./pages/portal/Login";
import Signup from "./pages/portal/Signup";
import ForgotPassword from "./pages/portal/ForgotPassword";
import ResetPassword from "./pages/portal/ResetPassword";
import PendingApproval from "./pages/portal/PendingApproval";
import RejectedStatus from "./pages/portal/RejectedStatus";
import StudentDashboard from "./pages/portal/StudentDashboard";
import StudentProfile from "./pages/portal/StudentProfile";
import Profile from "./pages/portal/Profile";
import ProfileRedirect from "./pages/portal/ProfileRedirect";
import IntakeForm, { AdminIntakeEdit } from "./pages/portal/IntakeForm";
import InstructorDashboard from "./pages/portal/InstructorDashboard";
import InstructorSchedule from "./pages/portal/InstructorSchedule";
import InstructorStudentView from "./pages/portal/InstructorStudentView";
import InstructorStudents from "./pages/portal/InstructorStudents";
import ReportCardForm from "./pages/portal/ReportCardForm";
import ReportCardView from "./pages/portal/ReportCardView";
import ReportCardOpen from "./pages/portal/ReportCardOpen";
import RoadTestResultView from "./pages/portal/RoadTestResultView";
import RoadTestResultOpen from "./pages/portal/RoadTestResultOpen";
import AdminDashboard from "./pages/portal/AdminDashboard";
import AdminApprovals from "./pages/portal/AdminApprovals";
import AdminSchedule from "./pages/portal/AdminSchedule";
import AdminAssignments from "./pages/portal/AdminAssignments";
import AdminReportCards from "./pages/portal/AdminReportCards";
import AdminLeads from "./pages/portal/AdminLeads";
import AdminQA from "./pages/portal/AdminQA";
import AdminPlatformHealth from "./pages/portal/AdminPlatformHealth";
import AdminMessages from "./pages/portal/AdminMessages";
import AdminStudents from "./pages/portal/AdminStudents";
import AdminInstructors from "./pages/portal/AdminInstructors";
import AdminPermitQueue from "./pages/portal/AdminPermitQueue";
import AdminMap from "./pages/portal/AdminMap";
import AdminProposals from "./pages/portal/AdminProposals";
import InstructorMap from "./pages/portal/InstructorMap";
import StudentProposals from "./pages/portal/StudentProposals";
import PublicReportCard from "./pages/portal/PublicReportCard";
import PublicStudentSchedule from "./pages/portal/PublicStudentSchedule";
import AdminFeedback from "./pages/portal/AdminFeedback";
import AdminEmails from "./pages/portal/AdminEmails";
import PracticeTest from "./pages/portal/PracticeTest";
import AdminPracticeQuestions from "./pages/portal/AdminPracticeQuestions";
import RoadTestGame from "./games/roadtest/RoadTestGame";
const StopGame = lazy(() => import("./games/stopgame/StopGame"));
import { ProtectedRoute } from "./components/portal/ProtectedRoute";

import Unsubscribe from "./pages/Unsubscribe";
import OAuthConsent from "./pages/OAuthConsent";
import GuardianTrackerPage from "./pages/GuardianTrackerPage";
import InstructorLiveTracker from "./pages/portal/InstructorLiveTracker";
import AdminLiveTracker from "./pages/portal/AdminLiveTracker";
import StudentLiveTracker from "./pages/portal/StudentLiveTracker";
import Preview from "./pages/preview/Preview";
import KlassroomPreview from "./pages/KlassroomPreview";
import NuHome2 from "./pages/NuHome2";
const queryClient = new QueryClient();

/** /nuhome2 was the preview address. It now forwards to the home page, keeping any query string. */
function Nuhome2Redirect() { const { search, hash } = useLocation(); return <Navigate to={{ pathname: "/", search, hash }} replace />; }

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="time-based" storageKey="theme">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <ThemeDebugBadge />
        <BrowserRouter>
          <Routes>
            {/* Fully public route — NO auth providers, no analytics */}
            <Route path="/report/public/:slug" element={<StudentShell><PublicReportCard /></StudentShell>} />
            <Route path="/schedule/public/:slug" element={<StudentShell><PublicStudentSchedule /></StudentShell>} />
            <Route path="/unsubscribe" element={<StudentShell><Unsubscribe /></StudentShell>} />
            <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
            <Route path="/play" element={<RoadTestGame publicMode />} />
            <Route path="/tracker/:token" element={<StudentShell><GuardianTrackerPage /></StudentShell>} />
            <Route path="/preview" element={<Preview />} />
            <Route path="/nuhome" element={<KlassroomPreview />} />



            {/* All other routes wrapped in auth + analytics providers */}
            <Route path="/*" element={
              <AuthProvider>
                <PortalAuthProvider>
                  <AnalyticsProvider>
                    <Routes>
                      {/* Public Routes */}
                      <Route path="/" element={<NuHome2 />} />
                      <Route path="/nuhome2" element={<Nuhome2Redirect />} />
                      <Route path="/classic-home" element={<Index />} />
                      {/* staff-only while the game is being finished */}
                      <Route path="/stop-game" element={<Suspense fallback={null}><StopGame /></Suspense>} />
                      <Route path="/auth" element={<Auth />} />
                      
                      {/* Portal Auth Routes */}
                      <Route path="/login" element={<StudentShell><Login /></StudentShell>} />
                      <Route path="/signup" element={<StudentShell><Signup /></StudentShell>} />
                      <Route path="/forgot-password" element={<StudentShell><ForgotPassword /></StudentShell>} />
                      <Route path="/reset-password" element={<StudentShell><ResetPassword /></StudentShell>} />
                      <Route path="/pending-approval" element={<StudentShell><PendingApproval /></StudentShell>} />
                      <Route path="/rejected" element={<StudentShell><RejectedStatus /></StudentShell>} />
                      
                      {/* Intake Form */}
                      <Route path="/intake" element={<IntakeForm />} />
                      <Route path="/intake-form" element={<IntakeForm />} />
                      
                      {/* Admin Intake Edit */}
                      <Route path="/admin/intake-edit" element={<AdminIntakeEdit />} />
                      
                      {/* Canonical Profile Route */}
                      <Route path="/profile" element={<Profile />} />
                      
                      {/* Legacy Profile Redirects */}
                      <Route path="/student/profile" element={<ProfileRedirect />} />
                      <Route path="/instructor/profile" element={<ProfileRedirect />} />
                      <Route path="/admin/profile" element={<ProfileRedirect />} />
                      <Route path="/staff/profile" element={<ProfileRedirect />} />
                      <Route path="/teacher/profile" element={<ProfileRedirect />} />
                      <Route path="/settings/profile" element={<ProfileRedirect />} />
                      <Route path="/klassroom/profile" element={<ProfileRedirect />} />
                      
                      {/* Student Portal */}
                      <Route path="/student" element={<StudentDashboard />} />
                      <Route path="/student/proposals" element={<StudentProposals />} />
                      <Route path="/student/tracker" element={<StudentLiveTracker />} />
                      <Route path="/instructor/tracker" element={<InstructorLiveTracker />} />
                      <Route path="/admin/tracker" element={<AdminLiveTracker />} />
                      
                      {/* Instructor Portal */}
                      <Route path="/instructor" element={<InstructorDashboard />} />
                      <Route path="/instructor/schedule" element={<InstructorSchedule />} />
                      <Route path="/instructor/students" element={<InstructorStudents />} />
                      <Route path="/instructor/students/:id" element={<InstructorStudentView />} />
                      <Route path="/instructor/report-cards/new" element={<ReportCardForm />} />
                      <Route path="/instructor/report-cards/edit/:id" element={<ReportCardForm />} />
                      
                      {/* Report Card Routes */}
                      <Route path="/report-cards/open/:id" element={<StudentShell><ReportCardOpen /></StudentShell>} />
                      <Route path="/report-cards/:id" element={<ReportCardView />} />
                      <Route path="/road-test-results/open/:sessionId" element={<StudentShell><RoadTestResultOpen /></StudentShell>} />
                      <Route path="/road-test-results/:sessionId" element={<RoadTestResultView />} />
                      
                      {/* Admin Portal */}
                      <Route path="/admin" element={<AdminDashboard />} />
                      <Route path="/admin/approvals" element={<AdminApprovals />} />
                      <Route path="/admin/schedule" element={<AdminSchedule />} />
                      <Route path="/admin/assignments" element={<AdminAssignments />} />
                      <Route path="/admin/report-cards" element={<AdminReportCards />} />
                      <Route path="/admin/leads" element={<AdminLeads />} />
                      <Route path="/admin/qa" element={<AdminQA />} />
                      <Route path="/admin/health" element={<AdminPlatformHealth />} />
                      <Route path="/admin/messages" element={<AdminMessages />} />
                      <Route path="/admin/students" element={<AdminStudents />} />
                      <Route path="/admin/instructors" element={<AdminInstructors />} />
                      <Route path="/admin/permits" element={<AdminPermitQueue />} />
                      <Route path="/admin/map" element={<AdminMap />} />
                      <Route path="/admin/proposals" element={<AdminProposals />} />
                      <Route path="/admin/feedback" element={<AdminFeedback />} />
                      <Route path="/admin/practice-questions" element={<AdminPracticeQuestions />} />
                      <Route path="/admin/practice-test" element={<PracticeTest />} />
                      <Route path="/instructor/feedback" element={<AdminFeedback />} />
                      <Route path="/instructor/practice-test" element={<PracticeTest />} />
                      <Route path="/admin/emails" element={<AdminEmails />} />
                      <Route path="/instructor/emails" element={<AdminEmails />} />
                      
                      {/* Instructor Map */}
                      <Route path="/instructor/map" element={<InstructorMap />} />
                      <Route path="/admin/analytics" element={<AdminAnalytics />} />
                      
                      {/* Legacy Admin */}
                      <Route path="/old-admin" element={<Admin />} />
                      
                      {/* Driving Simulator — open to everyone (guests can play + post to leaderboard) */}
                      <Route path="/simulator" element={<RoadTestGame />} />
                      
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </AnalyticsProvider>
                </PortalAuthProvider>
              </AuthProvider>
            } />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
