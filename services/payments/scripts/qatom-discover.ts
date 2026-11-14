/**
 * Read-only: prints Qatom's live MCP tools with their input/output schemas and the raw wallet
 * response, so the unconfirmed field names in src/qatom/client.ts can be checked. Buys nothing.
 */
import { QatomClient, qatomConfigFromEnv } from "../src/qatom/index.js";

const client = await QatomClient.connect(qatomConfigFromEnv());
try {
  for (const tool of await client.listTools()) {
    console.log(`\n## ${tool.name}\n${tool.description ?? ""}`);
    console.log("input:", JSON.stringify(tool.inputSchema, null, 2));
    if (tool.outputSchema) console.log("output:", JSON.stringify(tool.outputSchema, null, 2));
  }
  try { console.log("\nagent wallet:", await client.getAgentWallet()); }
  catch (error) { console.log("\nagent wallet response not recognised:", error instanceof Error && "payload" in error ? JSON.stringify(error.payload, null, 2) : error); }
} finally {
  await client.close();
}
