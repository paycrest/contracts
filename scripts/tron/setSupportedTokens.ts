import { getTronContracts } from "../utils";

async function main() {
  let gatewayInstance = await getTronContracts();

  let result = await gatewayInstance["getFeeDetails"]().call();
  console.log(result[0].toString(), result[1].toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
