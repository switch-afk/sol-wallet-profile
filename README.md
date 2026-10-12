# sol-wallet-profile

A zero-dependency Node.js CLI that prints a quick profile of a Solana wallet.

> Status: early development. The scaffold and address validation are in place; the profile itself is coming in the next releases.

## Planned usage

```bash
npx sol-wallet-profile <address>
npx sol-wallet-profile <address> --json
```

## Requirements

- Node.js 18 or newer

## RPC endpoint

The public mainnet RPC rate-limits heavily. Set your own endpoint with the `SOL_WALLET_PROFILE_RPC` environment variable or pass `--rpc <url>`.

## Development

```bash
npm test
```

## License

MIT