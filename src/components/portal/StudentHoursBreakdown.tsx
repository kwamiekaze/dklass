import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3 } from "lucide-react";

interface SessionLite {
  status: string;
  duration_minutes: number;
  actual_minutes?: number | null;
}

interface Props {
  studentId: string;
  sessions: SessionLite[];
  hoursRemaining: number;
  purchasedHours: number;
  hoursCompletedStored?: number | null;
}

const OPEN_ITEM = ["proposed", "pending_admin_finalize", "conflict"];
const h = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}h`;

/** Admin view: where every hour of a student stands (purchased, remaining, scheduled, completed, proposed, cancelled, not yet booked). */
export function StudentHoursBreakdown({ studentId, sessions, hoursRemaining, purchasedHours, hoursCompletedStored }: Props) {
  const [proposedMin, setProposedMin] = useState(0);
  const [proposedCount, setProposedCount] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("schedule_proposal_items")
        .select("duration_minutes, item_status, schedule_proposals!inner(student_id, proposal_status)")
        .eq("schedule_proposals.student_id", studentId)
        .in("item_status", OPEN_ITEM);
      if (!alive || !data) return;
      const rows = (data as any[]).filter((r) => !["declined", "cancelled"].includes(r.schedule_proposals?.proposal_status));
      setProposedMin(rows.reduce((a, r) => a + (r.duration_minutes || 0), 0));
      setProposedCount(rows.length);
    })();
    return () => { alive = false; };
  }, [studentId]);

  const s = useMemo(() => {
    let scheduled = 0, completed = 0, cancelled = 0, sc = 0, cc = 0, xc = 0;
    for (const x of sessions) {
      const full = (x.duration_minutes || 0) / 60;
      if (x.status === "scheduled" || x.status === "pending") { scheduled += full; sc++; }
      else if (x.status === "completed") { completed += full; cc++; }
      else if (x.status === "partially_completed") { completed += (x.actual_minutes ?? x.duration_minutes ?? 0) / 60; cc++; }
      else if (x.status === "cancelled") { cancelled += full; xc++; }
    }
    return { scheduled, completed, cancelled, sc, cc, xc };
  }, [sessions]);

  const completed = hoursCompletedStored != null && hoursCompletedStored > 0 ? Number(hoursCompletedStored) : s.completed;
  const proposed = proposedMin / 60;
  const unbooked = Math.max(0, hoursRemaining - s.scheduled - proposed);

  const tiles: { label: string; value: string; sub?: string; tone: string }[] = [
    { label: "Purchased", value: h(purchasedHours), tone: "text-foreground" },
    { label: "Remaining", value: h(hoursRemaining), tone: "text-primary" },
    { label: "Completed", value: h(completed), sub: `${s.cc} session${s.cc === 1 ? "" : "s"}`, tone: "text-green-600 dark:text-green-400" },
    { label: "Scheduled", value: h(s.scheduled), sub: `${s.sc} upcoming`, tone: "text-blue-600 dark:text-blue-400" },
    { label: "Proposed", value: h(proposed), sub: `${proposedCount} awaiting`, tone: "text-amber-600 dark:text-amber-400" },
    { label: "Not yet booked", value: h(unbooked), sub: "remaining − scheduled − proposed", tone: "text-foreground" },
    { label: "Cancelled", value: h(s.cancelled), sub: `${s.xc} session${s.xc === 1 ? "" : "s"}`, tone: "text-red-600 dark:text-red-400" },
  ];

  return (
    <div className="space-y-3 p-4 rounded-xl border border-primary/20 bg-primary/5 min-w-0">
      <p className="text-sm font-semibold flex items-center gap-1.5">
        <BarChart3 className="h-4 w-4 text-primary" />
        Hours Breakdown
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {tiles.map((t) => (
          <div key={t.label} className="min-w-0 rounded-lg border bg-background/60 p-2.5">
            <p className="text-[11px] text-muted-foreground leading-tight">{t.label}</p>
            <p className={`text-lg font-bold leading-tight mt-0.5 ${t.tone}`}>{t.value}</p>
            {t.sub && <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 break-words">{t.sub}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
