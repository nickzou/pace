// Metro config for a pnpm monorepo.
// See https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require("expo/metro-config")
const path = require("node:path")

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, "../..")

const config = getDefaultConfig(projectRoot)

// 1. Watch the whole monorepo so changes in shared packages are picked up.
config.watchFolders = [workspaceRoot]

// 2. Resolve modules from the app first, then the workspace root (pnpm hoists
//    shared deps to the root .pnpm store; Metro follows the symlinks).
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
]

// 3. @powersync/react-native relies on module side effects at import time, which
//    Metro's inline requires defer/break. Keep inline requires on everywhere
//    except the PowerSync SDK. (PowerSync M11.)
config.transformer.getTransformOptions = async () => ({
  transform: {
    inlineRequires: {
      blockList: {
        [require.resolve("@powersync/react-native")]: true,
      },
    },
  },
})

module.exports = config
