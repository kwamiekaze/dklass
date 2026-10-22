import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Upload, Camera, FileText, Eye, Loader2, CheckCircle, Archive, Clock, Download } from "lucide-react";
import { PermitPreview } from "./PermitPreview";
import { findPermitForStudent } from "@/lib/permitDocuments";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

interface DocumentRecord {
  id: string;
  student_id: string;
  document_type: string;
  file_path: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  source: string;
  status: string;
  is_current: boolean;
  uploaded_at: string;
  uploaded_by: string | null;
  created_at: string;
}

interface StudentDocumentSectionProps {
  studentId: string;
  isOwnProfile: boolean; // student viewing their own
  isStaffOrAdmin: boolean;
  onDocumentUploaded?: () => void;
}

const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function StudentDocumentSection({ studentId, isOwnProfile, isStaffOrAdmin, onDocumentUploaded }: StudentDocumentSectionProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState<string>("permit");
  const [previewDoc, setPreviewDoc] = useState<DocumentRecord | null>(null);
  /** a permit saved before the documents list existed (profile link, older permits table, or storage only) */
  const [earlierPermit, setEarlierPermit] = useState(false);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('permit_documents')
      .select('id, student_id, document_type, file_path, file_name, mime_type, size_bytes, source, status, is_current, uploaded_at, uploaded_by, created_at')
      .eq('student_id', studentId)
      .order('uploaded_at', { ascending: false });

    if (!error && data) {
      setDocuments(data as DocumentRecord[]);
      if (data.length === 0) {
        // nothing in the documents list: look where older uploads were saved before saying there is nothing on file
        try { setEarlierPermit(!!(await findPermitForStudent(studentId, null))); } catch { setEarlierPermit(false); }
      } else setEarlierPermit(false);
    }
    setLoading(false);
  }, [studentId]);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input
    e.target.value = "";

    // Validate type
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast({ title: "Invalid file type", description: "Please upload a JPG, PNG, WEBP, or PDF file.", variant: "destructive" });
      return;
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      toast({ title: "File too large", description: "Please select a file under 10MB.", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const timestamp = Date.now();
      const filePath = `${studentId}/profile/${timestamp}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('permits')
        .upload(filePath, file, { contentType: file.type });

      if (uploadError) throw uploadError;

      // Insert document record (trigger will mark previous as not current)
      const { error: insertError } = await supabase
        .from('permit_documents')
        .insert({
          student_id: studentId,
          document_type: docType,
          file_path: filePath,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          source: 'profile_upload',
          status: 'pending_review',
          is_current: true,
          uploaded_by: studentId,
          bucket: 'permits',
        });

      if (insertError) throw insertError;

      // Also update profile permit_file_url for backward compat
      const { data: urlData } = supabase.storage.from('permits').getPublicUrl(filePath);
      await supabase.from('profiles').update({ permit_file_url: filePath }).eq('id', studentId);

      toast({ title: "Document uploaded successfully", description: `Your ${docType === 'permit' ? 'permit' : "driver's license"} has been uploaded.` });
      fetchDocuments();
      onDocumentUploaded?.();
    } catch (err: any) {
      console.error("Upload failed:", err);
      toast({ title: "Upload failed", description: err.message || "Could not upload document. Please try again.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: DocumentRecord) => {
    try {
      const { data, error } = await supabase.storage
        .from('permits')
        .createSignedUrl(doc.file_path, 300);
      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch (err: any) {
      toast({ title: "Error", description: "Could not generate download link.", variant: "destructive" });
    }
  };

  const currentDocs = documents.filter(d => d.is_current);
  const archivedDocs = documents.filter(d => !d.is_current);
  const canUpload = isOwnProfile || isStaffOrAdmin;

  return (
    <Card className="portal-card">
      <CardHeader className="pb-3 sm:pb-4">
        <CardTitle className="text-base sm:text-lg">Permit / Driver's License</CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          {isOwnProfile ? "Upload and manage your documents" : "View student documents and upload history"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Upload Section */}
        {canUpload && (
          <div className="space-y-3 p-3 rounded-lg border border-border/50 bg-muted/20">
            <div className="flex items-center gap-3">
              <div className="space-y-1 flex-1">
                <Label className="text-sm">Document Type</Label>
                <Select value={docType} onValueChange={setDocType}>
                  <SelectTrigger className="min-h-[44px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border z-50">
                    <SelectItem value="permit">Learner's Permit</SelectItem>
                    <SelectItem value="drivers_license">Driver's License</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col xs:flex-row gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={handleFileSelect}
                className="hidden"
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="gap-2 min-h-[44px] flex-1"
              >
                <Upload className="h-4 w-4" />
                Choose File
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => cameraInputRef.current?.click()}
                disabled={uploading}
                className="gap-2 min-h-[44px] flex-1"
              >
                <Camera className="h-4 w-4" />
                Take Photo
              </Button>
            </div>

            {uploading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading document...
              </div>
            )}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Current Documents */}
        {!loading && currentDocs.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Current Document{currentDocs.length > 1 ? 's' : ''} on File
            </h4>
            <div className="space-y-2">
              {currentDocs.map((doc) => (
                <DocumentRow key={doc.id} doc={doc} onView={setPreviewDoc} onDownload={handleDownload} isCurrent />
              ))}
            </div>
          </div>
        )}

        {/* No documents */}
        {!loading && documents.length === 0 && earlierPermit && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Permit on File
            </h4>
            <PermitPreview permitFileUrl={null} studentId={studentId} className="max-w-full sm:max-w-md" />
          </div>
        )}
        {!loading && documents.length === 0 && !earlierPermit && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No documents on file
          </p>
        )}

        {/* Document History */}
        {!loading && archivedDocs.length > 0 && (isStaffOrAdmin || isOwnProfile) && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-1.5 text-muted-foreground">
              <Archive className="h-4 w-4" />
              Document History ({archivedDocs.length})
            </h4>
            <div className="space-y-1.5">
              {archivedDocs.map((doc) => (
                <DocumentRow key={doc.id} doc={doc} onView={setPreviewDoc} onDownload={handleDownload} isCurrent={false} />
              ))}
            </div>
          </div>
        )}

        {/* Preview Modal */}
        {previewDoc && (
          <div className="mt-3 p-3 rounded-lg border border-border bg-muted/30">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">
                {previewDoc.document_type === 'permit' ? 'Permit' : "Driver's License"} — {format(parseISO(previewDoc.uploaded_at), 'MMM d, yyyy h:mm a')}
              </p>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPreviewDoc(null)}>Close</Button>
            </div>
            <PermitPreview permitFileUrl={previewDoc.file_path} className="max-w-full sm:max-w-md" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DocumentRow({ doc, onView, onDownload, isCurrent }: { doc: DocumentRecord; onView: (d: DocumentRecord) => void; onDownload: (d: DocumentRecord) => void; isCurrent: boolean }) {
  const typeLabel = doc.document_type === 'permit' ? 'Permit' : "Driver's License";
  const dateStr = format(parseISO(doc.uploaded_at), 'MMM d, yyyy');
  const isPdf = doc.mime_type?.includes('pdf') || doc.file_name?.toLowerCase().endsWith('.pdf');

  return (
    <div className={cn(
      "flex items-center gap-3 p-2.5 rounded-lg border transition-colors",
      isCurrent ? "border-primary/30 bg-primary/5" : "border-border/40 bg-muted/10"
    )}>
      <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center shrink-0">
        {isPdf ? <FileText className="h-4 w-4 text-muted-foreground" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{typeLabel}</span>
          {isCurrent ? (
            <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4 bg-green-600 hover:bg-green-600">Current</Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">Archived</Badge>
          )}
          {doc.status === 'approved' && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-green-500/50 text-green-600">
              <CheckCircle className="h-2.5 w-2.5 mr-0.5" />Verified
            </Badge>
          )}
          {doc.status === 'rejected' && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-red-500/50 text-red-600">Rejected</Badge>
          )}
          {doc.status !== 'approved' && doc.status !== 'rejected' && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-amber-500/50 text-amber-600">
              <Clock className="h-2.5 w-2.5 mr-0.5" />Pending
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{dateStr}{doc.file_name ? ` • ${doc.file_name}` : ''}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => onView(doc)} title="Preview">
          <Eye className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => onDownload(doc)} title="Download">
          <Download className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
