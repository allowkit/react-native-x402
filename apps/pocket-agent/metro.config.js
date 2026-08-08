const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

const monorepoRoot = path.resolve(__dirname, '../..');

/** Monorepo: watch the workspace root and resolve hoisted node_modules. */
const config = {
  watchFolders: [monorepoRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(monorepoRoot, 'node_modules'),
    ],
    // Node builtins used by @x402/* — shimmed for Hermes.
    extraNodeModules: {
      crypto: path.resolve(__dirname, 'shims/crypto.js'),
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
