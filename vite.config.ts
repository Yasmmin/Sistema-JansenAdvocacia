import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig(async () => {
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_SEND_METRICS ??= "false";
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
  plugins: [react(), cloudflare({ inspectorPort: false })],
  resolve: {
    alias: [
      { find: "@/db/schema", replacement: fromRoot("./server/db/schema.ts") },
      { find: "@/db", replacement: fromRoot("./server/db/index.ts") },
      { find: "@/lib/calendar", replacement: fromRoot("./src/features/calendario/calendar.ts") },
      { find: "@/lib/datajud", replacement: fromRoot("./server/services/datajud.ts") },
      { find: "@/lib/djen", replacement: fromRoot("./server/services/djen.ts") },
      { find: "@/lib/google-calendar", replacement: fromRoot("./server/services/google-calendar.ts") },
      { find: "@/lib/legal", replacement: fromRoot("./src/features/processos/legal.ts") },
      { find: "@/lib/sync", replacement: fromRoot("./server/services/sync.ts") },
      { find: "@/lib/tasks", replacement: fromRoot("./src/features/tarefas/tasks.ts") },
      { find: "@/lib/utils", replacement: fromRoot("./src/utils/cn.ts") },
      { find: "@server", replacement: fromRoot("./server") },
      { find: "@", replacement: fromRoot("./src") },
    ],
  },
  server: { host: "127.0.0.1", port: 8787, strictPort: true },
  preview: { host: "127.0.0.1", port: 8787, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("node_modules/chart.js") || id.includes("node_modules/react-chartjs-2")) return "charts";
          if (id.includes("node_modules/@fullcalendar")) return "calendar";
          return undefined;
        },
      },
    },
  },
  };
});
