module.exports = {
  // mode: "production",
  entry: "./src/reader_relay_script.ts",
  output: {
    chunkFormat: "module",
    clean: true
  },
  target: ["es5"],
  resolve: {
    extensions: [".ts"]
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: "ts-loader"
      }
    ]
  }
}