const readline = require("readline");
const dotenv = require("dotenv");

dotenv.config();

/**
 * Asserts that environment variables are set as expected
 */
const assertEnvironment = () => {
  if (!process.env.DEPLOYER_PRIVATE_KEY) {
    console.error("Please set your DEPLOYER_PRIVATE_KEY in a .env file");
  }
  if (!process.env.TREASURY_ADDRESS) {
    console.error("Please set your TREASURY_ADDRESS in a .env file");
  }
};

/**
 * Helper method for waiting on user input. Source: https://stackoverflow.com/a/50890409
 * @param query
 */
async function waitForInput(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

/**
 * Helper method for confirming user input
 *
 * @param params
 */
async function confirmContinue(params) {
  console.log("\nPARAMETERS");
  console.table(params);

  const response = await waitForInput("\nDo you want to continue? y/N\n");
  if (response !== "y")
    throw new Error("Aborting script: User chose to exit script");
  console.log("\n");
}

module.exports = {
  assertEnvironment,
  confirmContinue,
  waitForInput,
}