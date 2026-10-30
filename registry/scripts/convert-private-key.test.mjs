import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateKeyPairSync,
  createPrivateKey,
  createPublicKey,
} from "node:crypto";
import { convertPrivateKey } from "./convert-private-key.mjs";
test("converts a GitHub-style RSA key without changing its public identity", () => {
  const key = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
  const input = key.export({ type: "pkcs1", format: "pem" });
  const converted = convertPrivateKey(input);
  assert.match(converted, /^-----BEGIN PRIVATE KEY-----/);
  assert.deepEqual(
    createPublicKey(createPrivateKey(converted)).export({
      type: "spki",
      format: "der",
    }),
    createPublicKey(key).export({ type: "spki", format: "der" }),
  );
});
