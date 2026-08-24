import { Router } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "../middlewares/require-auth";
import { classifyGmailFinancialMetadata, normalizeGmailMessageMetadata, CONTRACTOR_GMAIL_TARGETED_QUERIES,
  type GmailMessageMetadata, type GmailFinancialClassification } from "../lib/contractor-gmail";

const router = Router();
const adminClient = (): SupabaseClient => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Gmail financial enrichment is unavailable.");
  return createClient(url, key, { auth: { persistSession: false } });
};

async function isOrganizationOwner(admin: SupabaseClient, organizationId: number, authUserId: string) {
  const { data: user, error: userError } = await admin.from("users").select("id").eq("auth_id", authUserId).maybeSingle();
  if (userError) throw userError;
  if (!user) return false;
  const { data, error } = await admin.from("organizations").select("id").eq("id", organizationId).eq("owner_id", user.id).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

router.get("/organizations/:organizationId/contractor-gmail/query-plan", requireAuth, async (req, res) => {
  const organizationId = Number(req.params.organizationId);
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) { res.status(400).json({ error: "invalid_organization" }); return; }
  try {
    const admin = adminClient();
    if (!await isOrganizationOwner(admin, organizationId, req.supabaseUserId!)) { res.status(403).json({ error: "forbidden" }); return; }
    res.json({ queries: CONTRACTOR_GMAIL_TARGETED_QUERIES, metadataFirst: true, accountingEffect: "none" });
  } catch (error) {
    res.status(503).json({ error: "gmail_query_plan_unavailable", message: error instanceof Error ? error.message : "Query plan unavailable." });
  }
});

router.post("/organizations/:organizationId/contractor-gmail/import-metadata", requireAuth, async (req, res) => {
  const organizationId = Number(req.params.organizationId);
  const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages.slice(0, 100) : null;
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0 || !rawMessages) { res.status(400).json({ error: "invalid_import" }); return; }
  try {
    const admin = adminClient();
    if (!await isOrganizationOwner(admin, organizationId, req.supabaseUserId!)) { res.status(403).json({ error: "forbidden" }); return; }
    const classified: Array<{ metadata: GmailMessageMetadata; classification: GmailFinancialClassification }> = rawMessages.map((message: GmailMessageMetadata) => {
      const metadata = normalizeGmailMessageMetadata(message);
      return { metadata, classification: classifyGmailFinancialMetadata(metadata) };
    });
    const relevant = classified.filter(item => item.classification.relevant);
    if (relevant.length) {
      const { error } = await admin.from("contractor_gmail_financial_messages").upsert(relevant.map(({ metadata, classification }) => ({
        organization_id: organizationId,
        gmail_message_id: metadata.messageId,
        gmail_thread_id: metadata.threadId,
        sender: metadata.sender,
        subject: metadata.subject,
        message_date: metadata.messageDate,
        attachment_names: metadata.attachmentNames ?? [],
        detected_document_type: classification.documentType,
        extracted_reference_numbers: classification.extractedReferenceNumbers,
        confidence: classification.confidence,
        matched_signals: classification.matchedSignals,
        requires_content_fetch: classification.requiresContentFetch,
        classification_version: classification.classificationVersion,
        updated_at: new Date().toISOString(),
      })), { onConflict: "organization_id,gmail_message_id" });
      if (error) throw error;
    }
    res.json({ scanned: classified.length, detected: relevant.length, ignored: classified.length - relevant.length,
      needsContentFetch: relevant.filter(item => item.classification.requiresContentFetch).length, accountingEffect: "none" });
  } catch (error) {
    const invalid = error instanceof Error && /required|invalid/i.test(error.message);
    res.status(invalid ? 400 : 503).json({ error: invalid ? "invalid_gmail_metadata" : "gmail_import_unavailable",
      message: error instanceof Error ? error.message : "Gmail metadata import unavailable." });
  }
});

export default router;
