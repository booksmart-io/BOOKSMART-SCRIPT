import type { RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { securityAuditAdminClient, type SecurityAuditEventType, writeSecurityAuditEvent } from "../lib/security-audit";

export function describeSecuritySensitiveRequest(method: string, path: string): { eventType: SecurityAuditEventType; action: string; provider?: string } | null {
  if (method === "POST" && path === "/api/account/export") return { eventType: "data_export", action: "download" };
  if (method === "DELETE" && path === "/api/account") return { eventType: "account_deletion", action: "delete" };
  const integration = path.match(/^\/api\/(?:integrations\/(quickbooks|jobber|gmail)\/(connect|callback|disconnect)|plaid\/(link-token|exchange-public-token)|plaid\/items\/[^/]+)$/);
  if (integration) return { eventType: "integration_connection", provider: integration[1] ?? "plaid", action: integration[2] ?? (method === "DELETE" ? "disconnect" : "connect") };
  if (method === "PATCH" && /^\/api\/cpa\/orders\/[^/]+$/.test(path)) return { eventType: "cpa_order_change", action: "status_change" };
  if (path === "/api/admin/set-token-balance") return { eventType: "admin_account_change", action: "token_balance" };
  if (path === "/api/admin/set-plan") return { eventType: "admin_account_change", action: "plan" };
  if (method === "DELETE" && /^\/api\/admin\/users\/[^/]+$/.test(path)) return { eventType: "admin_account_change", action: "delete_user" };
  if (method === "PATCH" && /^\/api\/admin\/cpas\/[^/]+\/verification$/.test(path)) return { eventType: "admin_role_change", action: "cpa_verification" };
  return null;
}

export const securityAuditMiddleware: RequestHandler = (req, res, next) => {
  const description = describeSecuritySensitiveRequest(req.method, req.originalUrl.split("?")[0]);
  if (!description) { next(); return; }
  const eventKey = randomUUID();
  res.once("finish", () => {
    const callbackFailed = description.action === "callback"
      && /[?&](?:result|quickbooks|jobber|gmail)=error(?:&|$)/.test(String(res.getHeader("location") ?? ""));
    const outcome = callbackFailed ? "failed" : res.statusCode >= 200 && res.statusCode < 400 ? "succeeded" : [401, 403, 404].includes(res.statusCode) ? "denied" : "failed";
    const rawOrganizationId = req.body?.organization_id ?? req.body?.org_id ?? req.query?.organization_id ?? req.query?.org_id ?? null;
    const organizationId = Array.isArray(rawOrganizationId) ? rawOrganizationId[0] : rawOrganizationId;
    const rawTarget = req.params?.userId ?? req.params?.cpaId ?? req.params?.orderId ?? req.params?.itemId ??
      req.body?.userId ?? req.body?.order_id ?? pathTarget(req.originalUrl.split("?")[0]);
    const target = Array.isArray(rawTarget) ? rawTarget[0] : rawTarget;
    try {
      void writeSecurityAuditEvent(securityAuditAdminClient(), { eventKey, eventType: description.eventType, outcome,
        actorAuthId: req.supabaseUserId, organizationId, target, metadata: { action: description.action,
          ...(description.provider ? { provider: description.provider } : {}), status_code: res.statusCode } }).catch(() => {
            req.log?.error({ eventType: description.eventType }, "Security audit write failed");
          });
    } catch { req.log?.error({ eventType: description.eventType }, "Security audit is not configured"); }
  });
  next();
};

function pathTarget(path: string) {
  const match = path.match(/^\/api\/(?:admin\/(?:users|cpas)|cpa\/orders|plaid\/items)\/([^/]+)/);
  return match?.[1] ?? null;
}
