import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { UserRole, Profile, ApprovalStatus } from "@/types/portal";

interface PortalAuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: UserRole | null;
  isLoading: boolean;
  isApproved: boolean;
  isRejected: boolean;
  isPending: boolean;
  approvalStatus: ApprovalStatus | null;
  isIntakeSubmitted: boolean;
  isStaffOrAdmin: boolean;
  refetchProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const PortalAuthContext = createContext<PortalAuthContextType | undefined>(undefined);

/** True when this page load is the return from a sign-in provider (the address carries its code or token). Read once, before the library tidies the address. */
const OAUTH_RETURN = (() => {
  try { const l = window.location; return /(^|[#&?])(access_token|code|provider_token)=/.test(`${l.hash}${l.search}`); } catch { return false; }
})();
const oauthHandled = { v: false };
/** Set by the sign-in buttons just before they hand over to Google, so the return trip is recognised even when the address carries nothing. */
export const OAUTH_FLAG = "dk_oauth_pending";
const oauthPending = () => { try { const v = sessionStorage.getItem(OAUTH_FLAG); if (v) sessionStorage.removeItem(OAUTH_FLAG); return !!v; } catch { return false; } };

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Resolve the canonical student account for any auth user. A secondary
  // (alias) login returns the primary account's id so the UI shows the same data.
  const resolveCanonicalId = async (userId: string): Promise<string> => {
    const { data, error } = await supabase.rpc('canonical_user_id', { _uid: userId });
    if (error || !data) return userId;
    return data as string;
  };

  const fetchProfile = async (userId: string) => {
    const canonicalId = await resolveCanonicalId(userId);
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', canonicalId)
      .maybeSingle();
    
    if (profileData) {
      setProfile(profileData as Profile);
    }
  };

  const fetchRole = async (userId: string) => {
    const canonicalId = await resolveCanonicalId(userId);
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', canonicalId)
      .maybeSingle();
    
    if (roleData) {
      setRole(roleData.role as UserRole);
    }
  };


  const refetchProfile = async () => {
    if (user?.id) {
      await Promise.all([fetchProfile(user.id), fetchRole(user.id)]);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          setTimeout(() => {
            fetchProfile(session.user.id);
            fetchRole(session.user.id);
          }, 0);

          // Update last_sign_in_at on any sign-in or token refresh
          if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
            setTimeout(() => {
              supabase
                .from('profiles')
                .update({ last_sign_in_at: new Date().toISOString() })
                .eq('id', session.user.id)
                .then(() => {});
            }, 0);
          }
        } else {
          setProfile(null);
          setRole(null);
        }

        // Handle OAuth callback: only when this page load really is the return from a sign-in provider.
        // (The auth library also announces SIGNED_IN whenever a tab is refocused or a session is restored, which must never carry a visitor from the home page into the dashboard.)
        if (event === 'SIGNED_IN' && session?.user && (OAUTH_RETURN || oauthPending()) && !oauthHandled.v) {
          const path = window.location.pathname;
          if (path === '/' || path === '') {
            oauthHandled.v = true;
            setTimeout(() => {
              window.location.href = '/login';
            }, 500);
          }
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        // Update last_sign_in_at on session restore
        supabase
          .from('profiles')
          .update({ last_sign_in_at: new Date().toISOString() })
          .eq('id', session.user.id)
          .then(() => {});

        Promise.all([
          fetchProfile(session.user.id),
          fetchRole(session.user.id)
        ]).finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    
    // If sign-in successful, immediately fetch profile and role for faster routing
    if (data?.user && !error) {
      // Update last_sign_in_at timestamp
      await supabase
        .from('profiles')
        .update({ last_sign_in_at: new Date().toISOString() })
        .eq('id', data.user.id);
      
      await Promise.all([
        fetchProfile(data.user.id),
        fetchRole(data.user.id)
      ]);
    }
    
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { full_name: fullName }
      },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Sign out error:', error);
      throw error;
    }
    setUser(null);
    setSession(null);
    setProfile(null);
    setRole(null);
  };

  // Determine approval status - check new field first, fallback to legacy boolean
  const approvalStatus: ApprovalStatus | null = 
    (profile as any)?.approval_status || 
    (profile?.approved ? 'approved' : profile ? 'pending' : null);
  
  const isApproved = approvalStatus === 'approved';
  const isRejected = approvalStatus === 'rejected';
  const isPending = approvalStatus === 'pending';
  const isIntakeSubmitted = profile?.intake_submitted ?? false;
  const isStaffOrAdmin = role === 'staff' || role === 'admin';

  return (
    <PortalAuthContext.Provider value={{
      user,
      session,
      profile,
      role,
      isLoading,
      isApproved,
      isRejected,
      isPending,
      approvalStatus,
      isIntakeSubmitted,
      isStaffOrAdmin,
      refetchProfile,
      signIn,
      signUp,
      signOut,
    }}>
      {children}
    </PortalAuthContext.Provider>
  );
}

export function usePortalAuth() {
  const context = useContext(PortalAuthContext);
  if (context === undefined) {
    throw new Error("usePortalAuth must be used within a PortalAuthProvider");
  }
  return context;
}
