// Manual test runner for the Flowcase findUser tool.
// Run with:   npx env-cmd --silent -f .localConfigs ts-node src/tools/flowcase/__manual-test.ts
// Or:         npx env-cmd --silent -f .localConfigs.playground ts-node src/tools/flowcase/__manual-test.ts

import { findFlowcaseUserTool } from "./findUserTool";

async function main() {
  const email = process.argv[2] ?? "ola.johannes.elvedahl@atea.no";

  console.log(`Looking up: ${email}`);
  console.log("FLOWCASE_BASE_URL =", process.env.FLOWCASE_BASE_URL ?? "(default)");
  console.log("FLOWCASE_API_KEY  =", process.env.FLOWCASE_API_KEY ? "(set)" : "(MISSING)");

  const result = await findFlowcaseUserTool.execute({ email });
  console.log("\nResult:");
  console.dir(result, { depth: null });
}

main().catch((err) => {
  console.error("\nTool threw:");
  console.error(err);
  process.exit(1);
});