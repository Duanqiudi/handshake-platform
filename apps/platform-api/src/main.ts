import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ProductApplicationService } from "@handshake/product-application";
import { SqliteProductStore } from "@handshake/product-sqlite-store";
import { createPlatformHttpServer } from "./http-server.js";

const port = parsePort(process.env.PORT);
const host = process.env.HOST?.trim() || "127.0.0.1";
const databasePath = resolve(
  process.env.HANDSHAKE_PRODUCT_DB_PATH ?? "./var/handshake-product.sqlite",
);
const store = new SqliteProductStore({ path: databasePath });
const service = new ProductApplicationService({ store });
const productionStaticDirectory = fileURLToPath(new URL("../../member-web/dist/", import.meta.url));
const server = createPlatformHttpServer({
  service,
  healthCheck: () => store.healthCheck(),
  demoMode: process.env.HANDSHAKE_DEMO_MODE === "true",
  ...(process.env.HANDSHAKE_INVITE_CODE === undefined
    ? {}
    : { onboardingInviteCode: process.env.HANDSHAKE_INVITE_CODE }),
  corsAllowedOrigins: parseOrigins(process.env.HANDSHAKE_CORS_ORIGINS),
  ...(process.env.NODE_ENV === "production" ? { staticDirectory: productionStaticDirectory } : {}),
});

server.listen(port, host, () => {
  console.log(`Handshake Platform API listening on http://${host}:${port}`);
  console.log(`SQLite database: ${databasePath}`);
  if (process.env.NODE_ENV === "production") {
    console.log(`Member web directory: ${productionStaticDirectory}`);
  }
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => {
      store.close();
      process.exit(0);
    });
  });
}

function parsePort(value: string | undefined): number {
  const portNumber = value === undefined ? 3220 : Number(value);
  if (!Number.isSafeInteger(portNumber) || portNumber < 1 || portNumber > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  return portNumber;
}

function parseOrigins(value: string | undefined): string[] {
  return value === undefined
    ? []
    : [
        ...new Set(
          value
            .split(",")
            .map((origin) => origin.trim())
            .filter(Boolean),
        ),
      ];
}
