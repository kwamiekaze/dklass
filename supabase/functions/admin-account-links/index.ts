// Admin-only management of secondary (alias) emails on student accounts.
// Actions: list | add | remove
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const temporaryPassword = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `DrivingKlass!9-${token}`;
};

async function findAuthUserByEmail(admin: any, email: string) {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data?.users?.find((u: any) => (u.email || "").toLowerCase() === target);
    if (found) return found;
    if (!data?.users || data.users.length < 1000) break;
  }
  return null;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!supabaseUrl || !serviceKey || !anonKey) return json({ error: "Server configuration error" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const caller = userData?.user;
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    // Admin-only for every action (including read).
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "Forbidden: admin only" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "list") {
      const canonicalId = String(body.canonical_user_id || "");
      if (!canonicalId) return json({ error: "canonical_user_id required" }, 400);
      const { data: links, error } = await admin
        .from("account_links")
        .select("id, alias_user_id, created_at, created_by, relationship, previous_status, label")
        .eq("canonical_user_id", canonicalId);
      if (error) return json({ error: error.message }, 500);
      const ids = (links || []).map((l: any) => l.alias_user_id);
      let emails: Record<string, string> = {};
      const names: Record<string, string | null> = {};
      if (ids.length) {
        const { data: profs } = await admin.from("profiles").select("id, email, full_name, first_name, last_name").in("id", ids);
        emails = Object.fromEntries((profs || []).map((p: any) => [p.id, p.email]));
        for (const p of profs || []) {
          names[p.id] = [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.full_name || null;
        }
      }
      return json({ links: (links || []).map((l: any) => ({ ...l, email: emails[l.alias_user_id] || null, full_name: names[l.alias_user_id] || null })) });
    }

    if (action === "add") {
      const canonicalId = String(body.canonical_user_id || "");
      const email = String(body.email || "").trim().toLowerCase();
      if (!canonicalId || !email) return json({ error: "canonical_user_id and email are required" }, 400);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Enter a valid email address" }, 400);

      const { data: canonicalProfile } = await admin
        .from("profiles").select("id, email, full_name, first_name, last_name")
        .eq("id", canonicalId).maybeSingle();
      if (!canonicalProfile) return json({ error: "Student account not found" }, 404);
      if ((canonicalProfile.email || "").toLowerCase() === email) {
        return json({ error: "That is already the primary email on this account" }, 400);
      }

      // Guard rails: canonical must not itself be an alias.
      const { data: isAlias } = await admin
        .from("account_links").select("id").eq("alias_user_id", canonicalId).maybeSingle();
      if (isAlias) return json({ error: "This account is already a secondary account of another student" }, 400);

      const existingUser = await findAuthUserByEmail(admin, email);
      if (existingUser) {
        const { data: link } = await admin
          .from("account_links").select("id, canonical_user_id").eq("alias_user_id", existingUser.id).maybeSingle();
        if (link && link.canonical_user_id === canonicalId) {
          return json({ ok: true, already_linked: true, alias_user_id: existingUser.id });
        }
        return json({
          error: "That email already belongs to another account. Merge or remove that account first — nothing was changed.",
        }, 409);
      }

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: temporaryPassword(),
        email_confirm: true,
        user_metadata: {
          full_name: canonicalProfile.full_name || email,
          secondary_email_for: canonicalId,
        },
      });
      if (createErr || !created?.user) {
        return json({ error: createErr?.message || "Could not create the secondary login" }, 500);
      }
      const aliasId = created.user.id;

      const { error: linkErr } = await admin.from("account_links").insert({
        canonical_user_id: canonicalId,
        alias_user_id: aliasId,
        created_by: caller.id,
      });
      if (linkErr) {
        // Roll back the freshly-created auth user so we never leave an orphan login.
        await admin.auth.admin.deleteUser(aliasId).catch(() => {});
        return json({ error: linkErr.message }, 400);
      }

      // Let the person set their own password (uses the project's existing auth email flow).
      const siteUrl = Deno.env.get("SITE_URL") || "https://drivingklass.com";
      await admin.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl}/reset-password` }).catch(() => {});

      return json({ ok: true, alias_user_id: aliasId, email });
    }

    if (action === "set_relationship") {
      const aliasId = String(body.alias_user_id || "");
      const rel = body.relationship == null || body.relationship === "" ? null : String(body.relationship).toLowerCase();
      if (!aliasId) return json({ error: "alias_user_id required" }, 400);
      if (rel !== null && !["student", "parent", "guardian", "other"].includes(rel)) {
        return json({ error: "Relationship must be student, parent, guardian or other" }, 400);
      }
      const { data: updated, error } = await admin
        .from("account_links").update({ relationship: rel }).eq("alias_user_id", aliasId).select("id");
      if (error) return json({ error: error.message }, 500);
      if (!updated?.length) return json({ error: "Linked account not found" }, 404);
      return json({ ok: true });
    }

    if (action === "remove") {
      const aliasId = String(body.alias_user_id || "");
      if (!aliasId) return json({ error: "alias_user_id required" }, 400);
      const { data: link } = await admin
        .from("account_links").select("id, canonical_user_id, previous_status, relationship")
        .eq("alias_user_id", aliasId).maybeSingle();
      if (!link) return json({ error: "Linked account not found" }, 404);

      const { error } = await admin.from("account_links").delete().eq("alias_user_id", aliasId);
      if (error) return json({ error: error.message }, 500);

      // If this login was merged from a real profile, give that person their own account back.
      let restoredStatus: string | null = null;
      if (link.previous_status) {
        const { data: prof } = await admin.from("profiles").select("approval_status").eq("id", aliasId).maybeSingle();
        if (prof?.approval_status === "merged") {
          const { error: upErr } = await admin.from("profiles")
            .update({ approval_status: link.previous_status, updated_at: new Date().toISOString() })
            .eq("id", aliasId);
          if (!upErr) restoredStatus = link.previous_status;
        }
      }

      await admin.from("account_merge_log").insert({
        source_user_id: aliasId,
        target_user_id: link.canonical_user_id,
        performed_by: caller.id,
        action: "unlink",
        relationship: link.relationship,
        moved: { restored_status: restoredStatus },
      });

      // The alias auth user row is intentionally kept (never delete data).
      return json({
        ok: true,
        restored_status: restoredStatus,
        message: restoredStatus
          ? `Unlinked. This person can sign in to their own account again (status: ${restoredStatus}). Records moved during the merge stay with the main account.`
          : "Unlinked. Records moved during any merge stay with the main account.",
      });
    }

    return json({ error: `Unknown action '${action}'` }, 400);
  } catch (e) {
    console.error("[admin-account-links]", e);
    return json({ error: String(e) }, 500);
  }
});
