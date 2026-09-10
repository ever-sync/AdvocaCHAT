/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Opcional — ativa o SDK do Sentry no browser quando definido */
  readonly VITE_SENTRY_DSN?: string;
  /** Google reCAPTCHA v2 (checkbox). Omitir em dev desliga o captcha no login. */
  readonly VITE_RECAPTCHA_SITE_KEY?: string;
  /** Papel usado pelo mock de auth em E2E/Playwright. */
  readonly VITE_E2E_MOCK_ROLE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
