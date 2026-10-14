# sol-wallet-profile

A quick profile of any Solana wallet from the command line. One command, no dependencies, no keys.

```
$ sol-wallet-profile <wallet address>
Address  <wallet address>
Balance  2.5 SOL (2500000000 lamports)
Type     wallet
Owner    System Program (11111111111111111111111111111111)
Data     0 bytes
Activity 100+ transactions
Last tx  2026-10-13 09:12 UTC (3h ago)
First tx 2026-01-25 15:00 UTC (oldest of the latest 100)
Failed   9 of 100
Tokens   4 with a balance (6 token accounts, 1 NFT-like)
         1234.5  USDC
            250  <mint address>
```

The output above is illustrative. It only reads public on-chain data and never asks for a private key or seed phrase.

## Install

Run it straight from GitHub:

```
npx github:switch-afk/sol-wallet-profile <wallet address>
```

Or clone it:

```
git clone https://github.com/switch-afk/sol-wallet-profile.git
cd sol-wallet-profile
node bin/sol-wallet-profile.js <wallet address>
```

Run `npm link` inside the clone to get a global `sol-wallet-profile` command. Requires Node 18 or newer.

## Usage

```
sol-wallet-profile <address> [options]
```

| Option | What it does |
| --- | --- |
| `--rpc <url>` | Use this RPC endpoint |
| `--json` | Print machine-readable JSON |
| `-v`, `--version` | Print the version |
| `-h`, `--help` | Show help |

## RPC endpoint

The endpoint is chosen in this order:

1. `--rpc <url>`
2. the `SOL_WALLET_PROFILE_RPC` environment variable
3. the public mainnet RPC (`https://api.mainnet-beta.solana.com`)

The public RPC rate-limits heavily. The client retries HTTP 429 twice with exponential backoff, and if it still fails it tells you to use your own endpoint. Error messages only ever show the RPC hostname, so API keys inside the URL are never printed.

PowerShell:

```
$env:SOL_WALLET_PROFILE_RPC = "https://your-rpc.example.com/your-key"
```

macOS and Linux:

```
export SOL_WALLET_PROFILE_RPC="https://your-rpc.example.com/your-key"
```

## What it shows

- **Balance, type, owner, data size.** One `getAccountInfo` call with a zero-length data slice, so big program accounts are never downloaded. Balances are exact (no floating point). The type is `wallet` (owned by the System Program), `program` (executable) or `data account`. An address that does not exist on chain is reported as not found, not as an error.
- **Activity.** One `getSignaturesForAddress` call for the latest 100 transactions. If the wallet has fewer than 100, the count is its full history. Otherwise it shows `100+`, and the first transaction shown is the oldest of those 100. Times are UTC.
- **Tokens.** One `getTokenAccountsByOwner` call each for the Token and Token-2022 programs. Accounts of the same mint are merged, empty balances are dropped, and amounts are exact. The text view lists the top 10 by balance and names USDC, USDT and wSOL. There are no prices, so the order is only by amount.
- **NFT-like.** A holding with 0 decimals and a balance of exactly 1. They are counted but not listed. This is a heuristic, not proof the token is an NFT.

A run makes four RPC calls, one after another. If any call fails, the command exits with an error and prints no partial profile.

## JSON output

`--json` prints one object:

```
{
  "address": "...",
  "exists": true,
  "lamports": 2500000000,
  "sol": "2.5",
  "kind": "wallet",
  "owner": "11111111111111111111111111111111",
  "ownerLabel": "System Program",
  "executable": false,
  "dataSize": 0,
  "activity": {
    "checked": 100,
    "limit": 100,
    "complete": false,
    "failed": 9,
    "lastSeen": "2026-10-13T09:12:45.000Z",
    "firstSeen": "2026-01-25T15:00:10.000Z"
  },
  "tokens": {
    "accounts": 6,
    "withBalance": 4,
    "nftLike": 1,
    "holdings": [
      {
        "mint": "...",
        "symbol": "USDC",
        "amount": "1234500000",
        "decimals": 6,
        "uiAmount": "1234.5",
        "program": "token",
        "accounts": 1,
        "nftLike": false
      }
    ]
  }
}
```

`amount` is the raw integer as a string and `uiAmount` is the exact decimal string. `holdings` contains every holding, not just the top 10. `lastSeen` and `firstSeen` are `null` when the RPC returns no block times.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | RPC error (rate limit, network, unexpected response) |
| 2 | Usage error (bad option, missing or invalid address) |

## Development

```
npm test
```

Zero dependencies. Tests use Node's built-in test runner and a scriptable mock RPC (`tests/helpers/mock-rpc.js`), so they never touch the network. CI runs on Node 20 and 22.

## License

MIT