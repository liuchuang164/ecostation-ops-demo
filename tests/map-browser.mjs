// Compatibility entry point for the former photograph-map checks.
// The active map now uses GIS coordinates; run its current browser acceptance suite.
import { spawnSync } from "node:child_process";
const result = spawnSync(process.execPath, ["--import", "tsx", "tests/gis-browser.mjs"], {
  stdio: "inherit",
  env: process.env,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
