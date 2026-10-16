import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAccountFamily, RELATIONSHIP_LABELS } from "@/hooks/useAccountFamily";

/** Read-only list of everyone linked to this account. Hidden when there is nobody else. */
export function FamilyCard({ userId }: { userId: string | undefined }) {
  const { members } = useAccountFamily(userId);
  if (members.length < 2) return null;

  return (
    <Card className="portal-card">
      <CardHeader className="pb-3 sm:pb-4">
        <CardTitle className="text-base sm:text-lg">Family</CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Everyone who can sign in to this account with their own email and password.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {members.map((m) => (
          <div key={m.user_id} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{m.full_name || m.email || "Account member"}</p>
              <p className="truncate text-xs text-muted-foreground">{m.email}</p>
            </div>
            {m.relationship && (
              <Badge variant="outline" className="text-[10px]">{RELATIONSHIP_LABELS[m.relationship] || m.relationship}</Badge>
            )}
            {m.is_primary && <Badge className="text-[10px]">Primary</Badge>}
            {m.is_me && <Badge variant="secondary" className="text-[10px]">You</Badge>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
