import fs from "node:fs/promises";
import path from "node:path";
import { parseObject } from "@paperclipai/adapter-utils/server-utils";

/**
 * Shape of a single MCP server entry in agent adapterConfig.mcpServers.
 */
export interface McpServerEntry {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * Parse mcpServers from raw adapter config.
 * Returns null when no valid servers are configured.
 */
export function parseMcpServers(
  config: Record<string, unknown>,
): Record<string, McpServerEntry> | null {
  const raw = config.mcpServers;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;

  const servers: Record<string, McpServerEntry> = {};
  for (const [name, entry] of Object.entries(raw as Record<string, unknown>)) {
    const obj = parseObject(entry);
    const command = typeof obj.command === "string" ? obj.command.trim() : "";
    if (!command) continue;

    const args = Array.isArray(obj.args)
      ? obj.args.filter((a): a is string => typeof a === "string")
      : [];

    const env: Record<string, string> = {};
    if (typeof obj.env === "object" && obj.env !== null && !Array.isArray(obj.env)) {
      for (const [k, v] of Object.entries(obj.env as Record<string, unknown>)) {
        if (typeof v === "string") env[k] = v;
      }
    }

    servers[name] = {
      command,
      ...(args.length > 0 ? { args } : {}),
      ...(Object.keys(env).length > 0 ? { env } : {}),
    };
  }

  return Object.keys(servers).length > 0 ? servers : null;
}

/**
 * Write a JSON file that can be passed to `claude --mcp-config <path>`.
 * The file follows the standard MCP config shape:
 * { "mcpServers": { "<name>": { "command": "...", "args": [...], "env": {...} } } }
 *
 * Returns the file path, or null if no servers were configured.
 */
export async function writeMcpConfigFile(
  tmpDir: string,
  servers: Record<string, McpServerEntry>,
): Promise<string> {
  const configPath = path.join(tmpDir, "mcp-config.json");
  await fs.writeFile(
    configPath,
    JSON.stringify({ mcpServers: servers }, null, 2),
    "utf-8",
  );
  return configPath;
}