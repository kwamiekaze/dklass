import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { ProtectedRoute } from '@/components/portal/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { 
  Users, 
  Plus, 
  ClipboardPaste, 
  Loader2, 
  Mail, 
  Phone, 
  MapPin,
  FileText,
  Calendar,
  AlertCircle,
  CheckCircle,
  Trash2,
  Search,
  ChevronDown,
  MessageSquare,
  Send,
  Eye,
  Download,
  Copy,
  MessageCircle,
  UserPlus,
  Clock,
  X,
  AlertTriangle,
  Activity,
  Filter,
  Cake,
  Image as ImageIcon,
  Paperclip
} from 'lucide-react';
import { Lead, LeadNote, LeadActivity, LeadPipelineStatus, ParsedLeadData } from '@/types/leads';
import { compareByEffectiveAddedDesc, effectiveAddedDate, effectiveAddedIsDateOnly } from '@/lib/leadDates';
import { parseLeadData, getMissingFields } from '@/lib/leadParser';
import { 
  logLeadActivity, 
  fetchLeadActivity, 
  exportLeadsToCSV, 
  copyLeadInfo, 
  convertLeadToStudent,
  PIPELINE_STATUS_OPTIONS,
  getMissingLeadFields,
  getFollowUpStatus
} from '@/lib/leadUtils';
import { format } from 'date-fns';
import { LeadScreenshotUploader } from '@/components/portal/LeadScreenshotUploader';
import { ImportedLeadsPanel } from '@/components/portal/ImportedLeadsPanel';
import { GameInviteCard } from '@/components/portal/GameInviteCard';


// Helper component for inline field warnings
function FieldHint({ value, fieldLabel }: { value: string | number | null; fieldLabel: string }) {
  if (value !== null && value !== '' && value !== 0) return null;
  return (
    <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
      <AlertCircle className="h-3 w-3" />
      Not detected — please type to continue
    </p>
  );
}

export default function AdminLeads() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <PortalLayout>
        <AdminLeadsContent />
      </PortalLayout>
    </ProtectedRoute>
  );
}

// Filter types
type FollowUpFilter = 'all' | 'due_today' | 'overdue' | 'scheduled';
type MissingInfoFilter = 'dob' | 'parent_phone' | 'address' | 'permit';

