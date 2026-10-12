'use strict';

const pkg = require('../package.json');
const { parseArgs } = require('./args');
const { isValidAddress } = require('./base58');

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

async function run(argv, io = defaultIo()) {
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

  io.err('Fetching the profile is not implemented yet.');
  return 1;
}

module.exports = { run, HELP };