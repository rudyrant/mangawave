module.exports = {
  apps: [
    {
      name: "mangawave",
      script: "./server.js",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};
