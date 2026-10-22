import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { ProtectedRoute } from "@/components/portal/ProtectedRoute";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { 
  Loader2, 
  CheckCircle, 
  XCircle, 
  Eye, 
  Download,
  Search,
  FileImage,
  ExternalLink,
  Filter,
  RefreshCw
} from "lucide-react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { getDisplayName } from "@/lib/profileUtils";
import { createSignedPermitUrl } from "@/lib/permitDocuments";
import { normalizeDocStatus } from "@/lib/documentStatus";

interface PermitWithProfile {
  /** where the record lives: the documents table (every upload since the documents feature) or the older permits table */
  kind: 'document' | 'legacy';
  id: string;
  user_id: string;
  bucket?: string | null;
  file_path?: string | null;
  mime_type?: string | null;
  file_url: string;
  file_name: string | null;
  upload_source: string;
  uploaded_at: string;
  verified_status: string;
  admin_note: string | null;
  profile: {
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
}

export default function AdminPermitQueue() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'staff']}>
      <PortalLayout>
        <AdminPermitQueueContent />
      </PortalLayout>
    </ProtectedRoute>
  );
}

function AdminPermitQueueContent() {
  const { toast } = useToast();
  const [permits, setPermits] = useState<PermitWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIsPdf, setPreviewIsPdf] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  useEffect(() => {
    fetchPermits();
  }, [statusFilter]);

  const fetchPermits = async () => {
    setLoading(true);
    try {
      // Uploads are saved in the documents table, older ones in the permits table. The queue lists both, so an uploaded permit never goes missing from review.
      let permitsQuery = supabase.from('permits').select('*').order('uploaded_at', { ascending: false });
      if (statusFilter !== 'all') permitsQuery = permitsQuery.eq('verified_status', statusFilter);
      let docsQuery = supabase.from('permit_documents').select('id, student_id, bucket, file_path, file_name, mime_type, source, status, review_note, uploaded_at').eq('is_current', true).order('uploaded_at', { ascending: false });
      if (statusFilter === 'pending') docsQuery = docsQuery.in('status', ['pending', 'pending_review']);
      else if (statusFilter !== 'all') docsQuery = docsQuery.eq('status', statusFilter);

      const [{ data: permitsData, error: permitsError }, { data: docsData, error: docsError }] = await Promise.all([permitsQuery, docsQuery]);
      if (permitsError && docsError) throw permitsError;

      const rows: Omit<PermitWithProfile, 'profile'>[] = [
        ...((permitsData || []) as any[]).map((p) => ({ ...p, kind: 'legacy' as const })),
        ...((docsData || []) as any[]).map((d) => ({
          kind: 'document' as const, id: d.id, user_id: d.student_id, bucket: d.bucket, file_path: d.file_path, mime_type: d.mime_type,
          file_url: '', file_name: d.file_name, upload_source: d.source, uploaded_at: d.uploaded_at,
          verified_status: normalizeDocStatus(d.status), admin_note: d.review_note ?? null,
        })),
      ].sort((x, y) => new Date(y.uploaded_at).getTime() - new Date(x.uploaded_at).getTime());

      const userIds = [...new Set(rows.map(p => p.user_id))];
      if (userIds.length === 0) { setPermits([]); return; }

      const profilesData: { id: string; full_name: string | null; first_name: string | null; last_name: string | null; email: string | null }[] = [];
      for (let i = 0; i < userIds.length; i += 150) {
        const { data, error: profilesError } = await supabase.from('profiles').select('id, full_name, first_name, last_name, email').in('id', userIds.slice(i, i + 150));
        if (profilesError) throw profilesError;
        profilesData.push(...(data || []));
      }
      const profilesMap = new Map(profilesData.map(p => [p.id, p]));
      setPermits(rows.map(permit => ({ ...permit, profile: profilesMap.get(permit.user_id) || null })));
    } catch (error: any) {
      console.error('Error fetching permits:', error);
      toast({
        title: "Error",
        description: "Failed to load permits",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  /** a link that opens the file: the stored address for older permits, a fresh signed link for documents */
  const resolveUrl = async (permit: PermitWithProfile): Promise<string | null> => {
    if (permit.kind === 'legacy' && permit.file_url) return permit.file_url;
    if (permit.file_path) {
      const res = await createSignedPermitUrl({ bucket: permit.bucket, storagePath: permit.file_path, expiresInSeconds: 3600 });
      if (res.ok) return res.signedUrl;
    }
    return permit.file_url || null;
  };

  const handlePreview = async (permit: PermitWithProfile) => {
    const url = await resolveUrl(permit);
    if (!url) { toast({ title: "Could not open file", description: "The file could not be found in storage.", variant: "destructive" }); return; }
    setPreviewUrl(url);
    setPreviewIsPdf(permit.mime_type === 'application/pdf' || /\.pdf(\?|#|$)/i.test(permit.file_name || permit.file_path || permit.file_url || ''));
    setPreviewOpen(true);
  };

  const handleDownloadPermit = async (permit: PermitWithProfile) => {
    const url = await resolveUrl(permit);
    if (!url) { toast({ title: "Could not download", description: "The file could not be found in storage.", variant: "destructive" }); return; }
    await handleDownload(url, permit.file_name);
  };

  const handleVerify = async (permitId: string, status: 'approved' | 'rejected', note?: string) => {
    setActionLoading(permitId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const target = permits.find((p) => p.id === permitId);

      const { error } = target?.kind === 'document'
        ? await supabase.from('permit_documents').update({ status, reviewed_by: user?.id, reviewed_at: new Date().toISOString(), review_note: note || null }).eq('id', permitId)
        : await supabase.from('permits').update({ verified_status: status, reviewed_by: user?.id, reviewed_at: new Date().toISOString(), admin_note: note || null }).eq('id', permitId);

      if (error) throw error;

      toast({
        title: status === 'approved' ? "Permit Approved" : "Permit Rejected",
        description: `The permit has been ${status}.`,
      });

      await fetchPermits();
      setRejectingId(null);
      setRejectNote("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDownload = async (url: string, fileName: string | null) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = fileName || 'permit-file';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      window.open(url, '_blank');
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'intake':
      case 'intake_form': return 'Intake Form';
      case 'profile_upload': return 'Profile Upload';
      case 'message_upload': return 'Chat/Message';
      case 'storage_repair': return 'Recovered File';
      case 'chat': return 'Chat/Message';
      case 'admin': return 'Admin Upload';
      case 'profile': return 'Profile Update';
      default: return 'Other';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-500/20 text-green-600 border-green-500/30">Approved</Badge>;
      case 'rejected':
        return <Badge className="bg-red-500/20 text-red-600 border-red-500/30">Rejected</Badge>;
      default:
        return <Badge className="bg-yellow-500/20 text-yellow-600 border-yellow-500/30">Pending</Badge>;
    }
  };

  const filteredPermits = permits.filter(permit => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    const name = permit.profile?.full_name || 
      `${permit.profile?.first_name || ''} ${permit.profile?.last_name || ''}`.trim();
    return (
      name.toLowerCase().includes(search) ||
      permit.profile?.email?.toLowerCase().includes(search) ||
      permit.file_name?.toLowerCase().includes(search)
    );
  });

  const pendingCount = permits.filter(p => p.verified_status === 'pending').length;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold theme-heading">Permit Review Queue</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Review and verify student permit documents
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <Badge variant="secondary" className="gap-1">
              {pendingCount} pending
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={fetchPermits}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="portal-card">
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Permits Table */}
      <Card className="portal-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">
            {statusFilter === 'all' ? 'All Permits' : `${statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)} Permits`}
          </CardTitle>
          <CardDescription>
            {filteredPermits.length} permit{filteredPermits.length !== 1 ? 's' : ''} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredPermits.length === 0 ? (
            <div className="py-12 text-center">
              <FileImage className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No permits found</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead className="hidden sm:table-cell">Upload Date</TableHead>
                    <TableHead className="hidden md:table-cell">Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPermits.map((permit) => {
                    const displayName = permit.profile?.full_name || 
                      `${permit.profile?.first_name || ''} ${permit.profile?.last_name || ''}`.trim() ||
                      'Unknown';

                    return (
                      <TableRow key={`${permit.kind}-${permit.id}`}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{displayName}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {permit.profile?.email || 'No email'}
                            </p>
                            <p className="text-xs text-muted-foreground sm:hidden mt-1">
                              {format(new Date(permit.uploaded_at), 'MMM d, yyyy')}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                          {format(new Date(permit.uploaded_at), 'MMM d, yyyy h:mm a')}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Badge variant="outline" className="text-xs">
                            {getSourceLabel(permit.upload_source)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(permit.verified_status)}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handlePreview(permit)}
                              title="Preview"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDownloadPermit(permit)}
                              title="Download"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            
                            {permit.verified_status === 'pending' && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleVerify(permit.id, 'approved')}
                                  disabled={actionLoading === permit.id}
                                  className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                  title="Approve"
                                >
                                  {actionLoading === permit.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <CheckCircle className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setRejectingId(permit.id)}
                                  disabled={actionLoading === permit.id}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  title="Reject"
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[95vh] p-0">
          <DialogHeader className="p-4 border-b">
            <div className="flex items-center justify-between">
              <DialogTitle>Permit Preview</DialogTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => previewUrl && window.open(previewUrl, '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-1" />
                Open in New Tab
              </Button>
            </div>
          </DialogHeader>
          <div className="p-4 overflow-auto max-h-[calc(95vh-80px)]">
            {previewUrl && (
              !previewIsPdf ? (
                <img 
                  src={previewUrl} 
                  alt="Permit preview" 
                  className="max-w-full mx-auto rounded-lg"
                />
              ) : (
                <iframe
                  src={previewUrl}
                  className="w-full h-[70vh] rounded-lg border"
                  title="Permit preview"
                />
              )
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={!!rejectingId} onOpenChange={(open) => !open && setRejectingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Permit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Optional: reason for rejection..."
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              className="min-h-[100px]"
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setRejectingId(null);
                  setRejectNote("");
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => rejectingId && handleVerify(rejectingId, 'rejected', rejectNote)}
                disabled={actionLoading === rejectingId}
              >
                {actionLoading === rejectingId ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : null}
                Reject Permit
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}