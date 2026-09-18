import { resolve } from "node:path";
import { FeasibilityGatewayService } from "@handshake/application";
import { SqliteHandshakeStore } from "@handshake/sqlite-store";
import { createGatewayHttpServer } from "./http-server.js";

const port = parsePort(process.env.PORT);
const databasePath = resolve(process.env.HANDSHAKE_DB_PATH ?? "./var/handshake.sqlite");
const store = new SqliteHandshakeStore({ path: databasePath });
const service = new FeasibilityGatewayService({ store });
const server = createGatewayHttpServer({
  service,
  healthCheck: () => store.healthCheck(),
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Handshake feasibility Gateway listening on http://127.0.0.1:${port}`);
  console.log(`SQLite database: ${databasePath}`);
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
  const portNumber = value === undefined ? 3210 : Number(value);
  if (!Number.isSafeInteger(portNumber) || portNumber < 1 || portNumber > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  return portNumber;
}
