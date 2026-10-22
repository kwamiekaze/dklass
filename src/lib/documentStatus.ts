import { supabase } from "@/integrations/supabase/client";

/**
 * One answer to "does this person have a permit or licence on file, and where does it stand?"
 *
 * Uploads are recorded in more than one place (the documents table, the older permits table, and a link kept on the profile), and which one is
 * filled in depends on how and by whom the file was uploaded. A badge that looked at only one of them called an uploaded document "missing".
 * Everything that shows or gates on a document should come through here so the answer is the same for students, instructors and admins.
 */
export type DocStatus = "approved" | "pending" | "rejected";
export interface DocSummary { count: number; status: DocStatus | null }

export interface DocRow { status?: string | null; is_current?: boolean | null }

/** documents table uses pending_review / approved / rejected; the older permits table uses pending / approved / rejected */
export function normalizeDocStatus(status?: string | null): DocStatus {
  const s = (status || "").toLowerCase();
  if (s === "approved" || s === "verified") return "approved";
  if (s === "rejected" || s === "declined") return "rejected";
  return "pending";
}

/** Several files on record: the current ones decide (any approved wins, then any waiting, then rejected); old replaced files only count when nothing is current. */
export function summarizeDocs(rows: DocRow[]): DocSummary {
  if (rows.length === 0) return { count: 0, status: null };
  const current = rows.filter((r) => r.is_current !== false);
  const deciding = current.length ? current : rows;
  const all = deciding.map((r) => normalizeDocStatus(r.status));
  const status: DocStatus = all.includes("approved") ? "approved" : all.includes("pending") ? "pending" : "rejected";
  return { count: rows.length, status };
}

/** a document is on file if any record exists, or the profile still carries a link to one */
export function hasDocumentOnFile(summary: DocSummary | null | undefined, profileFileUrl?: string | null): boolean {
  return (summary?.count ?? 0) > 0 || !!(profileFileUrl && profileFileUrl.trim());
}

/** the status to show: the record's own, or "pending" when only the profile link proves a file exists */
export function effectiveDocStatus(summary: DocSummary | null | undefined, profileFileUrl?: string | null): DocStatus | null {
  if (summary?.status) return summary.status;
  return profileFileUrl && profileFileUrl.trim() ? "pending" : null;
}

const CHUNK = 150;

/** Summaries for many people at once, from the documents table and the older permits table. A failed lookup returns what it has rather than throwing. */
export async function fetchDocSummaries(userIds: string[]): Promise<Map<string, DocSummary>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const rowsBy = new Map<string, DocRow[]>();
  const push = (id: string, row: DocRow) => { const a = rowsBy.get(id); if (a) a.push(row); else rowsBy.set(id, [row]); };

  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    try {
      const { data } = await supabase.from("permit_documents").select("student_id, status, is_current").in("student_id", part);
      for (const r of (data || []) as { student_id: string; status: string | null; is_current: boolean | null }[]) push(r.student_id, { status: r.status, is_current: r.is_current });
    } catch { /* keep going with the other source */ }
    try {
      const { data } = await supabase.from("permits").select("user_id, verified_status").in("user_id", part);
      for (const r of (data || []) as { user_id: string; verified_status: string | null }[]) push(r.user_id, { status: r.verified_status, is_current: true });
    } catch { /* keep going */ }
  }
  const out = new Map<string, DocSummary>();
  for (const [id, rows] of rowsBy) out.set(id, summarizeDocs(rows));
  return out;
}
