import { Router } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "../middlewares/require-auth";
import { classifyGmailFinancialMetadata, normalizeGmailMessageMetadata, CONTRACTOR_GMAIL_TARGETED_QUERIES,
  type GmailMessageMetadata, type GmailFinancialClassification } from "../lib/contractor-gmail";
import { createGmailOAuthState, decryptGmailToken, encryptGmailToken, GMAIL_READONLY_SCOPE,
  gmailIntegrationEnabled, hashGmailOAuthState, verifyGmailOAuthState } from "../lib/gmail-oauth";
import { createGmailScanClient, GmailConnectionError, refreshGmailAccessToken } from "../lib/gmail-client";
import { scanGmailCandidates } from "../lib/gmail-scan";
import { extractReceiptFile, extractReceiptText } from "../lib/receipt-extraction-service";
import { CONTRACTOR_RECEIPT_SCHEMA_VERSION, type ContractorReceiptExtraction } from "../lib/contractor-receipt";
import { matchReceiptToTransaction } from "../lib/contractor-receipt-transaction-matcher";

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

async function ownedOrganization(admin: SupabaseClient, organizationId: unknown, authUserId: string) {
  const id = Number(organizationId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("invalid_organization");
  const { data: user, error: userError } = await admin.from("users").select("id").eq("auth_id", authUserId).maybeSingle();
  if (userError) throw userError;
  if (!user) throw new Error("organization_not_found");
  const { data, error } = await admin.from("organizations").select("id,owner_id").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("organization_not_found");
  return { id, ownerId: Number(user.id) };
}

function callbackRedirect(result: "connected" | "error", reason?: string) {
  const url = new URL("/user/settings", process.env.WEB_APP_URL ?? "http://localhost:8080");
  url.searchParams.set("gmail", result);
  if (reason) url.searchParams.set("reason", reason);
  return url.toString();
}

async function saveGmailReceiptEvidence(admin: SupabaseClient, organizationId: number, sourceId: string, receipt: ContractorReceiptExtraction) {
  const { error: extractionError } = await admin.from("contractor_receipt_extractions").upsert({
    organization_id: organizationId, document_id: null, source_id: sourceId, vendor: receipt.vendor,
    receipt_date: receipt.date, subtotal: receipt.subtotal, tax: receipt.tax, total: receipt.total,
    payment_method: receipt.paymentMethod, payment_last_four: receipt.paymentLastFour,
    po_number: receipt.poNumber, job_number: receipt.jobNumber, customer_or_project: receipt.customerOrProject,
    receipt_number: receipt.receiptNumber, line_items: receipt.lineItems, warnings: receipt.warnings,
    schema_version: CONTRACTOR_RECEIPT_SCHEMA_VERSION, updated_at: new Date().toISOString(),
  }, { onConflict: "organization_id,source_id" });
  if (extractionError) throw extractionError;

  let transactionMatch = matchReceiptToTransaction(receipt, []);
  if (receipt.date && receipt.total !== null) {
    const center = new Date(`${receipt.date}T12:00:00.000Z`).getTime();
    const { data, error } = await admin.from("transactions")
      .select("id,amount,date_time,title,description,plaid_transaction_id,quickbooks_external_id,pending")
      .eq("org_id", organizationId).eq("pending", false)
      .gte("date_time", new Date(center - 7 * 86_400_000).toISOString())
      .lte("date_time", new Date(center + 7 * 86_400_000).toISOString()).limit(250);
    if (error) throw error;
    transactionMatch = matchReceiptToTransaction(receipt, (data ?? []).map(row => ({
      id: String(row.id), amount: Number(row.amount), date: row.date_time, title: row.title,
      description: row.description, plaidTransactionId: row.plaid_transaction_id,
      quickBooksExternalId: row.quickbooks_external_id,
    })));
    if (transactionMatch.transactionId && transactionMatch.transactionSource) {
      const { error: linkError } = await admin.from("contractor_source_links").upsert({
        organization_id: organizationId, left_provider: "receipt", left_record_type: "contractor_receipt_extraction",
        left_record_id: sourceId, right_provider: transactionMatch.transactionSource, right_record_type: "transaction",
        right_record_id: transactionMatch.transactionId, confidence: transactionMatch.confidence,
        score: transactionMatch.score, match_reasons: transactionMatch.matchReasons,
        requires_confirmation: true, status: "suggested", calculation_version: transactionMatch.calculationVersion,
        updated_at: new Date().toISOString(),
      }, { onConflict: "organization_id,left_provider,left_record_type,left_record_id,right_provider,right_record_type,right_record_id" });
      if (linkError) throw linkError;
    }
  }
  return transactionMatch;
}

async function findExistingReceiptEvidence(admin: SupabaseClient, organizationId: number, sourceId: string, receipt: ContractorReceiptExtraction) {
  if (!receipt.receiptNumber && !(receipt.vendor && receipt.date && receipt.total !== null)) return null;
  let query = admin.from("contractor_receipt_extractions").select("source_id")
    .eq("organization_id", organizationId).neq("source_id", sourceId);
  if (receipt.receiptNumber) {
    query = query.eq("receipt_number", receipt.receiptNumber);
    if (receipt.date) query = query.eq("receipt_date", receipt.date);
  } else {
    query = query.eq("vendor", receipt.vendor!).eq("receipt_date", receipt.date!).eq("total", receipt.total!);
  }
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  return data?.source_id ?? null;
}

router.get("/integrations/gmail/connect", requireAuth, async (req, res) => {
  if (!gmailIntegrationEnabled()) { res.status(503).json({ error: "gmail_setup_required", message: "Gmail integration is not configured yet." }); return; }
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_GMAIL_REDIRECT_URI;
    if (!clientId || !process.env.GOOGLE_CLIENT_SECRET || !redirectUri) throw new Error("gmail_setup_required");
    const admin = adminClient();
    const organization = await ownedOrganization(admin, req.query.organization_id, req.supabaseUserId!);
    const state = createGmailOAuthState(req.supabaseUserId!, organization.id);
    const parsed = verifyGmailOAuthState(state);
    const { error } = await admin.from("gmail_oauth_states").upsert({
      state_hash: hashGmailOAuthState(state), organization_id: organization.id, auth_user_id: req.supabaseUserId!,
      expires_at: new Date(parsed.expiresAt * 1000).toISOString(),
    }, { onConflict: "organization_id" });
    if (error) throw error;
    const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizationUrl.searchParams.set("client_id", clientId);
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("scope", GMAIL_READONLY_SCOPE);
    authorizationUrl.searchParams.set("access_type", "offline");
    authorizationUrl.searchParams.set("include_granted_scopes", "true");
    authorizationUrl.searchParams.set("state", state);
    res.json({ authorization_url: authorizationUrl.toString(), scope: GMAIL_READONLY_SCOPE });
  } catch (error) {
    const message = error instanceof Error ? error.message : "gmail_connect_failed";
    res.status(message.includes("organization") ? 403 : 503).json({ error: message === "gmail_setup_required" ? message : "gmail_connect_failed", message: message === "gmail_setup_required" ? "Gmail integration is not configured yet." : "Could not start Gmail connection." });
  }
});

