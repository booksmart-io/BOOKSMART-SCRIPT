import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBusinessDocumentPrefill,
  preserveEnteredBusinessDocumentFields,
  safelyMapEntityType,
} from "./business-document-prefill";

const states = [
  { id: 5, name: "California", code: "CA" },
  { id: 8, name: "Delaware", code: "DE" },
];

test("maps only unambiguous entity types", () => {
  assert.equal(safelyMapEntityType("Single-Member LLC"), "Single Member LLC");
  assert.equal(safelyMapEntityType("Nonprofit Corporation"), "Nonprofit");
  assert.equal(safelyMapEntityType("Sole Proprietorship"), "Sole Proprietor");
  assert.equal(safelyMapEntityType("Limited Partnership"), "Limited Partnership");
  assert.equal(safelyMapEntityType("Limited Liability Partnership"), "LLP");
  assert.equal(safelyMapEntityType("Limited Liability Company"), null);
  assert.equal(safelyMapEntityType("Corporation"), null);
});

test("maps explicit registration facts into existing form fields", () => {
  const result = buildBusinessDocumentPrefill({
    businessName: "Example Ventures LLC",
    entityType: "Single-Member LLC",
    formationState: "DE",
    formationDate: "2025-04-03",
    principalAddress: {
      street: "100 Market Street",
      suite: "Suite 200",
      city: "San Francisco",
      state: "CA",
      postalCode: "94105",
      country: "United States",
    },
    registrationNumber: "2025-1234567",
    registeredAgent: null,
    organizers: [],
    warnings: [],
  }, states);

  assert.deepEqual(result, {
    businessName: "Example Ventures LLC",
    orgType: "Single Member LLC",
    stateIncorporation: "Delaware",
    stateId: "5",
    yearEstablished: "2025",
    startDate: "2025-04-03",
    street: "100 Market Street",
    suite: "Suite 200",
    city: "San Francisco",
    zip: "94105",
    country: "United States",
    stateRegistrationNumber: "2025-1234567",
  });
});

test("does not invent or map ambiguous values", () => {
  const result = buildBusinessDocumentPrefill({
    businessName: null,
    entityType: "LLC",
    formationState: "Unknown",
    formationDate: "April 2025",
    principalAddress: null,
    registrationNumber: null,
    registeredAgent: null,
    organizers: [],
    warnings: [],
  }, states);

  assert.deepEqual(result, {});
});

test("document prefill fills empty fields without overwriting entered values", () => {
  const result = preserveEnteredBusinessDocumentFields(
    {
      businessName: "Typed Name LLC",
      street: "",
      stateRegistrationNumber: "MANUAL-123",
    },
    {
      businessName: "Extracted Name LLC",
      street: "100 Extracted Street",
      stateRegistrationNumber: "DOC-456",
    },
  );
  assert.equal(result.businessName, "Typed Name LLC");
  assert.equal(result.street, "100 Extracted Street");
  assert.equal(result.stateRegistrationNumber, "MANUAL-123");
});