function AdminLeadsContent() {
  const { toast } = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('list');
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [permitIssueDateFrom, setPermitIssueDateFrom] = useState('');
  const [permitIssueDateTo, setPermitIssueDateTo] = useState('');
  const [followUpFilter, setFollowUpFilter] = useState<FollowUpFilter>('all');
  const [missingInfoFilters, setMissingInfoFilters] = useState<MissingInfoFilter[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  
  // Export state
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportScope, setExportScope] = useState<'filtered' | 'all'>('filtered');
  const [exportFallbackContent, setExportFallbackContent] = useState('');
  
  // Paste parser state
  const [rawText, setRawText] = useState('');
  const [parsedData, setParsedData] = useState<ParsedLeadData | null>(null);
  const [editableData, setEditableData] = useState<ParsedLeadData | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Screenshot upload state
  const [addMode, setAddMode] = useState<'paste' | 'screenshot'>('paste');
  const [screenshotData, setScreenshotData] = useState<{
    student_name: string;
    student_email: string;
    student_phone: string;
    guardian_name: string;
    guardian_email: string;
    guardian_phone: string;
    raw_ocr_text: string;
    attachment_file: File;
  } | null>(null);
  const [savingScreenshot, setSavingScreenshot] = useState(false);

  // Lead details state
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [leadNotes, setLeadNotes] = useState<LeadNote[]>([]);
  const [leadActivities, setLeadActivities] = useState<LeadActivity[]>([]);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [converting, setConverting] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    const { data } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (data) {
      setLeads(data as unknown as Lead[]);
    }
    setLoading(false);
  };

  const fetchLeadNotes = async (leadId: string) => {
    const { data } = await supabase
      .from('lead_notes')
      .select('*')
      .eq('lead_id', leadId)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });
    
    if (data) {
      const notesWithAuthors = await Promise.all(
        data.map(async (note) => {
          let authorName: string | null = null;
          if (note.author_id) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', note.author_id)
              .maybeSingle();
            authorName = profile?.full_name || null;
          }
          return {
            ...note,
            author: { full_name: authorName }
          } as LeadNote;
        })
      );
      setLeadNotes(notesWithAuthors);
    }
  };

  const handleOpenDetails = async (lead: Lead) => {
    setSelectedLead(lead);
    setDetailsOpen(true);
    setAttachmentUrl(null);
    
    // Fetch attachment URL if exists
    if (lead.attachment_path && lead.attachment_bucket) {
      const { data } = await supabase.storage
        .from(lead.attachment_bucket)
        .createSignedUrl(lead.attachment_path, 3600);
      if (data?.signedUrl) {
        setAttachmentUrl(data.signedUrl);
      }
    }
    
    await Promise.all([
      fetchLeadNotes(lead.id),
      fetchLeadActivity(lead.id).then(setLeadActivities)
    ]);
  };

  const handleSaveScreenshotLead = async () => {
    if (!screenshotData) return;
    
    setSavingScreenshot(true);
    
    try {
      const { data: userData } = await supabase.auth.getUser();
      
      // First create the lead to get an ID
      const { data: newLead, error: leadError } = await (supabase.from('leads') as any)
        .insert({
          created_by: userData?.user?.id || null,
          full_name: screenshotData.student_name || null,
          email: screenshotData.student_email || null,
          phone: screenshotData.student_phone || null,
          guardian_name: screenshotData.guardian_name || null,
          guardian_phone: screenshotData.guardian_phone || null,
          guardian_email: screenshotData.guardian_email || null,
          raw_text: screenshotData.raw_ocr_text || null,
          status: 'new',
          lead_status: 'New',
          source_type: 'screenshot',
        })
        .select()
        .single();
      
      if (leadError) throw leadError;
      
      // Upload the attachment
      const timestamp = Date.now();
      const fileName = `${timestamp}-${screenshotData.attachment_file.name}`;
      const filePath = `leads/${newLead.id}/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('lead-attachments')
        .upload(filePath, screenshotData.attachment_file);
      
      if (uploadError) {
        console.error('Upload error:', uploadError);
        // Lead created but upload failed - still continue
        toast({ 
          title: 'Lead Created', 
          description: 'Lead saved but attachment upload failed. You can try re-uploading later.',
        });
      } else {
        // Update lead with attachment path
        await (supabase.from('leads') as any)
          .update({
            attachment_path: filePath,
            attachment_bucket: 'lead-attachments',
          })
          .eq('id', newLead.id);
      }
      
      await logLeadActivity(newLead.id, 'lead_created', { 
        full_name: screenshotData.student_name,
        source: 'screenshot'
      });
      
      toast({ title: 'Lead Created', description: 'Lead from screenshot saved successfully' });
      
      // Reset state
      setScreenshotData(null);
      setAddMode('paste');
      setActiveTab('list');
      fetchLeads();
      
    } catch (error: any) {
      console.error('Error saving screenshot lead:', error);
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to save lead', 
        variant: 'destructive' 
      });
    } finally {
      setSavingScreenshot(false);
    }
  };

  const handleAddNote = async () => {
    if (!selectedLead || !newNote.trim()) return;
    
    setSavingNote(true);
    const { data: userData } = await supabase.auth.getUser();
    
    const { error } = await supabase
      .from('lead_notes')
      .insert({
        lead_id: selectedLead.id,
        author_id: userData?.user?.id,
        note: newNote.trim(),
      });
    
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Note Added' });
      setNewNote('');
      await logLeadActivity(selectedLead.id, 'note_added', { note: newNote.trim() });
      await Promise.all([
        fetchLeadNotes(selectedLead.id),
        fetchLeadActivity(selectedLead.id).then(setLeadActivities)
      ]);
    }
    setSavingNote(false);
  };

  const handleUpdateStatus = async (leadId: string, status: LeadPipelineStatus) => {
    const oldLead = leads.find(l => l.id === leadId);
    const oldStatus = oldLead?.lead_status;
    
    const { error } = await (supabase.from('leads') as any)
      .update({ lead_status: status })
      .eq('id', leadId);
    
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Status Updated' });
      await logLeadActivity(leadId, 'status_changed', { from: oldStatus, to: status });
      fetchLeads();
      if (selectedLead?.id === leadId) {
        setSelectedLead({ ...selectedLead, lead_status: status });
        fetchLeadActivity(leadId).then(setLeadActivities);
      }
    }
  };

  const handleUpdateFollowUp = async (leadId: string, followUpDate: string | null) => {
    const { error } = await (supabase.from('leads') as any)
      .update({ next_follow_up_at: followUpDate })
      .eq('id', leadId);
    
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Follow-up Updated' });
      await logLeadActivity(leadId, 'followup_set', { follow_up_at: followUpDate });
      fetchLeads();
      if (selectedLead?.id === leadId) {
        setSelectedLead({ ...selectedLead, next_follow_up_at: followUpDate });
        fetchLeadActivity(leadId).then(setLeadActivities);
      }
    }
  };

  const handleParse = () => {
    if (!rawText.trim()) {
      toast({ title: 'Error', description: 'Please paste some data first', variant: 'destructive' });
      return;
    }
    
    const parsed = parseLeadData(rawText);
    setParsedData(parsed);
    setEditableData(parsed);
    setMissingFields(getMissingFields(parsed));
  };

  const handleFieldChange = (field: keyof ParsedLeadData, value: string | number | null) => {
    if (!editableData) return;
    
    const updated = { ...editableData, [field]: value };
    setEditableData(updated);
    setMissingFields(getMissingFields(updated));
  };

  const handleSaveLead = async () => {
    if (!editableData) return;
    
    if (!editableData.full_name) {
      toast({ 
        title: 'Missing required fields', 
        description: 'Full Name is required', 
        variant: 'destructive' 
      });
      return;
    }
    
    if (!editableData.phone && !editableData.email) {
      toast({ 
        title: 'Missing required fields', 
        description: 'Phone or Email is required', 
        variant: 'destructive' 
      });
      return;
    }
    
    setSaving(true);
    
    const { data: userData } = await supabase.auth.getUser();
    
    const { data: newLead, error } = await (supabase.from('leads') as any)
      .insert({
        created_by: userData?.user?.id || null,
        full_name: editableData.full_name || null,
        email: editableData.email || null,
        phone: editableData.phone || null,
        permit_number: editableData.permit_number || null,
        permit_issue_date: editableData.permit_issue_date || null,
        permit_expiration_date: editableData.permit_expiration_date || null,
        guardian_name: editableData.guardian_name || null,
        guardian_phone: editableData.guardian_phone || null,
        guardian_email: editableData.guardian_email || null,
        home_address: editableData.home_address || null,
        pickup_locations: editableData.pickup_locations || null,
        raw_text: rawText,
        status: 'new',
        lead_status: 'New',
        dob: editableData.dob || null,
        age: editableData.age || null,
      })
      .select()
      .single();
    
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Lead Created', description: 'Lead has been saved successfully' });
      if (newLead) {
        await logLeadActivity(newLead.id, 'lead_created', { full_name: editableData.full_name });
      }
      setRawText('');
      setParsedData(null);
      setEditableData(null);
      setMissingFields([]);
      setActiveTab('list');
      fetchLeads();
    }
    
    setSaving(false);
  };

  const handleDeleteLead = async (id: string) => {
    const { error } = await supabase.from('leads').delete().eq('id', id);
    
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Deleted', description: 'Lead has been deleted' });
      fetchLeads();
      if (selectedLead?.id === id) {
        setDetailsOpen(false);
        setSelectedLead(null);
      }
    }
  };

  const handleCopyLead = (lead: Lead) => {
    const info = copyLeadInfo(lead);
    navigator.clipboard.writeText(info);
    toast({ title: 'Copied', description: 'Lead info copied to clipboard' });
  };

  const handleConvertLead = async () => {
    if (!selectedLead) return;
    
    setConverting(true);
    const result = await convertLeadToStudent(selectedLead);
    
    if (result.success) {
      toast({ 
        title: 'Lead Converted', 
        description: 'Lead has been marked as converted. Create student account manually.'
      });
      fetchLeads();
      if (selectedLead) {
        setSelectedLead({ ...selectedLead, lead_status: 'Converted' });
        fetchLeadActivity(selectedLead.id).then(setLeadActivities);
      }
    } else {
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
    }
    setConverting(false);
  };

  const handleExportCSV = async () => {
    exportLeadsToCSV(filteredLeads);
    toast({ title: 'Exported', description: `${filteredLeads.length} leads exported to CSV` });
    
    // Log activity for first lead in export (just to have a record)
    if (filteredLeads.length > 0) {
      await logLeadActivity(filteredLeads[0].id, 'export_csv', { count: filteredLeads.length });
    }
  };

  // Phone formatting helper
  const formatPhone = (phone: string): string => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    if (digits.length === 11 && digits.startsWith('1')) {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    return digits || phone;
  };

  // Get name for export
  const getExportName = (lead: Lead, useFullName: boolean): string => {
    const fullName = lead.full_name?.trim();
    if (!fullName) return 'Unknown';
    if (useFullName) return fullName;
    return fullName.split(/\s+/)[0] || 'Unknown';
  };

  // Generic export generator
  const generateExport = (type: 'email' | 'phone', useFullName: boolean): string => {
    const sourceLeads = exportScope === 'filtered' ? filteredLeads : leads;
    const seen = new Set<string>();
    const entries: string[] = [];

    for (const lead of sourceLeads) {
      if (type === 'email') {
        const email = lead.email?.trim().toLowerCase();
        if (!email || seen.has(email)) continue;
        seen.add(email);
        entries.push(`${getExportName(lead, useFullName)} : ${email}`);
      } else {
        const digits = lead.phone?.replace(/\D/g, '');
        if (!digits || seen.has(digits)) continue;
        seen.add(digits);
        entries.push(`${getExportName(lead, useFullName)} : ${formatPhone(lead.phone!)}`);
      }
    }

    return entries.join('\n');
  };

  const handleDownloadExport = (type: 'email' | 'phone', useFullName: boolean) => {
    const content = generateExport(type, useFullName);
    if (!content) {
      toast({ 
        title: `No ${type}s`, 
        description: `No leads with valid ${type}s found`, 
        variant: 'destructive' 
      });
      return;
    }

    const dateStr = format(new Date(), 'yyyy-MM-dd');
    const suffix = useFullName ? 'fullname-' : '';
    const filename = `drivingklass-leads-${suffix}${type}s-${dateStr}.txt`;

    try {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({ title: 'Downloaded', description: `${content.split('\n').length} ${type}s exported` });
    } catch {
      // Fallback for iOS Safari - show content for manual copy
      setExportFallbackContent(content);
    }
  };

  const handleCopyExportContent = () => {
    navigator.clipboard.writeText(exportFallbackContent);
    toast({ title: 'Copied', description: 'Content copied to clipboard' });
  };

  const clearFilters = () => {
    setStatusFilter('all');
    setSearchQuery('');
    setPermitIssueDateFrom('');
    setPermitIssueDateTo('');
    setFollowUpFilter('all');
    setMissingInfoFilters([]);
  };

  const hasActiveFilters = useMemo(() => {
    return statusFilter !== 'all' || 
           searchQuery || 
           permitIssueDateFrom || 
           permitIssueDateTo || 
           followUpFilter !== 'all' || 
           missingInfoFilters.length > 0;
  }, [statusFilter, searchQuery, permitIssueDateFrom, permitIssueDateTo, followUpFilter, missingInfoFilters]);

  // Filter leads
  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      // Status filter
      const matchesStatus = statusFilter === 'all' || lead.lead_status === statusFilter;
      
      // Search across all fields
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = !searchQuery || 
        lead.full_name?.toLowerCase().includes(searchLower) ||
        lead.email?.toLowerCase().includes(searchLower) ||
        lead.phone?.includes(searchQuery) ||
        lead.permit_number?.toLowerCase().includes(searchLower) ||
        lead.home_address?.toLowerCase().includes(searchLower) ||
        lead.pickup_locations?.toLowerCase().includes(searchLower) ||
        lead.guardian_name?.toLowerCase().includes(searchLower) ||
        lead.guardian_phone?.includes(searchQuery) ||
        lead.guardian_email?.toLowerCase().includes(searchLower);
      
      // Permit issue date filter
      let matchesPermitDate = true;
      if (permitIssueDateFrom || permitIssueDateTo) {
        const issueDate = lead.permit_issue_date ? new Date(lead.permit_issue_date) : null;
        if (issueDate) {
          if (permitIssueDateFrom && issueDate < new Date(permitIssueDateFrom)) {
            matchesPermitDate = false;
          }
          if (permitIssueDateTo && issueDate > new Date(permitIssueDateTo)) {
            matchesPermitDate = false;
          }
        } else {
          matchesPermitDate = false;
        }
      }
      
      // Follow-up filter
      let matchesFollowUp = true;
      if (followUpFilter !== 'all') {
        const status = getFollowUpStatus(lead.next_follow_up_at);
        matchesFollowUp = status === followUpFilter;
      }
      
      // Missing info filters
      let matchesMissingInfo = true;
      if (missingInfoFilters.length > 0) {
        const missing = getMissingLeadFields(lead);
        const missingMap: Record<MissingInfoFilter, string> = {
          dob: 'DOB',
          parent_phone: 'Parent Phone',
          address: 'Address',
          permit: 'Permit #',
        };
        matchesMissingInfo = missingInfoFilters.some(filter => 
          missing.includes(missingMap[filter])
        );
      }
      
      return matchesStatus && matchesSearch && matchesPermitDate && matchesFollowUp && matchesMissingInfo;
    }).sort(compareByEffectiveAddedDesc);
  }, [leads, statusFilter, searchQuery, permitIssueDateFrom, permitIssueDateTo, followUpFilter, missingInfoFilters]);

  const toggleMissingFilter = (filter: MissingInfoFilter) => {
    setMissingInfoFilters(prev => 
      prev.includes(filter) 
        ? prev.filter(f => f !== filter)
        : [...prev, filter]
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold theme-heading">Leads</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          Manage prospective student leads
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto grid grid-cols-4 sm:inline-flex">
          <TabsTrigger value="list" className="gap-1.5 text-sm">
            <Users className="h-4 w-4" />
            Leads List
          </TabsTrigger>
          <TabsTrigger value="imported" className="gap-1.5 text-sm">
            <Download className="h-4 w-4" />
            Student Leads
          </TabsTrigger>

          <TabsTrigger value="add" className="gap-1.5 text-sm">
            <Plus className="h-4 w-4" />
            Add Lead
          </TabsTrigger>
          <TabsTrigger value="invite" className="gap-1.5 text-sm">
            <Send className="h-4 w-4" />
            Invite
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invite" className="mt-4">
          <GameInviteCard />
        </TabsContent>

        {/* Imported leads (server-side search + pagination) */}
        <TabsContent value="imported" className="mt-4">
          <ImportedLeadsPanel />
        </TabsContent>


        {/* Leads List Tab */}
        <TabsContent value="list" className="mt-4">
          <Card className="portal-card">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                  <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/20 text-primary text-sm font-bold">
                    {filteredLeads.length}
                  </span>
                  {hasActiveFilters ? 'Filtered Results' : 'All Leads'}
                  {hasActiveFilters && (
                    <Badge variant="secondary" className="text-xs">filtered</Badge>
                  )}
                </CardTitle>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleExportCSV}
                    disabled={filteredLeads.length === 0}
                    className="gap-1.5"
                  >
                    <Download className="h-4 w-4" />
                    <span className="hidden sm:inline">CSV</span>
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setExportDialogOpen(true)}
                    className="gap-1.5"
                  >
                    <Download className="h-4 w-4" />
                    <span className="hidden sm:inline">Exports</span>
                    <span className="sm:hidden">.txt</span>
                  </Button>
                </div>
              </div>
              
              {/* Search Bar */}
              <div className="relative mt-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search name, email, phone, permit, address, parent contact..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 min-h-[44px]"
                />
              </div>

              {/* Filter Toggle */}
              <div className="flex items-center gap-2 mt-3">
                <Button
                  variant={showFilters ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setShowFilters(!showFilters)}
                  className="gap-1.5"
                >
                  <Filter className="h-4 w-4" />
                  Filters
                  {hasActiveFilters && (
                    <Badge className="h-5 w-5 p-0 flex items-center justify-center rounded-full text-xs">
                      !
                    </Badge>
                  )}
                </Button>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-muted-foreground">
                    <X className="h-4 w-4" />
                    Clear all
                  </Button>
                )}
              </div>

              {/* Filters Panel */}
              {showFilters && (
                <div className="mt-3 p-4 bg-muted/30 rounded-lg space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {/* Status Filter */}
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Status</Label>
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="min-h-[40px]">
                          <SelectValue placeholder="All Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Status</SelectItem>
                          {PIPELINE_STATUS_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Permit Issue Date From */}
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Permit Issue From</Label>
                      <Input
                        type="date"
                        value={permitIssueDateFrom}
                        onChange={(e) => setPermitIssueDateFrom(e.target.value)}
                        className="min-h-[40px]"
                      />
                    </div>

                    {/* Permit Issue Date To */}
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Permit Issue To</Label>
                      <Input
                        type="date"
                        value={permitIssueDateTo}
                        onChange={(e) => setPermitIssueDateTo(e.target.value)}
                        className="min-h-[40px]"
                      />
                    </div>

                    {/* Follow-up Filter */}
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Follow-up</Label>
                      <Select value={followUpFilter} onValueChange={(v) => setFollowUpFilter(v as FollowUpFilter)}>
                        <SelectTrigger className="min-h-[40px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="due_today">Due Today</SelectItem>
                          <SelectItem value="overdue">Overdue</SelectItem>
                          <SelectItem value="scheduled">Scheduled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Missing Info Chips */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Missing Info</Label>
                    <div className="flex flex-wrap gap-2">
                      {(['dob', 'parent_phone', 'address', 'permit'] as MissingInfoFilter[]).map(filter => (
                        <Badge
                          key={filter}
                          variant={missingInfoFilters.includes(filter) ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => toggleMissingFilter(filter)}
                        >
                          {filter === 'dob' && 'Missing DOB'}
                          {filter === 'parent_phone' && 'Missing Parent Phone'}
                          {filter === 'address' && 'Missing Address'}
                          {filter === 'permit' && 'Missing Permit #'}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {filteredLeads.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>{leads.length === 0 ? 'No leads yet' : 'No leads match your filters'}</p>
                  {leads.length === 0 && (
                    <Button 
                      variant="outline" 
                      className="mt-4"
                      onClick={() => setActiveTab('add')}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add First Lead
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredLeads.map((lead) => (
                    <LeadCard 
                      key={lead.id} 
                      lead={lead} 
                      onOpen={() => handleOpenDetails(lead)}
                      onDelete={() => handleDeleteLead(lead.id)}
                      onStatusChange={(status) => handleUpdateStatus(lead.id, status)}
                      onCopy={() => handleCopyLead(lead)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Add Lead Tab */}
        <TabsContent value="add" className="mt-4">
          {/* Mode Toggle */}
          <div className="flex gap-2 mb-4">
            <Button
              variant={addMode === 'paste' ? 'default' : 'outline'}
              onClick={() => setAddMode('paste')}
              className="gap-2"
            >
              <ClipboardPaste className="h-4 w-4" />
              Paste Text
            </Button>
            <Button
              variant={addMode === 'screenshot' ? 'default' : 'outline'}
              onClick={() => setAddMode('screenshot')}
              className="gap-2"
            >
              <ImageIcon className="h-4 w-4" />
              Upload Screenshot
            </Button>
          </div>

          {/* Screenshot Upload Mode */}
          {addMode === 'screenshot' && !screenshotData && (
            <Card className="portal-card">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ImageIcon className="h-5 w-5" />
                  OCR Screenshot Import
                </CardTitle>
                <CardDescription className="text-sm">
                  Upload a screenshot of student info. OCR will extract the data automatically.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <LeadScreenshotUploader
                  onLeadExtracted={setScreenshotData}
                  onCancel={() => setAddMode('paste')}
                />
              </CardContent>
            </Card>
          )}

          {/* Screenshot Data Preview & Save */}
          {addMode === 'screenshot' && screenshotData && (
            <Card className="portal-card">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Ready to Save
                </CardTitle>
                <CardDescription className="text-sm">
                  Review the extracted data before saving
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Student</h4>
                    <div className="space-y-2 text-sm">
                      <p><span className="text-muted-foreground">Name:</span> {screenshotData.student_name || '—'}</p>
                      <p><span className="text-muted-foreground">Email:</span> {screenshotData.student_email || '—'}</p>
                      <p><span className="text-muted-foreground">Phone:</span> {screenshotData.student_phone || '—'}</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Guardian</h4>
                    <div className="space-y-2 text-sm">
                      <p><span className="text-muted-foreground">Name:</span> {screenshotData.guardian_name || '—'}</p>
                      <p><span className="text-muted-foreground">Email:</span> {screenshotData.guardian_email || '—'}</p>
                      <p><span className="text-muted-foreground">Phone:</span> {screenshotData.guardian_phone || '—'}</p>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    Attachment: {screenshotData.attachment_file.name}
                  </span>
                </div>
                
                <div className="flex gap-2 pt-4 border-t">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setScreenshotData(null)}
                    disabled={savingScreenshot}
                  >
                    Back to Edit
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleSaveScreenshotLead}
                    disabled={savingScreenshot}
                  >
                    {savingScreenshot ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Save Lead
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Paste Mode */}
          {addMode === 'paste' && (
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Raw Paste Area */}
              <Card className="portal-card">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <ClipboardPaste className="h-5 w-5" />
                    Paste Raw Data
                  </CardTitle>
                  <CardDescription className="text-sm">
                    Paste student information and it will be automatically parsed
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    placeholder={`Paste raw data here...

Supported formats:
Name: John Doe
Email: john@example.com
Phone: (555) 123-4567
Birthday: 01/15/2008
...`}
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    className="min-h-[280px] font-mono text-sm"
                  />
                  <Button 
                    onClick={handleParse} 
                    className="w-full min-h-[44px] gap-2"
                    disabled={!rawText.trim()}
                  >
                    <FileText className="h-4 w-4" />
                    Extract Data
                  </Button>
                </CardContent>
              </Card>

              {/* Parsed Preview */}
              <Card className="portal-card">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Eye className="h-5 w-5" />
                    Preview & Edit
                  </CardTitle>
                  <CardDescription className="text-sm">
                    Review and correct extracted information
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {!editableData ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <ClipboardPaste className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>Paste data and click "Extract Data" to preview</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[500px] pr-4">
                      <div className="space-y-4">
                        {/* Missing fields warning */}
                        {missingFields.length > 0 && (
                          <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-destructive">Missing required fields:</p>
                              <p className="text-sm text-muted-foreground capitalize">
                                {missingFields.join(', ')}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Editable Fields */}
                        <div className="grid gap-4">
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor="full_name" className="text-sm flex items-center gap-1">
                                Name <span className="text-destructive">*</span>
                              </Label>
                              <Input
                                id="full_name"
                                value={editableData.full_name}
                                onChange={(e) => handleFieldChange('full_name', e.target.value)}
                                className="min-h-[44px]"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="email" className="text-sm">Email</Label>
                              <Input
                                id="email"
                                type="email"
                                value={editableData.email}
                                onChange={(e) => handleFieldChange('email', e.target.value)}
                                className="min-h-[44px]"
                              />
                            </div>
                          </div>

                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor="phone" className="text-sm flex items-center gap-1">
                                Phone <span className="text-destructive">*</span>
                              </Label>
                              <Input
                                id="phone"
                                value={editableData.phone}
                                onChange={(e) => handleFieldChange('phone', e.target.value)}
                                className="min-h-[44px]"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="permit_number" className="text-sm">Permit #</Label>
                              <Input
                                id="permit_number"
                                value={editableData.permit_number}
                                onChange={(e) => handleFieldChange('permit_number', e.target.value)}
                                className="min-h-[44px]"
                              />
                            </div>
                          </div>

                          {/* DOB & Age */}
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1">
                              <Label htmlFor="dob" className="text-sm flex items-center gap-1">
                                <Cake className="h-3 w-3" /> Date of Birth
                              </Label>
                              <Input
                                id="dob"
                                type="date"
                                value={editableData.dob}
                                onChange={(e) => {
                                  handleFieldChange('dob', e.target.value);
                                  // Recalculate age
                                  if (e.target.value) {
                                    const birthDate = new Date(e.target.value);
                                    const today = new Date();
                                    let age = today.getFullYear() - birthDate.getFullYear();
                                    const monthDiff = today.getMonth() - birthDate.getMonth();
                                    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                                      age--;
                                    }
                                    handleFieldChange('age', age >= 0 ? age : null);
                                  }
                                }}
                                className="min-h-[44px]"
                              />
                              <FieldHint value={editableData.dob} fieldLabel="Date of Birth" />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="age" className="text-sm">Age</Label>
                              <Input
                                id="age"
                                type="number"
                                value={editableData.age ?? ''}
                                onChange={(e) => handleFieldChange('age', e.target.value ? parseInt(e.target.value) : null)}
                                className="min-h-[44px]"
                                readOnly
                              />
                            </div>
                          </div>

                          {/* Permit Dates */}
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1">
                              <Label htmlFor="permit_issue_date" className="text-sm">Permit Issue Date</Label>
                              <Input
                                id="permit_issue_date"
                                type="date"
                                value={editableData.permit_issue_date}
                                onChange={(e) => handleFieldChange('permit_issue_date', e.target.value)}
                                className="min-h-[44px]"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="permit_expiration_date" className="text-sm">Permit Expiration</Label>
                              <Input
                                id="permit_expiration_date"
                                type="date"
                                value={editableData.permit_expiration_date}
                                onChange={(e) => handleFieldChange('permit_expiration_date', e.target.value)}
                                className="min-h-[44px]"
                              />
                            </div>
                          </div>

                          {/* Guardian Section */}
                          <div className="space-y-4 pt-4 border-t">
                            <h4 className="font-medium text-sm">Parent/Guardian Information</h4>
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div className="space-y-1">
                                <Label htmlFor="guardian_name" className="text-sm">Guardian Name</Label>
                                <Input
                                  id="guardian_name"
                                  value={editableData.guardian_name}
                                  onChange={(e) => handleFieldChange('guardian_name', e.target.value)}
                                  className="min-h-[44px]"
                                />
                                <FieldHint value={editableData.guardian_name} fieldLabel="Guardian Name" />
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor="guardian_phone" className="text-sm">Guardian Phone</Label>
                                <Input
                                  id="guardian_phone"
                                  value={editableData.guardian_phone}
                                  onChange={(e) => handleFieldChange('guardian_phone', e.target.value)}
                                  className="min-h-[44px]"
                                />
                                <FieldHint value={editableData.guardian_phone} fieldLabel="Guardian Phone" />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="guardian_email" className="text-sm">Guardian Email</Label>
                              <Input
                                id="guardian_email"
                                type="email"
                                value={editableData.guardian_email}
                                onChange={(e) => handleFieldChange('guardian_email', e.target.value)}
                                className="min-h-[44px]"
                              />
                              <FieldHint value={editableData.guardian_email} fieldLabel="Guardian Email" />
                            </div>
                          </div>

                          {/* Address Section */}
                          <div className="space-y-4 pt-4 border-t">
                            <h4 className="font-medium text-sm">Address Information</h4>
                            <div className="space-y-1">
                              <Label htmlFor="home_address" className="text-sm">Home Address</Label>
                              <Input
                                id="home_address"
                                value={editableData.home_address}
                                onChange={(e) => handleFieldChange('home_address', e.target.value)}
                                className="min-h-[44px]"
                              />
                              <FieldHint value={editableData.home_address} fieldLabel="Home Address" />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="pickup_locations" className="text-sm">Pick-up Locations</Label>
                              <Textarea
                                id="pickup_locations"
                                value={editableData.pickup_locations}
                                onChange={(e) => handleFieldChange('pickup_locations', e.target.value)}
                                placeholder="School, Library, etc."
                                className="min-h-[80px]"
                              />
                              <FieldHint value={editableData.pickup_locations} fieldLabel="Pickup Locations" />
                            </div>
                          </div>
                        </div>

                        {/* Save Button */}
                        <div className="flex gap-2 pt-4 border-t">
                          <Button
                            variant="outline"
                            className="flex-1 min-h-[44px]"
                            onClick={() => {
                              setParsedData(null);
                              setEditableData(null);
                              setMissingFields([]);
                            }}
                          >
                            Clear
                          </Button>
                          <Button
                            className="flex-1 min-h-[44px]"
                            onClick={handleSaveLead}
                            disabled={saving || missingFields.length > 0}
                          >
                            {saving ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Saving...
                              </>
                            ) : (
                              <>
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Save Lead
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Export Dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={(open) => {
        setExportDialogOpen(open);
        if (!open) setExportFallbackContent('');
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Export Leads
            </DialogTitle>
            <DialogDescription>
              Download lead emails or phones as .txt files
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Export Scope</Label>
              <Select 
                value={exportScope} 
                onValueChange={(v) => setExportScope(v as 'filtered' | 'all')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="filtered">
                    Filtered Results ({filteredLeads.length} leads)
                  </SelectItem>
                  <SelectItem value="all">
                    All Leads ({leads.length} leads)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-auto py-2 flex-col"
                onClick={() => handleDownloadExport('email', false)}
              >
                <Mail className="h-4 w-4" />
                <span className="text-xs">Emails (.txt)</span>
                <span className="text-[10px] text-muted-foreground">FirstName : email</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-auto py-2 flex-col"
                onClick={() => handleDownloadExport('phone', false)}
              >
                <Phone className="h-4 w-4" />
                <span className="text-xs">Phones (.txt)</span>
                <span className="text-[10px] text-muted-foreground">FirstName : phone</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-auto py-2 flex-col"
                onClick={() => handleDownloadExport('email', true)}
              >
                <Mail className="h-4 w-4" />
                <span className="text-xs">Full Name : Email</span>
                <span className="text-[10px] text-muted-foreground">FullName : email</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-auto py-2 flex-col"
                onClick={() => handleDownloadExport('phone', true)}
              >
                <Phone className="h-4 w-4" />
                <span className="text-xs">Full Name : Phone</span>
                <span className="text-[10px] text-muted-foreground">FullName : phone</span>
              </Button>
            </div>

            {exportFallbackContent && (
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  If download didn't start, copy manually:
                </Label>
                <Textarea 
                  value={exportFallbackContent} 
                  readOnly 
                  className="h-32 font-mono text-xs"
                />
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleCopyExportContent}
                  className="gap-1.5 w-full"
                >
                  <Copy className="h-4 w-4" />
                  Copy to Clipboard
                </Button>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lead Details Sheet */}
      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedLead && (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle className="text-xl">{selectedLead.full_name || 'Unknown Lead'}</SheetTitle>
                <SheetDescription>
                  Added {format(effectiveAddedDate(selectedLead), effectiveAddedIsDateOnly(selectedLead) ? 'MMM d, yyyy' : 'MMM d, yyyy h:mm a')}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-6">
                {/* Quick Actions */}
                <div className="grid grid-cols-4 gap-2">
                  {selectedLead.phone && (
                    <Button variant="outline" size="sm" className="flex-col h-16 gap-1" asChild>
                      <a href={`tel:${selectedLead.phone}`}>
                        <Phone className="h-4 w-4" />
                        <span className="text-xs">Call</span>
                      </a>
                    </Button>
                  )}
                  {selectedLead.phone && (
                    <Button variant="outline" size="sm" className="flex-col h-16 gap-1" asChild>
                      <a href={`sms:${selectedLead.phone}?body=Hi ${selectedLead.full_name?.split(' ')[0] || ''}, this is DrivingKlass.`}>
                        <MessageCircle className="h-4 w-4" />
                        <span className="text-xs">Text</span>
                      </a>
                    </Button>
                  )}
                  {selectedLead.email && (
                    <Button variant="outline" size="sm" className="flex-col h-16 gap-1" asChild>
                      <a href={`mailto:${selectedLead.email}`}>
                        <Mail className="h-4 w-4" />
                        <span className="text-xs">Email</span>
                      </a>
                    </Button>
                  )}
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-col h-16 gap-1"
                    onClick={() => handleCopyLead(selectedLead)}
                  >
                    <Copy className="h-4 w-4" />
                    <span className="text-xs">Copy</span>
                  </Button>
                </div>

                {/* Missing Data Badges */}
                {getMissingLeadFields(selectedLead).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {getMissingLeadFields(selectedLead).map(field => (
                      <Badge key={field} variant="outline" className="text-xs text-amber-600 border-amber-300 gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Missing {field}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Status & Follow-up */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Status</Label>
                    <Select 
                      value={selectedLead.lead_status || 'New'} 
                      onValueChange={(value) => handleUpdateStatus(selectedLead.id, value as LeadPipelineStatus)}
                    >
                      <SelectTrigger className="min-h-[44px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PIPELINE_STATUS_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Next Follow-up
                    </Label>
                    <Input
                      type="datetime-local"
                      value={selectedLead.next_follow_up_at ? format(new Date(selectedLead.next_follow_up_at), "yyyy-MM-dd'T'HH:mm") : ''}
                      onChange={(e) => handleUpdateFollowUp(selectedLead.id, e.target.value || null)}
                      className="min-h-[44px]"
                    />
                  </div>
                </div>

                {/* DOB & Age */}
                {(selectedLead.dob || selectedLead.age) && (
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm flex items-center gap-2">
                      <Cake className="h-4 w-4" />
                      Date of Birth
                    </h4>
                    <p className="text-sm">
                      {selectedLead.dob ? format(new Date(selectedLead.dob), 'MMMM d, yyyy') : 'N/A'} 
                      {selectedLead.age && ` (${selectedLead.age} years old)`}
                    </p>
                  </div>
                )}

                {/* Contact Info */}
                <div className="space-y-3">
                  <h4 className="font-medium text-sm">Contact Information</h4>
                  <div className="space-y-2 text-sm">
                    {selectedLead.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <a href={`mailto:${selectedLead.email}`} className="text-primary hover:underline">
                          {selectedLead.email}
                        </a>
                      </div>
                    )}
                    {selectedLead.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <a href={`tel:${selectedLead.phone}`} className="text-primary hover:underline">
                          {selectedLead.phone}
                        </a>
                      </div>
                    )}
                    {selectedLead.home_address && (
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <span>{selectedLead.home_address}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Attachment Section */}
                {(selectedLead.attachment_path || selectedLead.source_type === 'screenshot') && (
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm flex items-center gap-2">
                      <Paperclip className="h-4 w-4" />
                      Attachment
                    </h4>
                    {attachmentUrl ? (
                      <div className="space-y-2">
                        <img 
                          src={attachmentUrl} 
                          alt="Lead screenshot" 
                          className="w-full rounded-lg border max-h-[300px] object-contain bg-muted"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full gap-2"
                          asChild
                        >
                          <a href={attachmentUrl} download target="_blank" rel="noopener noreferrer">
                            <Download className="h-4 w-4" />
                            Download Attachment
                          </a>
                        </Button>
                      </div>
                    ) : selectedLead.attachment_path ? (
                      <p className="text-sm text-muted-foreground">Loading attachment...</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">No attachment available</p>
                    )}
                    {selectedLead.source_type && (
                      <Badge variant="secondary" className="text-xs">
                        Source: {selectedLead.source_type}
                      </Badge>
                    )}
                  </div>
                )}
                {(selectedLead.permit_number || selectedLead.permit_issue_date || selectedLead.permit_expiration_date) && (
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm">Permit Information</h4>
                    <div className="space-y-2 text-sm">
                      {selectedLead.permit_number && (
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span>Permit #: {selectedLead.permit_number}</span>
                        </div>
                      )}
                      {selectedLead.permit_issue_date && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>Issued: {format(new Date(selectedLead.permit_issue_date), 'MMM d, yyyy')}</span>
                        </div>
                      )}
                      {selectedLead.permit_expiration_date && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>Expires: {format(new Date(selectedLead.permit_expiration_date), 'MMM d, yyyy')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Guardian Info */}
                {(selectedLead.guardian_name || selectedLead.guardian_phone || selectedLead.guardian_email) && (
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm">Parent/Guardian</h4>
                    <div className="space-y-2 text-sm">
                      {selectedLead.guardian_name && <p>{selectedLead.guardian_name}</p>}
                      {selectedLead.guardian_phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <a href={`tel:${selectedLead.guardian_phone}`} className="text-primary hover:underline">
                            {selectedLead.guardian_phone}
                          </a>
                        </div>
                      )}
                      {selectedLead.guardian_email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <a href={`mailto:${selectedLead.guardian_email}`} className="text-primary hover:underline">
                            {selectedLead.guardian_email}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Pickup Locations */}
                {selectedLead.pickup_locations && (
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm">Pick-up Locations</h4>
                    <p className="text-sm whitespace-pre-line">{selectedLead.pickup_locations}</p>
                  </div>
                )}

                {/* Notes Section */}
                <div className="space-y-3">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Notes
                  </h4>
                  
                  {/* Add Note */}
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Add a note..."
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      className="min-h-[60px] flex-1"
                    />
                    <Button
                      size="icon"
                      onClick={handleAddNote}
                      disabled={savingNote || !newNote.trim()}
                      className="h-[60px] w-10 shrink-0"
                    >
                      {savingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>

                  {/* Notes List */}
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {leadNotes.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">No notes yet</p>
                    ) : (
                      leadNotes.map(note => (
                        <div key={note.id} className="p-3 bg-muted/50 rounded-lg text-sm">
                          <p className="whitespace-pre-line">{note.note}</p>
                          <p className="text-xs text-muted-foreground mt-2">
                            {note.author?.full_name || 'Unknown'} • {format(new Date(note.created_at), 'MMM d, h:mm a')}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Activity Log */}
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:text-primary w-full">
                    <ChevronDown className="h-4 w-4" />
                    <Activity className="h-4 w-4" />
                    Activity Log ({leadActivities.length})
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {leadActivities.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">No activity yet</p>
                      ) : (
                        leadActivities.map(activity => (
                          <div key={activity.id} className="p-2 bg-muted/30 rounded text-xs">
                            <div className="flex justify-between">
                              <span className="font-medium capitalize">{activity.action.replace(/_/g, ' ')}</span>
                              <span className="text-muted-foreground">
                                {format(new Date(activity.created_at), 'MMM d, h:mm a')}
                              </span>
                            </div>
                            {activity.actor?.full_name && (
                              <p className="text-muted-foreground">by {activity.actor.full_name}</p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Raw Text Collapsible */}
                {selectedLead.raw_text && (
                  <Collapsible>
                    <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:text-primary w-full">
                      <ChevronDown className="h-4 w-4" />
                      View Raw Data
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2">
                      <pre className="p-3 bg-muted/50 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap">
                        {selectedLead.raw_text}
                      </pre>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* Convert to Student */}
                {selectedLead.lead_status !== 'Converted' && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button className="w-full min-h-[44px] gap-2">
                        <UserPlus className="h-4 w-4" />
                        Convert to Student Profile
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Convert Lead to Student?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will mark the lead as "Converted". You'll need to manually create the student account to complete the conversion. The lead data won't be deleted.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConvertLead} disabled={converting}>
                          {converting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                          Convert Lead
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}

                {/* Delete Button */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      className="w-full min-h-[44px]"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Lead
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Lead?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the lead and all associated notes.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={() => handleDeleteLead(selectedLead.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

interface LeadCardProps {
  lead: Lead;
  onOpen: () => void;
  onDelete: () => void;
  onStatusChange: (status: LeadPipelineStatus) => void;
  onCopy: () => void;
}

function LeadCard({ lead, onOpen, onDelete, onStatusChange, onCopy }: LeadCardProps) {
  const statusConfig = PIPELINE_STATUS_OPTIONS.find(s => s.value === lead.lead_status) || PIPELINE_STATUS_OPTIONS[0];
  const missingFields = getMissingLeadFields(lead);
  const followUpStatus = getFollowUpStatus(lead.next_follow_up_at);

  return (
    <div className="flex flex-col gap-3 p-4 border rounded-xl bg-background/50 hover:bg-muted/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm sm:text-base truncate">
            {lead.full_name || 'Unknown'}
          </p>
          <div className="flex flex-wrap gap-2 mt-1">
            {lead.email && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Mail className="h-3 w-3" />
                <span className="truncate max-w-[150px]">{lead.email}</span>
              </span>
            )}
            {lead.phone && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Phone className="h-3 w-3" />
                {lead.phone}
              </span>
            )}
            {lead.age && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Cake className="h-3 w-3" />
                {lead.age} yrs
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Select value={lead.lead_status || 'New'} onValueChange={(val) => onStatusChange(val as LeadPipelineStatus)}>
            <SelectTrigger className={`h-7 text-xs border px-2 ${statusConfig.color}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PIPELINE_STATUS_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {lead.attachment_path && (
          <Badge variant="secondary" className="text-xs gap-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
            <Paperclip className="h-3 w-3" />
            Attachment
          </Badge>
        )}
        {lead.source_type === 'screenshot' && !lead.attachment_path && (
          <Badge variant="outline" className="text-xs gap-1">
            <ImageIcon className="h-3 w-3" />
            OCR
          </Badge>
        )}
        {lead.permit_number && (
          <Badge variant="secondary" className="text-xs gap-1">
            <FileText className="h-3 w-3" />
            {lead.permit_number}
          </Badge>
        )}
        {lead.permit_expiration_date && (
          <Badge variant="outline" className="text-xs gap-1">
            <Calendar className="h-3 w-3" />
            Exp: {format(new Date(lead.permit_expiration_date), 'MM/dd/yyyy')}
          </Badge>
        )}
        {followUpStatus === 'overdue' && (
          <Badge variant="destructive" className="text-xs gap-1">
            <Clock className="h-3 w-3" />
            Overdue
          </Badge>
        )}
        {followUpStatus === 'due_today' && (
          <Badge className="text-xs gap-1 bg-amber-500">
            <Clock className="h-3 w-3" />
            Due Today
          </Badge>
        )}
        {missingFields.length > 0 && (
          <Badge variant="outline" className="text-xs gap-1 text-amber-600 border-amber-300">
            <AlertTriangle className="h-3 w-3" />
            {missingFields.length} missing
          </Badge>
        )}
      </div>

      {(lead.home_address || lead.pickup_locations) && (
        <div className="text-xs text-muted-foreground flex items-start gap-1">
          <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
          <span className="line-clamp-1">
            {lead.home_address || lead.pickup_locations}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-2 border-t">
        <span className="text-xs text-muted-foreground">
          Added {format(effectiveAddedDate(lead), 'MMM d, yyyy')}
        </span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onCopy}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-3 text-xs"
            onClick={onOpen}
          >
            <Eye className="h-3 w-3 mr-1" />
            Open
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Lead?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete {lead.full_name || 'this lead'}.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={onDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
