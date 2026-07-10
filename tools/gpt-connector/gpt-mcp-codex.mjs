#!/usr/bin/env node
// gpt-mcp-codex.mjs
// A local/self-hosted MCP connector that gives Claude a "second opinion" tool
// backed by GPT-5.5 (xhigh reasoning) THROUGH your existing Codex CLI.
//
// Why wrap Codex instead of calling the API directly?
//   - Reuses your ~/.codex/config.toml (model = "gpt-5.5", model_reasoning_effort = "xhigh")
//   - Reuses Codex's auth + network egress. No API key handling here, no API-param guessing.
//
// Exposes one tool:  ask_gpt(prompt)  ->  GPT's reply (text)
//
// Config via environment variables (all optional):
//   GPT_CODEX_BIN    path/name of the codex executable         (default: "codex")
//   GPT_CODEX_ARGS   extra args inserted before the prompt,    (default: "")
//                    e.g. "--sandbox read-only" or
//                         "-m gpt-5.5 -c model_reasoning_effort=xhigh"
//                    (only needed if you want to force model/effort instead of
//                     inheriting them from ~/.codex/config.toml)
//   GPT_TIMEOUT_MS   max time to wait for a reply, ms          (default: 600000 = 10 min)

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn } from "node:child_process";

const CODEX_BIN = process.env.GPT_CODEX_BIN || "codex";
const TIMEOUT_MS = Number(process.env.GPT_TIMEOUT_MS || 600000);

function runCodex(prompt) {
  return new Promise((resolve, reject) => {
    const extra = (process.env.GPT_CODEX_ARGS || "").trim();
    const args = ["exec", ...(extra ? extra.split(/\s+/) : []), prompt];
    // shell:true so Windows resolves `codex.cmd`; harmless on macOS/Linux.
    const child = spawn(CODEX_BIN, args, { shell: true });

    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`codex timed out after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`failed to launch "${CODEX_BIN}": ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim() || err.trim());
      else reject(new Error(`codex exited ${code}: ${(err || out).trim()}`));
    });
  });
}

const server = new McpServer({ name: "gpt-codex", version: "1.0.0" });

server.tool(
  "ask_gpt",
  "Get a second opinion / technical audit from GPT-5.5 (xhigh reasoning) via the local Codex CLI. " +
    "Pass the FULL problem plus your current analysis/decision; returns GPT's reply so you can reconcile before finalizing.",
  { prompt: z.string().describe("Full problem statement plus your current analysis/decision to be cross-checked.") },
  async ({ prompt }) => {
    try {
      const reply = await runCodex(prompt);
      return { content: [{ type: "text", text: reply || "(codex returned no output)" }] };
    } catch (e) {
      return { content: [{ type: "text", text: `GPT/Codex error: ${e.message}` }], isError: true };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
