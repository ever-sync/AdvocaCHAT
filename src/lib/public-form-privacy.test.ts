import { describe, expect, it } from "vitest";
import {
  collectPublicFormMetadata,
  sanitizePublicFormEventMetadata,
  sanitizePublicFormMetadata,
  sanitizePublicReferralUrl,
} from "../../supabase/functions/_shared/public-form-privacy";
import documentPage from "../pages/Documentos.tsx?raw";
import inboxPage from "../pages/Inbox.tsx?raw";

describe("public form metadata privacy", () => {
  it("strips tokens, client identifiers, path segments, credentials and fragments while retaining UTM attribution", () => {
    const safe = sanitizePublicReferralUrl(
      "https://user:password@example.com/client/12345678900?email=client%40example.com&token=secret&utm_source=google&utm_campaign=IR+2026#medical-diagnosis",
    );
    expect(safe).toBe("https://example.com/?utm_source=google&utm_campaign=IR+2026");
  });

  it.each(["javascript:alert(1)", "data:text/plain,secret", "/relative?token=secret", "not a URL", null])(
    "does not persist non-web referrers: %s", (value) => expect(sanitizePublicReferralUrl(value)).toBeUndefined(),
  );

  it("collects marketing attribution without importing other landing-page query values", () => {
    expect(collectPublicFormMetadata(
      "?utm_source=google&utm_medium=cpc&utm_campaign=IR&utm_term=isencao&utm_content=ad1&gclid=click-123&email=private%40example.com&token=secret&_variant_id=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "https://example.com/medical-record?cpf=12345678900&utm_source=partner",
    )).toEqual({
      utm_source: "google", utm_medium: "cpc", utm_campaign: "IR", utm_term: "isencao", utm_content: "ad1", gclid: "click-123",
      variant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", referrer: "https://example.com/?utm_source=partner",
    });
  });

  it("applies the same boundary to a direct POST and nested attribution before storage/webhook", () => {
    const meta = sanitizePublicFormMetadata({
      utm_source: "newsletter", time_to_complete_seconds: 35, referrer: "https://example.com/path?token=secret",
      email: "private@example.com", access_token: "secret", arbitrary_url: "https://example.com/?cpf=12345678900",
      score: 999, ip_address: "forged", user_agent: "forged", variant_id: "not-a-uuid",
      attribution: {
        utm_campaign: "IR", client: { email: "private@example.com" },
        first_touch: { url: "https://example.com/private/123?email=private&utm_source=google", utm_source: "google", token: "secret" },
        last_touch: { landing_page: "https://example.com/path#secret", utm_medium: "cpc" },
      },
    });
    expect(meta).toEqual({
      utm_source: "newsletter", time_to_complete_seconds: 35, referrer: "https://example.com/",
      attribution: {
        utm_campaign: "IR",
        first_touch: { url: "https://example.com/?utm_source=google", utm_source: "google" },
        last_touch: { landing_page: "https://example.com/", utm_medium: "cpc" },
      },
    });
  });

  it("preserves form interaction metrics without collecting arbitrary metadata or answers", () => {
    expect(sanitizePublicFormEventMetadata({
      multi_step: true, total_fields: 4, total_steps: 2, step_index: 1, step_title: "Contato", last_field: "email",
      referrer: "https://example.com/path?token=secret", answer: "private@example.com", urls: ["https://example.com/?token=secret"],
    })).toEqual({
      multi_step: true, total_fields: 4, total_steps: 2, step_index: 1, step_title: "Contato", last_field: "email",
      referrer: "https://example.com/",
    });
  });
});

describe("retired legacy public document generators", () => {
  it.each([documentPage, inboxPage])("contains no HMAC/public-PII link generator and offers case-based collection", (source) => {
    expect(source).not.toMatch(/signUrlParams|\/anamnese\/preencher|\/orcamento\/aprovar|generated(?:Anamnese|Orcamento|InboxDoc)Link/);
    expect(source).toContain('navigate("/casos")');
    expect(source).toContain("Coleta segura no caso");
  });
});
