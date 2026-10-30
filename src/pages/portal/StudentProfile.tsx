import { PortalBackground } from "@/components/portal/PortalBackground";
import { useState, useRef } from "react";
import { usePortalAuth } from "@/hooks/usePortalAuth";
import { supabase } from "@/integrations/supabase/client";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { ProtectedRoute } from "@/components/portal/ProtectedRoute";
import { AvatarUpload } from "@/components/portal/AvatarUpload";
import { PermitPreview } from "@/components/portal/PermitPreview";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Upload, Camera, FileText, CheckCircle, AlertCircle } from "lucide-react";
import { z } from "zod";

const profileSchema = z.object({
  first_name: z.string().min(1, "First name is required").max(50),
  last_name: z.string().min(1, "Last name is required").max(50),
  email: z.string().email("Invalid email"),
  phone: z.string().min(10, "Phone number is required").max(20),
  pickup_address: z.string().min(5, "Pickup address is required").max(500),
  dropoff_address: z.string().min(5, "Drop-off address is required").max(500),
  permit_number: z.string().min(3, "Permit number is required").max(50),
  guardian_name: z.string().min(2, "Guardian name is required").max(100),
  guardian_phone: z.string().min(10, "Guardian phone is required").max(20),
  guardian_email: z.string().email("Invalid guardian email").max(255).optional().or(z.literal('')),
});

export default function StudentProfile() {
  return (
    <ProtectedRoute allowedRoles={['student']} requireApproval={false}>
      <PortalLayout>
        <StudentProfileContent />
      </PortalLayout>
    </ProtectedRoute>
  );
}

