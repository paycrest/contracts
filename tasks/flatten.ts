import { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import fs from "fs";
import path from "path";

interface FlatTaskArguments {
  files?: string[];
}

export default async function (
  taskArguments: FlatTaskArguments,
  hre: HardhatRuntimeEnvironment,
) {
  const files = taskArguments.files ?? ["contracts/Gateway.sol"];
  let flattened = await hre.run("flatten:get-flattened-sources", { files });

  // Remove every line started with "// SPDX-License-Identifier:"
  flattened = flattened.replace(/SPDX-License-Identifier:/gm, "License-Identifier:");
  flattened = `// SPDX-License-Identifier: MIXED\n\n${flattened}`;

  // Remove every line started with "pragma experimental ABIEncoderV2;" except the first one
  flattened = flattened.replace(
    /pragma experimental ABIEncoderV2;\n/gm,
    ((i) => (m: string) => (!i++ ? m : ""))(0),
  );

  // Write to flattened/Gateway.sol
  const outputPath = path.join("flattened", "Gateway.sol");
  fs.writeFileSync(outputPath, flattened);
  console.log(`Flattened contract written to ${outputPath}`);
}
