'use strict';

const pkg = require('../package.json');
const { parseArgs } = require('./args');
const { isValidAddress } = require('./base58');
const { resolveEndpoint, RpcError } = require('./rpc');
const { fetchProfile, renderText } = require('./profile');
const { fetchActivity } = require('./activity');
const { fetchTokens } = require('./tokens');

const HELP = `sol-wallet-profile - a quick profile of a Solana wallet

Usage:
  sol-wallet-profile <address> [options]

Options:
  --rpc <url>    RPC endpoint (default: SOL_WALLET_PROFILE_RPC, then public mainnet RPC)
  --json         Print machine-readable JSON
  -v, --version  Print version
  -h, --help     Show this help
`;

function defaultIo() {
  return {
    out: (text) => process.stdout.write(text + '\n'),
    err: (text) => process.stderr.write(text + '\n'),
  };
}

// deps lets tests inject a fake fetch, a no-wait sleep, a fake environment and a fixed clock.
async function run(argv, io = defaultIo(), deps = {}) {
  const { env = process.env, fetchImpl, sleepImpl, now } = deps;
  const opts = parseArgs(argv);

  if (opts.errors.length > 0) {
    for (const message of opts.errors) io.err(`error: ${message}`);
    io.err('Run sol-wallet-profile --help for usage.');
    return 2;
  }

  if (opts.help) {
    io.out(HELP);
    return 0;
  }

  if (opts.version) {
    io.out(pkg.version);
    return 0;
  }

  if (opts.address === null) {
    io.err('error: a wallet address is required');
    io.err('Run sol-wallet-profile --help for usage.');
    return 2;
  }

  if (!isValidAddress(opts.address)) {
    io.err(`error: not a valid Solana address: ${opts.address.slice(0, 60)}`);
    return 2;
  }

  const endpoint = resolveEndpoint(opts.rpc, env);
  const rpcOptions = { fetchImpl, sleepImpl };

  let profile;
  try {
    // One call after the other keeps us gentle on public RPC rate limits.
    profile = await fetchProfile(endpoint, opts.address, rpcOptions);
    profile.activity = await fetchActivity(endpoint, opts.address, rpcOptions);
    profile.tokens = await fetchTokens(endpoint, opts.address, rpcOptions);
  } catch (err) {
    if (err instanceof RpcError) {
      io.err(`error: ${err.message}`);
      if (err.hint) io.err(err.hint);
      return 1;
    }
    throw err;
  }

  io.out(opts.json ? JSON.stringify(profile, null, 2) : renderText(profile, now));
  return 0;
}

module.exports = { run, HELP };