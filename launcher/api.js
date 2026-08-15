const http = require("node:http");
const claude = require("./claude");

const API_PORT = 9090;

function start() {
  const server = http.createServer((req, res) => {
    const respond = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };

    if (req.method === "GET" && req.url === "/status") {
      respond(200, { status: claude.isRunning() ? "running" : "stopped", busy: claude.isBusy() });
      return;
    }

    if (req.method !== "POST") {
      respond(405, { error: "POST only (GET /status also allowed)" });
      return;
    }

    if (claude.isBusy() && req.url !== "/status") {
      respond(409, { error: "busy with another operation" });
      return;
    }

    switch (req.url) {
      case "/compact":
        if (claude.compact()) {
          respond(200, { status: "compacting" });
        } else {
          respond(409, { error: "busy" });
        }
        break;
      case "/kill":
        respond(200, { status: claude.kill() ? "killed" : "not running" });
        break;
      case "/restart":
        claude.restart();
        respond(200, { status: "restarting" });
        break;
      default:
        respond(404, { error: "unknown endpoint", endpoints: ["/compact", "/kill", "/restart", "/status"] });
    }
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[api] port ${API_PORT} already in use`);
      process.exit(1);
    }
    console.error(`[api] server error: ${err.message}`);
  });

  server.listen(API_PORT, "127.0.0.1", () => {
    console.error(`[api] listening on http://127.0.0.1:${API_PORT}`);
    console.error("[api] POST /compact | /kill | /restart  GET /status");
  });

  return server;
}

module.exports = { start };
