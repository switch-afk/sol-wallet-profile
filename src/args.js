'use strict';

const ONE_ADDRESS = 'only one wallet address can be given at a time';

function parseArgs(argv) {
  const opts = {
    help: false,
    version: false,
    json: false,
    rpc: null,
    address: null,
    errors: [],
  };

  function addError(message) {
    if (!opts.errors.includes(message)) opts.errors.push(message);
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg === '--version' || arg === '-v') {
      opts.version = true;
    } else if (arg === '--json') {
      opts.json = true;
    } else if (arg === '--rpc') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        addError('--rpc needs a value');
      } else {
        i++;
        opts.rpc = value;
      }
    } else if (arg.startsWith('-')) {
      addError(`unknown option: ${arg}`);
    } else if (opts.address === null) {
      opts.address = arg;
    } else {
      addError(ONE_ADDRESS);
    }
  }

  return opts;
}

module.exports = { parseArgs };