import { supabase } from "@/integrations/supabase/client";

export const PERMITS_BUCKET = "permits" as const;

const legacyBuckets = ["permits", "permit_uploads", "documents", "uploads", "intake", "user_uploads"] as const;

export type SignedUrlResult =
  | { ok: true; signedUrl: string; bucketUsed: string }
  | { ok: false; errorMessage: string };

export async function createSignedPermitUrl(options: {
  bucket?: string | null;
  storagePath: string;
  expiresInSeconds?: number;
}): Promise<SignedUrlResult> {
  const bucket = options.bucket || PERMITS_BUCKET;
  const expiresInSeconds = options.expiresInSeconds ?? 600;

  const trySign = async (b: string): Promise<SignedUrlResult> => {
    const { data, error } = await supabase.storage.from(b).createSignedUrl(options.storagePath, expiresInSeconds);
    if (error || !data?.signedUrl) {
      return { ok: false, errorMessage: error?.message || "Failed to create signed URL" };
    }
    return { ok: true, signedUrl: data.signedUrl, bucketUsed: b };
  };

  // 1) try given bucket
  const first = await trySign(bucket);
  if (first.ok) return first;

  // 2) if bucket mismatch (or anything), try canonical bucket
  if (bucket !== PERMITS_BUCKET) {
    const canonical = await trySign(PERMITS_BUCKET);
    if (canonical.ok) return canonical;
  }

  // 3) legacy buckets (best-effort)
  for (const b of legacyBuckets) {
    if (b === bucket || b === PERMITS_BUCKET) continue;
    const res = await trySign(b);
    if (res.ok) return res;
  }

  return first;
}

export function inferMimeTypeFromFilename(filename?: string | null) {
  const ext = (filename || "").toLowerCase().split(".").pop() || "";
  if (["jpg", "jpeg"].includes(ext)) return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "pdf") return "application/pdf";
  return "application/octet-stream";
}

export function isImageMime(mime?: string | null) {
  return !!mime && mime.startsWith("image/");
}

export function isPdfMime(mime?: string | null) {
  return mime === "application/pdf";
}

export function sanitizeFilename(name: string) {
  return name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 120);
}

/** Where a stored permit lives, from whatever form it was saved in: a bare path, or a storage address (public, signed or authenticated, with or without a token). */
export function parseStorageRef(value: string | null | undefined, defaultBucket: string = PERMITS_BUCKET): { bucket: string; path: string } | null {
  if (!value) return null;
  const v = value.trim();
  if (!v || v.startsWith("data:")) return null;
  const m = v.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?#]+)\/([^?#]+)/);
  if (m) { try { return { bucket: m[1]!, path: decodeURIComponent(m[2]!) }; } catch { return { bucket: m[1]!, path: m[2]! }; } }
  if (/^https?:\/\//i.test(v)) return null;           // an address of some other site
  const clean = v.replace(/^\/+/, "").split(/[?#]/)[0]!;
  try { return { bucket: defaultBucket, path: decodeURIComponent(clean) }; } catch { return { bucket: defaultBucket, path: clean }; }
}

export type FoundPermit = { signedUrl: string; isPdf: boolean; source: "profile" | "documents" | "legacy" | "storage" | "direct" };

const looksPdf = (s?: string | null) => !!s && /\.pdf(\?|#|$)/i.test(s);

/**
 * Finds a student's permit wherever it was saved, and returns a fresh link to it. The profile's own link goes stale (it is often a signed address that expires),
 * and some permits were only ever recorded in the documents table or only exist in storage, so every source is tried, newest and most likely first:
 * the profile's link, the documents table (current permit first), the older permits table, then the student's storage folders.
 */
export async function findPermitForStudent(studentId: string, profileUrl?: string | null): Promise<FoundPermit | null> {
  const sign = async (bucket: string, path: string) => {
    const r = await createSignedPermitUrl({ bucket, storagePath: path, expiresInSeconds: 3600 });
    return r.ok ? r.signedUrl : null;
  };

  // 1) the profile's link
  if (profileUrl) {
    if (profileUrl.startsWith("data:")) return { signedUrl: profileUrl, isPdf: profileUrl.includes("application/pdf"), source: "profile" };
    const ref = parseStorageRef(profileUrl);
    if (ref) { const u = await sign(ref.bucket, ref.path); if (u) return { signedUrl: u, isPdf: looksPdf(ref.path), source: "profile" }; }
  }

  // 2) the documents table
  try {
    const { data } = await supabase
      .from("permit_documents")
      .select("bucket, file_path, file_name, mime_type, document_type, is_current, uploaded_at")
      .eq("student_id", studentId)
      .order("uploaded_at", { ascending: false });
    const rows = ((data || []) as unknown as { bucket: string | null; file_path: string; file_name: string | null; mime_type: string | null; document_type?: string | null; is_current?: boolean | null }[])
      .filter((r) => r.file_path)
      .sort((a, b) => Number(b.document_type !== "drivers_license" && b.document_type !== "license") - Number(a.document_type !== "drivers_license" && a.document_type !== "license") || Number(!!b.is_current) - Number(!!a.is_current));
    for (const r of rows) {
      const ref = parseStorageRef(r.file_path, r.bucket || PERMITS_BUCKET);
      if (!ref) continue;
      const u = await sign(r.bucket || ref.bucket, ref.path) || await sign(ref.bucket, ref.path);
      if (u) return { signedUrl: u, isPdf: r.mime_type === "application/pdf" || looksPdf(r.file_name) || looksPdf(ref.path), source: "documents" };
    }
  } catch { /* try the next source */ }

  // 3) the older permits table
  try {
    const { data } = await supabase.from("permits").select("file_path, file_url, file_name").eq("user_id", studentId).order("uploaded_at", { ascending: false });
    for (const r of ((data || []) as { file_path: string | null; file_url: string | null; file_name: string | null }[])) {
      const ref = parseStorageRef(r.file_path) || parseStorageRef(r.file_url);
      if (ref) { const u = await sign(ref.bucket, ref.path); if (u) return { signedUrl: u, isPdf: looksPdf(r.file_name) || looksPdf(ref.path), source: "legacy" }; }
      else if (r.file_url && /^https?:\/\//i.test(r.file_url)) return { signedUrl: r.file_url, isPdf: looksPdf(r.file_url), source: "direct" };
    }
  } catch { /* try the next source */ }

  // 4) the student's folders in storage
  for (const folder of [studentId, `${studentId}/intake`, `${studentId}/permits`]) {
    try {
      const { data: files, error } = await supabase.storage.from(PERMITS_BUCKET).list(folder, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
      if (error || !files) continue;
      const f = files.find((x) => x.name && /\.(jpe?g|png|webp|pdf|heic)$/i.test(x.name));
      if (f) { const path = `${folder}/${f.name}`; const u = await sign(PERMITS_BUCKET, path); if (u) return { signedUrl: u, isPdf: looksPdf(f.name), source: "storage" }; }
    } catch { /* next folder */ }
  }

  // an address of some other site, as a last resort
  if (profileUrl && /^https?:\/\//i.test(profileUrl) && !parseStorageRef(profileUrl)) return { signedUrl: profileUrl, isPdf: looksPdf(profileUrl), source: "direct" };
  return null;
}