router.get("/integrations/gmail/callback", async (req, res) => {
  if (!gmailIntegrationEnabled()) { res.redirect(303, callbackRedirect("error", "setup_required")); return; }
  try {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const stateValue = typeof req.query.state === "string" ? req.query.state : "";
    if (req.query.error) throw new Error("authorization_denied");
    if (!code || !stateValue) throw new Error("invalid_callback");
    const state = verifyGmailOAuthState(stateValue);
    const admin = adminClient();
    const { data: consumed, error: stateError } = await admin.from("gmail_oauth_states").delete()
      .eq("state_hash", hashGmailOAuthState(stateValue)).eq("organization_id", state.organizationId)
      .eq("auth_user_id", state.userId).gte("expires_at", new Date().toISOString()).select("id").maybeSingle();
    if (stateError) throw stateError;
    if (!consumed) throw new Error("invalid_callback");
    const organization = await ownedOrganization(admin, state.organizationId, state.userId);
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({
      code, client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: process.env.GOOGLE_GMAIL_REDIRECT_URI ?? "", grant_type: "authorization_code",
    }) });
    const tokens = await tokenResponse.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; token_type?: string };
    if (!tokenResponse.ok || !tokens.access_token || !tokens.expires_in) throw new Error("token_exchange_failed");
    const profileResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const profile = await profileResponse.json() as { emailAddress?: string };
    if (!profileResponse.ok || !profile.emailAddress) throw new Error("profile_lookup_failed");
    const { data: existing } = await admin.from("gmail_connections").select("refresh_token_encrypted").eq("organization_id", state.organizationId).maybeSingle();
    const { error: saveError } = await admin.from("gmail_connections").upsert({
      organization_id: state.organizationId, connected_by_user_id: organization.ownerId, google_account_email: profile.emailAddress,
      access_token_encrypted: encryptGmailToken(tokens.access_token),
      refresh_token_encrypted: tokens.refresh_token ? encryptGmailToken(tokens.refresh_token) : existing?.refresh_token_encrypted ?? null,
      access_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      granted_scopes: (tokens.scope ?? GMAIL_READONLY_SCOPE).split(/\s+/).filter(Boolean), status: "active",
      connected_at: new Date().toISOString(), disconnected_at: null, updated_at: new Date().toISOString(),
    }, { onConflict: "organization_id" });
    if (saveError) throw saveError;
    res.redirect(303, callbackRedirect("connected"));
  } catch (error) {
    const reason = error instanceof Error && ["authorization_denied", "invalid_callback"].includes(error.message) ? error.message : "connection_failed";
    res.redirect(303, callbackRedirect("error", reason));
  }
});

