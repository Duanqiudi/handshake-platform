import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import process from "node:process";

const workspaceRoot = process.cwd();
const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts"]);
const ignoredDirectories = new Set(["node_modules", "dist", "coverage", ".git"]);

const rules = [
  {
    directory: join(workspaceRoot, "packages", "hsp-contracts"),
    forbidden: ["@handshake/"],
    reason: "hsp-contracts must remain the dependency root",
  },
  {
    directory: join(workspaceRoot, "packages", "domain"),
    forbidden: ["@handshake/data-access", "@handshake/model-adapters", "/apps/"],
    reason: "domain code must not depend on infrastructure, providers, or applications",
  },
  {
    directory: join(workspaceRoot, "packages", "application"),
    forbidden: ["@handshake/sqlite-store", "/apps/", "node:http", "node:sqlite"],
    reason: "application use cases must depend on ports, not HTTP or concrete persistence",
  },
  {
    directory: join(workspaceRoot, "packages", "product-application"),
    forbidden: ["@handshake/product-sqlite-store", "/apps/", "node:http", "node:sqlite"],
    reason:
      "product-application use cases must depend on ProductStore, not HTTP or concrete persistence",
  },
  {
    directory: join(workspaceRoot, "packages"),
    forbidden: ["/apps/"],
    reason: "shared packages must never import deployable applications",
  },
  {
    directory: join(workspaceRoot, "apps", "reference-agent"),
    forbidden: ["@handshake/application", "@handshake/sqlite-store", "@handshake/gateway-api"],
    reason: "reference-agent must retain its local trust boundary and not reach platform internals",
  },
];

async function collectSourceFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectSourceFiles(path)));
    if (entry.isFile() && sourceExtensions.has(extname(entry.name))) files.push(path);
  }
  return files;
}

const violations = [];
for (const rule of rules) {
  for (const file of await collectSourceFiles(rule.directory)) {
    const content = await readFile(file, "utf8");
    for (const forbidden of rule.forbidden) {
      if (content.includes(forbidden)) {
        violations.push(
          `${relative(workspaceRoot, file).split(sep).join("/")}: contains forbidden dependency ` +
            `${JSON.stringify(forbidden)} (${rule.reason})`,
        );
      }
    }
  }
}

if (violations.length > 0) {
  console.error(`Architecture boundary violations:\n${violations.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("Architecture boundaries are valid.");
}
