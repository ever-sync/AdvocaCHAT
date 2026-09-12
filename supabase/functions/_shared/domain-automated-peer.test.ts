import { assertEquals } from "jsr:@std/assert@1";
import { detectAutomatedPeer } from "./domain.ts";

Deno.test("detectAutomatedPeer blocks explicit bot introductions", () => {
  assertEquals(
    detectAutomatedPeer("Olá! Aqui é o Rubinho, assistente virtual do credenciamento."),
    true,
  );
});

Deno.test("detectAutomatedPeer blocks instructions aimed at another bot", () => {
  assertEquals(
    detectAutomatedPeer("Teste de velocidade pronto. Responda apenas: teste"),
    true,
  );
});

Deno.test("detectAutomatedPeer blocks event automation without an introduction", () => {
  assertEquals(
    detectAutomatedPeer("Seu credenciamento para o evento foi concluído e a vaga está garantida."),
    true,
  );
});

Deno.test("detectAutomatedPeer keeps normal RecupereiBR lead messages", () => {
  assertEquals(detectAutomatedPeer("Oi, sou aposentado e pago imposto de renda."), false);
  assertEquals(detectAutomatedPeer("Quero saber se um assistente virtual pode me ajudar."), false);
});
