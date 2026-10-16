import { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { usePortalAuth } from "@/hooks/usePortalAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Moon, Sun, Bell, User, LogOut, Calendar, FileText, Users, Settings, Home, CheckCircle, Menu, X, UserPlus, FileUser, Shield, Headset, Gamepad2, Map as MapIcon, Send, Star, BookOpen, Mail, RadioTower, HeartPulse } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { GlobalSearch } from "@/components/portal/GlobalSearch";
import { useEffect, useState } from "react";
import { StudentThemeContext } from "@/lib/studentTheme";
import { StudentSky } from "@/components/portal/StudentSky";
import { HeaderPanel } from "@/components/nuhome2/HeaderPanel";
import { useTheme } from "@/components/ThemeProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import wheelUrl from "@/assets/dk-steering-wheel.webp";
import "@/components/nuhome2/header.css";
import "@/components/portal/student-theme.css";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { resolveNotificationRoute, buildNotificationUrl } from "@/lib/notificationRouter";
import { Notification, UserRole } from "@/types/portal";
import { LanguageSwitcherInline } from "@/components/LanguageSwitcher";
import { useTranslation } from "react-i18next";
import { useAccountFamily, RELATIONSHIP_LABELS } from "@/hooks/useAccountFamily";

interface PortalLayoutProps {
  children: ReactNode;
}

export function PortalLayout({ children }: PortalLayoutProps) {
  const { profile, role, signOut } = usePortalAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead, hasMore, loadingMore, loadMore } = useNotifications();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();

  const handleSignOut = async () => {
    try {
      await signOut();
      toast({
        title: "Signed out successfully",
        description: "You have been logged out.",
      });
      navigate('/login');
    } catch (error: any) {
      toast({
        title: "Sign out failed",
        description: "Please retry.",
        variant: "destructive",
      });
    }
  };

  const navItems = getNavItems(role, t);
  const isStudent = role === "student";
  const { resolvedTheme, setTheme } = useTheme();
  const { trackClick } = useAnalytics();
  const night = resolvedTheme === "dark";
  // the navy and gold student look is switched on for the whole page, popups included, by one class on <body>
  useEffect(() => {
    if (!isStudent) return;
    document.body.classList.add("dk-portal");
    return () => document.body.classList.remove("dk-portal");
  }, [isStudent]);
  const hdrBtn = isStudent ? "n2-hdr-btn" : "";

  return (
    <StudentThemeContext.Provider value={isStudent}>
    <div className="min-h-screen">
      {isStudent && <StudentSky />}
      {/* Top Navigation */}
      <header className={cn(isStudent ? "n2-header n2-hdr n2-hdr--bar" : "sticky top-0 z-50 border-b border-border/40 bg-background/60 backdrop-blur-xl supports-[backdrop-filter]:bg-background/40")}>
        {isStudent && <HeaderPanel />}
        <div className={cn("flex h-14 sm:h-16 items-center justify-between px-3 sm:px-4 lg:px-6 max-w-7xl mx-auto", isStudent && "n2-hdr-row")}>
          {/* Logo/Brand */}
          {isStudent ? (
            <Link to="/" className="n2-brand" aria-label="DrivingKlass home">
              <span className="n2-hdr-wheelwrap" style={{ "--wheel": `url(${wheelUrl})` } as React.CSSProperties}>
                <img className="n2-hdr-wheel" src={wheelUrl} alt="" width={480} height={480} decoding="async" />
              </span>
              <span className="n2-hdr-sep" aria-hidden="true" />
              <span className="n2-hdr-word">DrivingKlass</span>
            </Link>
          ) : (
            <Link to="/" className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <span className="text-lg sm:text-xl font-bold text-gold-shimmer">DrivingKlass</span>
              <Badge variant="secondary" className="text-[10px] sm:text-xs hidden xs:inline-flex">Portal</Badge>
            </Link>
          )}

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => (
              <Link key={item.href} to={item.href}>
                <Button 
                  variant={location.pathname === item.href ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-1.5 text-sm"
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Button>
              </Link>
            ))}
          </nav>

          {/* Right Side Actions */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Global Search - Admin/Staff Only */}
            {(role === 'admin' || role === 'staff') && (
              <div className="hidden sm:block">
                <GlobalSearch />
              </div>
            )}
            
            {isStudent ? (
              <button type="button" className="n2-hdr-btn" aria-label={night ? "Switch to day" : "Switch to night"}
                onClick={() => { trackClick("theme_toggle", { theme: night ? "light" : "dark" }); setTheme(night ? "light" : "dark"); }}>
                {night ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
              </button>
            ) : <ThemeToggle />}
            
            {/* Notifications */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className={cn("relative h-9 w-9 sm:h-10 sm:w-10", hdrBtn)}>
                  <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
                  {unreadCount > 0 && (
                    <Badge 
                      className="absolute -top-1 -right-1 h-4 w-4 sm:h-5 sm:w-5 p-0 flex items-center justify-center text-[10px] sm:text-xs"
                      variant="destructive"
                    >
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-[min(92vw,20rem)] bg-popover border z-50 p-0 flex flex-col max-h-[min(70vh,600px)]"
              >
                <DropdownMenuLabel className="flex justify-between items-center gap-2 shrink-0 sticky top-0 bg-popover border-b px-3 py-2 z-10">
                  <span className="text-sm">{t('common.notifications')}</span>
                  {unreadCount > 0 && (
                    <Button variant="ghost" size="sm" onClick={markAllAsRead} className="text-xs h-7">
                      {t('common.markAllRead')}
                    </Button>
                  )}
                </DropdownMenuLabel>
                <div
                  className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
                  style={{ WebkitOverflowScrolling: 'touch' }}
                >
                  {notifications.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                      {t('common.noNotifications')}
                    </div>
                  ) : (
                    <>
                      {notifications.map((notif) => {
                        const handleNotificationClick = () => {
                          // Mark as read immediately (optimistic)
                          markAsRead(notif.id);

                          // Resolve the route based on notification type and user role
                          const resolved = resolveNotificationRoute(notif, role as UserRole);
                          const targetUrl = buildNotificationUrl(resolved);
                          navigate(targetUrl);
                        };

                        return (
                          <DropdownMenuItem
                            key={notif.id}
                            onClick={handleNotificationClick}
                            className={cn("flex flex-col items-start gap-1 p-3 cursor-pointer", !notif.read && "bg-muted/50")}
                          >
                            <div className="flex items-center gap-2 w-full">
                              <span className="font-medium text-sm truncate flex-1">{notif.title}</span>
                              {!notif.read && <div className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                            </div>
                            <span className="text-xs text-muted-foreground line-clamp-2">{notif.message}</span>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(notif.created_at), 'MMM d, h:mm a')}
                            </span>
                          </DropdownMenuItem>
                        );
                      })}
                      {hasMore && (
                        <div className="p-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full text-xs"
                            disabled={loadingMore}
                            onSelect={(e) => e.preventDefault()}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              loadMore();
                            }}
                          >
                            {loadingMore ? 'Loading…' : 'Load more'}
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className={cn("h-9 w-9 sm:h-10 sm:w-10 rounded-full p-0", hdrBtn)}>
                  <Avatar className="h-8 w-8 sm:h-9 sm:w-9">
                    <AvatarImage src={(profile as any)?.avatar_url || undefined} alt={profile?.full_name || 'User'} />
                    <AvatarFallback className="text-xs sm:text-sm bg-primary/10 text-primary">
                      {profile?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-popover border z-50">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span className="text-sm">{profile?.full_name || 'User'}</span>
                    <span className="text-xs text-muted-foreground font-normal capitalize">{role}</span>
                    {aliasMe && (
                      <span className="text-xs text-muted-foreground font-normal">
                        Signed in as {aliasMe.full_name || aliasMe.email}
                        {aliasMe.relationship ? ` (${RELATIONSHIP_LABELS[aliasMe.relationship] || aliasMe.relationship})` : ""}
                      </span>
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/profile')} className="cursor-pointer">
                  <User className="mr-2 h-4 w-4" />
                  {t('common.profile')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/')} className="cursor-pointer">
                  <Home className="mr-2 h-4 w-4" />
                  {t('common.mainSite')}
                </DropdownMenuItem>
                <LanguageSwitcherInline />
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" />
                  {t('common.signOut')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mobile Menu Toggle */}
            <Button
              variant="ghost"
              size="icon"
              className={cn("lg:hidden h-9 w-9 sm:h-10 sm:w-10", hdrBtn)}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav className="lg:hidden border-t border-border/40 p-3 sm:p-4 bg-background/80 backdrop-blur-xl">
            <div className="flex flex-col gap-1.5">
              {navItems.map((item) => (
                <Link 
                  key={item.href} 
                  to={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Button 
                    variant={location.pathname === item.href ? "secondary" : "ghost"}
                    className="w-full justify-start gap-2 min-h-[44px] text-sm"
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Button>
                </Link>
              ))}
            </div>
          </nav>
        )}
      </header>

      {/* Main Content */}
      <main className="px-3 sm:px-4 lg:px-6 py-4 sm:py-6 max-w-7xl mx-auto">
        {children}
      </main>
    </div>
    </StudentThemeContext.Provider>
  );
}

export function getNavItems(role: string | null, t: (k: string) => string) {
  const items: { href: string; label: string; icon: any }[] = [];

  switch (role) {
    case 'admin':
      items.push(
        { href: '/admin', label: 'Dashboard', icon: Home },
        { href: '/admin/students', label: 'Students', icon: Users },
        { href: '/admin/schedule', label: 'Schedule', icon: Calendar },
        { href: '/admin/proposals', label: 'Proposals', icon: Send },
        { href: '/admin/map', label: 'Map', icon: MapIcon },
        { href: '/admin/approvals', label: 'Approvals', icon: CheckCircle },
        { href: '/admin/report-cards', label: 'Reports', icon: FileText },
        { href: '/admin/feedback', label: 'Feedback', icon: Star },
        { href: '/admin/leads', label: 'Leads', icon: FileUser },
        { href: '/admin/messages', label: 'Messages', icon: Headset },
        { href: '/admin/emails', label: 'Emails', icon: Mail },
        { href: '/admin/qa', label: 'QA', icon: Shield },
        { href: '/admin/practice-test', label: 'Practice Test', icon: BookOpen },
        { href: '/admin/tracker', label: 'Live Tracker', icon: RadioTower },
        { href: '/admin/health', label: 'Platform Health', icon: HeartPulse },
        { href: '/simulator', label: 'Simulator', icon: Gamepad2 },
      );
      break;
    case 'staff':
      items.push(
        { href: '/admin', label: 'Dashboard', icon: Home },
        { href: '/admin/students', label: 'Students', icon: Users },
        { href: '/admin/schedule', label: 'Schedule', icon: Calendar },
        { href: '/admin/approvals', label: 'Approvals', icon: CheckCircle },
        { href: '/admin/report-cards', label: 'Reports', icon: FileText },
        { href: '/admin/feedback', label: 'Feedback', icon: Star },
        { href: '/admin/leads', label: 'Leads', icon: FileUser },
        { href: '/admin/messages', label: 'Messages', icon: Headset },
        { href: '/admin/emails', label: 'Emails', icon: Mail },
      );
      break;
    case 'instructor':
      items.push(
        { href: '/instructor', label: 'Dashboard', icon: Home },
        { href: '/instructor/schedule', label: 'Schedule', icon: Calendar },
        { href: '/instructor/students', label: 'Students', icon: Users },
        { href: '/instructor/feedback', label: 'Feedback', icon: Star },
        { href: '/instructor/emails', label: 'Emails', icon: Mail },
        { href: '/instructor/map', label: 'Map', icon: MapIcon },
        { href: '/instructor/practice-test', label: 'Practice Test', icon: BookOpen },
        { href: '/instructor/tracker', label: 'Live Tracker', icon: RadioTower },
        { href: '/simulator', label: 'Simulator', icon: Gamepad2 },
      );
      break;
    case 'student':
    default:
      items.push(
        { href: '/student', label: t('nav.dashboard'), icon: Home },
        { href: '/profile', label: t('nav.profile'), icon: User },
        { href: '/student/proposals', label: t('nav.proposals'), icon: Send },
        { href: '/student/tracker', label: 'Live Tracker', icon: RadioTower },
        { href: '/simulator', label: 'Play', icon: Gamepad2 },
      );
      break;
  }

  return items;
}