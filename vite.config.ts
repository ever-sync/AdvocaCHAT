import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname), "");
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = env.VITE_SUPABASE_ANON_KEY?.trim();
  if (mode === "production" && (!url || !key)) {
    console.warn(
      "⚠️ [Vite] VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não definidas. Configure seu arquivo .env para conectar ao Supabase em produção.",
    );
  }

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            "react-vendor": ["react", "react-dom", "react-router-dom"],
            "supabase-vendor": ["@supabase/supabase-js"],
            "query-vendor": ["@tanstack/react-query", "@tanstack/react-virtual"],
            "chart-vendor": ["recharts"],
          },
        },
      },
    },
  };
});
