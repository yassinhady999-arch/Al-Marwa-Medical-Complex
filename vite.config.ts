// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { loadEnv } from "vite";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Server routes read secrets such as ANTHROPIC_API_KEY or N8N_API_KEY from process.env, which
// the hosting platform fills in production. Mirror .env into it when running locally (dev /
// preview) so those features work there too; real environment variables still win.
if (!process.argv.includes("build")) {
  for (const [key, value] of Object.entries(loadEnv("development", process.cwd(), ""))) {
    process.env[key] ??= value;
  }
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    // Local dev compiles modules on first request; do it at startup instead so the
    // first visit to each section doesn't wait for it.
    server: {
      warmup: { clientFiles: ["./src/routes/**/*.tsx", "./src/components/**/*.tsx"] },
    },
  },
});
