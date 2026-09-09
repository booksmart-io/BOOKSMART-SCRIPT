import assert from "node:assert/strict";
import test from "node:test";
import { extractUpcomingObligations, type GmailObligationMessage } from "./contractor-obligations";

test("extracts explicit upcoming obligations once", () => {
  const rows: GmailObligationMessage[] = [
    { id: "p1", sender: "payroll@example.test", subject: "Upcoming payroll debit $18,000 scheduled for September 5, 2026", messageDate: "2026-08-28T12:00:00Z", documentType: "payroll_notice", confidence: "high" },
    { id: "p2", sender: "payroll@example.test", subject: "Reminder: payroll $18,000 due September 5, 2026", messageDate: "2026-08-29T12:00:00Z", documentType: "payroll_notice", confidence: "medium" },
    { id: "v1", sender: "vendor@example.test", subject: "Supplier invoice $7,500 due 2026-09-08", messageDate: "2026-08-28T12:00:00Z", documentType: "vendor_invoice", confidence: "medium" },
  ];
  assert.deepEqual(extractUpcomingObligations(rows, new Date("2026-08-31T12:00:00Z")).map(row => [row.kind, row.amount, row.dueDate]), [["payroll", 18_000, "2026-09-05"], ["vendor_bill", 7_500, "2026-09-08"]]);
});

test("rejects paid or unsupported obligation claims", () => {
  const base = { sender: "x@example.test", messageDate: "2026-08-28T12:00:00Z", documentType: "payroll_notice", confidence: "high" as const };
  const rows: GmailObligationMessage[] = [
    { ...base, id: "paid", subject: "Payroll $1,000 paid September 1, 2026" }, { ...base, id: "missing", subject: "Payroll due September 1, 2026" },
    { ...base, id: "past", subject: "Payroll $1,000 due July 1, 2026" }, { ...base, id: "distant", subject: "Payroll $1,000 due December 1, 2026" },
    { ...base, id: "low", subject: "Payroll $1,000 due September 1, 2026", confidence: "low" }, { ...base, id: "dismissed", subject: "Payroll $1,000 due September 1, 2026", status: "dismissed" },
  ];
  assert.deepEqual(extractUpcomingObligations(rows, new Date("2026-08-31T12:00:00Z")), []);
});
