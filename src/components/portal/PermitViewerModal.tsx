import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle,
  ChevronDown,
  Download,
  ExternalLink,
  FileImage,
  FileText,
  FolderSearch,
  Loader2,
  RefreshCw,
  XCircle,
  Bug,
} from "lucide-react";
import { format } from "date-fns";
import {
  createSignedPermitUrl,
  inferMimeTypeFromFilename,
  isImageMime,
  isPdfMime,
  PERMITS_BUCKET,
} from "@/lib/permitDocuments";

interface PermitDocument {
  id: string;
  student_id: string;
  bucket: string;
  file_path: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  status: string;
  source: string;
  uploaded_by: string | null;
  created_at: string;
  uploaded_at: string;
  updated_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
}

interface ProfilePermitInfo {
  permit_file_url: string | null;
}

interface DebugInfo {
  student_id: string;
  permit_documents_count: number;
  profile_permit_file_url: string | null;
  storage_files_found: number;
  storage_files: string[];
  signed_url_errors: string[];
}

interface PermitViewerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName?: string;
  onStatusChange?: () => void;
}

export function PermitViewerModal({
  open,
  onOpenChange,
  userId,
  userName = "User",
  onStatusChange,
}: PermitViewerModalProps) {
  const { toast } = useToast();
  const [docs, setDocs] = useState<PermitDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [urlById, setUrlById] = useState<Record<string, string>>({});
  const [errById, setErrById] = useState<Record<string, string>>({});
  const [profileInfo, setProfileInfo] = useState<ProfilePermitInfo | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [fallbackError, setFallbackError] = useState<string | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [previewFallback, setPreviewFallback] = useState(false);

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const [locating, setLocating] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);

  const previewDoc = useMemo(
    () => docs.find((d) => d.id === previewDocId) || null,
    [docs, previewDocId]
  );

  useEffect(() => {
    if (!open || !userId) return;
    void fetchDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId]);

  const fetchDocs = async () => {
    setLoading(true);
    setErrById({});
    setUrlById({});
    setFallbackUrl(null);
    setFallbackError(null);
    setDebugInfo(null);

    // Fetch permit_documents
    const { data, error } = await supabase
      .from("permit_documents")
      .select("id, student_id, bucket, file_path, file_name, mime_type, size_bytes, status, source, uploaded_by, created_at, uploaded_at, updated_at, reviewed_by, reviewed_at, review_note")
      .eq("student_id", userId)
      .order("uploaded_at", { ascending: false });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const rows = (data || []) as unknown as PermitDocument[];
    setDocs(rows);

    // Fetch profile's permit_file_url as fallback
    const { data: profileData } = await supabase
      .from("profiles")
      .select("permit_file_url")
      .eq("id", userId)
      .single();

    setProfileInfo(profileData);

    // Build debug info
    const debug: DebugInfo = {
      student_id: userId,
      permit_documents_count: rows.length,
      profile_permit_file_url: profileData?.permit_file_url || null,
      storage_files_found: 0,
      storage_files: [],
      signed_url_errors: [],
    };

    // Pre-sign (quick UX)
    await Promise.all(
      rows.map(async (doc) => {
        const res = await createSignedPermitUrl({ bucket: doc.bucket, storagePath: doc.file_path, expiresInSeconds: 600 });
        if (res.ok) {
          setUrlById((m) => ({ ...m, [doc.id]: res.signedUrl }));
          if (res.bucketUsed !== doc.bucket) {
            // best-effort: persist the working bucket so future loads work
            await supabase.from("permit_documents").update({ bucket: res.bucketUsed }).eq("id", doc.id);
          }
        } else if (res.ok === false) {
          setErrById((m) => ({ ...m, [doc.id]: res.errorMessage }));
          debug.signed_url_errors.push(`${doc.file_path}: ${res.errorMessage}`);
        }
      })
    );

    // If no permit_documents but profile has permit_file_url, try to create signed URL from it
    if (rows.length === 0 && profileData?.permit_file_url) {
      const url = profileData.permit_file_url;
      // Check if it's a storage path reference we can sign
      // Format: https://xxx.supabase.co/storage/v1/object/public/permits/user-id/filename
      const match = url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/);
      if (match) {
        const [, bucket, path] = match;
        // Remove any query params from path
        const cleanPath = path.split('?')[0];
        const res = await createSignedPermitUrl({ bucket, storagePath: cleanPath, expiresInSeconds: 600 });
        if (res.ok === true) {
          setFallbackUrl(res.signedUrl);
        } else if (res.ok === false) {
          setFallbackError(res.errorMessage);
          debug.signed_url_errors.push(`fallback (${cleanPath}): ${res.errorMessage}`);
        }
      } else if (url.startsWith('http')) {
        // It's already a URL, try to use it directly
        setFallbackUrl(url);
      }
    }

    setDebugInfo(debug);
    setLoading(false);
  };

  const locatePermitInStorage = async () => {
    setLocating(true);
    const foldersToTry = [
      `${userId}/`,
      `${userId}/intake/`,
      `${userId}/permits/`,
    ];

    let foundFile: { name: string; created_at: string } | null = null;
    let foundFolder = "";

    for (const folder of foldersToTry) {
      const { data: files, error } = await supabase.storage
        .from(PERMITS_BUCKET)
        .list(folder.replace(/\/$/, ""), { limit: 100, sortBy: { column: "created_at", order: "desc" } });

      if (error) continue;
      if (files && files.length > 0) {
        // Filter out folders, get only files
        const fileItems = files.filter((f) => !f.id.includes("/") && f.name && f.metadata);
        if (fileItems.length > 0) {
          foundFile = fileItems[0];
          foundFolder = folder.replace(/\/$/, "");
          break;
        }
        // If no metadata, still pick first that looks like a file
        const anyFile = files.find((f) => f.name && f.name.includes("."));
        if (anyFile) {
          foundFile = anyFile;
          foundFolder = folder.replace(/\/$/, "");
          break;
        }
      }
    }

    if (debugInfo) {
      setDebugInfo({
        ...debugInfo,
        storage_files_found: foundFile ? 1 : 0,
        storage_files: foundFile ? [`${foundFolder}/${foundFile.name}`] : [],
      });
    }

    if (!foundFile) {
      toast({
        title: "No Permit Found",
        description: "No permit file located in storage for this user. Ask user to re-upload.",
        variant: "destructive",
      });
      setLocating(false);
      return;
    }

    const filePath = `${foundFolder}/${foundFile.name}`;
    const mimeType = inferMimeTypeFromFilename(foundFile.name);

    // Upsert into permit_documents
    const { data: authData } = await supabase.auth.getUser();
    const { error: upsertError } = await supabase
      .from("permit_documents")
      .upsert(
        {
          student_id: userId,
          bucket: PERMITS_BUCKET,
          file_path: filePath,
          file_name: foundFile.name,
          mime_type: mimeType,
          source: "storage_repair",
          status: "pending_review",
          uploaded_by: authData.user?.id || null,
        },
        { onConflict: "student_id,source", ignoreDuplicates: false }
      );

    if (upsertError) {
      // Try inserting without onConflict if the constraint doesn't exist
      const { error: insertError } = await supabase.from("permit_documents").insert({
        student_id: userId,
        bucket: PERMITS_BUCKET,
        file_path: filePath,
        file_name: foundFile.name,
        mime_type: mimeType,
        source: "storage_repair",
        status: "pending_review",
        uploaded_by: authData.user?.id || null,
      });
      if (insertError) {
        toast({ title: "Error", description: insertError.message, variant: "destructive" });
        setLocating(false);
        return;
      }
    }

    // Also update profiles.permit_file_url for consistency
    // store the stable storage path, not a signed link (those expire within the hour and left the profile pointing at nothing)
    await supabase.from("profiles").update({ permit_file_url: filePath }).eq("id", userId);

    toast({ title: "Permit Located", description: `Found and linked: ${foundFile.name}` });
    await fetchDocs();
    onStatusChange?.();
    setLocating(false);
  };

  const sourceLabel = (source: string) => {
    switch (source) {
      case "intake_form":
        return "Intake Form";
      case "message_upload":
        return "Message Upload";
      case "admin":
        return "Admin";
      case "storage_repair":
        return "Storage Repair";
      default:
        return source || "Other";
    }
  };

  const statusBadge = (status: string) => {
    if (status === "approved") return <Badge className="bg-green-500/20 text-green-600 border-green-500/30">Approved</Badge>;
    if (status === "rejected") return <Badge className="bg-red-500/20 text-red-600 border-red-500/30">Rejected</Badge>;
    return <Badge className="bg-yellow-500/20 text-yellow-600 border-yellow-500/30">Pending Review</Badge>;
  };

  const ensureSigned = async (doc: PermitDocument) => {
    if (urlById[doc.id]) return urlById[doc.id];
    const res = await createSignedPermitUrl({ bucket: doc.bucket, storagePath: doc.file_path, expiresInSeconds: 600 });
    if (res.ok === false) {
      setErrById((m) => ({ ...m, [doc.id]: res.errorMessage }));
      throw new Error(res.errorMessage);
    }
    setUrlById((m) => ({ ...m, [doc.id]: res.signedUrl }));
    return res.signedUrl;
  };

  const handleDownload = async (doc: PermitDocument) => {
    try {
      const signedUrl = await ensureSigned(doc);
      const res = await fetch(signedUrl);
      const blob = await res.blob();
      const dlUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = doc.file_name || "permit";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(dlUrl);
    } catch {
      // fallback: open new tab if download blocked (iOS)
      const signedUrl = urlById[doc.id];
      if (signedUrl) window.open(signedUrl, "_blank");
    }
  };

  const handleDownloadFallback = async () => {
    if (!fallbackUrl) return;
    try {
      const res = await fetch(fallbackUrl);
      const blob = await res.blob();
      const dlUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = "permit";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(dlUrl);
    } catch {
      window.open(fallbackUrl, "_blank");
    }
  };

  const handleUpdateStatus = async (docId: string, status: "approved" | "rejected", note?: string) => {
    setActionLoading(docId);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("permit_documents")
      .update({
        status,
        reviewed_by: auth.user?.id ?? null,
        reviewed_at: new Date().toISOString(),
        review_note: note || null,
      })
      .eq("id", docId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setActionLoading(null);
      return;
    }

    toast({ title: status === "approved" ? "Permit Approved" : "Permit Rejected" });
    await fetchDocs();
    onStatusChange?.();
    setRejectingId(null);
    setRejectNote("");
    setActionLoading(null);
  };

  const fileMeta = (doc: PermitDocument) => {
    const mime = doc.mime_type || inferMimeTypeFromFilename(doc.file_name);
    return {
      mime,
      isImage: isImageMime(mime),
      isPdf: isPdfMime(mime),
    };
  };

  const hasFallbackOnly = docs.length === 0 && (fallbackUrl || profileInfo?.permit_file_url);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] p-0">
          <DialogHeader className="p-4 pb-0 sm:p-6 sm:pb-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <DialogTitle className="text-lg sm:text-xl">Permit Documents</DialogTitle>
                <DialogDescription>Review uploaded permits for {userName}</DialogDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={fetchDocs} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </Button>
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="max-h-[calc(90vh-120px)] px-4 pb-4 sm:px-6 sm:pb-6">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : docs.length === 0 && !hasFallbackOnly ? (
              <div className="py-12 text-center space-y-4">
                <FileImage className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground font-medium">No Permit Documents in Database</p>
                <p className="text-sm text-muted-foreground">
                  The permit may exist in storage but wasn't linked properly.
                </p>
                <Button
                  variant="outline"
                  onClick={locatePermitInStorage}
                  disabled={locating}
                  className="gap-2"
                >
                  {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderSearch className="h-4 w-4" />}
                  Locate Permit in Storage
                </Button>
              </div>
            ) : (
              <div className="space-y-4 mt-4">
                {/* Fallback from profile.permit_file_url */}
                {hasFallbackOnly && fallbackUrl && (
                  <div className="border rounded-lg p-4 bg-amber-500/5 border-amber-500/20 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-14 w-14 rounded-lg border bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                          <img src={fallbackUrl} alt="Permit" className="h-full w-full object-cover" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">Permit (from profile)</p>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30">Legacy Record</Badge>
                          </div>
                        </div>
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground">
                      This permit was found in the user's profile but not in the permit_documents table.
                    </p>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => {
                          setPreviewFallback(true);
                          setPreviewOpen(true);
                        }}
                      >
                        Preview
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => window.open(fallbackUrl, "_blank")}
                      >
                        <ExternalLink className="h-4 w-4" />
                        Open
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={handleDownloadFallback}
                      >
                        <Download className="h-4 w-4" />
                        Download
                      </Button>
                      <Button
                        variant="outline"
                        onClick={locatePermitInStorage}
                        disabled={locating}
                        className="gap-2"
                        size="sm"
                      >
                        {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderSearch className="h-4 w-4" />}
                        Link to Database
                      </Button>
                    </div>
                  </div>
                )}

                {hasFallbackOnly && !fallbackUrl && fallbackError && (
                  <div className="border rounded-lg p-4 bg-destructive/5 border-destructive/20 space-y-3">
                    <p className="text-sm text-destructive">
                      Profile has permit_file_url but we couldn't load it: {fallbackError}
                    </p>
                    <Button
                      variant="outline"
                      onClick={locatePermitInStorage}
                      disabled={locating}
                      className="gap-2"
                    >
                      {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderSearch className="h-4 w-4" />}
                      Locate Permit in Storage
                    </Button>
                  </div>
                )}

                {docs.map((doc) => {
                  const { isImage, isPdf } = fileMeta(doc);
                  const signedUrl = urlById[doc.id];
                  const signErr = errById[doc.id];

                  return (
                    <div key={doc.id} className="border rounded-lg p-4 bg-card/50 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-14 w-14 rounded-lg border bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                            {isImage && signedUrl ? (
                              <img src={signedUrl} alt={doc.file_name || "Permit thumbnail"} className="h-full w-full object-cover" />
                            ) : isPdf ? (
                              <FileText className="h-6 w-6 text-muted-foreground" />
                            ) : (
                              <FileImage className="h-6 w-6 text-muted-foreground" />
                            )}
                          </div>

                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{doc.file_name || "Permit Document"}</p>
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              {statusBadge(doc.status)}
                              <Badge variant="outline" className="text-xs">{sourceLabel(doc.source)}</Badge>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>Uploaded: {format(new Date(doc.uploaded_at || doc.created_at), "MMM d, yyyy h:mm a")}</span>
                      </div>

                      {signErr && (
                        <div className="text-sm border border-destructive/30 bg-destructive/5 rounded p-2 text-destructive">
                          {signErr.includes("Bucket") ? "Permit file is not accessible (bucket/path mismatch)." : "Permit file could not be loaded."}
                          <div className="mt-2 flex gap-2">
                            <Button variant="outline" size="sm" className="gap-2" onClick={() => fetchDocs()}>
                              <RefreshCw className="h-4 w-4" /> Retry
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              onClick={locatePermitInStorage}
                              disabled={locating}
                            >
                              {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderSearch className="h-4 w-4" />}
                              Find in Storage
                            </Button>
                          </div>
                        </div>
                      )}

                      {doc.review_note && (
                        <div className="text-sm bg-muted/50 rounded p-2">
                          <span className="text-muted-foreground">Note: </span>
                          {doc.review_note}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5"
                              disabled={!signedUrl && !!signErr}
                              onClick={async () => {
                                const url = await ensureSigned(doc);
                                setPreviewDocId(doc.id);
                                setPreviewFallback(false);
                                setPreviewOpen(true);
                                setUrlById((m) => ({ ...m, [doc.id]: url }));
                              }}
                            >
                              Preview
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Preview inline</TooltipContent>
                        </Tooltip>

                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          disabled={!signedUrl && !!signErr}
                          onClick={async () => {
                            const url = await ensureSigned(doc);
                            window.open(url, "_blank");
                          }}
                        >
                          <ExternalLink className="h-4 w-4" />
                          Open
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          disabled={!signedUrl && !!signErr}
                          onClick={() => handleDownload(doc)}
                        >
                          <Download className="h-4 w-4" />
                          Download
                        </Button>

                        {(doc.status === "pending" || doc.status === "pending_review") ? (
                          <>
                            <Button
                              size="sm"
                              className="gap-1.5"
                              disabled={actionLoading === doc.id}
                              onClick={() => handleUpdateStatus(doc.id, "approved")}
                            >
                              {actionLoading === doc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                              Approve
                            </Button>

                            <Button
                              size="sm"
                              variant="destructive"
                              className="gap-1.5"
                              disabled={actionLoading === doc.id}
                              onClick={() => setRejectingId(doc.id)}
                            >
                              <XCircle className="h-4 w-4" />
                              Reject
                            </Button>
                          </>
                        ) : null}
                      </div>

                      {rejectingId === doc.id && (
                        <div className="mt-2 space-y-2">
                          <Textarea
                            placeholder="Optional reason…"
                            value={rejectNote}
                            onChange={(e) => setRejectNote(e.target.value)}
                            className="min-h-[70px]"
                          />
                          <div className="flex gap-2">
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={actionLoading === doc.id}
                              onClick={() => handleUpdateStatus(doc.id, "rejected", rejectNote)}
                            >
                              Confirm Reject
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setRejectingId(null);
                                setRejectNote("");
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Debug Panel */}
                <Collapsible open={debugOpen} onOpenChange={setDebugOpen} className="mt-6">
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                      <Bug className="h-4 w-4" />
                      Debug Info
                      <ChevronDown className={`h-4 w-4 transition-transform ${debugOpen ? "rotate-180" : ""}`} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                    <div className="border rounded-lg p-3 bg-muted/30 text-xs font-mono space-y-1">
                      <div><strong>student_id:</strong> {userId}</div>
                      <div><strong>permit_documents count:</strong> {docs.length}</div>
                      <div><strong>profile.permit_file_url:</strong> {profileInfo?.permit_file_url || "(empty)"}</div>
                      {debugInfo && (
                        <>
                          <div><strong>storage files found:</strong> {debugInfo.storage_files_found}</div>
                          {debugInfo.storage_files.length > 0 && (
                            <div><strong>files:</strong> {debugInfo.storage_files.join(", ")}</div>
                          )}
                          {debugInfo.signed_url_errors.length > 0 && (
                            <div className="text-destructive"><strong>errors:</strong> {debugInfo.signed_url_errors.join("; ")}</div>
                          )}
                        </>
                      )}
                      {Object.keys(errById).length > 0 && (
                        <div className="text-destructive">
                          <strong>signed URL errors:</strong>{" "}
                          {Object.entries(errById).map(([id, err]) => `${id.slice(0, 8)}: ${err}`).join("; ")}
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Preview */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[95vh] p-0">
          <DialogHeader className="p-4 border-b">
            <DialogTitle>Permit Preview</DialogTitle>
          </DialogHeader>
          <div className="p-4 overflow-auto max-h-[calc(95vh-80px)]">
            {previewFallback && fallbackUrl ? (
              <img src={fallbackUrl} alt="Permit" className="max-w-full mx-auto rounded-lg" />
            ) : previewDoc ? (
              (() => {
                const signedUrl = urlById[previewDoc.id];
                const mime = previewDoc.mime_type || inferMimeTypeFromFilename(previewDoc.file_name);
                if (!signedUrl) return <p className="text-sm text-muted-foreground">Loading preview…</p>;
                if (isImageMime(mime)) {
                  return <img src={signedUrl} alt={previewDoc.file_name || "Permit"} className="max-w-full mx-auto rounded-lg" />;
                }
                if (isPdfMime(mime)) {
                  return <iframe src={signedUrl} className="w-full h-[70vh] rounded-lg border" title="Permit PDF" />;
                }
                return (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Preview not available for this file type.</p>
                    <Button variant="outline" onClick={() => window.open(signedUrl, "_blank")}>Open</Button>
                  </div>
                );
              })()
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Status badge component for use in cards
export function PermitStatusBadge({
  hasPermit,
  verifiedStatus,
}: {
  hasPermit: boolean;
  verifiedStatus?: string | null;
}) {
  if (!hasPermit) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className="bg-red-500/20 text-red-600 border-red-500/30 gap-1">
            <XCircle className="h-3 w-3" />
            Permit Missing
          </Badge>
        </TooltipTrigger>
        <TooltipContent>No permit uploaded</TooltipContent>
      </Tooltip>
    );
  }

  if (verifiedStatus === "approved") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className="bg-green-500/20 text-green-600 border-green-500/30 gap-1">
            <CheckCircle className="h-3 w-3" />
            Permit Uploaded
          </Badge>
        </TooltipTrigger>
        <TooltipContent>Permit verified</TooltipContent>
      </Tooltip>
    );
  }

  if (verifiedStatus === "rejected") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className="bg-red-500/20 text-red-600 border-red-500/30 gap-1">
            <XCircle className="h-3 w-3" />
            Rejected
          </Badge>
        </TooltipTrigger>
        <TooltipContent>Permit rejected</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge className="bg-yellow-500/20 text-yellow-600 border-yellow-500/30 gap-1">
          <FileText className="h-3 w-3" />
          Pending Review
        </Badge>
      </TooltipTrigger>
      <TooltipContent>Permit uploaded, awaiting review</TooltipContent>
    </Tooltip>
  );
}
