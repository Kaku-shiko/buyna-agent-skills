// @lovable.dev/vite-tanstack-config already includes these plugins; do not add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig, type LovableViteTanstackOptions } from "@lovable.dev/vite-tanstack-config";

const nitroConfig = {
  hooks: {
    "rollup:before": (_nitro: unknown, rollupConfig: { platform?: unknown }) => {
      delete rollupConfig.platform;
    },
  },
} as unknown as LovableViteTanstackOptions["nitro"];

function isDependencyUseClientDirective(log: unknown) {
  const message =
    typeof log === "object" && log && "message" in log ? String(log.message) : String(log);

  return (
    message.includes("Module level directives") &&
    message.includes('"use client"') &&
    message.includes("node_modules")
  );
}

export default defineConfig({
  nitro: nitroConfig,
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    environments: {
      client: {
        build: {
          rollupOptions: {
            output: {
              manualChunks: {
                "vendor-react": [
                  "react",
                  "react/jsx-runtime",
                  "react/jsx-dev-runtime",
                  "react-dom",
                  "react-dom/client",
                ],
              },
            },
          },
        },
      },
    },
    build: {
      rollupOptions: {
        onLog(level, log, handler) {
          if (level === "warn" && isDependencyUseClientDirective(log)) {
            return;
          }
          handler(level, log);
        },
      },
    },
  },
});
