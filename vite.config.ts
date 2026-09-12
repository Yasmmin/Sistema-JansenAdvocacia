import vinext from "vinext";
import { defineConfig } from "vite";

const localBindingConfig = {
  main: "vinext/server/fetch-handler",
  d1_databases: [
    {
      binding: "DB",
      database_name: "jansen-djen-local",
      database_id: "00000000-0000-4000-8000-000000000000",
    },
  ],
};

export default defineConfig(async () => {
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
  process.env.WRANGLER_SEND_METRICS ??= "false";

  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: localBindingConfig,
      }),
    ],
  };
});
