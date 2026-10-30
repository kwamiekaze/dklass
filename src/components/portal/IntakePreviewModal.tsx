import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, X, FileText, User, MapPin, Shield, Phone, Calendar, Download } from "lucide-react";
import { format } from "date-fns";
import { Profile } from "@/types/portal";
import { findPermitForStudent } from "@/lib/permitDocuments";

interface IntakePreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile | null;
  showDownload?: boolean;
  approvedIntakeId?: string | null;
}

export function IntakePreviewModal({ 
  open, 
  onOpenChange, 
  profile,
  showDownload = false,
  approvedIntakeId = null
}: IntakePreviewModalProps) {
  const [loading, setLoading] = useState(false);
  const [permitImageUrl, setPermitImageUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const [permitIsPdf, setPermitIsPdf] = useState(false);
  const [permitLookup, setPermitLookup] = useState<'idle' | 'loading' | 'found' | 'none'>('idle');

  // find the permit wherever it was saved (documents table, profile link, older permits, storage), so an uploaded permit always shows here
  useEffect(() => {
    if (!open || !profile?.id) return;
    let cancelled = false;
    setPermitLookup('loading'); setPermitImageUrl(null); setPermitIsPdf(false);
    findPermitForStudent(profile.id, profile.permit_file_url)
      .then((found) => {
        if (cancelled) return;
        if (found) { setPermitImageUrl(found.signedUrl); setPermitIsPdf(found.isPdf); setPermitLookup('found'); }
        else setPermitLookup('none');
      })
      .catch(() => { if (!cancelled) setPermitLookup('none'); });
    return () => { cancelled = true; };
  }, [open, profile?.id, profile?.permit_file_url]);

  const handleDownloadIntake = async () => {
    if (!profile) return;
    
    setDownloading(true);
    try {
      // Create JSON snapshot of intake data
      const intakeData = {
        exportedAt: new Date().toISOString(),
        user: {
          fullName: profile.full_name || `${(profile as any).first_name || ''} ${(profile as any).last_name || ''}`.trim(),
          firstName: (profile as any).first_name,
          lastName: (profile as any).last_name,
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
          fileUrl: profile.permit_file_url,
        },
        guardian: {
          name: profile.guardian_name,
          phone: profile.guardian_phone,
          email: profile.guardian_email,
        },
        submittedAt: profile.created_at,
        approvedAt: (profile as any).approved_at,
      };

      // Download as JSON
      const blob = new Blob([JSON.stringify(intakeData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `intake-${profile.full_name?.replace(/\s+/g, '-') || profile.id}-${format(new Date(), 'yyyy-MM-dd')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  if (!profile) {
    return null;
  }

  const displayName = profile.full_name || 
    `${(profile as any).first_name || ''} ${(profile as any).last_name || ''}`.trim() || 
    'Unknown User';

  const hasIntakeData = profile.intake_submitted || profile.permit_number || profile.guardian_name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] p-0">
        <DialogHeader className="p-4 pb-0 sm:p-6 sm:pb-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg sm:text-xl">Intake Submission Preview</DialogTitle>
              <DialogDescription className="text-sm mt-1">
                Review submitted intake form
              </DialogDescription>
            </div>
            <Badge variant={(profile as any).approval_status === 'pending' ? 'secondary' : 'default'} className="capitalize">
              {(profile as any).approval_status || 'Pending'}
            </Badge>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-120px)] px-4 pb-4 sm:px-6 sm:pb-6">
          {!hasIntakeData ? (
            <div className="py-8 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No intake submission found for this user.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* User Info */}
              <div className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2 text-sm">
                  <User className="h-4 w-4" />
                  Personal Information
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Full Name</p>
                    <p className="font-medium">{displayName}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Email</p>
                    <p className="font-medium break-words">{profile.email || '-'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground text-xs">Phone</p>
                    <p className="font-medium">{profile.phone || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Addresses */}
              <div className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4" />
                  Addresses
                </h3>
                <div className="space-y-2 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Pickup Address</p>
                    <p className="font-medium">{profile.pickup_address || '-'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Drop-off Address</p>
                    <p className="font-medium">{profile.dropoff_address || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Permit Info */}
              <div className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2 text-sm">
                  <Shield className="h-4 w-4" />
                  Permit Information
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="col-span-2">
                    <p className="text-muted-foreground text-xs">Permit Number</p>
                    <p className="font-medium">{profile.permit_number || '-'}</p>
                  </div>
                  {profile.permit_issue_date && (
                    <div>
                      <p className="text-muted-foreground text-xs">Issue Date</p>
                      <p className="font-medium">{format(new Date(profile.permit_issue_date), 'MMM d, yyyy')}</p>
                    </div>
                  )}
                  {profile.permit_expiration_date && (
                    <div>
                      <p className="text-muted-foreground text-xs">Expiration Date</p>
                      <p className="font-medium">{format(new Date(profile.permit_expiration_date), 'MMM d, yyyy')}</p>
                    </div>
                  )}
                </div>

                {/* Permit document */}
                <div className="mt-3">
                  <p className="text-muted-foreground text-xs mb-2">Permit Document</p>
                  {permitLookup === 'loading' && (
                    <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />Loading document…</p>
                  )}
                  {permitLookup === 'found' && permitImageUrl && (
                    permitIsPdf ? (
                      <Button variant="outline" size="sm" onClick={() => window.open(permitImageUrl, '_blank')} className="gap-2">
                        <FileText className="h-4 w-4" />Open permit PDF
                      </Button>
                    ) : (
                      <img
                        src={permitImageUrl}
                        alt="Permit"
                        className="w-full max-w-xs rounded-lg border"
                        onError={() => setPermitLookup('none')}
                      />
                    )
                  )}
                  {permitLookup === 'none' && <p className="text-xs text-muted-foreground">No document uploaded yet.</p>}
                </div>
              </div>

              {/* Guardian Info */}
              <div className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4" />
                  Guardian/Emergency Contact
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="col-span-2">
                    <p className="text-muted-foreground text-xs">Name</p>
                    <p className="font-medium">{profile.guardian_name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Phone</p>
                    <p className="font-medium">{profile.guardian_phone || '-'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Email</p>
                    <p className="font-medium">{profile.guardian_email || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Timestamps */}
              <div className="space-y-2 pt-2 border-t text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Calendar className="h-3 w-3" />
                  <span>Submitted: {format(new Date(profile.created_at), 'MMM d, yyyy h:mm a')}</span>
                </div>
                {(profile as any).approved_at && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3 w-3" />
                    <span>Approved: {format(new Date((profile as any).approved_at), 'MMM d, yyyy h:mm a')}</span>
                  </div>
                )}
              </div>

              {/* Download Button for approved users */}
              {showDownload && (
                <Button 
                  onClick={handleDownloadIntake}
                  variant="outline"
                  className="w-full gap-2"
                  disabled={downloading}
                >
                  {downloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Download Intake
                </Button>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
