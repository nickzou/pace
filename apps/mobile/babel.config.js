module.exports = (api) => {
  api.cache(true)
  return {
    presets: ["babel-preset-expo"],
    // PowerSync leans on async generators (its watch/streaming APIs). Transform
    // them so they run on the RN/Hermes runtime. (PowerSync M11.)
    plugins: ["@babel/plugin-transform-async-generator-functions"],
  }
}
