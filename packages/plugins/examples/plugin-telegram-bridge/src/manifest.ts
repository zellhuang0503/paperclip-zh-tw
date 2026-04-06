import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import { JOB_KEYS, PLUGIN_ID, PLUGIN_VERSION, TOOL_NAMES, WEBHOOK_KEYS } from "./constants.js";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Telegram Bridge",
  description:
    "Bridges Telegram messages to Paperclip agents. Send commands from Telegram and receive agent responses in real-time.",
  author: "梵亞行銷",
  categories: ["connector", "automation"],

  capabilities: [
    // Read company/agent metadata to resolve @-mentions
    "companies.read",
    "agents.read",
    // Create issues and comments to dispatch work
    "issues.read",
    "issues.create",
    "issue.comments.read",
    "issue.comments.create",
    // Invoke agents and manage conversational sessions
    "agents.invoke",
    "agent.sessions.create",
    "agent.sessions.send",
    "agent.sessions.close",
    // Receive inbound webhooks from Telegram
    "webhooks.receive",
    // Send outbound HTTP to Telegram Bot API
    "http.outbound",
    // Persist chat ↔ session mappings
    "plugin.state.read",
    "plugin.state.write",
    // Write activity log entries
    "activity.log.write",
    // Subscribe to events (e.g., run completion)
    "events.subscribe",
    // Register tools that agents can call
    "agent.tools.register",
    // Scheduled jobs
    "jobs.schedule",
    // Write metrics
    "metrics.write",
  ],

  entrypoints: {
    worker: "./dist/worker.js",
  },

  // Operator fills these in the Paperclip UI when installing the plugin
  instanceConfigSchema: {
    type: "object",
    properties: {
      telegramBotToken: {
        type: "string",
        title: "Telegram Bot Token",
        description: "Token from @BotFather (e.g., 123456:ABC-DEF...)",
      },
      allowedChatIds: {
        type: "string",
        title: "Allowed Chat IDs (comma-separated)",
        description:
          "Only accept messages from these Telegram chat IDs. Leave empty to allow all (not recommended).",
        default: "",
      },
      defaultAgentName: {
        type: "string",
        title: "Default Agent Name",
        description:
          "Agent name to route messages to when no @mention is specified (e.g., Jarvis).",
        default: "Jarvis",
      },
      companyId: {
        type: "string",
        title: "Company ID",
        description: "The Paperclip company ID to operate under.",
      },
      projectId: {
        type: "string",
        title: "Project ID (optional)",
        description:
          "If set, issues created from Telegram will be placed in this project.",
        default: "",
      },
      notifyChatId: {
        type: "string",
        title: "Notification Chat ID",
        description:
          "Telegram chat ID to receive event notifications (issue created, agent run completed). Falls back to the first allowed chat ID if empty.",
        default: "",
      },
    },
    required: ["telegramBotToken", "companyId"],
  },

  webhooks: [
    {
      endpointKey: WEBHOOK_KEYS.telegramUpdate,
      displayName: "Telegram Update",
      description:
        "Receives Telegram Bot API updates (messages, callbacks) via webhook.",
    },
  ],

  tools: [
    {
      name: TOOL_NAMES.telegramSend,
      displayName: "Telegram Send Message",
      description:
        "Sends a text message to a Telegram chat via the bridge bot. Use this to proactively notify the operator.",
      parametersSchema: {
        type: "object",
        properties: {
          chatId: {
            type: "number",
            description:
              "Telegram chat ID to send the message to. If omitted, uses the configured notification chat.",
          },
          text: {
            type: "string",
            description: "The message text to send.",
          },
        },
        required: ["text"],
      },
    },
    {
      name: TOOL_NAMES.telegramCreateIssue,
      displayName: "Telegram Create Issue",
      description:
        "Creates a Paperclip issue and notifies the Telegram chat about it.",
      parametersSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Issue title." },
          description: {
            type: "string",
            description: "Issue description (optional).",
          },
          chatId: {
            type: "number",
            description:
              "Telegram chat ID to notify. If omitted, uses the configured notification chat.",
          },
        },
        required: ["title"],
      },
    },
  ],

  jobs: [
    {
      jobKey: JOB_KEYS.healthPing,
      displayName: "Telegram Health Ping",
      description:
        "Periodically calls Telegram getMe to verify the bot token is still valid.",
      schedule: "0 */6 * * *",
    },
  ],
};

export default manifest;