import { loadEnv } from 'vite';
const env = { ...loadEnv('production', process.cwd(), ''), ...process.env };
for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
  if (!env[key]?.trim()) throw new Error(`Missing required production variable: ${key}`);
}
const url = new URL(env.VITE_SUPABASE_URL);
if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
  throw new Error('Supabase must use HTTPS outside localhost');
}
if (env.VITE_E2E_MOCK_AUTH === 'true') throw new Error('Production builds cannot use mock authentication');
if (env.VITE_SUPABASE_ANON_KEY.startsWith('sb_secret_')) throw new Error('Private Supabase key cannot be bundled');
try {
  const payload = JSON.parse(Buffer.from(env.VITE_SUPABASE_ANON_KEY.split('.')[1], 'base64url').toString());
  if (payload.role === 'service_role') throw new Error('Private service_role key cannot be bundled');
} catch (error) {
  if (error instanceof Error && error.message.includes('cannot be bundled')) throw error;
}
