import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface FamilyMember {
  user_id: string;
  full_name: string | null;
  email: string | null;
  relationship: string | null;
  is_primary: boolean;
  is_me: boolean;
}

export const RELATIONSHIP_LABELS: Record<string, string> = {
  parent: "Parent",
  guardian: "Guardian",
  student: "Student",
  other: "Other",
};

/** Everyone attached to the current login's account (main + linked logins). */
export function useAccountFamily(userId: string | undefined) {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) {
      setMembers([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase.rpc("get_account_family").then(({ data }) => {
      if (!cancelled) {
        setMembers((data as FamilyMember[]) || []);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { members, loading, me: members.find((m) => m.is_me) || null };
}
