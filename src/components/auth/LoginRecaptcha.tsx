import { forwardRef, useMemo } from "react";
import ReCAPTCHA from "react-google-recaptcha";
import { getRecaptchaSiteKey } from "@/lib/recaptcha";

type LoginRecaptchaProps = {
  onChange: (token: string | null) => void;
  onExpired?: () => void;
};

export const LoginRecaptcha = forwardRef<ReCAPTCHA, LoginRecaptchaProps>(function LoginRecaptcha(
  { onChange, onExpired },
  ref,
) {
  const siteKey = useMemo(() => getRecaptchaSiteKey(), []);

  if (!siteKey) {
    return null;
  }

  return (
    <div className="flex origin-top justify-center overflow-hidden rounded-md border border-border bg-muted/20 py-0.5 scale-[0.92] sm:scale-100">
      <ReCAPTCHA ref={ref} sitekey={siteKey} onChange={onChange} onExpired={onExpired} hl="pt-BR" />
    </div>
  );
});
