import { readFileSync, writeFileSync } from "node:fs";
import { webcrypto } from "node:crypto";

const ITERATIONS = 210000;

const [input, output] = process.argv.slice(2);
const password = process.env.DEMOS_PASSWORD;

if (!password) {
  console.error("set DEMOS_PASSWORD");
  process.exit(1);
}

const salt = webcrypto.getRandomValues(new Uint8Array(16));
const iv = webcrypto.getRandomValues(new Uint8Array(12));

const base = await webcrypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(password),
  "PBKDF2",
  false,
  ["deriveKey"],
);

const key = await webcrypto.subtle.deriveKey(
  { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
  base,
  { name: "AES-GCM", length: 256 },
  false,
  ["encrypt"],
);

const plain = new TextEncoder().encode(readFileSync(input, "utf8"));
const sealed = await webcrypto.subtle.encrypt(
  { name: "AES-GCM", iv },
  key,
  plain,
);

const b64 = (bytes) => Buffer.from(bytes).toString("base64");

writeFileSync(
  output,
  JSON.stringify(
    {
      v: 1,
      iterations: ITERATIONS,
      salt: b64(salt),
      iv: b64(iv),
      data: b64(sealed),
    },
    null,
    2,
  ) + "\n",
);

console.log(
  `sealed ${input} -> ${output} (${(sealed.byteLength / 1024).toFixed(1)} KB)`,
);
