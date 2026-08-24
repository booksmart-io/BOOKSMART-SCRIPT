import { Router } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "../middlewares/require-auth";
import {
  CONTRACTOR_RECEIPT_PROMPT,
  CONTRACTOR_RECEIPT_SCHEMA_VERSION,
  contractorReceiptJsonSchema,
  normalizeContractorReceipt,
  receiptToFinancialRecord,
} from "../lib/contractor-receipt";
import { matchContractorFinancialRecord } from "../lib/contractor-job-matcher";
import { matchReceiptToTransaction } from "../lib/contractor-receipt-transaction-matcher";

const router = Router();
const SUPABASE_URL =
  process.env.SUPABASE_URL ?? "https://pvppwmkswnluidlwnnck.supabase.co";
const MAX_BYTES = 10 * 1024 * 1024;
const adminClient = (): SupabaseClient => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Contractor receipt extraction is unavailable.");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
};

function providerText(payload: any) {
  return (
    payload?.output_text ??
    payload?.output
      ?.flatMap((item: any) => item.content ?? [])
      .map((item: any) => item.text ?? "")
      .join("") ??
    ""
  );
}

async function requireOrganizationOwner(
  admin: SupabaseClient,
  organizationId: number,
  authUserId: string,
) {
  const { data: user, error: userError } = await admin
    .from("users")
    .select("id")
    .eq("auth_id", authUserId)
    .maybeSingle();
  if (userError) throw userError;
  if (!user) return null;
  const { data: organization, error: organizationError } = await admin
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (organizationError) throw organizationError;
  return organization ? user : null;
}

