# claude-bluebubble

A [Claude Code channel](https://code.claude.com/docs/en/channels) that bridges **iMessage** into a Claude Code session via a [BlueBubbles](https://bluebubbles.app) server. Incoming iMessages are injected into the session; Claude replies (text or files) back over iMessage.

## How it works

The channel is a single Node.js process that Claude Code spawns as an MCP stdio server (see `.mcp.json`). It also opens an HTTP port that the BlueBubbles server POSTs `new-message` webhook events to (the channel self-registers the webhook at startup).

```
iMessage ⇄ BlueBubbles server (Mac) ⇄ this channel ⇄ Claude Code session
```

- Inbound: webhook → filter (`isFromMe` guard + sender allowlist) → download attachments → inject into the session.
- Outbound: Claude calls the `reply` / `send_file` MCP tools → BlueBubbles REST API (`method: private-api`).
- Niceties: typing indicator while Claude works, chat marked read after handling.

## Requirements

- **Mac**: BlueBubbles server ≥ 1.0.0 with **Private API enabled**, reachable from this machine over the LAN.
- **This machine**: Node.js ≥ 20.12, reachable from the Mac (the webhook is a plain HTTP POST to this machine's LAN IP).

## Setup

```sh
npm install
cp .env.example .env   # then fill in BB_SERVER_URL, BB_PASSWORD, ALLOWED_SENDERS
npm run build
```

> **Rebuild after every source change** — Claude Code runs the compiled `dist/index.js`, not the TypeScript sources.

## Run

```sh
claude --dangerously-load-development-channels server:bluebubbles
```

(The dev flag is required for custom channels not on Anthropic's allowlist. Claude Code shows a warning prompt; choose "I am using this for local development".)

Then text the Mac's iMessage account from an allowlisted sender — the message appears in your session and Claude can reply.

## Configuration (`.env`)

| Var | Required | Default | Meaning |
|---|---|---|---|
| `BB_SERVER_URL` | yes | — | BlueBubbles server, e.g. `http://192.168.2.175:1234` |
| `BB_PASSWORD` | yes | — | BlueBubbles server password |
| `WEBHOOK_PORT` | no | `8787` | Local port for the webhook listener |
| `WEBHOOK_PUBLIC_URL` | no | auto-detected LAN IPv4 | URL the Mac uses to reach this machine |
| `ALLOWED_SENDERS` | no (but do it) | accept all + loud warning | Comma-separated phone numbers/emails allowed to talk to Claude |
| `ATTACHMENTS_DIR` | no | `./attachments` | Where inbound attachments are saved |

## Standalone smoke test (no Claude Code, no Mac)

```sh
npm run dev   # or: node dist/index.js
curl -X POST localhost:8787/webhook -H "Content-Type: application/json" -d '{"type":"hello-world","data":{}}'
```

## v2 ideas (not implemented)

- Threaded replies (`selectedMessageGuid`), tapbacks, permission relay (approve tool calls by texting `yes <id>`).
