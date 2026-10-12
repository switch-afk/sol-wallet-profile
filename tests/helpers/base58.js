'use strict';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// Test-only encoder, used to build valid addresses.
function encodeBase58(bytes) {
  let num = 0n;
  for (const byte of bytes) num = num * 256n + BigInt(byte);

  let out = '';
  while (num > 0n) {
    out = ALPHABET[Number(num % 58n)] + out;
    num /= 58n;
  }
  for (const byte of bytes) {
    if (byte === 0) out = '1' + out;
    else break;
  }
  return out;
}

// A distinct, valid 32-byte address for each index.
function fakeAddress(index) {
  const bytes = Uint8Array.from({ length: 32 }, (_, i) => (i === 31 ? (index % 256) : i === 30 ? Math.floor(index / 256) : 7));
  return encodeBase58(bytes);
}

module.exports = { encodeBase58, fakeAddress };