router.get(
  "/organizations/:organizationId/contractor-receipts/review-queue",
  requireAuth,
  async (req, res) => {
    const organizationId = Number(req.params.organizationId);
    if (!Number.isSafeInteger(organizationId) || organizationId <= 0) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    try {
      const admin = adminClient();
      const owner = await requireOrganizationOwner(
        admin,
        organizationId,
        req.supabaseUserId!,
      );
      if (!owner) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      const [matchesResult, linksResult, receiptsResult] = await Promise.all([
        admin
          .from("contractor_financial_matches")
          .select(
            "source_record_id,jobber_job_id,confidence,score,match_reasons,requires_confirmation,status,updated_at",
          )
          .eq("organization_id", organizationId)
          .eq("source_provider", "receipt")
          .order("updated_at", { ascending: false }),
        admin
          .from("contractor_source_links")
          .select(
            "left_record_id,right_provider,right_record_id,confidence,score,match_reasons,requires_confirmation",
          )
          .eq("organization_id", organizationId)
          .eq("left_provider", "receipt")
          .eq("right_record_type", "transaction")
          .eq("status", "suggested")
          .order("score", { ascending: false }),
        admin
          .from("contractor_receipt_extractions")
          .select(
            "source_id,vendor,receipt_date,total,po_number,job_number,customer_or_project,receipt_number,warnings,created_at,updated_at",
          )
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false }),
      ]);
      if (matchesResult.error) throw matchesResult.error;
      if (linksResult.error) throw linksResult.error;
      if (receiptsResult.error) throw receiptsResult.error;
      const matches = matchesResult.data ?? [];
      const links = linksResult.data ?? [];
      const jobIds = [
        ...new Set(
          matches
            .map((row) => row.jobber_job_id)
            .filter((value): value is string => Boolean(value)),
        ),
      ];
      const transactionIds = [
        ...new Set(
          links
            .map((row) => Number(row.right_record_id))
            .filter(Number.isSafeInteger),
        ),
      ];
      const [jobsResult, transactionsResult] = await Promise.all([
        jobIds.length
          ? admin
              .from("jobber_records")
              .select("external_id,record_number,title,status")
              .eq("organization_id", organizationId)
              .eq("object_type", "jobs")
              .in("external_id", jobIds)
          : Promise.resolve({ data: [], error: null }),
        transactionIds.length
          ? admin
              .from("transactions")
              .select("id,title,description,amount,date_time")
              .eq("org_id", organizationId)
              .in("id", transactionIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (jobsResult.error) throw jobsResult.error;
      if (transactionsResult.error) throw transactionsResult.error;
      const receiptBySource = new Map(
        (receiptsResult.data ?? []).map((row) => [row.source_id, row]),
      );
      const jobById = new Map(
        (jobsResult.data ?? []).map((row) => [row.external_id, row]),
      );
      const transactionById = new Map(
        (transactionsResult.data ?? []).map((row) => [String(row.id), row]),
      );
      const bestLinkBySource = new Map<string, (typeof links)[number]>();
      for (const link of links)
        if (!bestLinkBySource.has(link.left_record_id))
          bestLinkBySource.set(link.left_record_id, link);
      const matchBySource = new Map(
        matches.map((match) => [match.source_record_id, match]),
      );
      res.json({
        receipts: (receiptsResult.data ?? []).map((receipt) => {
          const match = matchBySource.get(receipt.source_id);
          return {
            ...receipt,
            status:
              match?.status === "unmatched"
                ? "unmatched"
                : match?.status === "suggested"
                  ? "awaiting_review"
                  : "processed",
            removable: match?.status !== "confirmed",
            confirmed: match?.status === "confirmed",
          };
        }),
        suggestions: matches
          .filter((match) => match.status === "suggested")
          .map((match) => {
            const link = bestLinkBySource.get(match.source_record_id);
            return {
              sourceId: match.source_record_id,
              confidence: match.confidence,
              score: Number(match.score),
              reasons: match.match_reasons,
              requiresConfirmation: match.requires_confirmation,
              updatedAt: match.updated_at,
              receipt: receiptBySource.get(match.source_record_id) ?? null,
              job: match.jobber_job_id
                ? (jobById.get(match.jobber_job_id) ?? {
                    external_id: match.jobber_job_id,
                  })
                : null,
              transaction: link
                ? (transactionById.get(link.right_record_id) ?? null)
                : null,
              transactionMatch: link
                ? {
                    confidence: link.confidence,
                    score: Number(link.score),
                    reasons: link.match_reasons,
                  }
                : null,
            };
          }),
      });
    } catch (error) {
      res
        .status(503)
        .json({
          error: "review_queue_unavailable",
          message:
            error instanceof Error
              ? error.message
              : "Suggested matches are unavailable.",
        });
    }
  },
);

router.delete(
  "/organizations/:organizationId/contractor-receipts/:sourceId",
  requireAuth,
  async (req, res) => {
    const organizationId = Number(req.params.organizationId);
    const sourceId = String(req.params.sourceId ?? "")
      .trim()
      .slice(0, 300);
    if (
      !Number.isSafeInteger(organizationId) ||
      organizationId <= 0 ||
      !sourceId
    ) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    try {
      const admin = adminClient();
      const owner = await requireOrganizationOwner(
        admin,
        organizationId,
        req.supabaseUserId!,
      );
      if (!owner) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      const { data: receipt, error: receiptError } = await admin
        .from("contractor_receipt_extractions")
        .select("source_id")
        .eq("organization_id", organizationId)
        .eq("source_id", sourceId)
        .maybeSingle();
      if (receiptError) throw receiptError;
      if (!receipt) {
        res.status(404).json({ error: "receipt_not_found" });
        return;
      }
      const { data: match, error: matchLookupError } = await admin
        .from("contractor_financial_matches")
        .select("id,status")
        .eq("organization_id", organizationId)
        .eq("source_provider", "receipt")
        .eq("source_record_id", sourceId)
        .maybeSingle();
      if (matchLookupError) throw matchLookupError;
      // A confirmed assignment belongs to the accounting transaction, not the
      // uploaded receipt. Detach its audit reference before removing receipt
      // evidence so the transaction and tracked job cost remain unchanged.
      if (match?.id) {
        const { error: assignmentError } = await admin
          .from("contractor_job_cost_assignments")
          .update({ match_id: null })
          .eq("organization_id", organizationId)
          .eq("match_id", match.id);
        if (assignmentError) throw assignmentError;
      }
      const { error: linksError } = await admin
        .from("contractor_source_links")
        .delete()
        .eq("organization_id", organizationId)
        .eq("left_provider", "receipt")
        .eq("left_record_id", sourceId);
      if (linksError) throw linksError;
      const { error: matchError } = await admin
        .from("contractor_financial_matches")
        .delete()
        .eq("organization_id", organizationId)
        .eq("source_provider", "receipt")
        .eq("source_record_id", sourceId);
      if (matchError) throw matchError;
      const { error: extractionError } = await admin
        .from("contractor_receipt_extractions")
        .delete()
        .eq("organization_id", organizationId)
        .eq("source_id", sourceId);
      if (extractionError) throw extractionError;
      res.json({
        removed: true,
        accountingEffect: "none",
        jobCostEffect: "preserved",
      });
    } catch (error) {
      res
        .status(503)
        .json({
          error: "receipt_removal_unavailable",
          message:
            error instanceof Error
              ? error.message
              : "The receipt could not be removed.",
        });
    }
  },
);

router.post(
  "/organizations/:organizationId/contractor-receipts/reject-match",
  requireAuth,
  async (req, res) => {
    const organizationId = Number(req.params.organizationId);
    const sourceId = String(req.body?.sourceId ?? "")
      .trim()
      .slice(0, 300);
    if (
      !Number.isSafeInteger(organizationId) ||
      organizationId <= 0 ||
      !sourceId
    ) {
      res.status(400).json({ error: "invalid_rejection" });
      return;
    }
    try {
      const admin = adminClient();
      const owner = await requireOrganizationOwner(
        admin,
        organizationId,
        req.supabaseUserId!,
      );
      if (!owner) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      const { data: match, error: lookupError } = await admin
        .from("contractor_financial_matches")
        .select("id,status")
        .eq("organization_id", organizationId)
        .eq("source_provider", "receipt")
        .eq("source_record_id", sourceId)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (!match || match.status !== "suggested") {
        res
          .status(422)
          .json({
            error: "rejection_rejected",
            message: "This suggestion is no longer awaiting review.",
          });
        return;
      }
      const now = new Date().toISOString();
      const { error: linkError } = await admin
        .from("contractor_source_links")
        .update({
          status: "rejected",
          requires_confirmation: false,
          updated_at: now,
        })
        .eq("organization_id", organizationId)
        .eq("left_provider", "receipt")
        .eq("left_record_id", sourceId)
        .eq("status", "suggested");
      if (linkError) throw linkError;
      const { error: matchError } = await admin
        .from("contractor_financial_matches")
        .update({
          status: "rejected",
          requires_confirmation: false,
          updated_at: now,
        })
        .eq("id", match.id)
        .eq("status", "suggested");
      if (matchError) throw matchError;
      res.json({ rejected: true, accountingEffect: "none" });
    } catch (error) {
      res
        .status(503)
        .json({
          error: "rejection_unavailable",
          message:
            error instanceof Error
              ? error.message
              : "The suggestion could not be rejected.",
        });
    }
  },
);

router.post(
  "/organizations/:organizationId/contractor-receipts/extract",
  requireAuth,
  async (req, res) => {
    const organizationId = Number(req.params.organizationId);
    const documentId =
      req.body?.documentId == null ? null : Number(req.body.documentId);
    const sourceId = String(
      req.body?.sourceId ?? (documentId ? `document:${documentId}` : ""),
    )
      .trim()
      .slice(0, 300);
    const mimeType = String(req.body?.mimeType ?? "");
    const filename = String(req.body?.filename ?? "contractor-receipt").slice(
      0,
      200,
    );
    const fileData = String(req.body?.fileData ?? "").replace(
      /^data:[^;]+;base64,/,
      "",
    );
    if (
      !Number.isSafeInteger(organizationId) ||
      organizationId <= 0 ||
      !sourceId
    ) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    if (
      !(mimeType === "application/pdf" || mimeType.startsWith("image/")) ||
      !fileData
    ) {
      res.status(400).json({ error: "unsupported_file" });
      return;
    }
    let buffer: Buffer;
    try {
      buffer = Buffer.from(fileData, "base64");
    } catch {
      res.status(400).json({ error: "invalid_file" });
      return;
    }
    if (!buffer.length || buffer.length > MAX_BYTES) {
      res
        .status(buffer.length > MAX_BYTES ? 413 : 400)
        .json({ error: "invalid_file_size" });
      return;
    }

    try {
      const apiKey = process.env.OPENAI_API_KEY?.trim();
      if (!apiKey) throw new Error("Receipt extraction is not configured.");
      const admin = adminClient();
      const { data: user, error: userError } = await admin
        .from("users")
        .select("id")
        .eq("auth_id", req.supabaseUserId!)
        .maybeSingle();
      if (userError) throw userError;
      if (!user) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      const { data: organization, error: organizationError } = await admin
        .from("organizations")
        .select("id")
        .eq("id", organizationId)
        .eq("owner_id", user.id)
        .maybeSingle();
      if (organizationError) throw organizationError;
      if (!organization) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      if (documentId !== null) {
        if (!Number.isSafeInteger(documentId) || documentId <= 0) {
          res.status(400).json({ error: "invalid_document" });
          return;
        }
        const { data: document, error: documentError } = await admin
          .from("user_documents")
          .select("id")
          .eq("id", documentId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (documentError) throw documentError;
        if (!document) {
          res.status(403).json({ error: "forbidden_document" });
          return;
        }
      }

      const fileContent =
        mimeType === "application/pdf"
          ? {
              type: "input_file",
              filename,
              file_data: `data:${mimeType};base64,${fileData}`,
            }
          : {
              type: "input_image",
              image_url: `data:${mimeType};base64,${fileData}`,
              detail: "high",
            };
      const upstream = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          temperature: 0,
          max_output_tokens: 4096,
          input: [
            {
              role: "system",
              content: [
                {
                  type: "input_text",
                  text: "Extract contractor receipt facts. Return only strict schema-valid data.",
                },
              ],
            },
            {
              role: "user",
              content: [
                fileContent,
                { type: "input_text", text: CONTRACTOR_RECEIPT_PROMPT },
              ],
            },
          ],
          text: {
            format: { type: "json_schema", ...contractorReceiptJsonSchema },
          },
        }),
      });
      if (!upstream.ok) {
        res.status(502).json({ error: "receipt_extraction_failed" });
        return;
      }
      const receipt = normalizeContractorReceipt(
        JSON.parse(providerText(await upstream.json())),
      );
      const { data: extraction, error: extractionError } = await admin
        .from("contractor_receipt_extractions")
        .upsert(
          {
            organization_id: organizationId,
            document_id: documentId,
            source_id: sourceId,
            vendor: receipt.vendor,
            receipt_date: receipt.date,
            subtotal: receipt.subtotal,
            tax: receipt.tax,
            total: receipt.total,
            payment_method: receipt.paymentMethod,
            payment_last_four: receipt.paymentLastFour,
            po_number: receipt.poNumber,
            job_number: receipt.jobNumber,
            customer_or_project: receipt.customerOrProject,
            receipt_number: receipt.receiptNumber,
            line_items: receipt.lineItems,
            warnings: receipt.warnings,
            schema_version: CONTRACTOR_RECEIPT_SCHEMA_VERSION,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "organization_id,source_id" },
        )
        .select("id")
        .single();
      if (extractionError) throw extractionError;

      const { data: jobRows, error: jobsError } = await admin
        .from("jobber_records")
        .select("external_id,record_number,title,amount")
        .eq("organization_id", organizationId)
        .eq("object_type", "jobs")
        .eq("is_archived", false);
      if (jobsError) throw jobsError;
      const match = matchContractorFinancialRecord(
        receiptToFinancialRecord(sourceId, receipt),
        (jobRows ?? []).map((row) => ({
          id: row.external_id,
          jobNumber: row.record_number,
          title: row.title,
          amount: row.amount == null ? null : Number(row.amount),
        })),
      );
      const { error: matchError } = await admin
        .from("contractor_financial_matches")
        .upsert(
          {
            organization_id: organizationId,
            source_provider: "receipt",
            source_record_type: "contractor_receipt_extraction",
            source_record_id: sourceId,
            jobber_job_id: match.matchedJobId,
            confidence: match.confidence,
            score: match.score,
            match_reasons: match.matchReasons,
            source_ids: match.sourceIds,
            requires_confirmation: match.requiresConfirmation,
            status:
              match.confidence === "unmatched" ? "unmatched" : "suggested",
            calculation_version: match.calculationVersion,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict:
              "organization_id,source_provider,source_record_type,source_record_id",
          },
        );
      if (matchError) throw matchError;

      let transactionMatch = matchReceiptToTransaction(receipt, []);
      if (receipt.date && receipt.total !== null) {
        const receiptDate = new Date(`${receipt.date}T12:00:00.000Z`);
        const start = new Date(
          receiptDate.getTime() - 7 * 86_400_000,
        ).toISOString();
        const end = new Date(
          receiptDate.getTime() + 7 * 86_400_000,
        ).toISOString();
        const { data: transactionRows, error: transactionError } = await admin
          .from("transactions")
          .select(
            "id,amount,date_time,title,description,plaid_transaction_id,quickbooks_external_id,pending",
          )
          .eq("org_id", organizationId)
          .eq("pending", false)
          .gte("date_time", start)
          .lte("date_time", end)
          .limit(250);
        if (transactionError) throw transactionError;
        transactionMatch = matchReceiptToTransaction(
          receipt,
          (transactionRows ?? []).map((row) => ({
            id: String(row.id),
            amount: Number(row.amount),
            date: row.date_time,
            title: row.title,
            description: row.description,
            plaidTransactionId: row.plaid_transaction_id,
            quickBooksExternalId: row.quickbooks_external_id,
          })),
        );
        if (
          transactionMatch.transactionId &&
          transactionMatch.transactionSource
        ) {
          const { error: linkError } = await admin
            .from("contractor_source_links")
            .upsert(
              {
                organization_id: organizationId,
                left_provider: "receipt",
                left_record_type: "contractor_receipt_extraction",
                left_record_id: sourceId,
                right_provider: transactionMatch.transactionSource,
                right_record_type: "transaction",
                right_record_id: transactionMatch.transactionId,
                confidence: transactionMatch.confidence,
                score: transactionMatch.score,
                match_reasons: transactionMatch.matchReasons,
                requires_confirmation: transactionMatch.requiresConfirmation,
                status: "suggested",
                calculation_version: transactionMatch.calculationVersion,
                updated_at: new Date().toISOString(),
              },
              {
                onConflict:
                  "organization_id,left_provider,left_record_type,left_record_id,right_provider,right_record_type,right_record_id",
              },
            );
          if (linkError) throw linkError;
        }
      }
      res.json({
        extractionId: extraction.id,
        receipt,
        jobMatch: match,
        transactionMatch,
        accountingEffect: "none",
      });
    } catch (error) {
      res
        .status(503)
        .json({
          error: "contractor_receipt_unavailable",
          message:
            error instanceof Error
              ? error.message
              : "Contractor receipt extraction is unavailable.",
        });
    }
  },
);

