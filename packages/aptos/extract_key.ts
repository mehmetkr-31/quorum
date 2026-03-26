import { Ed25519Account } from "@aptos-labs/ts-sdk";

const mnemonic = "chalk witness chuckle fee obvious lizard huge reward piece bread staff chuckle";

try {
  // Deriving account from mnemonic (Path: m/44'/637'/0'/0'/0')
  const account = Ed25519Account.fromDerivationPath({ path: "m/44'/637'/0'/0'/0", mnemonic: mnemonic });
  console.log("ADDRESS=" + account.accountAddress.toString());
  console.log("PRIVATE_KEY=" + account.privateKey.toString());
} catch (e) {
  console.error("Error:", e);
}