router.get("/integrations/gmail/status", requireAuth, async (req, res) => {
  try {
    const admin = adminClient();
    const organization = await ownedOrganization(admin, req.query.organization_id, req.supabaseUserId!);
    if (!gmailIntegrationEnabled()) { res.json({ enabled: false, configured: false, connected: false, connection: null }); return; }
    const { data, error } = await admin.from("gmail_connections")
      .select("google_account_email,status,last_scan_at,last_scan_status,last_scan_error,connected_at,updated_at")
      .eq("organization_id", organization.id).maybeSingle();
    if (error) throw error;
    res.json({ enabled: true, configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_GMAIL_REDIRECT_URI), connected: data?.status === "active", connection: data ?? null });
  } catch { res.status(403).json({ error: "gmail_status_unavailable", message: "Could not read Gmail connection status." }); }
});

router.post("/integrations/gmail/disconnect", requireAuth, async (req, res) => {
  try {
    const admin = adminClient();
    const organization = await ownedOrganization(admin, req.body?.organization_id, req.supabaseUserId!);
    const { data, error } = await admin.from("gmail_connections").select("access_token_encrypted").eq("organization_id", organization.id).maybeSingle();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: "gmail_connection_not_found" }); return; }
    let revoked = false;
    if (data.access_token_encrypted) {
      try {
        const token = decryptGmailToken(data.access_token_encrypted);
        const response = await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token }),
        });
        revoked = response.ok;
      } catch { revoked = false; }
    }
    const { error: updateError } = await admin.from("gmail_connections").update({ access_token_encrypted: null, refresh_token_encrypted: null, access_token_expires_at: null, status: "disconnected", disconnected_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("organization_id", organization.id);
    if (updateError) throw updateError;
    res.json({ ok: true, connected: false, revoked });
  } catch { res.status(503).json({ error: "gmail_disconnect_failed", message: "Could not disconnect Gmail." }); }
});

