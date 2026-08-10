module.exports = (api) => {
  api.cache(true)
  return {
    presets: ["babel-preset-expo"],
    // PowerSync leans on async generators (its watch/streaming APIs). Transform
    // them for the RN/Hermes runtime. require.resolve so Babel gets an absolute
    // path from this config's location — under pnpm's strict node_modules,
    // @babel/core can't resolve the plugin by bare name (MODULE_NOT_FOUND in the
    // release bundle, though looser local hoisting hides it). (PowerSync M11.)
    plugins: [require.resolve("@babel/plugin-transform-async-generator-functions")],
  }
}
