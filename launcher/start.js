const claude = require("./claude");
const api = require("./api");

process.on("uncaughtException", (err) => {
  console.error(`[start] uncaught exception: ${err.message}`);
});

process.on("unhandledRejection", (err) => {
  console.error(`[start] unhandled rejection: ${err}`);
});

api.start();
claude.spawn();

process.on("SIGINT", () => {
  console.error("[start] shutting down...");
  claude.kill();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.error("[start] shutting down...");
  claude.kill();
  process.exit(0);
});
