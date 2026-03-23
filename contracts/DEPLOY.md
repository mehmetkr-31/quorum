# Contract Deploy Guide — Shelbynet

## Account (generated)

```
Address : 0x98bf6a33b5db4dfb05c4b18992a4383cd340630e366f5ebb870a03d45e44a573
Profile : contracts/.aptos/config.yaml
```

## Steps

### 1. Fund the account

The CLI faucet has timing issues. Use the web faucet directly:

```
https://faucet.shelbynet.shelby.xyz
```

Fund address: `0x98bf6a33b5db4dfb05c4b18992a4383cd340630e366f5ebb870a03d45e44a573`

Verify:
```bash
aptos account balance --profile default
```

### 2. Compile

```bash
cd contracts
aptos move compile \
  --named-addresses quorum=0x98bf6a33b5db4dfb05c4b18992a4383cd340630e366f5ebb870a03d45e44a573
```

### 3. Publish

```bash
aptos move publish \
  --named-addresses quorum=0x98bf6a33b5db4dfb05c4b18992a4383cd340630e366f5ebb870a03d45e44a573 \
  --url https://api.shelbynet.shelby.xyz/v1 \
  --max-gas 200000 \
  --assume-yes
```

### 4. Initialize contracts

```bash
# Initialize DAO governance
aptos move run \
  --function-id 0x98bf6a33b5db4dfb05c4b18992a4383cd340630e366f5ebb870a03d45e44a573::dao_governance::initialize \
  --url https://api.shelbynet.shelby.xyz/v1 \
  --assume-yes

# Initialize revenue splitter (treasury = your address)
aptos move run \
  --function-id 0x98bf6a33b5db4dfb05c4b18992a4383cd340630e366f5ebb870a03d45e44a573::revenue_splitter::initialize \
  --args "address:0x98bf6a33b5db4dfb05c4b18992a4383cd340630e366f5ebb870a03d45e44a573" \
  --url https://api.shelbynet.shelby.xyz/v1 \
  --assume-yes
```

### 5. Update .env

```env
APTOS_CONTRACT_ADDRESS=0x98bf6a33b5db4dfb05c4b18992a4383cd340630e366f5ebb870a03d45e44a573
APTOS_NODE_URL=https://api.shelbynet.shelby.xyz/v1
APTOS_NETWORK=custom
APTOS_PRIVATE_KEY=0xe417a270977f86df2e51fe8b2aaa4d8a4e1b585b3af43d9cee5e18a5beec511c
```
