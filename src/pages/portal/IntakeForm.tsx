import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { usePortalAuth } from "@/hooks/usePortalAuth";
import { supabase } from "@/integrations/supabase/client";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { ProtectedRoute } from "@/components/portal/ProtectedRoute";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, Camera, ArrowLeft, ArrowRight, Check, CheckCircle2, FileText } from "lucide-react";
import { Link } from "react-router-dom";

// ------- 5-step intake. Only the requested fields. -------
type IntakeData = {
  full_name: string;
  phone: string;
  pickup_address: string;
  dropoff_address: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
};

const EMPTY: IntakeData = {
  full_name: "",
  phone: "",
  pickup_address: "",
  dropoff_address: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
};

const STEPS = [
  { n: 1, title: "Full Name" },
  { n: 2, title: "Phone Number" },
  { n: 3, title: "Permit Photo" },
  { n: 4, title: "Pickup & Drop-off" },
  { n: 5, title: "Emergency Contact" },
];

export default function IntakeForm() {
  return (
    <ProtectedRoute allowedRoles={["student"]} requireApproval={false}>
      <PortalLayout>
        <IntakeFormContent />
      </PortalLayout>
    </ProtectedRoute>
  );
}

export function AdminIntakeEdit() {
  return (
    <ProtectedRoute allowedRoles={["admin", "staff"]}>
      <PortalLayout>
        <IntakeFormContent isAdminEdit />
      </PortalLayout>
    </ProtectedRoute>
  );
}

