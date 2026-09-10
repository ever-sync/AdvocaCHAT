/**
 * Comparação de strings em tempo constante para evitar timing side-channels
 * ao validar assinaturas, tokens e segredos.
 *
 * Observação: o tamanho das strings pode vazar pelo early-return; isso é
 * aceitável para os casos de uso aqui (assinaturas/tokens de tamanho fixo).
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
