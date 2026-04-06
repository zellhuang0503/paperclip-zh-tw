export const PLUGIN_ID = "paperclip-telegram-bridge";
export const PLUGIN_VERSION = "0.2.0";

export const WEBHOOK_KEYS = {
  telegramUpdate: "telegram-update",
} as const;

export const STATE_KEYS = {
  /** Maps Telegram chat ID → active Paperclip agent session ID */
  chatSession: "chat-session",
  /** Stores the last known Telegram update_id for dedup */
  lastUpdateId: "last-update-id",
  /** Stores the default agent ID to route messages to (e.g., Jarvis) */
  defaultAgentId: "default-agent-id",
  /** Stores the company ID this plugin operates under */
  companyId: "company-id",
  /** Stores the notification chat ID for event-driven push messages */
  notifyChatId: "notify-chat-id",
} as const;

export const TOOL_NAMES = {
  /** Agent tool: send a message to a Telegram chat */
  telegramSend: "telegram_send",
  /** Agent tool: create a Paperclip issue from an agent context */
  telegramCreateIssue: "telegram_create_issue",
} as const;

export const JOB_KEYS = {
  /** Periodic health-check — pings the Telegram Bot API to verify the token */
  healthPing: "telegram-health-ping",
} as const;

/**
 * Regex to detect @agent mentions in Telegram messages.
 * Matches @AgentName (case-insensitive, allows underscores/hyphens).
 */
export const MENTION_REGEX = /(?:^|\s)@([\w-]+)/gi;

/**
 * Maximum Telegram message length before we need to split.
 */
export const TELEGRAM_MAX_LENGTH = 4096;