function StudentProfileContent() {
  const { profile, user, refetchProfile, isIntakeSubmitted } = usePortalAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  
  const [avatarUrl, setAvatarUrl] = useState<string | null>((profile as any)?.avatar_url || null);
  const [avatarMediaType, setAvatarMediaType] = useState<"image" | "video">(
    (profile as any)?.avatar_media_type === "video" ? "video" : "image"
  );
  const [avatarFraming, setAvatarFraming] = useState<{ zoom: number; x: number; y: number } | null>(
    (profile as any)?.avatar_zoom != null ||
      (profile as any)?.avatar_pos_x != null ||
      (profile as any)?.avatar_pos_y != null
      ? {
          zoom: Number((profile as any)?.avatar_zoom ?? 1),
          x: Number((profile as any)?.avatar_pos_x ?? 50),
          y: Number((profile as any)?.avatar_pos_y ?? 50),
        }
      : null
  );
  
  const [formData, setFormData] = useState({
    first_name: (profile as any)?.first_name || '',
    last_name: (profile as any)?.last_name || '',
    email: profile?.email || user?.email || '',
    phone: profile?.phone || '',
    pickup_address: profile?.pickup_address || '',
    dropoff_address: profile?.dropoff_address || '',
    permit_number: profile?.permit_number || '',
    guardian_name: profile?.guardian_name || '',
    guardian_phone: profile?.guardian_phone || '',
    guardian_email: profile?.guardian_email || '',
  });

  const [permitFile, setPermitFile] = useState<File | null>(null);
  const [permitPreview, setPermitPreview] = useState<string | null>(profile?.permit_file_url || null);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

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
    // Clear error when user starts typing
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

    // Validate form
    const validation = profileSchema.safeParse(formData);
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
      let permitUrl = profile?.permit_file_url;

      // Upload permit file if selected
      if (permitFile) {
        const fileExt = permitFile.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('permits')
          .upload(fileName, permitFile);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('permits')
          .getPublicUrl(fileName);
        
        permitUrl = urlData.publicUrl;
      }

      // Update profile - also set full_name for backwards compatibility
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          ...formData,
          full_name: `${formData.first_name} ${formData.last_name}`.trim(),
          permit_file_url: permitUrl,
          intake_submitted: true,
        })
        .eq('id', user.id);

      if (updateError) {
        if (updateError.message.includes('unique')) {
          toast({
            title: "ID Already Taken",
            description: "This Student ID is already in use. Please choose a different one.",
            variant: "destructive",
          });
        } else {
          throw updateError;
        }
        return;
      }

      await refetchProfile();
      
      toast({
        title: "Profile Updated",
        description: isIntakeSubmitted 
          ? "Your profile has been saved successfully."
          : "Your intake form has been submitted. You'll be notified once approved.",
      });

    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update profile",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <PortalBackground />
      <div className="max-w-2xl mx-auto space-y-4 sm:space-y-6 relative">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold theme-heading">Your Profile</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          {isIntakeSubmitted 
            ? "Keep your information up to date"
            : "Complete your intake form to get started"
          }
        </p>
      </div>

      {!isIntakeSubmitted && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            Please complete all required fields and upload your permit to be approved for lessons.
          </AlertDescription>
        </Alert>
      )}

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
                role="student"
              />
            )}
          </CardContent>
        </Card>

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
                <Label htmlFor="email" className="text-sm">Email *</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="theme-input min-h-[44px]"
                  required
                />
                {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-sm">Phone *</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={handleInputChange}
                  placeholder="(555) 123-4567"
                  className="theme-input min-h-[44px]"
                  required
                />
                {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Addresses */}
        <Card className="portal-card">
          <CardHeader className="pb-3 sm:pb-4">
            <CardTitle className="text-base sm:text-lg">Pickup & Drop-off Locations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pickup_address" className="text-sm">Pickup Address *</Label>
              <Input
                id="pickup_address"
                name="pickup_address"
                value={formData.pickup_address}
                onChange={handleInputChange}
                placeholder="123 Main St, City, State ZIP"
                className="theme-input min-h-[44px]"
                required
              />
              {errors.pickup_address && <p className="text-xs text-destructive">{errors.pickup_address}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="dropoff_address" className="text-sm">Drop-off Address *</Label>
              <Input
                id="dropoff_address"
                name="dropoff_address"
                value={formData.dropoff_address}
                onChange={handleInputChange}
                placeholder="123 Main St, City, State ZIP"
                className="theme-input min-h-[44px]"
                required
              />
              {errors.dropoff_address && <p className="text-xs text-destructive">{errors.dropoff_address}</p>}
            </div>
          </CardContent>
        </Card>

        {/* Permit Information */}
        <Card className="portal-card">
          <CardHeader className="pb-3 sm:pb-4">
            <CardTitle className="text-base sm:text-lg">Permit Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label htmlFor="permit_number" className="text-sm">Permit Number *</Label>
                <Input
                  id="permit_number"
                  name="permit_number"
                  value={formData.permit_number}
                  onChange={handleInputChange}
                  className="theme-input min-h-[44px]"
                  required
                />
                {errors.permit_number && <p className="text-xs text-destructive">{errors.permit_number}</p>}
              </div>
            </div>

            {/* Permit Upload */}
            <div className="space-y-3">
              <Label className="text-sm">Permit Photo *</Label>
              <div className="flex flex-col xs:flex-row gap-2 sm:gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
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
                  className="gap-2 min-h-[44px] flex-1 xs:flex-none"
                >
                  <Upload className="h-4 w-4" />
                  Choose File
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => cameraInputRef.current?.click()}
                  className="gap-2 min-h-[44px] flex-1 xs:flex-none"
                >
                  <Camera className="h-4 w-4" />
                  Take Photo
                </Button>
              </div>
              
              {/* Preview - show newly selected file preview or existing permit */}
              {permitPreview ? (
                <div className="mt-4">
                  <p className="text-xs sm:text-sm text-muted-foreground mb-2">Preview:</p>
                  <img 
                    src={permitPreview} 
                    alt="Permit preview" 
                    className="max-w-full sm:max-w-xs rounded-lg border"
                  />
                </div>
              ) : profile?.permit_file_url ? (
                <div className="mt-4">
                  <p className="text-xs sm:text-sm text-muted-foreground mb-2">Current Permit:</p>
                  <PermitPreview 
                    permitFileUrl={profile.permit_file_url} 
                    className="max-w-full sm:max-w-xs"
                  />
                </div>
              ) : (
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Please upload a clear photo of your learner's permit
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Guardian Information */}
        <Card className="portal-card">
          <CardHeader className="pb-3 sm:pb-4">
            <CardTitle className="text-base sm:text-lg">Parent/Guardian/Emergency Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="guardian_name" className="text-sm">Full Name *</Label>
                <Input
                  id="guardian_name"
                  name="guardian_name"
                  value={formData.guardian_name}
                  onChange={handleInputChange}
                  className="theme-input min-h-[44px]"
                  required
                />
                {errors.guardian_name && <p className="text-xs text-destructive">{errors.guardian_name}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="guardian_phone" className="text-sm">Phone *</Label>
                <Input
                  id="guardian_phone"
                  name="guardian_phone"
                  type="tel"
                  value={formData.guardian_phone}
                  onChange={handleInputChange}
                  placeholder="(555) 123-4567"
                  className="theme-input min-h-[44px]"
                  required
                />
                {errors.guardian_phone && <p className="text-xs text-destructive">{errors.guardian_phone}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="guardian_email" className="text-sm">Email (Optional)</Label>
                <Input
                  id="guardian_email"
                  name="guardian_email"
                  type="email"
                  value={formData.guardian_email}
                  onChange={handleInputChange}
                  className="theme-input min-h-[44px]"
                  placeholder="Optional"
                />
                {errors.guardian_email && <p className="text-xs text-destructive">{errors.guardian_email}</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" className="w-full min-h-[48px] cta-button" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              {isIntakeSubmitted ? "Update Profile" : "Submit Intake Form"}
            </>
          )}
        </Button>
      </form>
    </div>
    </>
  );
}