import { render, screen } from "@testing-library/react";
import type { InputHTMLAttributes } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Login from "./Login";

const resendSignUpConfirmation = vi.fn();

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    signIn: vi.fn(),
    verifyMfa: vi.fn(),
    resendSignUpConfirmation,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ onCheckedChange, ...props }: InputHTMLAttributes<HTMLInputElement> & {
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <input
      type="checkbox"
      {...props}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
    />
  ),
}));

vi.mock("@/lib/recaptcha", () => ({
  getRecaptchaSiteKey: () => "",
  isRecaptchaEnabled: () => false,
  verifyRecaptchaToken: vi.fn(),
}));

describe("confirmação de cadastro", () => {
  beforeEach(() => {
    sessionStorage.clear();
    resendSignUpConfirmation.mockReset();
  });

  it("mostra o endereço pendente e a ação de reenvio", () => {
    sessionStorage.setItem("advocachat-pending-confirmation-email", "advogada@example.com");

    render(
      <MemoryRouter initialEntries={["/login?cadastro=confirmar-email"]}>
        <Login />
      </MemoryRouter>,
    );

    expect(screen.getByText(/link enviado para advogada@example\.com/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reenviar e-mail de confirmação" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue("advogada@example.com");
  });

  it("informa o retorno concluído", () => {
    render(
      <MemoryRouter initialEntries={["/login?cadastro=confirmado"]}>
        <Login />
      </MemoryRouter>,
    );

    expect(screen.getByText("E-mail confirmado. Entre para acessar o seu escritório.")).toBeInTheDocument();
  });
});
