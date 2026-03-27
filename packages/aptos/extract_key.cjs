"use strict"
Object.defineProperty(exports, "__esModule", { value: true })
const ts_sdk_1 = require("@aptos-labs/ts-sdk")
const mnemonic = "chalk witness chuckle fee obvious lizard huge reward piece bread staff chuckle"
try {
  // Deriving account from mnemonic (Path: m/44'/637'/0'/0'/0')
  const account = ts_sdk_1.Ed25519Account.fromDerivationPath({
    path: "m/44'/637'/0'/0'/0",
    mnemonic: mnemonic,
  })
  console.log(`ADDRESS=${account.accountAddress.toString()}`)
  console.log(`PRIVATE_KEY=${account.privateKey.toString()}`)
} catch (e) {
  console.error("Error:", e)
}
