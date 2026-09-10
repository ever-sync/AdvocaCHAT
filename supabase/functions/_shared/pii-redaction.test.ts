// Rodar com: deno test supabase/functions/_shared/pii-redaction.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { redactPii } from "./pii-redaction.ts";

Deno.test("CPF com máscara", () => {
  // Pessoa fictícia; CPF válido pelo DV ("111.444.777-35" é exemplo da Receita).
  assertEquals(
    redactPii("meu cpf é 111.444.777-35 ok"),
    "meu cpf é [CPF] ok",
  );
});

Deno.test("CPF sem máscara", () => {
  assertEquals(redactPii("11144477735"), "[CPF]");
});

Deno.test("CPF inválido fica intacto (DV errado)", () => {
  assertEquals(redactPii("123.456.789-00"), "123.456.789-00");
});

Deno.test("CPF com todos iguais é rejeitado (anti-falso-positivo)", () => {
  assertEquals(redactPii("111.111.111-11"), "111.111.111-11");
});

Deno.test("CNPJ válido com e sem máscara", () => {
  // 11.222.333/0001-81 — DV válido.
  assertEquals(redactPii("CNPJ 11.222.333/0001-81 da empresa"), "CNPJ [CNPJ] da empresa");
  assertEquals(redactPii("11222333000181"), "[CNPJ]");
});

Deno.test("Cartão Visa de teste é redigido (Luhn ok)", () => {
  // 4111 1111 1111 1111 é o cartão de teste padrão.
  assertEquals(
    redactPii("cartão 4111 1111 1111 1111 vence em 12/30"),
    "cartão [CARD] vence em 12/30",
  );
  assertEquals(redactPii("4111111111111111"), "[CARD]");
});

Deno.test("Sequência de 16 dígitos sem Luhn não é redigida", () => {
  assertEquals(redactPii("pedido 1234567890123456"), "pedido 1234567890123456");
});

Deno.test("RG formatado é redigido; sem máscara não (DV não padronizado)", () => {
  assertEquals(redactPii("RG 12.345.678-9"), "RG [RG]");
  assertEquals(redactPii("RG 123456789 do cliente"), "RG 123456789 do cliente");
});

Deno.test("Telefone fica intacto (a IA precisa em set_custom_field)", () => {
  assertEquals(
    redactPii("meu telefone é (11) 99999-8888"),
    "meu telefone é (11) 99999-8888",
  );
});

Deno.test("E-mail fica intacto (a IA precisa em set_custom_field)", () => {
  assertEquals(redactPii("envia pra fulano@empresa.com"), "envia pra fulano@empresa.com");
});

Deno.test("Múltiplos PIIs no mesmo texto", () => {
  const input = "CPF 111.444.777-35, CNPJ 11.222.333/0001-81 e cartão 4111111111111111";
  assertEquals(redactPii(input), "CPF [CPF], CNPJ [CNPJ] e cartão [CARD]");
});

Deno.test("Texto vazio / null-like", () => {
  assertEquals(redactPii(""), "");
});

Deno.test("Data dd.mm.yyyy não é confundida com PII", () => {
  assertEquals(redactPii("vence em 31.12.2026"), "vence em 31.12.2026");
});
