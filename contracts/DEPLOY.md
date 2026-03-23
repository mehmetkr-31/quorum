# Contract Deploy — Status

## ✅ Deployed on Aptos Devnet (2026-03-23)

| Contract | Tx Hash |
|---|---|
| Publish | `0x391e15bcf0a9856b41ce84c2072d1f182dcd6bf7a39b8afc442a5c97d6f31125` |
| dao_governance::initialize | `0xd88143b16baf9508c580697a9a95b2bbff48c92233461e2c2a354888f7e0d582` |
| revenue_splitter::initialize | `0x673596fe924fcfc37053b28a08bcaf07f78b44f77c7d191b15105cb0ccc22448` |

**Contract Address:** `0x928d7052d85f63b206fab9f837b2c3302813e4798931ff0d78a420611dc20d4e`

Explorer: https://explorer.aptoslabs.com/account/0x928d7052d85f63b206fab9f837b2c3302813e4798931ff0d78a420611dc20d4e?network=devnet

---

## ⏳ Shelbynet — Pending

Shelbynet (chain_id=113) is running but has **0 user transactions** on-chain.
The faucet accepts requests and returns tx hashes, but no user transactions are being included in blocks.
This is a known early-stage issue — re-deploy to Shelbynet once user transactions are enabled.

### Shelbynet deploy commands (when ready)

```bash
# Fund account
curl -X POST "https://faucet.shelbynet.shelby.xyz/mint?amount=200000000&address=0x928d7052d85f63b206fab9f837b2c3302813e4798931ff0d78a420611dc20d4e"

# Publish
aptos move publish \
  --named-addresses quorum=0x928d7052d85f63b206fab9f837b2c3302813e4798931ff0d78a420611dc20d4e \
  --url https://api.shelbynet.shelby.xyz/v1 \
  --gas-unit-price 100 \
  --max-gas 200000 \
  --assume-yes

# Initialize
aptos move run \
  --function-id 0x928d7052d85f63b206fab9f837b2c3302813e4798931ff0d78a420611dc20d4e::dao_governance::initialize \
  --url https://api.shelbynet.shelby.xyz/v1 --assume-yes

aptos move run \
  --function-id 0x928d7052d85f63b206fab9f837b2c3302813e4798931ff0d78a420611dc20d4e::revenue_splitter::initialize \
  --args "address:0x928d7052d85f63b206fab9f837b2c3302813e4798931ff0d78a420611dc20d4e" \
  --url https://api.shelbynet.shelby.xyz/v1 --assume-yes
```
