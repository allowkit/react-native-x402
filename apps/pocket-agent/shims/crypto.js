/**
 * Minimal Node-'crypto' shim for React Native (Hermes has no node builtins).
 * Covers exactly what @x402/svm uses: createHash('sha256').
 * Backed by @noble/hashes (audited, pure JS).
 */
const { sha256 } = require('@noble/hashes/sha2.js');

class NobleHash {
  constructor(algo) {
    if (algo !== 'sha256') {
      throw new Error(`crypto shim: unsupported hash "${algo}" (only sha256)`);
    }
    this._h = sha256.create();
  }
  update(data) {
    this._h.update(typeof data === 'string' ? new TextEncoder().encode(data) : data);
    return this;
  }
  digest(encoding) {
    const out = this._h.digest();
    if (!encoding) return out;
    if (encoding === 'hex') {
      return Array.from(out, (b) => b.toString(16).padStart(2, '0')).join('');
    }
    throw new Error(`crypto shim: unsupported digest encoding "${encoding}"`);
  }
}

module.exports = {
  createHash: (algo) => new NobleHash(algo),
};
