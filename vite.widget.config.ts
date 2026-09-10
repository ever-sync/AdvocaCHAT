import fs from "fs";
import path from "path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";

/** Garante /embed/ → index.html (Vercel/serve resolve diretório). */
function embedIndexHtmlPlugin(): Plugin {
  return {
    name: "embed-index-html",
    closeBundle() {
      const outDir = path.resolve(__dirname, "dist/embed");
      const src = path.join(outDir, "embed.html");
      const dest = path.join(outDir, "index.html");
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
      }
    },
  };
}

/** Preconnect ao Supabase no HTML do widget (antes do JS baixar). */
function embedPreconnectPlugin(): Plugin {
  return {
    name: "embed-preconnect",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        const env = loadEnv(ctx.server ? "development" : "production", process.cwd(), "");
        const supabaseUrl = env.VITE_SUPABASE_URL?.trim().replace(/\/$/, "");
        if (!supabaseUrl) {
          return html;
        }
        const tags = [
          `<link rel="preconnect" href="${supabaseUrl}" crossorigin />`,
          `<link rel="dns-prefetch" href="${supabaseUrl}" />`,
        ].join("\n    ");
        return html.replace("</head>", `    ${tags}\n  </head>`);
      },
    },
  };
}

// Build separado e leve do widget público de formulários.
// Sai em dist/embed (servido em <origin>/embed/), sem o bundle do app principal.
// Roda DEPOIS do `vite build` principal (o build principal limpa dist/).
export default defineConfig({
  base: "/embed/",
  publicDir: false,
  plugins: [react(), embedPreconnectPlugin(), embedIndexHtmlPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist/embed",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "embed.html"),
      output: {
        manualChunks: undefined,
      },
    },
    target: "es2020",
    minify: "esbuild",
  },
});
