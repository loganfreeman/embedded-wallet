# Embedded Wallet

Non-custodial TypeScript/Node.js backend for building and broadcasting crypto send transactions across EVM, Solana, and Bitcoin.

The server never receives private keys. It builds unsigned transactions, stores short-lived transaction context in Redis, returns signing payloads to clients, then verifies and broadcasts signed transactions.

## Supported Networks

- Base and Base Sepolia
- Arbitrum One and Arbitrum Sepolia
- Ethereum Mainnet and Sepolia
- Solana Mainnet-Beta and Devnet
- Bitcoin Mainnet and Signet

## Architecture

The API exposes one unified transaction flow:

1. `POST /tx/build`
   - Client sends transaction intent: from, to, amount, asset, network.
   - Server builds the unsigned transaction.
   - Server stores canonical unsigned transaction context in Redis with a short TTL.
   - Server returns `txId`, signing payloads, and signing instructions.

2. Client signs locally
   - Signing happens outside the server using Passkey, MPC, wallet, or another signer.

3. `POST /tx/broadcast`
   - Client sends `txId` plus signature material or a signed transaction.
   - Server loads the original context from Redis.
   - Server verifies the signed transaction matches the original build session.
   - Server broadcasts to the target network.

## Safety Guarantees

- Private keys never touch the server.
- `/tx/build` requires a client-generated `idempotency_key`.
- Build requests are protected by a Redis per-wallet distributed lock.
- Transaction context is stored by server-generated UUID `txId`.
- `/tx/broadcast` does not trust client-supplied unsigned transaction data.
- Broadcast requests are locked and cached to reduce duplicate broadcasts.
- Transaction sessions expire after a short TTL.

## Tech Stack

- Fastify
- TypeScript
- Redis via `ioredis`
- EVM via `viem`
- Solana via `@solana/web3.js`
- Bitcoin via `bitcoinjs-lib`
- Validation via `zod`

## Setup

Install dependencies:

```bash
npm install
```

Copy environment defaults:

```bash
cp .env.example .env
```

Start Redis locally, then run the API:

```bash
npm run dev
```

Default server URL:

```txt
http://localhost:3000
```

## Environment

See [.env.example](.env.example) for available settings.

Important values:

- `REDIS_URL`
- `TX_SESSION_TTL_SECONDS`
- `BUILD_LOCK_TTL_MS`
- `BROADCAST_LOCK_TTL_MS`
- `BASE_RPC_URL`
- `ETHEREUM_RPC_URL`
- `SOLANA_RPC_URL`
- `BITCOIN_MEMPOOL_API_URL`

## API

### Health

```txt
GET /health
```

### Networks

```txt
GET /networks
```

### Build Transaction

```txt
POST /tx/build
```

Example:

```json
{
  "idempotency_key": "client-generated-uuid",
  "network": "base-sepolia",
  "from": "0xSender",
  "to": "0xRecipient",
  "amount": "1000000000000000",
  "asset": {
    "type": "native"
  }
}
```

Response:

```json
{
  "txId": "server-generated-uuid",
  "network": "base-sepolia",
  "status": "requires_signature",
  "expiresAt": "2026-06-26T12:00:00.000Z",
  "signingPayloads": [],
  "signingInstructions": [],
  "display": {
    "from": "0xSender",
    "to": "0xRecipient",
    "amount": "1000000000000000",
    "asset": {
      "type": "native"
    }
  }
}
```

### Broadcast Transaction

```txt
POST /tx/broadcast
```

Signature-based submit:

```json
{
  "txId": "server-generated-uuid",
  "signatures": [
    {
      "payloadId": "payload_0",
      "signature": "0x...",
      "encoding": "hex"
    }
  ]
}
```

Signed transaction submit:

```json
{
  "txId": "server-generated-uuid",
  "signedTransaction": "0x...",
  "encoding": "hex"
}
```

Response:

```json
{
  "txId": "server-generated-uuid",
  "status": "broadcasted",
  "txHash": "0x..."
}
```

## Development

Typecheck:

```bash
npm run typecheck
```

Build:

```bash
npm run build
```
