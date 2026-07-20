import { Router } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "../middlewares/require-auth";

const router = Router();
const SUPABASE_URL = "https://pvppwmkswnluidlwnnck.supabase.co";

type SupabaseAdmin = SupabaseClient<any, any, any>;

function getAdminClient(): SupabaseAdmin {
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(SUPABASE_URL, serviceRoleKey, { auth: { persistSession: false } });
}

function appUrl() {
  return (process.env["APP_URL"] ?? "http://localhost:5173").replace(/\/+$/, "");
}

function emailLogoUrl() {
  return (process.env["EMAIL_LOGO_URL"] ?? `${appUrl()}/logo.png`).trim();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function sendReferralEmail(args: {
  to: string;
  cpaName: string;
  referralLink: string;
}) {
  const apiKey = process.env["RESEND_API_KEY"];
  const from = process.env["REFERRAL_FROM_EMAIL"];
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  if (!from) throw new Error("REFERRAL_FROM_EMAIL is not set");

  const safeCpaName = escapeHtml(args.cpaName);
  const safeReferralLink = escapeHtml(args.referralLink);
  const safeLogoUrl = escapeHtml(emailLogoUrl());
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject: `${args.cpaName} invited you to BookSmart`,
      html: `
        <div style="margin:0;padding:0;background:#031226;color:#ffffff;font-family:Arial,Helvetica,sans-serif">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#031226;padding:34px 16px">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#082653;border:1px solid #214c86;border-radius:16px;overflow:hidden">
                  <tr>
                    <td style="padding:24px 28px;background:#061f49;border-bottom:1px solid #214c86">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="vertical-align:middle">
                            <img src="${safeLogoUrl}" width="54" height="54" alt="BookSmart" style="display:block;border:0;outline:none;text-decoration:none">
                          </td>
                          <td align="right" style="vertical-align:middle;color:#ffc72b;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">
                            BookSmart
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:34px 32px 20px">
                      <p style="margin:0 0 10px;color:#ffc72b;font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">CPA Referral Invite</p>
                      <h1 style="margin:0 0 14px;color:#ffffff;font-size:30px;line-height:1.18;font-weight:800">You're invited to BookSmart</h1>
                      <p style="margin:0;color:#dce8ff;font-size:16px;line-height:1.65">${safeCpaName} invited you to set up your BookSmart account so you can organize your business finances, documents, reports, and tax strategy.</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:8px 32px 28px">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0d315f;border:1px solid #27558f;border-radius:12px">
                        <tr>
                          <td style="padding:18px 20px;color:#bcd0ef;font-size:14px;line-height:1.55">
                            <strong style="color:#ffffff">What happens next:</strong><br>
                            Create your account, add your business profile, and your CPA referral will be linked automatically.
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding:0 32px 32px">
                      <a href="${safeReferralLink}" style="background:#ffc72b;color:#07142f;text-decoration:none;font-weight:800;font-size:16px;padding:14px 24px;border-radius:10px;display:inline-block">Create your account</a>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 32px 30px">
                      <p style="margin:0;color:#9fb4d6;font-size:12px;line-height:1.6">If the button does not work, copy and paste this link into your browser:<br><a href="${safeReferralLink}" style="color:#ffc72b;text-decoration:none;word-break:break-all">${safeReferralLink}</a></p>
                    </td>
                  </tr>
                </table>
                <p style="max-width:640px;margin:16px auto 0;color:#7890b7;font-size:11px;line-height:1.5">You received this email because a CPA invited you to join BookSmart.</p>
              </td>
            </tr>
          </table>
        </div>
      `,
      text: `${args.cpaName} invited you to BookSmart. Create your account here: ${args.referralLink}`,
    }),
  });

  const data = await res.json().catch(() => ({})) as { id?: string; message?: string };
  if (!res.ok) {
    const message = typeof data?.message === "string" ? data.message : "Resend email request failed";
    throw new Error(message);
  }
  return data;
}

router.post("/referrals/send", requireAuth, async (req, res) => {
  try {
    const recipientEmail = String(req.body?.recipientEmail ?? "").trim().toLowerCase();
    if (!isValidEmail(recipientEmail)) {
      res.status(400).json({ error: "invalid_email", message: "Enter a valid recipient email address." });
      return;
    }

    const admin = getAdminClient();
    const { data: cpa, error } = await admin
      .from("users")
      .select("id, first_name, last_name, email, role")
      .eq("auth_id", req.supabaseUserId!)
      .maybeSingle();
    if (error) throw error;
    if (!cpa || cpa.role !== "cpa") {
      res.status(403).json({ error: "forbidden", message: "Only CPA accounts can send referral invites." });
      return;
    }

    const cpaName = [cpa.first_name, cpa.last_name].filter(Boolean).join(" ") || cpa.email || "Your CPA";
    const referralLink = `${appUrl()}/sign-up?ref=${cpa.id}`;
    const email = await sendReferralEmail({ to: recipientEmail, cpaName, referralLink });

    res.json({ ok: true, id: email?.id ?? null, referralLink });
  } catch (e) {
    res.status(502).json({ error: "referral_send_failed", message: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
