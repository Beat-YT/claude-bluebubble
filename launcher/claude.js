const pty = require("node-pty");
const { execSync } = require("node:child_process");
const fs = require("node:fs");

const CLAUDE_PATH = "C:\\Users\\Just\\.local\\bin\\claude.exe";
const CHANNEL_ARGS = [
  "--dangerously-load-development-channels",
  "server:bluebubbles",
  "--dangerously-skip-permissions",
  "--effort", "high",
];

let proc = null;
let busy = false;

function spawn() {
  if (proc) {
    console.error("[claude] already running");
    return;
  }

  if (!fs.existsSync(CLAUDE_PATH)) {
    console.error(`[claude] executable not found: ${CLAUDE_PATH}`);
    return;
  }

  try {
    proc = pty.spawn(CLAUDE_PATH, CHANNEL_ARGS, {
      name: "xterm-256color",
      cwd: process.cwd(),
      env: process.env,
    });
  } catch (e) {
    console.error(`[claude] failed to spawn: ${e.message}`);
    proc = null;
    return;
  }

  console.error("[claude] spawned");

  setTimeout(() => {
    if (proc) {
      try {
        proc.write("\r");
        console.error("[claude] sent enter");
      } catch (e) {
        console.error(`[claude] failed to send enter: ${e.message}`);
      }
    }
  }, 2000);

  proc.onExit(({ exitCode }) => {
    console.error(`[claude] exited (code=${exitCode})`);
    proc = null;
  });
}

function kill() {
  if (!proc) return false;
  try {
    proc.kill();
  } catch (e) {
    console.error(`[claude] kill error: ${e.message}`);
  }
  proc = null;
  console.error("[claude] killed");
  return true;
}

function restart() {
  if (busy) {
    console.error("[claude] busy, ignoring restart");
    return;
  }
  busy = true;
  kill();
  setTimeout(() => {
    spawn();
    busy = false;
  }, 500);
}

function compact() {
  if (busy) {
    console.error("[claude] busy, ignoring compact");
    return false;
  }
  busy = true;
  console.error("[claude] running compact...");
  kill();
  try {
    execSync(`"${CLAUDE_PATH}" -c -p "/compact"`, {
      stdio: "inherit",
      timeout: 60000,
    });
    console.error("[claude] compact done");
  } catch (e) {
    console.error(`[claude] compact failed: ${e.message}`);
  }
  setTimeout(() => {
    spawn();
    busy = false;
  }, 500);
  return true;
}

function isRunning() {
  return proc !== null;
}

function isBusy() {
  return busy;
}

module.exports = { spawn, kill, restart, compact, isRunning, isBusy };
