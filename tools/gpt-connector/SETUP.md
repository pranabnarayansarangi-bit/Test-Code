# GPT second-opinion MCP connector (Option A — Codex-backed)

Gives Claude Code a tool, `ask_gpt`, that forwards a problem to **GPT-5.5 (xhigh
reasoning)** through your **existing Codex CLI** and returns the reply. Because it
shells out to `codex exec`, it inherits your `~/.codex/config.toml`
(`model = "gpt-5.5"`, `model_reasoning_effort = "xhigh"`), auth, and network — nothing
to re-configure and no API key stored here.

This complements your `/gpt` slash command: `/gpt` is a manual button you press;
`ask_gpt` is a tool Claude can call **on its own** to honor the "cross-check with GPT
on hard calls / technical audits" rule.

## Where this must run
On a machine where `codex` already works (i.e. your **local PC**). It will NOT function
inside a cloud/web Claude session whose network policy blocks `api.openai.com`.

## Prerequisites
- Node.js >= 18 (you have it — Codex is Node-based).
- Codex CLI installed and working: `codex exec "hello"` returns a reply.

## Install
```bash
# from this folder
npm install
```

## Register with Claude Code (user scope = all your projects)
```bash
claude mcp add gpt-codex -s user -- node /ABSOLUTE/PATH/TO/gpt-mcp-codex.mjs
```
On Windows, use the full path, e.g.:
```powershell
claude mcp add gpt-codex -s user -- node "C:\Users\user\gpt-connector\gpt-mcp-codex.mjs"
```
Then restart Claude Code. Verify:
```bash
claude mcp list
claude mcp get gpt-codex
```
The tool appears to Claude as `mcp__gpt-codex__ask_gpt`.

## Use
Just ask Claude to "get a second opinion from GPT" / "cross-check this with GPT", or let
it call `ask_gpt` automatically when it's uncertain. Claude passes the problem + its own
analysis; GPT-5.5's reply comes back for reconciliation.

## Optional tuning (environment variables)
| Var | Default | Purpose |
|-----|---------|---------|
| `GPT_CODEX_BIN` | `codex` | Path/name of the codex executable. |
| `GPT_CODEX_ARGS` | *(empty)* | Extra args before the prompt, e.g. `--sandbox read-only`, or force settings with `-m gpt-5.5 -c model_reasoning_effort=xhigh`. |
| `GPT_TIMEOUT_MS` | `600000` | Max wait per call (ms). |

Set them in the `claude mcp add` command with `-e`, e.g.:
```bash
claude mcp add gpt-codex -s user -e GPT_CODEX_ARGS="--sandbox read-only" -- node /path/gpt-mcp-codex.mjs
```

## Troubleshooting
- **"failed to launch codex"** → `codex` isn't on PATH for the MCP process; set
  `GPT_CODEX_BIN` to the full path.
- **Noisy / non-answer output** → your Codex version may print logs around the final
  message. Add flags via `GPT_CODEX_ARGS`, or tune to your Codex version's
  "print last message only" option.
- **Hangs / approval prompts** → `codex exec` is meant to be non-interactive; if your
  config requires approvals, add the appropriate non-interactive/sandbox flag via
  `GPT_CODEX_ARGS`.

## Note / caveat
Exact `codex exec` flags vary by Codex CLI version. The core (`codex exec "<prompt>"`)
is stable; the flag knobs above are where to adapt. This was written without a live GPT
cross-check available (that's the bootstrap problem this connector solves) — verify
`ask_gpt` end-to-end once, then it's self-checking thereafter.

## Option B (later)
A direct OpenAI **Responses API** server (`model=gpt-5.5`, `reasoning.effort=xhigh`) is the
fallback — build it only if you hit a concrete reason to bypass the Codex CLI.
