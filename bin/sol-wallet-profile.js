#!/usr/bin/env node
'use strict';

const { run } = require('../src/cli');

// Piping into something like `head` closes stdout early: exit quietly instead of crashing.
process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') process.exit(0);
  throw err;
});

run(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});