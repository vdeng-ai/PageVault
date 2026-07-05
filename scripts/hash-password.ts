import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { pbkdf2Sha256 } from "../packages/core/src/hash.js";

async function readPassword(): Promise<string> {
  const provided = process.argv[2];
  if (provided) {
    return provided;
  }
  const rl = createInterface({ input, output });
  try {
    return await rl.question("Password: ");
  } finally {
    rl.close();
  }
}

const password = await readPassword();
if (!password) {
  throw new Error("Password is required");
}

console.log(await pbkdf2Sha256(password));
