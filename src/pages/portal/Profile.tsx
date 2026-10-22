import { PortalBackground } from "@/components/portal/PortalBackground";
import { useState, useRef, useEffect } from "react";
import { usePortalAuth } from "@/hooks/usePortalAuth";
import { supabase } from "@/integrations/supabase/client";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { ProtectedRoute } from "@/components/portal/ProtectedRoute";
import { AvatarUpload } from "@/components/portal/AvatarUpload";
import { PermitPreview } from "@/components/portal/PermitPreview";
import { StudentDocumentSection } from "@/components/portal/StudentDocumentSection";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Upload, Camera, Lock } from "lucide-react";
import { z } from "zod";
import { useFormDraft, FileRestoreNotice } from "@/hooks/useFormDraft";
import { saveWithRetry } from "@/lib/saveWithRetry";
import { NotificationPreferences } from "@/components/portal/NotificationPreferences";
import { FamilyCard } from "@/components/portal/FamilyCard";

// Schema for profile editing (non-admin users)
const profileSchema = z.object({
  first_name: z.string().min(1, "First name is required").max(50),
  last_name: z.string().min(1, "Last name is required").max(50),
  phone: z.string().max(20).optional().or(z.literal('')),
  pickup_address: z.string().max(500).optional().or(z.literal('')),
  dropoff_address: z.string().max(500).optional().or(z.literal('')),
  guardian_name: z.string().max(100).optional().or(z.literal('')),
  guardian_phone: z.string().max(20).optional().or(z.literal('')),
  guardian_email: z.string().email("Invalid guardian email").max(255).optional().or(z.literal('')),
});

// Schema for admin/staff editing (includes permit fields)
const adminProfileSchema = profileSchema.extend({
  permit_number: z.string().max(50).optional().or(z.literal('')),
  permit_issue_date: z.string().optional().or(z.literal('')),
  permit_expiration_date: z.string().optional().or(z.literal('')),
});

export default function Profile() {
  return (
    <ProtectedRoute allowedRoles={['student', 'instructor', 'admin', 'staff']} requireApproval={false}>
      <PortalLayout>
        <ProfileContent />
      </PortalLayout>
    </ProtectedRoute>
  );
}

