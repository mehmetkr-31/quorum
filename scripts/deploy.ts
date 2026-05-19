import { execSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { Aptos, AptosConfig, Ed25519Account, Network } from "@aptos-labs/ts-sdk"
import { config } from "dotenv"

// 1. Load environment variables from apps/web/.env
const envPath = resolve(import.meta.dirname, "../apps/web/.env")
if (existsSync(envPath)) {
  config({ path: envPath })
}

// 2. Determine accounts
const mnemonic = "chalk witness chuckle fee obvious lizard huge reward piece bread staff chuckle"
let account0: Ed25519Account
let account1: Ed25519Account

try {
  account0 = Ed25519Account.fromDerivationPath({
    path: "m/44'/637'/0'/0'/0",
    mnemonic: mnemonic,
  })
  account1 = Ed25519Account.fromDerivationPath({
    path: "m/44'/637'/0'/0'/1",
    mnemonic: mnemonic,
  })
} catch (e) {
  console.error("❌ Failed to derive accounts from mnemonic:", e)
  process.exit(1)
}

const address = account1.accountAddress.toString()
const privateKey = account1.privateKey.toString()
const nodeUrl = process.env.VITE_APTOS_NODE_URL || "https://fullnode.testnet.aptoslabs.com/v1"

console.log("==========================================")
console.log("🚀 Quorum — Automatic Testnet Deployer")
console.log("==========================================")
console.log(`Funder Address (index 0): ${account0.accountAddress.toString()}`)
console.log(`Deployer Address (index 1): ${address}`)
console.log(`Network URL:               ${nodeUrl}`)
console.log("------------------------------------------")

// 2.2 Pre-funding check
console.log("🚰 Checking deployer balance and pre-funding...")
const aptos = new Aptos(new AptosConfig({ network: Network.TESTNET }))
try {
  let bal1 = 0
  try {
    bal1 = await aptos.getAccountAPTAmount({ accountAddress: account1.accountAddress })
  } catch (err) {
    // Account might not exist on-chain yet, balance is 0
  }

  console.log(`Deployer balance: ${bal1 / 100_000_000} APT`)
  if (bal1 < 10_000_000) {
    // Less than 0.1 APT
    const bal0 = await aptos.getAccountAPTAmount({ accountAddress: account0.accountAddress })
    console.log(`Funder balance:   ${bal0 / 100_000_000} APT`)

    if (bal0 > 60_000_000) {
      // Funder has enough to send 0.5 APT
      console.log("Transferring 0.5 APT from Funder to Deployer...")
      const transaction = await aptos.transferCoinTransaction({
        sender: account0.accountAddress,
        recipient: account1.accountAddress,
        amount: 50_000_000,
        options: {
          maxGasAmount: 30000,
        },
      })
      const pendingTxn = await aptos.signAndSubmitTransaction({
        signer: account0,
        transaction,
      })
      console.log(`Tx submitted: ${pendingTxn.hash}. Waiting for confirmation...`)
      await aptos.waitForTransaction({ transactionHash: pendingTxn.hash })
      console.log("✅ Funding complete!")
    } else {
      console.error("❌ Funder does not have enough balance to fund the deployer!")
      process.exit(1)
    }
  }
} catch (e) {
  console.error("❌ Pre-funding check failed:", e)
  process.exit(1)
}

// Helper to run a command and log output
function runCommand(cmd: string) {
  console.log(`Running: ${cmd}`)
  try {
    execSync(cmd, { stdio: "inherit" })
  } catch (error) {
    console.error(`❌ Command failed: ${cmd}`)
    process.exit(1)
  }
}

// 2.5 Update contracts/Move.toml to prevent compilation named-addresses conflict
const tomlPath = resolve(import.meta.dirname, "../contracts/Move.toml")
if (existsSync(tomlPath)) {
  let tomlContent = readFileSync(tomlPath, "utf-8")
  tomlContent = tomlContent.replace(/quorum\s*=\s*"0x[a-fA-F0-9]+"/g, `quorum = "${address}"`)
  writeFileSync(tomlPath, tomlContent, "utf-8")
  console.log(`✅ Pre-updated contracts/Move.toml: ${address}`)
}

// 3. Compile the move package
console.log("\n📦 1. Compiling Move contracts...")
runCommand(`aptos move compile --package-dir contracts --named-addresses quorum=${address}`)

// 4. Publish the package on Testnet
console.log("\n🌐 2. Publishing package to Testnet...")
runCommand(
  `aptos move publish --package-dir contracts --named-addresses quorum=${address} --url ${nodeUrl} --private-key ${privateKey} --assume-yes`,
)

// 5. Initialize contracts sequentially
console.log("\n⚙️ 3. Running initialization functions on-chain...")

// 5.1 Initialize governance registry
console.log("Initializing DAO Governance...")
runCommand(
  `aptos move run --function-id ${address}::dao_governance::initialize --url ${nodeUrl} --private-key ${privateKey} --assume-yes`,
)

// 5.2 Initialize revenue splitter (treasury = deployment address)
console.log("Initializing Revenue Splitter...")
runCommand(
  `aptos move run --function-id ${address}::revenue_splitter::initialize --args "address:${address}" --url ${nodeUrl} --private-key ${privateKey} --assume-yes`,
)

// 5.3 Initialize QRM token
console.log("Initializing QRM Token...")
runCommand(
  `aptos move run --function-id ${address}::qrm_token::initialize --url ${nodeUrl} --private-key ${privateKey} --assume-yes`,
)

// 5.4 Initialize Staking
console.log("Initializing Staking...")
runCommand(
  `aptos move run --function-id ${address}::staking::initialize --args "address:${address}" --url ${nodeUrl} --private-key ${privateKey} --assume-yes`,
)

// 5.5 Create Genesis DAO
console.log("Creating default Genesis DAO...")
const daoIdHex = "hex:" + Buffer.from("dao-1").toString("hex")
const daoNameHex = "hex:" + Buffer.from("Quorum Genesis DAO").toString("hex")
// Arguments: contract_addr, dao_id, name, treasury, voting_window_us, quorum_threshold
runCommand(
  `aptos move run --function-id ${address}::dao_governance::create_dao --args "address:${address}" "${daoIdHex}" "${daoNameHex}" "address:${address}" "u64:172800000000" "u64:60" --url ${nodeUrl} --private-key ${privateKey} --assume-yes`,
)

// 6. Update .env files and Move.toml
console.log("\n📝 4. Updating local configurations with new contract address...")

// 6.1 Update apps/web/.env
if (existsSync(envPath)) {
  let envContent = readFileSync(envPath, "utf-8")
  envContent = envContent.replace(
    /QUORUM_CONTRACT_ADDRESS=.*/,
    `QUORUM_CONTRACT_ADDRESS=${address}`,
  )
  envContent = envContent.replace(/VITE_CONTRACT_ADDRESS=.*/, `VITE_CONTRACT_ADDRESS=${address}`)
  writeFileSync(envPath, envContent, "utf-8")
  console.log(`✅ Updated apps/web/.env: ${address}`)
}

// 6.2 Move.toml was already updated before compile

console.log("\n==========================================")
console.log("🎉 SUCCESS! Move package fully deployed & initialized.")
console.log("==========================================")
