import { readFile } from "node:fs/promises";
import process from "node:process";
import {
  type DisclosedCapsule,
  type LocalProfile,
  ReferenceAgent,
  RuleBasedCompatibilityEvaluator,
} from "./index.js";

interface EvaluateFile {
  readonly profile: LocalProfile;
  readonly candidate: DisclosedCapsule;
}

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (filePath === undefined) {
    throw new Error("Usage: reference-agent <experiment.json>");
  }
  const experiment = JSON.parse(await readFile(filePath, "utf8")) as EvaluateFile;
  const agent = new ReferenceAgent(new RuleBasedCompatibilityEvaluator());
  const result = agent.evaluateCandidate({
    profile: experiment.profile,
    candidate: experiment.candidate,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Reference Agent failed."}\n`);
  process.exitCode = 1;
});
