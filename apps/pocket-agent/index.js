// Hermes polyfills: must run before anything imports @solana/kit or @x402/*
import 'react-native-get-random-values';
import 'fast-text-encoding'; // TextEncoder / TextDecoder
import { encode as b64encode, decode as b64decode } from 'base-64';
if (typeof global.btoa === 'undefined') global.btoa = b64encode;
if (typeof global.atob === 'undefined') global.atob = b64decode;

if (typeof global.crypto === 'undefined') global.crypto = {};
if (!global.crypto.subtle) {
  // Minimal WebCrypto digest for @solana/kit (PDA derivation): SHA-256 via @noble/hashes.
  const { sha256 } = require('@noble/hashes/sha2.js');
  global.crypto.subtle = {
    digest: async (algo, data) => {
      const name = typeof algo === 'string' ? algo : algo?.name;
      if (name !== 'SHA-256') throw new Error(`subtle shim: unsupported digest ${name}`);
      return sha256(data instanceof Uint8Array ? data : new Uint8Array(data)).buffer;
    },
  };
}


/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
