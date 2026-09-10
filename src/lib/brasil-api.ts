type BrasilApiCnpjResponse = {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  cep: string | null;
  logradouro: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  complemento: string | null;
  email: string | null;
  ddd_telefone_1: string | null;
};

type BrasilApiCepResponse = {
  cep: string;
  state: string;
  city: string;
  neighborhood: string;
  street: string;
};

export function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function formatCpf(value: string) {
  const digits = onlyDigits(value).slice(0, 11);

  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export function formatCnpj(value: string) {
  const digits = onlyDigits(value).slice(0, 14);

  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function formatCep(value: string) {
  const digits = onlyDigits(value).slice(0, 8);

  return digits.replace(/^(\d{5})(\d)/, "$1-$2");
}

export function formatPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 11);

  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }

  return digits
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

export async function fetchCnpjDetails(cnpj: string) {
  const digits = onlyDigits(cnpj);
  if (digits.length !== 14) {
    throw new Error("Informe um CNPJ com 14 digitos.");
  }

  const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
  if (!response.ok) {
    throw new Error("Nao encontrei dados para este CNPJ.");
  }

  return (await response.json()) as BrasilApiCnpjResponse;
}

export async function fetchCepDetails(cep: string) {
  const digits = onlyDigits(cep);
  if (digits.length !== 8) {
    throw new Error("Informe um CEP com 8 digitos.");
  }

  const response = await fetch(`https://brasilapi.com.br/api/cep/v1/${digits}`);
  if (!response.ok) {
    throw new Error("Nao encontrei dados para este CEP.");
  }

  return (await response.json()) as BrasilApiCepResponse;
}

export function isValidCnpj(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length !== 14) return false;
  if (/^(\d)\1+$/.test(digits)) return false;

  let size = digits.length - 2;
  let numbers = digits.substring(0, size);
  const checkDigits = digits.substring(size);
  let sum = 0;
  let pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += Number(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== Number(checkDigits.charAt(0))) return false;

  size = size + 1;
  numbers = digits.substring(0, size);
  sum = 0;
  pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += Number(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== Number(checkDigits.charAt(1))) return false;

  return true;
}
