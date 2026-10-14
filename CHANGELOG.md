# Changelog

## 0.1.0 - 2026-10-14

First release.

### Added

- `sol-wallet-profile <address>` prints a quick profile of any Solana address.
- Account details from one `getAccountInfo` call: exact SOL balance, owner program (with names for common programs), type (wallet, program or data account) and data size.
- Recent activity from `getSignaturesForAddress`: transaction count (exact for short histories, `100+` otherwise), first and last transaction time in UTC, and failed transactions.
- Token holdings from `getTokenAccountsByOwner` for both the Token and Token-2022 programs: exact amounts, accounts of one mint merged, NFT-like count, top 10 holdings by balance.
- `--json` for machine-readable output, `--rpc <url>` and the `SOL_WALLET_PROFILE_RPC` environment variable for your own RPC endpoint.
- RPC client with exponential backoff on HTTP 429. Errors only ever show the RPC hostname, so API keys in URLs are never printed.
- Exit codes: 0 success, 1 RPC error, 2 usage error.
- Zero dependencies, Node 18 or newer, tests on Node 20 and 22.