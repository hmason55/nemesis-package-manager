import { createPrivateKey } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
export function convertPrivateKey(pem) {
  return createPrivateKey(pem).export({ type: "pkcs8", format: "pem" });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (!process.argv[2]) {
    process.stderr.write(
      "Usage: node convert-private-key.mjs PATH_TO_KEY.pem | npx wrangler secret put GITHUB_PRIVATE_KEY ...\n",
    );
    process.exitCode = 1;
  } else
    try {
      process.stdout.write(convertPrivateKey(readFileSync(process.argv[2])));
    } catch {
      process.stderr.write(
        "Could not read or convert the private key. Check the file path and PEM format.\n",
      );
      process.exitCode = 1;
    }
}