router.post("/integrations/gmail/scan", requireAuth, async (req, res) => {
  if (!gmailIntegrationEnabled()) { res.status(503).json({ error: "gmail_setup_required", message: "Gmail integration is not enabled." }); return; }
  const days = Number(req.body?.days ?? 90);
  if (![30, 60, 90].includes(days)) { res.status(400).json({ error: "invalid_scan_period", message: "Choose a 30, 60, or 90 day scan." }); return; }
  try {
    const admin = adminClient();
    const organization = await ownedOrganization(admin, req.body?.organization_id, req.supabaseUserId!);
    const { data: connection, error: connectionError } = await admin.from("gmail_connections")
      .select("access_token_encrypted,refresh_token_encrypted,access_token_expires_at,status")
      .eq("organization_id", organization.id).maybeSingle();
    if (connectionError) throw connectionError;
    if (!connection || connection.status !== "active") { res.status(409).json({ error: "gmail_connection_required", message: "Connect Gmail before scanning." }); return; }
    let accessToken = connection.access_token_encrypted ? decryptGmailToken(connection.access_token_encrypted) : "";
    const expiresSoon = !connection.access_token_expires_at || Date.parse(connection.access_token_expires_at) <= Date.now() + 5 * 60_000;
    if (!accessToken || expiresSoon) {
      if (!connection.refresh_token_encrypted) throw new GmailConnectionError("reauthorization_required", "Reconnect Gmail to continue.");
      const refreshed = await refreshGmailAccessToken(decryptGmailToken(connection.refresh_token_encrypted));
      accessToken = refreshed.accessToken;
      const { error } = await admin.from("gmail_connections").update({ access_token_encrypted: encryptGmailToken(accessToken), access_token_expires_at: refreshed.expiresAt, status: "active", updated_at: new Date().toISOString() }).eq("organization_id", organization.id);
      if (error) throw error;
    }
    const client = createGmailScanClient(accessToken);
    const queries = [
      `newer_than:${days}d (receipt OR invoice OR "order confirmation" OR "purchase confirmation")`,
      `newer_than:${days}d ("payment confirmation" OR "payment received")`,
      `newer_than:${days}d has:attachment (filename:pdf OR filename:png OR filename:jpg OR filename:jpeg)`,
    ];
    const scan = await scanGmailCandidates(client, { queries, limit: 50 });
    const receiptDocumentTypes = new Set(["receipt", "vendor_invoice", "customer_invoice", "payment_notice"]);
    const receiptCandidates = scan.candidates.filter(candidate => receiptDocumentTypes.has(candidate.classification.documentType));
    const candidates = receiptCandidates.slice(0, 10);
    let matched = 0; let needsReview = 0; let unmatched = 0; let duplicatesSkipped = 0; let processed = 0; let processingFailures = scan.failures.length;
    for (const candidate of candidates) {
      const now = new Date().toISOString();
      const { error: metadataError } = await admin.from("contractor_gmail_financial_messages").upsert({
        organization_id: organization.id, gmail_message_id: candidate.messageId, gmail_thread_id: candidate.threadId,
        sender: candidate.sender, subject: candidate.subject, message_date: candidate.messageDate,
        attachment_names: candidate.attachments.map(item => item.filename), detected_document_type: candidate.classification.documentType,
        extracted_reference_numbers: candidate.classification.extractedReferenceNumbers, confidence: candidate.classification.confidence,
        matched_signals: candidate.classification.matchedSignals, requires_content_fetch: candidate.classification.requiresContentFetch,
        classification_version: candidate.classification.classificationVersion, updated_at: now,
      }, { onConflict: "organization_id,gmail_message_id" });
      if (metadataError) { processingFailures += 1; continue; }
      const attachment = candidate.attachments.find(item => item.size == null || item.size <= 10 * 1024 * 1024);
      const sourceId = attachment ? `gmail:${candidate.messageId}:attachment:${attachment.attachmentId}` : `gmail:${candidate.messageId}:body`;
      const { data: existing, error: duplicateError } = await admin.from("contractor_receipt_extractions").select("id").eq("organization_id", organization.id).eq("source_id", sourceId).maybeSingle();
      if (duplicateError) { processingFailures += 1; continue; }
      if (existing) { duplicatesSkipped += 1; continue; }
      try {
        let receipt: ContractorReceiptExtraction;
        if (attachment) {
          try {
            const gmailData = await client.getAttachment(candidate.messageId, attachment.attachmentId);
            const bytes = Buffer.from(gmailData, "base64url");
            if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error("unsupported_attachment_size");
            receipt = await extractReceiptFile({ filename: attachment.filename, mimeType: attachment.mimeType, base64Data: bytes.toString("base64") });
          } catch (attachmentError) {
            const body = candidate.plainText ?? candidate.htmlText;
            if (!body) throw attachmentError;
            receipt = await extractReceiptText(body);
          }
        } else {
          const body = candidate.plainText ?? candidate.htmlText;
          if (!body) { unmatched += 1; continue; }
          receipt = await extractReceiptText(body);
        }
        if (await findExistingReceiptEvidence(admin, organization.id, sourceId, receipt)) {
          duplicatesSkipped += 1;
          continue;
        }
        const transactionMatch = await saveGmailReceiptEvidence(admin, organization.id, sourceId, receipt);
        processed += 1;
        if (!transactionMatch.transactionId) unmatched += 1;
        else if (transactionMatch.confidence === "high") matched += 1;
        else needsReview += 1;
      } catch { processingFailures += 1; }
    }
    const completedAt = new Date().toISOString();
    const partial = receiptCandidates.length > candidates.length || processingFailures > 0;
    await admin.from("gmail_connections").update({ last_scan_at: completedAt, last_scan_status: partial ? "partial" : "completed", last_scan_error: processingFailures ? `${processingFailures} message(s) could not be processed.` : null, updated_at: completedAt }).eq("organization_id", organization.id);
    res.json({ emails_reviewed: scan.reviewed, possible_receipts: receiptCandidates.length, processed_receipts: processed,
      matched, needs_review: needsReview, unmatched, duplicates_skipped: duplicatesSkipped, failures: processingFailures,
      status: partial ? "partial" : "completed", accountingEffect: "none" });
  } catch (error) {
    if (error instanceof GmailConnectionError && error.code === "reauthorization_required") {
      try { const admin = adminClient(); const organization = await ownedOrganization(admin, req.body?.organization_id, req.supabaseUserId!); await admin.from("gmail_connections").update({ status: "reauth_required", last_scan_status: "failed", last_scan_error: "Gmail authorization must be renewed.", updated_at: new Date().toISOString() }).eq("organization_id", organization.id); } catch { /* preserve original error */ }
      res.status(401).json({ error: error.code, message: error.message, reconnect_required: true }); return;
    }
    res.status(503).json({ error: "gmail_scan_failed", message: error instanceof Error ? error.message : "Gmail scan failed." });
  }
});

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