function IntakeFormContent({ isAdminEdit = false }: { isAdminEdit?: boolean }) {
  const { profile, user, isIntakeSubmitted, isApproved, refetchProfile, role } = usePortalAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const editUserId = searchParams.get("userId");
  const isEditMode = isAdminEdit ? !!editUserId : isIntakeSubmitted;
  const targetUserId = isAdminEdit ? editUserId : user?.id;

  const [step, setStep] = useState(1);
  const [data, setData] = useState<IntakeData>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [permitFile, setPermitFile] = useState<File | null>(null);
  const [permitPreview, setPermitPreview] = useState<string | null>(null);
  const [existingPermitPath, setExistingPermitPath] = useState<string | null>(null);
  const [existingPermitName, setExistingPermitName] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  // ---- Hydrate from profile + server draft on mount ----
  useEffect(() => {
    if (!targetUserId) return;
    (async () => {
      // 1) profile for prefill / edit
      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", targetUserId)
        .single();

      const initial: IntakeData = {
        full_name:
          (prof as any)?.full_name ||
          `${(prof as any)?.first_name || ""} ${(prof as any)?.last_name || ""}`.trim(),
        phone: prof?.phone || "",
        pickup_address: prof?.pickup_address || "",
        dropoff_address: prof?.dropoff_address || "",
        emergency_contact_name: prof?.guardian_name || "",
        emergency_contact_phone: prof?.guardian_phone || "",
      };

      // 2) Try server-side draft (only for student's own intake, not admin edit, not already submitted)
      let resumeStep = 1;
      let merged = initial;
      if (!isAdminEdit && !isEditMode && user?.id) {
        const { data: draft } = await supabase
          .from("intake_drafts" as any)
          .select("data, current_step, permit_file_path, permit_file_name")
          .eq("user_id", user.id)
          .maybeSingle();
        if (draft) {
          merged = { ...initial, ...((draft as any).data as Partial<IntakeData>) };
          resumeStep = (draft as any).current_step || 1;
          if ((draft as any).permit_file_path) {
            setExistingPermitPath((draft as any).permit_file_path);
            setExistingPermitName((draft as any).permit_file_name);
          }
        }
      }

      // 3) Existing permit on the profile (edit mode)
      if (isEditMode || isAdminEdit) {
        const { data: pd } = await supabase
          .from("permit_documents")
          .select("file_path, file_name")
          .eq("student_id", targetUserId)
          .eq("is_current", true)
          .maybeSingle();
        if (pd) {
          setExistingPermitPath(pd.file_path);
          setExistingPermitName(pd.file_name);
        }
      }

      setData(merged);
      setStep(Math.min(Math.max(resumeStep, 1), 5));
      setHydrated(true);
    })();
  }, [targetUserId, user?.id, isAdminEdit, isEditMode]);

  // ---- Redirect guards (students) ----
  useEffect(() => {
    if (!hydrated) return;
    if (!isAdminEdit && isApproved && !isEditMode) {
      navigate("/profile", { replace: true });
    } else if (
      !isAdminEdit &&
      isIntakeSubmitted &&
      !isEditMode &&
      !searchParams.get("edit")
    ) {
      navigate("/pending-approval", { replace: true });
    }
  }, [hydrated, isAdminEdit, isApproved, isIntakeSubmitted, isEditMode, navigate, searchParams]);

  // ---- Autosave draft (debounced) on data/step change ----
  useEffect(() => {
    if (!hydrated || isAdminEdit || isEditMode || !user?.id) return;
    const t = setTimeout(async () => {
      setSavingDraft(true);
      try {
        await supabase.from("intake_drafts" as any).upsert(
          {
            user_id: user.id,
            data,
            current_step: step,
            permit_file_path: existingPermitPath,
            permit_file_name: existingPermitName,
            updated_at: new Date().toISOString(),
          } as any,
          { onConflict: "user_id" }
        );
      } finally {
        setSavingDraft(false);
      }
    }, 700);
    return () => clearTimeout(t);
  }, [data, step, existingPermitPath, existingPermitName, hydrated, isAdminEdit, isEditMode, user?.id]);

  const update = (k: keyof IntakeData, v: string) => {
    setData((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((p) => ({ ...p, [k]: "" }));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 10MB", variant: "destructive" });
      return;
    }
    setPermitFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setPermitPreview(reader.result as string);
    reader.readAsDataURL(file);

    // Immediately upload as draft so it survives device changes
    if (user?.id && !isAdminEdit) {
      (async () => {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${user.id}/draft-${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from("permits").upload(path, file, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });
        if (!error) {
          setExistingPermitPath(path);
          setExistingPermitName(file.name);
        }
      })();
    }
  };

  const validateStep = (s: number): boolean => {
    const e: Record<string, string> = {};
    if (s === 1 && !data.full_name.trim()) e.full_name = "Full name is required";
    if (s === 2 && data.phone.replace(/\D/g, "").length < 10)
      e.phone = "Enter a valid phone number";
    if (s === 3 && !permitFile && !existingPermitPath)
      e.permit = "Please attach a photo of your permit";
    if (s === 4) {
      if (!data.pickup_address.trim()) e.pickup_address = "Pickup address is required";
      if (!data.dropoff_address.trim()) e.dropoff_address = "Drop-off address is required";
    }
    if (s === 5) {
      if (!data.emergency_contact_name.trim())
        e.emergency_contact_name = "Emergency contact name is required";
      if (data.emergency_contact_phone.replace(/\D/g, "").length < 10)
        e.emergency_contact_phone = "Enter a valid emergency contact phone";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (validateStep(step)) setStep((s) => Math.min(5, s + 1));
  };
  const back = () => setStep((s) => Math.max(1, s - 1));

  const handleSubmit = async () => {
    if (!user?.id) {
      toast({ title: "Not signed in", variant: "destructive" });
      return;
    }
    for (let s = 1; s <= 5; s++) {
      if (!validateStep(s)) {
        setStep(s);
        return;
      }
    }
    if (!targetUserId) return;

    setIsSubmitting(true);
    try {
      // Upload permit file if user picked a new one (when not already drafted)
      let permitPath = existingPermitPath;
      let permitName = existingPermitName;
      let permitMime: string | null = null;
      let permitSize: number | null = null;

      if (permitFile && (!existingPermitPath || existingPermitPath.includes("draft-") === false)) {
        const ext = permitFile.name.split(".").pop() || "jpg";
        const path = `${targetUserId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("permits")
          .upload(path, permitFile, { contentType: permitFile.type || "image/jpeg" });
        if (upErr) throw upErr;
        permitPath = path;
        permitName = permitFile.name;
        permitMime = permitFile.type;
        permitSize = permitFile.size;
      } else if (permitFile) {
        permitMime = permitFile.type;
        permitSize = permitFile.size;
      }

      // Insert/upsert permit_documents. A failure here used to be swallowed, which is how an uploaded permit ended up "missing": say so and retry as a plain insert.
      if (permitPath) {
        const row = {
          student_id: targetUserId,
          uploaded_by: user.id,
          bucket: "permits",
          file_path: permitPath,
          file_name: permitName,
          mime_type: permitMime || "image/jpeg",
          size_bytes: permitSize,
          source: "intake_form",
          status: "pending_review",
          is_current: true,
        } as any;
        const { error: docErr } = await supabase.from("permit_documents").upsert(row, { onConflict: "student_id,source", ignoreDuplicates: false });
        if (docErr) {
          console.warn("permit document upsert failed, retrying as insert", docErr);
          const { error: insErr } = await supabase.from("permit_documents").insert(row);
          if (insErr && !/duplicate|unique/i.test(insErr.message)) throw insErr;
        }
      }

      // Split full name into first/last for backward compat
      const parts = data.full_name.trim().split(/\s+/);
      const first_name = parts[0] || "";
      const last_name = parts.slice(1).join(" ") || "";

      const update: Record<string, any> = {
        full_name: data.full_name.trim(),
        first_name,
        last_name,
        phone: data.phone.trim(),
        pickup_address: data.pickup_address.trim(),
        dropoff_address: data.dropoff_address.trim(),
        guardian_name: data.emergency_contact_name.trim(),
        guardian_phone: data.emergency_contact_phone.trim(),
        intake_updated_at: new Date().toISOString(),
        intake_updated_by: user.id,
        intake_last_edit_role: role,
      };

      // keep the profile's link to the permit in step, so every screen sees that a document is on file
      if (permitPath) update.permit_file_url = permitPath;

      if (!isEditMode) {
        update.intake_submitted = true;
        update.approval_status = "pending";
      }

      const { error: updErr } = await supabase
        .from("profiles")
        .update(update)
        .eq("id", targetUserId);
      if (updErr) throw updErr;

      // Notify admin/staff on a new intake
      if (!isEditMode) {
        const { data: staff } = await supabase
          .from("user_roles")
          .select("user_id")
          .in("role", ["admin", "staff"]);
        if (staff?.length) {
          await supabase.from("notifications").insert(
            staff.map((s) => ({
              user_id: s.user_id,
              title: "New Intake Submission",
              message: `${data.full_name} has submitted their intake form.`,
              type: "intake_submitted",
            }))
          );
        }

        // Fire-and-forget admin email. Never blocks the user's success flow.
        try {
          supabase.functions
            .invoke("notify-admins-submission", {
              body: { type: "intake", profile_id: targetUserId },
            })
            .catch((e) => console.warn("notify-admins-submission (intake) failed", e));
        } catch (e) {
          console.warn("notify-admins-submission (intake) dispatch error", e);
        }
      }

      // Clear server draft
      if (!isAdminEdit && user?.id) {
        await supabase.from("intake_drafts" as any).delete().eq("user_id", user.id);
      }

      await refetchProfile();
      toast({
        title: isEditMode ? "Intake updated" : "Intake submitted",
        description: isEditMode ? "Your changes are saved." : "You'll be notified once approved.",
      });

      if (isAdminEdit) navigate("/admin/approvals");
      else if (isEditMode && isApproved) navigate("/student");
      else navigate("/pending-approval", { replace: true });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to submit", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!hydrated) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 sm:space-y-6">
      {isAdminEdit && (
        <Button variant="ghost" asChild className="gap-2 -ml-2">
          <Link to="/admin/approvals">
            <ArrowLeft className="h-4 w-4" />
            Back to Approvals
          </Link>
        </Button>
      )}

      <div>
        <h1 className="text-2xl sm:text-3xl font-bold theme-heading">
          {isAdminEdit ? "Edit Intake" : isEditMode ? "Edit Your Intake" : "Student Intake"}
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          Step {step} of 5 — {STEPS[step - 1].title}
        </p>
      </div>

      <Progress value={(step / 5) * 100} />

      <Card>
        <CardHeader>
          <CardTitle>{STEPS[step - 1].title}</CardTitle>
          <CardDescription>
            {step === 1 && "What's your full legal name?"}
            {step === 2 && "Best phone number to reach you."}
            {step === 3 && "Attach or take a clear photo of your learner's permit."}
            {step === 4 && "Where should your instructor pick you up and drop you off?"}
            {step === 5 && "Who should we contact in an emergency?"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 1 && (
            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name *</Label>
              <Input
                id="full_name"
                value={data.full_name}
                onChange={(e) => update("full_name", e.target.value)}
                placeholder="First and last name"
                autoFocus
              />
              {errors.full_name && <p className="text-sm text-destructive">{errors.full_name}</p>}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number *</Label>
              <Input
                id="phone"
                type="tel"
                value={data.phone}
                onChange={(e) => update("phone", e.target.value)}
                placeholder="(404) 555-1234"
                autoFocus
              />
              {errors.phone && <p className="text-sm text-destructive">{errors.phone}</p>}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <Label>Permit Photo *</Label>
              {(permitPreview || existingPermitPath) && (
                <div className="rounded-lg border p-3 flex items-center gap-3 bg-muted/40">
                  {permitPreview ? (
                    <img src={permitPreview} alt="Permit preview" className="h-20 w-20 object-cover rounded" />
                  ) : (
                    <FileText className="h-10 w-10 text-muted-foreground" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {permitFile?.name || existingPermitName || "Permit on file"}
                    </p>
                    <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-green-600" /> Saved
                    </p>
                  </div>
                </div>
              )}
              <div className="flex gap-3 flex-wrap">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/heic,image/webp,application/pdf"
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
                <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2">
                  <Upload className="h-4 w-4" /> Attach file
                </Button>
                <Button type="button" variant="outline" onClick={() => cameraInputRef.current?.click()} className="gap-2">
                  <Camera className="h-4 w-4" /> Take photo
                </Button>
              </div>
              {errors.permit && <p className="text-sm text-destructive">{errors.permit}</p>}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pickup_address">Pickup Address *</Label>
                <Input
                  id="pickup_address"
                  value={data.pickup_address}
                  onChange={(e) => update("pickup_address", e.target.value)}
                  placeholder="Street, City, State"
                />
                {errors.pickup_address && <p className="text-sm text-destructive">{errors.pickup_address}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="dropoff_address">Drop-off Address *</Label>
                <Input
                  id="dropoff_address"
                  value={data.dropoff_address}
                  onChange={(e) => update("dropoff_address", e.target.value)}
                  placeholder="Street, City, State"
                />
                {errors.dropoff_address && <p className="text-sm text-destructive">{errors.dropoff_address}</p>}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="emergency_contact_name">Emergency Contact Name *</Label>
                <Input
                  id="emergency_contact_name"
                  value={data.emergency_contact_name}
                  onChange={(e) => update("emergency_contact_name", e.target.value)}
                  placeholder="Parent / guardian / next of kin"
                />
                {errors.emergency_contact_name && (
                  <p className="text-sm text-destructive">{errors.emergency_contact_name}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="emergency_contact_phone">Emergency Contact Phone *</Label>
                <Input
                  id="emergency_contact_phone"
                  type="tel"
                  value={data.emergency_contact_phone}
                  onChange={(e) => update("emergency_contact_phone", e.target.value)}
                  placeholder="(404) 555-1234"
                />
                {errors.emergency_contact_phone && (
                  <p className="text-sm text-destructive">{errors.emergency_contact_phone}</p>
                )}
              </div>
            </div>
          )}

          <Alert className="bg-muted/30 border-muted">
            <AlertDescription className="text-xs text-muted-foreground">
              {savingDraft ? "Saving draft…" : "Your progress is saved automatically."}
            </AlertDescription>
          </Alert>

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={back} disabled={step === 1 || isSubmitting} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            {step < 5 ? (
              <Button onClick={next} className="gap-2">
                Next <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2">
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Submit Intake
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
