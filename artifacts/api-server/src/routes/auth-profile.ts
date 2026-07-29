import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "../middlewares/require-auth";

const router = Router();

function adminClient() {
  const url = process.env["SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !serviceRoleKey) throw new Error("Supabase admin credentials are not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

router.post("/auth/ensure-profile", requireAuth, async (req, res) => {
  const authId = req.supabaseUserId!;
  const admin = adminClient();
  const select = "id,auth_id,email,role,first_name,middle_name,last_name,phone_number,token_balance,img_url,verification_status";

  try {
    const { data: authResult, error: authError } = await admin.auth.admin.getUserById(authId);
    if (authError) throw authError;
    const authUser = authResult.user;
    if (!authUser?.email || !authUser.email_confirmed_at) {
      res.status(403).json({ error: "email_not_confirmed", message: "Confirm your email before creating a BookSmart profile" });
      return;
    }

    const { data: linkedRows, error: linkedError } = await admin
      .from("users").select(select).eq("auth_id", authId).order("id", { ascending: true }).limit(1);
    if (linkedError) throw linkedError;
    if (linkedRows?.[0]) {
      res.json({ profile: linkedRows[0], created: false });
      return;
    }

    const { data: legacyRows, error: legacyError } = await admin
      .from("users").select(select).ilike("email", authUser.email).is("auth_id", null).order("id", { ascending: true }).limit(1);
    if (legacyError) throw legacyError;
    if (legacyRows?.[0]) {
      const { data: linked, error: linkError } = await admin
        .from("users").update({ auth_id: authId }).eq("id", legacyRows[0].id).is("auth_id", null).select(select).single();
      if (linkError) throw linkError;
      res.json({ profile: linked, created: false });
      return;
    }

    const metadata = authUser.user_metadata ?? {};
    const role = metadata.role === "cpa" ? "cpa" : "user";
    const fullName = typeof metadata.full_name === "string" ? metadata.full_name.trim() : "";
    const [firstName = "", ...lastNameParts] = fullName.split(/\s+/).filter(Boolean);
    const referralId = Number(metadata.referred_by_cpa_id);
    const { data: created, error: createError } = await admin
      .from("users")
      .insert({
        auth_id: authId,
        email: authUser.email,
        role,
        first_name: firstName,
        last_name: lastNameParts.join(" "),
        phone_number: typeof metadata.phone === "string" ? metadata.phone : "",
        verification_status: role === "cpa" ? "pending" : null,
        referred_by_cpa_id: role === "user" && Number.isSafeInteger(referralId) && referralId > 0 ? referralId : null,
      })
      .select(select)
      .single();
    if (createError) {
      // Two auth-state events can provision simultaneously. If the competing
      // request won the unique auth_id race, return its row idempotently.
      if ((createError as { code?: string }).code === "23505") {
        const { data: racedRows, error: racedError } = await admin
          .from("users").select(select).eq("auth_id", authId).order("id", { ascending: true }).limit(1);
        if (racedError) throw racedError;
        if (racedRows?.[0]) {
          res.json({ profile: racedRows[0], created: false });
          return;
        }
      }
      throw createError;
    }
    res.status(201).json({ profile: created, created: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[auth/ensure-profile]", { authId, message });
    res.status(502).json({ error: "profile_provisioning_failed", message });
  }
});

export default router;
