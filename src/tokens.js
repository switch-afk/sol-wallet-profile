'use strict';

const { rpcCall, RpcError, hostLabel } = require('./rpc');

const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

const PROGRAMS = [
  [TOKEN_PROGRAM, 'token'],
  [TOKEN_2022_PROGRAM, 'token-2022'],
];

const SHOW_LIMIT = 10;

const KNOWN_MINTS = {
  So11111111111111111111111111111111111111112: 'wSOL',
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 'USDC',
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: 'USDT',
};

function badResponse(endpoint) {
  return new RpcError(`${hostLabel(endpoint)} returned an unexpected token account response.`, {
    code: 'bad-response',
  });
}

// Exact raw amount -> decimal string, no floating point. Trailing zeros are trimmed.
function formatUnits(raw, decimals) {
  const value = BigInt(raw);
  if (decimals === 0) return value.toString();
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const frac = (value % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

function parseAccount(entry, endpoint, program) {
  const info =
    entry &&
    entry.account &&
    entry.account.data &&
    entry.account.data.parsed &&
    entry.account.data.parsed.info;
  const amount = info && info.tokenAmount;

  if (
    !info ||
    typeof info.mint !== 'string' ||
    !amount ||
    typeof amount.amount !== 'string' ||
    !/^\d+$/.test(amount.amount) ||
    !Number.isInteger(amount.decimals) ||
    amount.decimals < 0 ||
    amount.decimals > 255
  ) {
    throw badResponse(endpoint);
  }

  return {
    mint: info.mint,
    raw: BigInt(amount.amount),
    decimals: amount.decimals,
    program,
  };
}

// Biggest balance first. There are no prices, so this only orders by amount.
function byBalance(a, b) {
  const diff = Number(b.uiAmount) - Number(a.uiAmount);
  if (diff !== 0 && !Number.isNaN(diff)) return diff;
  if (a.mint < b.mint) return -1;
  if (a.mint > b.mint) return 1;
  return 0;
}

function summarizeTokenAccounts(accounts) {
  const byMint = new Map();

  for (const account of accounts) {
    const held = byMint.get(account.mint) || {
      mint: account.mint,
      raw: 0n,
      decimals: account.decimals,
      program: account.program,
      accounts: 0,
    };
    held.raw += account.raw;
    held.accounts += 1;
    byMint.set(account.mint, held);
  }

  const holdings = [...byMint.values()]
    .filter((held) => held.raw > 0n)
    .map((held) => ({
      mint: held.mint,
      symbol: Object.hasOwn(KNOWN_MINTS, held.mint) ? KNOWN_MINTS[held.mint] : null,
      amount: held.raw.toString(),
      decimals: held.decimals,
      uiAmount: formatUnits(held.raw, held.decimals),
      program: held.program,
      accounts: held.accounts,
      nftLike: held.decimals === 0 && held.raw === 1n,
    }))
    .sort(byBalance);

  return {
    accounts: accounts.length,
    withBalance: holdings.length,
    nftLike: holdings.filter((h) => h.nftLike).length,
    holdings,
  };
}

async function fetchTokens(endpoint, address, options = {}) {
  const parsed = [];

  // One program after the other keeps us gentle on public RPC rate limits.
  for (const [programId, label] of PROGRAMS) {
    const result = await rpcCall(
      endpoint,
      'getTokenAccountsByOwner',
      [address, { programId }, { encoding: 'jsonParsed', commitment: 'confirmed' }],
      options,
    );

    if (!result || typeof result !== 'object' || !Array.isArray(result.value)) {
      throw badResponse(endpoint);
    }

    for (const entry of result.value) parsed.push(parseAccount(entry, endpoint, label));
  }

  return summarizeTokenAccounts(parsed);
}

// Returns [label, value] pairs; profile.js owns the layout. An empty label
// continues the list under the value column.
function tokenRows(tokens) {
  if (tokens.accounts === 0) return [['Tokens', 'none']];

  const noun = tokens.accounts === 1 ? 'token account' : 'token accounts';
  const extra = tokens.nftLike > 0 ? `, ${tokens.nftLike} NFT-like` : '';
  const rows = [['Tokens', `${tokens.withBalance} with a balance (${tokens.accounts} ${noun}${extra})`]];

  const fungible = tokens.holdings.filter((h) => !h.nftLike);
  const shown = fungible.slice(0, SHOW_LIMIT);
  const width = Math.max(0, ...shown.map((h) => h.uiAmount.length));

  for (const h of shown) {
    rows.push(['', `${h.uiAmount.padStart(width)}  ${h.symbol || h.mint}`]);
  }

  if (fungible.length > shown.length) {
    rows.push(['', `+${fungible.length - shown.length} more (use --json for all)`]);
  }

  return rows;
}

module.exports = {
  fetchTokens,
  summarizeTokenAccounts,
  tokenRows,
  formatUnits,
  TOKEN_PROGRAM,
  TOKEN_2022_PROGRAM,
};