function ProfileContent() {
  const { profile, user, role, refetchProfile, isStaffOrAdmin } = usePortalAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarMediaType, setAvatarMediaType] = useState<"image" | "video">("image");
  const [avatarFraming, setAvatarFraming] = useState<{ zoom: number; x: number; y: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [permitFile, setPermitFile] = useState<File | null>(null);
  const [permitPreview, setPermitPreview] = useState<string | null>(null);
  const [fileRestoreNeeded, setFileRestoreNeeded] = useState(false);

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    pickup_address: '',
    dropoff_address: '',
    permit_number: '',
    permit_issue_date: '',
    permit_expiration_date: '',
    guardian_name: '',
    guardian_phone: '',
    guardian_email: '',
    hours_completed: '',
    rating: '',
  });

  // Form draft hook
  const { clearDraft } = useFormDraft({
    formName: 'profile',
    values: formData,
    setValue: (values) => setFormData(prev => ({ ...prev, ...values })),
    userId: user?.id,
    routePath: '/profile',
    serverTimestamp: profile?.updated_at,
    fileInfo: {
      hasFile: !!permitFile,
      fileName: permitFile?.name,
    },
    onFileRestoreNeeded: () => setFileRestoreNeeded(true),
  });

  // Initialize form data from profile
  useEffect(() => {
    if (profile) {
      setFormData({
        first_name: (profile as any)?.first_name || '',
        last_name: (profile as any)?.last_name || '',
        email: profile?.email || user?.email || '',
        phone: profile?.phone || '',
        pickup_address: profile?.pickup_address || '',
        dropoff_address: profile?.dropoff_address || '',
        permit_number: profile?.permit_number || '',
        permit_issue_date: profile?.permit_issue_date || '',
        permit_expiration_date: profile?.permit_expiration_date || '',
        guardian_name: profile?.guardian_name || '',
        guardian_phone: profile?.guardian_phone || '',
        guardian_email: profile?.guardian_email || '',
        hours_completed:
          (profile as any)?.hours_completed != null ? String((profile as any).hours_completed) : '',
        rating: (profile as any)?.rating != null ? String((profile as any).rating) : '',
      });
      setAvatarUrl((profile as any)?.avatar_url || null);
      setAvatarMediaType((profile as any)?.avatar_media_type === "video" ? "video" : "image");
      const az = (profile as any)?.avatar_zoom;
      const ax = (profile as any)?.avatar_pos_x;
      const ay = (profile as any)?.avatar_pos_y;
      setAvatarFraming(
        az != null || ax != null || ay != null
          ? { zoom: Number(az ?? 1), x: Number(ax ?? 50), y: Number(ay ?? 50) }
          : null
      );
      setPermitPreview(profile?.permit_file_url || null);
    }
  }, [profile, user]);

  const handleAvatarUpdate = (
    url: string,
    mediaType: "image" | "video" = "image",
    framing?: { zoom: number; x: number; y: number } | null
  ) => {
    setAvatarUrl(url);
    setAvatarMediaType(mediaType);
    setAvatarFraming(framing ?? null);
    refetchProfile();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Please select a file under 5MB",
          variant: "destructive",
        });
        return;
      }
      setPermitFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPermitPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Determine if user can edit permit fields
    const userCanEditPermit = isStaffOrAdmin || !profile?.intake_submitted;
    
    // Use appropriate schema based on whether permit fields are editable
    const schema = userCanEditPermit ? adminProfileSchema : profileSchema;
    const dataToValidate = userCanEditPermit ? formData : {
      first_name: formData.first_name,
      last_name: formData.last_name,
      phone: formData.phone,
      pickup_address: formData.pickup_address,
      dropoff_address: formData.dropoff_address,
      guardian_name: formData.guardian_name,
      guardian_phone: formData.guardian_phone,
      guardian_email: formData.guardian_email,
    };

    const validation = schema.safeParse(dataToValidate);
    if (!validation.success) {
      const newErrors: Record<string, string> = {};
      validation.error.errors.forEach(err => {
        if (err.path[0]) {
          newErrors[err.path[0] as string] = err.message;
        }
      });
      setErrors(newErrors);
      toast({
        title: "Validation Error",
        description: "Please fix the errors below",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      await saveWithRetry(async () => {
        let permitUrl = profile?.permit_file_url;

        // Upload permit file if selected and user can edit permit
        if (permitFile && userCanEditPermit) {
          const fileExt = permitFile.name.split('.').pop();
          const fileName = `${user.id}/${Date.now()}.${fileExt}`;
          
          const { error: uploadError } = await supabase.storage
            .from('permits')
            .upload(fileName, permitFile);

          if (uploadError) throw uploadError;

          const { data: urlData } = supabase.storage
            .from('permits')
            .getPublicUrl(fileName);
          
          permitUrl = urlData.publicUrl;
        }

        // Build update payload based on role
        const updatePayload: Record<string, any> = {
          first_name: formData.first_name,
          last_name: formData.last_name,
          full_name: `${formData.first_name} ${formData.last_name}`.trim(),
          phone: formData.phone,
        };

        // Include address and guardian fields for students
        if (role === 'student' || isStaffOrAdmin) {
          Object.assign(updatePayload, {
            pickup_address: formData.pickup_address,
            dropoff_address: formData.dropoff_address,
            guardian_name: formData.guardian_name,
            guardian_phone: formData.guardian_phone,
            guardian_email: formData.guardian_email,
          });
        }

        // Users can update permit fields if they haven't submitted intake, or admin/staff
        if (userCanEditPermit) {
          Object.assign(updatePayload, {
            permit_number: formData.permit_number,
            permit_file_url: permitUrl,
          });
          // Students never enter issue or expiration dates (the uploaded, verified document is the record), so their save must not touch them. Staff can still edit them.
          if (isStaffOrAdmin) {
            Object.assign(updatePayload, {
              permit_issue_date: formData.permit_issue_date || null,
              permit_expiration_date: formData.permit_expiration_date || null,
            });
          }
        }

        // Instructor stats — instructors can edit their own; admins any (RLS enforces)
        if (role === 'instructor' || isStaffOrAdmin) {
          const hcNum = parseFloat(formData.hours_completed);
          const rtNum = parseFloat(formData.rating);
          if (!Number.isNaN(hcNum) && hcNum >= 0) {
            updatePayload.hours_completed = hcNum;
          }
          if (!Number.isNaN(rtNum) && rtNum >= 1 && rtNum <= 5) {
            updatePayload.rating = rtNum;
          }
        }


        const { error: updateError } = await supabase
          .from('profiles')
          .update(updatePayload)
          .eq('id', user.id);

        if (updateError) throw updateError;
      }, { retries: 2, timeoutMs: 15000, context: "profile update" });

      await refetchProfile();
      clearDraft();
      
      toast({
        title: "Profile Updated",
        description: "Your profile has been saved successfully.",
      });

    } catch (error: any) {
      // saveWithRetry already shows a toast, only log here
      console.error("Profile save failed:", error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const isStudent = role === 'student';
  
  // Determine if permit fields can be edited:
  // - Admin/Staff can always edit
  // - Users can edit ONLY if intake is not submitted (no auto-gathered data)
  const hasAutoGatheredPermitData = profile?.intake_submitted && (
    profile?.permit_number ||
    profile?.permit_issue_date ||
    profile?.permit_expiration_date ||
    profile?.permit_file_url
  );
  const canEditPermit = isStaffOrAdmin || (!profile?.intake_submitted);
  const isPermitLockedAfterIntake = !isStaffOrAdmin && hasAutoGatheredPermitData;

  return (
    <>
      <PortalBackground />
      <div className="max-w-2xl mx-auto space-y-4 sm:space-y-6 relative">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold theme-heading">Your Profile</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          Keep your information up to date
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        {/* Profile Picture */}
        <Card className="portal-card">
          <CardHeader className="pb-3 sm:pb-4">
            <CardTitle className="text-base sm:text-lg">Profile Picture <span className="text-muted-foreground font-normal">(Optional)</span></CardTitle>
            <CardDescription className="text-xs sm:text-sm">Upload or take a photo for your profile</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            {user && (
              <AvatarUpload
                userId={user.id}
                currentAvatarUrl={avatarUrl}
                currentMediaType={avatarMediaType}
                currentFraming={avatarFraming}
                userName={`${formData.first_name} ${formData.last_name}`.trim()}
                onAvatarUpdate={handleAvatarUpdate}
                role={role}
              />
            )}
          </CardContent>
        </Card>

        <FamilyCard userId={user?.id} />

        {/* Personal Information */}
        <Card className="portal-card">
          <CardHeader className="pb-3 sm:pb-4">
            <CardTitle className="text-base sm:text-lg">Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name" className="text-sm">First Name *</Label>
                <Input
                  id="first_name"
                  name="first_name"
                  value={formData.first_name}
                  onChange={handleInputChange}
                  placeholder="John"
                  className="theme-input min-h-[44px]"
                  required
                />
                {errors.first_name && <p className="text-xs text-destructive">{errors.first_name}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name" className="text-sm">Last Name *</Label>
                <Input
                  id="last_name"
                  name="last_name"
                  value={formData.last_name}
                  onChange={handleInputChange}
                  placeholder="Doe"
                  className="theme-input min-h-[44px]"
                  required
                />
                {errors.last_name && <p className="text-xs text-destructive">{errors.last_name}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  className="theme-input min-h-[44px] bg-muted"
                  disabled
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-sm">Phone</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={handleInputChange}
                  placeholder="(555) 123-4567"
                  className="theme-input min-h-[44px]"
                />
                {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Instructor Stats — editable by the instructor (own profile) or admin/staff */}
        {role === 'instructor' && (
          <Card className="portal-card">
            <CardHeader className="pb-3 sm:pb-4">
              <CardTitle className="text-base sm:text-lg">Instructor Stats</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Shown to students on your instructor profile card.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="hours_completed" className="text-sm">Hours Completed</Label>
                  <Input
                    id="hours_completed"
                    name="hours_completed"
                    type="number"
                    min={0}
                    step="1"
                    value={formData.hours_completed}
                    onChange={handleInputChange}
                    placeholder="0"
                    className="theme-input min-h-[44px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rating" className="text-sm">Rating (1–5)</Label>
                  <Input
                    id="rating"
                    name="rating"
                    type="number"
                    min={1}
                    max={5}
                    step="0.1"
                    value={formData.rating}
                    onChange={handleInputChange}
                    placeholder="5"
                    className="theme-input min-h-[44px]"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Student Hours — read-only summary */}
        {isStudent && (
          <Card className="portal-card">
            <CardHeader className="pb-3 sm:pb-4">
              <CardTitle className="text-base sm:text-lg">Your Driving Hours</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Automatically accumulated as your sessions are completed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold theme-heading">
                {Number((profile as any)?.hours_completed ?? 0).toLocaleString('en-US', {
                  maximumFractionDigits: 1,
                })}
                <span className="text-sm font-normal text-muted-foreground ml-1">hours completed</span>
              </div>
            </CardContent>
          </Card>
        )}


        {/* Addresses - Students and Admin/Staff only */}
        {(isStudent || isStaffOrAdmin) && (
          <Card className="portal-card">
            <CardHeader className="pb-3 sm:pb-4">
              <CardTitle className="text-base sm:text-lg">Pickup & Drop-off Locations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pickup_address" className="text-sm">Pickup Address</Label>
                <Input
                  id="pickup_address"
                  name="pickup_address"
                  value={formData.pickup_address}
                  onChange={handleInputChange}
                  placeholder="123 Main St, City, State ZIP"
                  className="theme-input min-h-[44px]"
                />
                {errors.pickup_address && <p className="text-xs text-destructive">{errors.pickup_address}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="dropoff_address" className="text-sm">Drop-off Address</Label>
                <Input
                  id="dropoff_address"
                  name="dropoff_address"
                  value={formData.dropoff_address}
                  onChange={handleInputChange}
                  placeholder="123 Main St, City, State ZIP"
                  className="theme-input min-h-[44px]"
                />
                {errors.dropoff_address && <p className="text-xs text-destructive">{errors.dropoff_address}</p>}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Permit Information - Visible to students (read-only) and admin/staff (editable) */}
        {(isStudent || isStaffOrAdmin) && (
          <Card className="portal-card">
            <CardHeader className="pb-3 sm:pb-4">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base sm:text-lg">Permit/Driver's License Information</CardTitle>
                {isPermitLockedAfterIntake && <Lock className="h-4 w-4 text-muted-foreground" />}
              </div>
              {isPermitLockedAfterIntake && (
                <CardDescription className="text-xs sm:text-sm text-amber-600 dark:text-amber-400">
                  Locked after intake approval — contact staff to update.
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className={`grid grid-cols-1 gap-4 ${isStaffOrAdmin ? 'sm:grid-cols-3' : ''}`}>
                <div className="space-y-2">
                  <Label htmlFor="permit_number" className="text-sm">Permit Number{!isStaffOrAdmin && <span className="text-muted-foreground font-normal"> (Optional)</span>}</Label>
                  <Input
                    id="permit_number"
                    name="permit_number"
                    value={formData.permit_number}
                    onChange={handleInputChange}
                    className={`theme-input min-h-[44px] ${!canEditPermit ? 'bg-muted cursor-not-allowed' : ''}`}
                    disabled={!canEditPermit}
                  />
                  {errors.permit_number && <p className="text-xs text-destructive">{errors.permit_number}</p>}
                </div>
                {/* Issue and expiration dates are staff-only: a student's uploaded, verified document is the record */}
                {isStaffOrAdmin && (<>
                <div className="space-y-2">
                  <Label htmlFor="permit_issue_date" className="text-sm">Issue Date</Label>
                  <Input
                    id="permit_issue_date"
                    name="permit_issue_date"
                    type="date"
                    value={formData.permit_issue_date}
                    onChange={handleInputChange}
                    className={`theme-input min-h-[44px] ${!canEditPermit ? 'bg-muted cursor-not-allowed' : ''}`}
                    disabled={!canEditPermit}
                  />
                  {errors.permit_issue_date && <p className="text-xs text-destructive">{errors.permit_issue_date}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="permit_expiration_date" className="text-sm">Expiration Date</Label>
                  <Input
                    id="permit_expiration_date"
                    name="permit_expiration_date"
                    type="date"
                    value={formData.permit_expiration_date}
                    onChange={handleInputChange}
                    className={`theme-input min-h-[44px] ${!canEditPermit ? 'bg-muted cursor-not-allowed' : ''}`}
                    disabled={!canEditPermit}
                  />
                  {errors.permit_expiration_date && <p className="text-xs text-destructive">{errors.permit_expiration_date}</p>}
                </div>
                </>)}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Document Upload Section - Always available to students */}
        {(isStudent || isStaffOrAdmin) && user && (
          <StudentDocumentSection
            studentId={user.id}
            isOwnProfile={isStudent}
            isStaffOrAdmin={isStaffOrAdmin}
            onDocumentUploaded={refetchProfile}
          />
        )}

        {/* Guardian Information - Students and Admin/Staff only */}
        {(isStudent || isStaffOrAdmin) && (
          <Card className="portal-card">
            <CardHeader className="pb-3 sm:pb-4">
              <CardTitle className="text-base sm:text-lg">Parent/Guardian/Emergency Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="guardian_name" className="text-sm">Name</Label>
                  <Input
                    id="guardian_name"
                    name="guardian_name"
                    value={formData.guardian_name}
                    onChange={handleInputChange}
                    placeholder="Parent/Guardian Name"
                    className="theme-input min-h-[44px]"
                  />
                  {errors.guardian_name && <p className="text-xs text-destructive">{errors.guardian_name}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guardian_phone" className="text-sm">Phone</Label>
                  <Input
                    id="guardian_phone"
                    name="guardian_phone"
                    type="tel"
                    value={formData.guardian_phone}
                    onChange={handleInputChange}
                    placeholder="(555) 123-4567"
                    className="theme-input min-h-[44px]"
                  />
                  {errors.guardian_phone && <p className="text-xs text-destructive">{errors.guardian_phone}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guardian_email" className="text-sm">Email</Label>
                  <Input
                    id="guardian_email"
                    name="guardian_email"
                    type="email"
                    value={formData.guardian_email}
                    onChange={handleInputChange}
                    placeholder="guardian@email.com"
                    className="theme-input min-h-[44px]"
                  />
                  {errors.guardian_email && <p className="text-xs text-destructive">{errors.guardian_email}</p>}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {user?.id && (
          <NotificationPreferences userId={user.id} role={role as any} />
        )}


        {/* Submit Button */}
        <Button type="submit" className="w-full gap-2 min-h-[48px]" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Changes
            </>
          )}
        </Button>
      </form>
    </div>
    </>
  );
}
