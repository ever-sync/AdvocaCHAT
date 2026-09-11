import { expect, it } from "vitest";
import type { LegalOperationsProps } from "../operations/operations-ui";
import type { CareContext } from "./types";
import {
  careLocalDateTime,
  careTimestamp,
  visibleCareContext,
} from "./client-care-ui";
const reader = {
  workspace: { user_id: "reader" },
  legalCase: { id: "case", owner_id: "owner" },
  canEdit: false,
  member: { can_view_medical: false, can_view_fiscal: false },
} as unknown as LegalOperationsProps;
it("removes owner contact data and protected cached rows after a known grant change", () => {
  const cached = {
    memberships: [
      {
        id: "membership",
        case_id: "case",
        access_kind: "client",
        scopes: ["messages:read"],
        allow_medical: true,
        allow_fiscal: true,
        revision: 1,
        expires_at: "2099-01-01",
        public_title: "Acesso publicado",
        state: "active",
        verified_email: "private@example.invalid",
        identity_id: "private-identity",
        party_id: "private-party",
      },
    ],
    invites: [{ id: "invite-private" }],
    representation_grants: [{ id: "grant-private" }],
    publications: [
      { id: "general", category: "general" },
      { id: "medical", category: "medical" },
    ],
    releases: [{ id: "fiscal", category: "fiscal" }],
    exports: [{ id: "export" }],
    requests: [],
    communications: [{ id: "message", category: "medical" }],
    jobs: [{ id: "job", communication_id: "message" }],
    receipts: [{ id: "receipt", job_id: "job" }],
    messages: [{ id: "fiscal-message", category: "fiscal" }],
    followup_rules: [{ id: "followup" }],
  } as unknown as CareContext;
  const current = visibleCareContext(reader, cached);
  expect(current.memberships[0]).not.toHaveProperty("verified_email");
  expect(current.memberships[0]).not.toHaveProperty("identity_id");
  expect(current.memberships[0]).not.toHaveProperty("party_id");
  expect(current.publications.map((row) => row.id)).toEqual(["general"]);
  for (const key of [
    "invites",
    "representation_grants",
    "releases",
    "exports",
    "communications",
    "jobs",
    "receipts",
    "messages",
    "followup_rules",
  ] as const)
    expect(current[key]).toHaveLength(0);
  expect(cached.memberships[0].verified_email).toBe("private@example.invalid");
});
it("interprets operational form times in Brasilia regardless of the browser time zone", () => {
  expect(careTimestamp("2026-09-11T15:30")).toBe("2026-09-11T18:30:00.000Z");
  expect(careLocalDateTime("2026-09-11T18:30:00Z")).toBe("2026-09-11T15:30");
});
