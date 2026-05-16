import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tronDeploy = path.join(__dirname, "..", "tron-deploy");

function ensureSymlink(name, target) {
  const linkPath = path.join(tronDeploy, name);
  try {
    fs.unlinkSync(linkPath);
  } catch {
    // ignore missing
  }
  fs.symlinkSync(target, linkPath);
}

try {
  ensureSymlink("contracts", "../contracts");
  ensureSymlink("node_modules", "../node_modules");
  console.log("[link-tron-deploy] tron-deploy symlinks: contracts, node_modules");
} catch (e) {
  console.warn(
    `[link-tron-deploy] could not create symlinks (TronBox may need manual links on Windows): ${e.message}`
  );
}
