import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { getRecaptchaSiteKey, isRecaptchaEnabled } from "./recaptcha";

describe("recaptcha", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_RECAPTCHA_SITE_KEY", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("desabilita quando nao ha chave configurada", () => {
    expect(getRecaptchaSiteKey()).toBeNull();
    expect(isRecaptchaEnabled()).toBe(false);
  });

  it("habilita quando VITE_RECAPTCHA_SITE_KEY esta definida", () => {
    vi.stubEnv("VITE_RECAPTCHA_SITE_KEY", "minha-chave");
    expect(getRecaptchaSiteKey()).toBe("minha-chave");
    expect(isRecaptchaEnabled()).toBe(true);
  });
});
