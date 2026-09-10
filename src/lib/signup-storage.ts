import type { SignUpPayload } from "@/types/domain";

const SIGNUP_STORAGE_KEY = "distribuibot-signup";

export type SignUpDraft = Omit<SignUpPayload, "password"> & {
  senha: string;
  confirmar: string;
  termos: boolean;
  plano: string;
  billingPeriod: "mensal" | "anual";
};

export const defaultSignUpDraft: SignUpDraft = {
  nome: "",
  email: "",
  telefone: "",
  empresa: "",
  cnpj: "",
  senha: "",
  confirmar: "",
  termos: false,
  plano: "profissional",
  billingPeriod: "mensal",
};

export function readSignUpDraft(): SignUpDraft {
  if (typeof window === "undefined") {
    return defaultSignUpDraft;
  }

  const rawValue = window.sessionStorage.getItem(SIGNUP_STORAGE_KEY);
  if (!rawValue) {
    return defaultSignUpDraft;
  }

  try {
    return { ...defaultSignUpDraft, ...(JSON.parse(rawValue) as Partial<SignUpDraft>) };
  } catch {
    return defaultSignUpDraft;
  }
}

export function writeSignUpDraft(draft: Partial<SignUpDraft>) {
  if (typeof window === "undefined") {
    return;
  }

  const currentDraft = readSignUpDraft();
  window.sessionStorage.setItem(
    SIGNUP_STORAGE_KEY,
    JSON.stringify({ ...currentDraft, ...draft }),
  );
}

export function clearSignUpDraft() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(SIGNUP_STORAGE_KEY);
}
