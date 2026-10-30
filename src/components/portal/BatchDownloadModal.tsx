import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Download, Calendar, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, subDays } from "date-fns";

interface BatchDownloadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BatchDownloadModal({ open, onOpenChange }: BatchDownloadModalProps) {
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState<string>("7");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);

  const handleBatchDownload = async () => {
    setLoading(true);
    try {
      // Calculate date range
      const days = parseInt(dateRange);
      const startDate = subDays(new Date(), days).toISOString();

      // Fetch approved profiles within date range
      let query = supabase
        .from('profiles')
        .select('*')
        .eq('approval_status', 'approved')
        .gte('approved_at', startDate)
        .order('approved_at', { ascending: false });

      const { data: profiles, error } = await query;

      if (error) throw error;

      if (!profiles || profiles.length === 0) {
        toast({
          title: "No Records Found",
          description: "No approved intakes found for the selected date range.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // If role filter is applied, fetch user roles and filter
      let filteredProfiles = profiles;
      if (roleFilter !== 'all') {
        const { data: roles } = await supabase
          .from('user_roles')
          .select('user_id, role')
          .in('user_id', profiles.map(p => p.id));

        if (roles) {
          const roleMap = new Map(roles.map(r => [r.user_id, r.role]));
          filteredProfiles = profiles.filter(p => roleMap.get(p.id) === roleFilter);
        }
      }

      if (filteredProfiles.length === 0) {
        toast({
          title: "No Records Found",
          description: "No approved intakes found matching the filters.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // the current permit file for each person, from the documents table, for anyone whose profile has no link of its own
      const docPathBy = new Map<string, string>();
      try {
        const ids = filteredProfiles.map(p => p.id);
        for (let i = 0; i < ids.length; i += 150) {
          const { data: docs } = await supabase.from('permit_documents').select('student_id, file_path, is_current, uploaded_at').in('student_id', ids.slice(i, i + 150)).order('uploaded_at', { ascending: false });
          const rows = ((docs || []) as { student_id: string; file_path: string; is_current: boolean }[]).sort((x, y) => Number(y.is_current) - Number(x.is_current));
          for (const d of rows) if (!docPathBy.has(d.student_id)) docPathBy.set(d.student_id, d.file_path);
        }
      } catch { /* export what we have */ }

      // Create combined export
      const exportData = {
        exportedAt: new Date().toISOString(),
        dateRange: `Last ${days} days`,
        roleFilter: roleFilter === 'all' ? 'All roles' : roleFilter,
        totalRecords: filteredProfiles.length,
        intakes: filteredProfiles.map(profile => ({
          user: {
            id: profile.id,
            fullName: profile.full_name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
            firstName: profile.first_name,
            lastName: profile.last_name,
            email: profile.email,
            phone: profile.phone,
          },
          addresses: {
            pickup: profile.pickup_address,
            dropoff: profile.dropoff_address,
          },
          permit: {
            number: profile.permit_number,
            issueDate: profile.permit_issue_date,
            expirationDate: profile.permit_expiration_date,
            fileUrl: profile.permit_file_url || docPathBy.get(profile.id) || null,
          },
          guardian: {
            name: profile.guardian_name,
            phone: profile.guardian_phone,
            email: profile.guardian_email,
          },
          approvedAt: profile.approved_at,
          submittedAt: profile.created_at,
        })),
      };

      // Download as JSON
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `approved-intakes-batch-${format(new Date(), 'yyyy-MM-dd')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Download Complete",
        description: `Downloaded ${filteredProfiles.length} intake records.`,
      });

      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Download Failed",
        description: error.message || "Failed to download intakes.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Batch Download Approved Intakes
          </DialogTitle>
          <DialogDescription>
            Download approved intake submissions for the selected date range.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4" />
              Date Range
            </Label>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="min-h-[44px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border z-50">
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last year</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4" />
              Filter by Role (Optional)
            </Label>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="min-h-[44px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border z-50">
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="student">Students Only</SelectItem>
                <SelectItem value="instructor">Instructors Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleBatchDownload} disabled={loading} className="gap-2">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Download
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