router.post(
  "/organizations/:organizationId/contractor-receipts/confirm-job-cost",
  requireAuth,
  async (req, res) => {
    const organizationId = Number(req.params.organizationId);
    const transactionId = Number(req.body?.transactionId);
    const sourceId = String(req.body?.sourceId ?? "")
      .trim()
      .slice(0, 300);
    const jobberJobId = String(req.body?.jobberJobId ?? "")
      .trim()
      .slice(0, 300);
    if (
      !Number.isSafeInteger(organizationId) ||
      organizationId <= 0 ||
      !Number.isSafeInteger(transactionId) ||
      transactionId <= 0 ||
      !sourceId ||
      !jobberJobId
    ) {
      res.status(400).json({ error: "invalid_confirmation" });
      return;
    }
    try {
      const admin = adminClient();
      const { data, error } = await admin.rpc(
        "confirm_contractor_receipt_job_cost",
        {
          requested_organization_id: organizationId,
          requested_auth_user_id: req.supabaseUserId!,
          requested_receipt_source_id: sourceId,
          requested_transaction_id: transactionId,
          requested_jobber_job_id: jobberJobId,
        },
      );
      if (error) throw error;
      const assignment = data?.[0];
      if (!assignment)
        throw new Error("The confirmed job cost was not returned.");
      res.json({
        confirmed: true,
        assignmentId: assignment.assignment_id,
        amount: Number(assignment.assigned_amount),
        sourceProvider: assignment.source_provider,
        accountingEffect: "none",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "The job cost could not be confirmed.";
      const invalid = /not found|pending|only expense/i.test(message);
      res
        .status(invalid ? 422 : 503)
        .json({
          error: invalid ? "confirmation_rejected" : "confirmation_unavailable",
          message,
        });
    }
  },
);

export default router;
