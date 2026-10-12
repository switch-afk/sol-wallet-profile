'use strict';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// Returns a Uint8Array, or null if the string is empty or has a character outside the alphabet.
function decodeBase58(text) {
  if (typeof text !== 'string' || text.length === 0) return null;

  let num = 0n;
  for (const char of text) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) return null;
    num = num * 58n + BigInt(index);
  }

  const bytes = [];
  while (num > 0n) {
    bytes.push(Number(num & 0xffn));
    num >>= 8n;
  }

  // Each leading "1" stands for one leading zero byte.
  for (let i = 0; i < text.length && text[i] === '1'; i++) bytes.push(0);

  return Uint8Array.from(bytes.reverse());
}

// A Solana address is a base58 string that decodes to exactly 32 bytes.
function isValidAddress(text) {
  if (typeof text !== 'string' || text.length < 32 || text.length > 44) return false;
  const bytes = decodeBase58(text);
  return bytes !== null && bytes.length === 32;
}

module.exports = { decodeBase58, isValidAddress };