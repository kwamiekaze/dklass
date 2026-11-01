import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Single source of truth for the fallback admin recipient.
// Override in prod by setting the ADMIN_FALLBACK_EMAIL secret.
const ADMIN_FALLBACK_EMAIL =
  Deno.env.get("ADMIN_FALLBACK_EMAIL") || "kwamiekaze@gmail.com";

const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmdWFkdWRxdGNtcGRiZ3RnYXpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxOTI0MzMsImV4cCI6MjA4Mjc2ODQzM30.5aVbC2cnmJqVmiuO9wiJU3zQyLByWKhT2z8UHBp6_-Y";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function formatEasternTime(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `${fmt.format(d)} ET`;
  } catch {
    return d.toISOString();
  }
}

async function resolveAdminEmails(admin: SupabaseClient): Promise<string[]> {
  try {
    const { data: rows } = await admin
      .from("user_roles")
      .select("user_id, profiles:profiles!user_roles_user_id_fkey(email)")
      .eq("role", "admin");
    const emails: string[] = [];
    for (const r of (rows || []) as any[]) {
      const email = r?.profiles?.email;
      if (email && typeof email === "string") emails.push(email.trim().toLowerCase());
    }
    // Fallback path: manually join if the FK alias didn't resolve
    if (emails.length === 0) {
      const { data: roleRows } = await admin
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      const ids = (roleRows || []).map((r: any) => r.user_id).filter(Boolean);
      if (ids.length) {
        const { data: profRows } = await admin
          .from("profiles")
          .select("email")
          .in("id", ids);
        for (const p of (profRows || []) as any[]) {
          if (p?.email) emails.push(String(p.email).trim().toLowerCase());
        }
      }
    }
    const unique = Array.from(new Set(emails.filter(Boolean)));
    if (unique.length === 0) unique.push(ADMIN_FALLBACK_EMAIL.toLowerCase());
    return unique;
  } catch (e) {
    console.error("[notify-admins-submission] admin lookup failed", e);
    return [ADMIN_FALLBACK_EMAIL.toLowerCase()];
  }
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const type: "contact" | "intake" = body?.type;
    if (type !== "contact" && type !== "intake") {
      return json({ error: "type must be 'contact' or 'intake'" }, 400);
    }

    let templateName: string;
    let templateData: Record<string, unknown> = {};
    let idempotencyBase: string;

    if (type === "contact") {
      const submissionId: string | undefined = body.submission_id;
      if (!submissionId) return json({ error: "submission_id required" }, 400);
      const { data: sub, error: subErr } = await admin
        .from("contact_submissions")
        .select("*")
        .eq("id", submissionId)
        .maybeSingle();
      if (subErr || !sub) return json({ error: "submission not found" }, 404);

      let attachmentNote: string | undefined;
      if (sub.permit_attachment_path || sub.attachment_url) {
        attachmentNote = "Permit/License uploaded ✓";
      }

      templateName = "admin-new-contact-submission";
      idempotencyBase = `admin-contact-${submissionId}`;
      templateData = {
        fullName: sub.full_name,
        senderEmail: sub.email,
        phone: sub.phone,
        message: sub.message,
        sourceLabel: body.sourceLabel || "Homepage Contact Form",
        submittedAtLabel: formatEasternTime(sub.created_at),
        attachmentNote,
      };
    } else {
      // intake: caller passes profile_id
      const profileId: string | undefined = body.profile_id;
      if (!profileId) return json({ error: "profile_id required" }, 400);

      const { data: profile, error: pErr } = await admin
        .from("profiles")
        .select(
          "id, full_name, email, phone, pickup_address, dropoff_address, permit_number, permit_issue_date, permit_expiration_date, guardian_name, guardian_phone, guardian_email, availability_notes, intake_updated_at"
        )
        .eq("id", profileId)
        .maybeSingle();
      if (pErr || !profile) return json({ error: "profile not found" }, 404);

      // Latest current permit document → signed URL
      let permitFileUrl: string | undefined;
      let permitFileNote: string | undefined;
      const { data: perm } = await admin
        .from("permit_documents")
        .select("bucket, file_path")
        .eq("student_id", profileId)
        .eq("is_current", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (perm?.file_path) {
        permitFileNote = "Permit/License uploaded ✓";
        try {
          const { data: signed } = await admin.storage
            .from(perm.bucket || "permits")
            .createSignedUrl(perm.file_path, 60 * 60 * 24 * 7);
          if (signed?.signedUrl) permitFileUrl = signed.signedUrl;
        } catch (e) {
          console.warn("permit signed url failed", e);
        }
      }

      templateName = "admin-new-intake-submission";
      idempotencyBase = `admin-intake-${profileId}-${profile.intake_updated_at || Date.now()}`;
      templateData = {
        studentName: profile.full_name,
        studentEmail: profile.email,
        phone: profile.phone,
        pickupAddress: profile.pickup_address,
        dropoffAddress: profile.dropoff_address,
        permitNumber: profile.permit_number,
        permitIssueDate: profile.permit_issue_date,
        permitExpirationDate: profile.permit_expiration_date,
        guardianName: profile.guardian_name,
        guardianPhone: profile.guardian_phone,
        guardianEmail: profile.guardian_email,
        notes: profile.availability_notes,
        permitFileNote,
        permitFileUrl,
        submittedAtLabel: formatEasternTime(profile.intake_updated_at),
      };
    }

    const recipients = await resolveAdminEmails(admin);

    const results: Array<{ recipient: string; ok: boolean; error?: string }> = [];
    for (const recipient of recipients) {
      try {
        const idem = `${idempotencyBase}-${recipient}`;
        const res = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ANON_KEY}`,
          },
          body: JSON.stringify({
            templateName,
            recipientEmail: recipient,
            idempotencyKey: idem,
            templateData,
          }),
        });
        results.push({ recipient, ok: res.ok, error: res.ok ? undefined : await res.text() });
      } catch (e) {
        results.push({ recipient, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }

    return json({ success: true, recipients, results });
  } catch (error) {
    console.error("[notify-admins-submission]", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
