import {
  definePlugin,
  runWorker,
  type PluginContext,
  type PluginEvent,
  type PluginJobContext,
  type PluginWebhookInput,
  type ToolResult,
  type ToolRunContext,
} from "@paperclipai/plugin-sdk";
import {
  JOB_KEYS,
  MENTION_REGEX,
  PLUGIN_ID,
  STATE_KEYS,
  TELEGRAM_MAX_LENGTH,
  TOOL_NAMES,
  WEBHOOK_KEYS,
} from "./constants.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TelegramBridgeConfig {
  telegramBotToken: string;
  allowedChatIds?: string;
  defaultAgentName?: string;
  companyId: string;
  projectId?: string;
  notifyChatId?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

interface TelegramMessage {
  message_id: number;
  from?: { id: number; first_name?: string; username?: string };
  chat: { id: number; type: string };
  date: number;
  text?: string;
}

interface ChatSessionState {
  agentId: string;
  agentName: string;
  sessionId: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let pluginCtx: PluginContext | null = null;

/** Send a text message to a Telegram chat. */
async function sendTelegramMessage(
  ctx: PluginContext,
  token: string,
  chatId: number,
  text: string,
  parseMode: "Markdown" | "HTML" | "" = "",
): Promise<void> {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= TELEGRAM_MAX_LENGTH) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf("\n", TELEGRAM_MAX_LENGTH);
    if (splitAt <= 0) splitAt = TELEGRAM_MAX_LENGTH;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }

  for (const chunk of chunks) {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: chunk,
    };
    if (parseMode) body.parse_mode = parseMode;

    await ctx.http.fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
  }
}

/** Send a "typing…" indicator to a Telegram chat. */
async function sendTypingAction(
  ctx: PluginContext,
  token: string,
  chatId: number,
): Promise<void> {
  await ctx.http.fetch(
    `https://api.telegram.org/bot${token}/sendChatAction`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" }),
    },
  );
}

/** Call Telegram getMe to verify the bot token is valid. */
async function verifyBotToken(
  ctx: PluginContext,
  token: string,
): Promise<{ ok: boolean; username?: string }> {
  try {
    const res = await ctx.http.fetch(
      `https://api.telegram.org/bot${token}/getMe`,
      { method: "GET" },
    );
    const data = (await res.json()) as {
      ok: boolean;
      result?: { username?: string };
    };
    return { ok: data.ok, username: data.result?.username };
  } catch {
    return { ok: false };
  }
}

/** Resolve an agent by name (case-insensitive) within the company. */
async function resolveAgentByName(
  ctx: PluginContext,
  companyId: string,
  name: string,
): Promise<{ id: string; name: string } | null> {
  const agents = await ctx.agents.list({ companyId });
  const lower = name.toLowerCase();
  const match = agents.find(
    (a: { id: string; name: string }) => a.name.toLowerCase() === lower,
  );
  return match ? { id: match.id, name: match.name } : null;
}

/** Extract the first @mention from a message, or return null. */
function extractMention(text: string): string | null {
  MENTION_REGEX.lastIndex = 0;
  const match = MENTION_REGEX.exec(text);
  return match ? match[1] : null;
}

/** Remove @mentions from message text to get the clean prompt. */
function stripMentions(text: string): string {
  return text.replace(MENTION_REGEX, "").trim();
}

/** Get or create an agent session for a Telegram chat. */
async function getOrCreateSession(
  ctx: PluginContext,
  companyId: string,
  chatId: number,
  agentId: string,
  agentName: string,
): Promise<string> {
  const stateKey = `${STATE_KEYS.chatSession}:${chatId}`;

  const existing = (await ctx.state.get({
    scopeKind: "instance",
    stateKey,
  })) as ChatSessionState | null;

  if (existing && existing.agentId === agentId) {
    return existing.sessionId;
  }

  // Close old session if switching agents
  if (existing) {
    try {
      await ctx.agents.sessions.close(existing.sessionId, companyId);
    } catch {
      // Session may already be closed — ignore
    }
  }

  const session = await ctx.agents.sessions.create(agentId, companyId, {
    reason: `Telegram bridge — chat ${chatId}`,
  });

  const newState: ChatSessionState = {
    agentId,
    agentName,
    sessionId: session.sessionId,
    createdAt: new Date().toISOString(),
  };
  await ctx.state.set({ scopeKind: "instance", stateKey }, newState);

  return session.sessionId;
}

/** Check whether a chat ID is in the allow-list. Empty list = allow all. */
function isChatAllowed(
  allowedChatIds: string | undefined,
  chatId: number,
): boolean {
  if (!allowedChatIds || allowedChatIds.trim() === "") return true;
  const ids = allowedChatIds.split(",").map((s) => s.trim());
  return ids.includes(String(chatId));
}

/** Resolve the notification chat ID from config, falling back to the first allowed chat. */
function getNotifyChatId(config: TelegramBridgeConfig): number | null {
  if (config.notifyChatId && config.notifyChatId.trim() !== "") {
    return Number(config.notifyChatId);
  }
  if (config.allowedChatIds && config.allowedChatIds.trim() !== "") {
    const first = config.allowedChatIds.split(",")[0]?.trim();
    if (first) return Number(first);
  }
  return null;
}

/** Check for duplicate update_id and mark as processed. */
async function isDuplicateUpdate(
  ctx: PluginContext,
  updateId: number,
): Promise<boolean> {
  const last = (await ctx.state.get({
    scopeKind: "instance",
    stateKey: STATE_KEYS.lastUpdateId,
  })) as number | null;

  if (last !== null && updateId <= last) {
    return true;
  }

  await ctx.state.set(
    { scopeKind: "instance", stateKey: STATE_KEYS.lastUpdateId },
    updateId,
  );
  return false;
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

async function handleStart(
  ctx: PluginContext,
  config: TelegramBridgeConfig,
  chatId: number,
): Promise<void> {
  await sendTelegramMessage(
    ctx,
    config.telegramBotToken,
    chatId,
    "🤖 梵亞行銷指揮系統已連線！\n\n" +
      "您可以直接輸入指令，我會轉交給 Jarvis 處理。\n" +
      "也可以用 @AgentName 指定特定 agent，例如：\n" +
      "  @Ken 幫我檢查部署狀態\n" +
      "  @Jarvis 今天有什麼待辦？\n\n" +
      "指令：\n" +
      "/status — 查看目前連線狀態\n" +
      "/reset — 重置對話（開始新的 session）\n" +
      "/agents — 列出所有可用的 agent\n" +
      "/task <標題> — 建立新任務（issue）",
  );
}

async function handleStatus(
  ctx: PluginContext,
  config: TelegramBridgeConfig,
  chatId: number,
): Promise<void> {
  const stateKey = `${STATE_KEYS.chatSession}:${chatId}`;
  const session = (await ctx.state.get({
    scopeKind: "instance",
    stateKey,
  })) as ChatSessionState | null;

  const statusMsg = session
    ? `✅ 目前連線中\n` +
      `Agent: ${session.agentName}\n` +
      `Session: ${session.sessionId.slice(0, 8)}...\n` +
      `建立時間: ${session.createdAt}`
    : "⏸ 尚未建立對話 session，傳送任何訊息即可開始。";

  await sendTelegramMessage(ctx, config.telegramBotToken, chatId, statusMsg);
}

async function handleReset(
  ctx: PluginContext,
  config: TelegramBridgeConfig,
  chatId: number,
): Promise<void> {
  const stateKey = `${STATE_KEYS.chatSession}:${chatId}`;
  const session = (await ctx.state.get({
    scopeKind: "instance",
    stateKey,
  })) as ChatSessionState | null;

  if (session) {
    try {
      await ctx.agents.sessions.close(session.sessionId, config.companyId);
    } catch {
      // ignore
    }
    await ctx.state.delete({ scopeKind: "instance", stateKey });
  }
  await sendTelegramMessage(
    ctx,
    config.telegramBotToken,
    chatId,
    "🔄 對話已重置。下一則訊息將開始新的 session。",
  );
}

async function handleAgents(
  ctx: PluginContext,
  config: TelegramBridgeConfig,
  chatId: number,
): Promise<void> {
  const agents = await ctx.agents.list({ companyId: config.companyId });
  if (agents.length === 0) {
    await sendTelegramMessage(
      ctx,
      config.telegramBotToken,
      chatId,
      "目前沒有可用的 agent。",
    );
    return;
  }

  const lines = agents.map(
    (a: { name: string; id: string }, i: number) =>
      `${i + 1}. @${a.name} (${a.id.slice(0, 8)}...)`,
  );
  await sendTelegramMessage(
    ctx,
    config.telegramBotToken,
    chatId,
    `📋 可用的 Agent（共 ${agents.length} 位）：\n\n${lines.join("\n")}\n\n使用 @AgentName <指令> 來指派工作。`,
  );
}

async function handleTask(
  ctx: PluginContext,
  config: TelegramBridgeConfig,
  chatId: number,
  text: string,
  senderName: string,
): Promise<void> {
  // /task <title> — everything after "/task " is the title
  const title = text.replace(/^\/task\s*/i, "").trim();
  if (!title) {
    await sendTelegramMessage(
      ctx,
      config.telegramBotToken,
      chatId,
      "請提供任務標題，例如：/task 修復登入頁面的 CSS 問題",
    );
    return;
  }

  const issue = await ctx.issues.create({
    companyId: config.companyId,
    projectId: config.projectId || undefined,
    title,
    description: `[由 ${senderName} 透過 Telegram 建立]`,
  });

  await sendTelegramMessage(
    ctx,
    config.telegramBotToken,
    chatId,
    `✅ 已建立任務：${issue.title}\nID: ${issue.id?.slice(0, 8) ?? "N/A"}...`,
  );

  await ctx.activity.log({
    companyId: config.companyId,
    message: `Telegram /task: "${title}" (by ${senderName})`,
    metadata: { plugin: PLUGIN_ID, chatId, senderName },
  });
}

// ---------------------------------------------------------------------------
// Agent message routing
// ---------------------------------------------------------------------------

async function routeToAgent(
  ctx: PluginContext,
  config: TelegramBridgeConfig,
  chatId: number,
  text: string,
  senderName: string,
): Promise<void> {
  const mentionName = extractMention(text);
  const targetName: string = mentionName ?? config.defaultAgentName ?? "Jarvis";
  const prompt: string = mentionName ? stripMentions(text) : text;

  if (!prompt) {
    await sendTelegramMessage(
      ctx,
      config.telegramBotToken,
      chatId,
      "請在 @mention 後面加上您的指令內容。",
    );
    return;
  }

  const agent = await resolveAgentByName(ctx, config.companyId, targetName);
  if (!agent) {
    await sendTelegramMessage(
      ctx,
      config.telegramBotToken,
      chatId,
      `❌ 找不到 agent「${targetName}」。請確認名稱或用 /agents 查看列表。`,
    );
    return;
  }

  // Send typing indicator + processing notice
  await sendTypingAction(ctx, config.telegramBotToken, chatId);
  await sendTelegramMessage(
    ctx,
    config.telegramBotToken,
    chatId,
    `📨 收到！正在轉交給 ${agent.name} 處理⋯`,
  );

  try {
    const sessionId = await getOrCreateSession(
      ctx,
      config.companyId,
      chatId,
      agent.id,
      agent.name,
    );

    let fullResponse = "";

    await ctx.agents.sessions.sendMessage(sessionId, config.companyId, {
      prompt: `[Telegram 訊息來自 ${senderName}]\n\n${prompt}`,
      reason: "Telegram bridge message",
      onEvent: (event) => {
        if (event.stream === "stdout" && event.message) {
          fullResponse += event.message;
        }
      },
    });

    if (fullResponse.trim()) {
      await sendTelegramMessage(
        ctx,
        config.telegramBotToken,
        chatId,
        `💬 ${agent.name}：\n\n${fullResponse.trim()}`,
      );
    } else {
      await sendTelegramMessage(
        ctx,
        config.telegramBotToken,
        chatId,
        `✅ ${agent.name} 已完成處理（無文字回應）。`,
      );
    }

    await ctx.activity.log({
      companyId: config.companyId,
      message: `Telegram → ${agent.name}: "${prompt.slice(0, 100)}"`,
      metadata: {
        plugin: PLUGIN_ID,
        chatId,
        senderName,
        agentName: agent.name,
      },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    ctx.logger.error(`Failed to process message for ${agent.name}`, {
      error: errMsg,
    });

    // Clear broken session so next message creates a fresh one
    const stateKey = `${STATE_KEYS.chatSession}:${chatId}`;
    await ctx.state.delete({ scopeKind: "instance", stateKey });

    await sendTelegramMessage(
      ctx,
      config.telegramBotToken,
      chatId,
      `⚠️ 處理時發生錯誤：${errMsg}\n\n對話已重置，請重新傳送指令。`,
    );
  }
}

// ---------------------------------------------------------------------------
// Tool registration — agents can call these tools
// ---------------------------------------------------------------------------

async function registerTools(ctx: PluginContext): Promise<void> {
  // telegram_send — lets agents proactively push messages to Telegram
  ctx.tools.register(
    TOOL_NAMES.telegramSend,
    {
      displayName: "Telegram Send Message",
      description:
        "Sends a text message to the operator's Telegram chat via the Telegram Bridge bot.",
      parametersSchema: {
        type: "object",
        properties: {
          chatId: { type: "number" },
          text: { type: "string" },
        },
        required: ["text"],
      },
    },
    async (params, _runCtx: ToolRunContext): Promise<ToolResult> => {
      const { text, chatId: rawChatId } = params as {
        text?: string;
        chatId?: number;
      };
      if (!text) return { error: "text is required" };

      const config = (await ctx.config.get()) as unknown as TelegramBridgeConfig;
      const targetChatId = rawChatId ?? getNotifyChatId(config);
      if (!targetChatId) {
        return {
          error:
            "No target chat ID. Provide chatId parameter or configure notifyChatId.",
        };
      }

      await sendTelegramMessage(ctx, config.telegramBotToken, targetChatId, text);
      return { content: `Message sent to chat ${targetChatId}` };
    },
  );

  // telegram_create_issue — create an issue and notify Telegram
  ctx.tools.register(
    TOOL_NAMES.telegramCreateIssue,
    {
      displayName: "Telegram Create Issue",
      description:
        "Creates a Paperclip issue and sends a notification to the operator's Telegram chat.",
      parametersSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          chatId: { type: "number" },
        },
        required: ["title"],
      },
    },
    async (params, runCtx: ToolRunContext): Promise<ToolResult> => {
      const {
        title,
        description,
        chatId: rawChatId,
      } = params as {
        title?: string;
        description?: string;
        chatId?: number;
      };
      if (!title) return { error: "title is required" };

      const config = (await ctx.config.get()) as unknown as TelegramBridgeConfig;
      const issue = await ctx.issues.create({
        companyId: runCtx.companyId,
        projectId: runCtx.projectId || config.projectId || undefined,
        title,
        description,
      });

      const targetChatId = rawChatId ?? getNotifyChatId(config);
      if (targetChatId) {
        await sendTelegramMessage(
          ctx,
          config.telegramBotToken,
          targetChatId,
          `📝 Agent 建立了新任務：${issue.title}\nID: ${issue.id?.slice(0, 8) ?? "N/A"}...`,
        );
      }

      return {
        content: `Issue created: ${issue.title}`,
        data: { issueId: issue.id, title: issue.title },
      };
    },
  );
}

// ---------------------------------------------------------------------------
// Event handlers — push notifications to Telegram
// ---------------------------------------------------------------------------

async function registerEventHandlers(ctx: PluginContext): Promise<void> {
  // Notify when an issue is created (by any source)
  ctx.events.on("issue.created", async (event: PluginEvent) => {
    const config = (await ctx.config.get()) as unknown as TelegramBridgeConfig;
    const chatId = getNotifyChatId(config);
    if (!chatId || !event.entityId) return;

    ctx.logger.debug("issue.created → Telegram notification", {
      entityId: event.entityId,
    });

    try {
      const issue = await ctx.issues.get(event.entityId, event.companyId);
      if (!issue) return;
      await sendTelegramMessage(
        ctx,
        config.telegramBotToken,
        chatId,
        `📌 新任務建立：${issue.title}\nID: ${issue.id.slice(0, 8)}...`,
      );
    } catch (err) {
      ctx.logger.warn("Failed to send issue.created notification", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Notify when an agent run finishes
  ctx.events.on("agent.run.finished", async (event: PluginEvent) => {
    const config = (await ctx.config.get()) as unknown as TelegramBridgeConfig;
    const chatId = getNotifyChatId(config);
    if (!chatId || !event.entityId) return;

    ctx.logger.debug("agent.run.finished → Telegram notification", {
      entityId: event.entityId,
    });

    try {
      const agent = await ctx.agents.get(event.entityId, event.companyId);
      if (!agent) return;
      await sendTelegramMessage(
        ctx,
        config.telegramBotToken,
        chatId,
        `🏁 ${agent.name} 完成了一次執行。`,
      );
    } catch (err) {
      ctx.logger.warn("Failed to send agent.run.finished notification", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Job handlers
// ---------------------------------------------------------------------------

async function registerJobs(ctx: PluginContext): Promise<void> {
  ctx.jobs.register(JOB_KEYS.healthPing, async (_job: PluginJobContext) => {
    const config = (await ctx.config.get()) as unknown as TelegramBridgeConfig;
    const result = await verifyBotToken(ctx, config.telegramBotToken);

    await ctx.state.set(
      { scopeKind: "instance", stateKey: "last-health-ping" },
      {
        ok: result.ok,
        username: result.username,
        checkedAt: new Date().toISOString(),
      },
    );

    await ctx.metrics.write("telegram.health_ping", result.ok ? 1 : 0, {
      username: result.username ?? "unknown",
    });

    if (!result.ok) {
      ctx.logger.error(
        "Telegram health ping failed — bot token may be invalid or revoked",
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Plugin definition
// ---------------------------------------------------------------------------

const plugin = definePlugin({
  async setup(ctx) {
    pluginCtx = ctx;
    ctx.logger.info("Telegram Bridge plugin starting up (v0.2.0)");

    await registerEventHandlers(ctx);
    await registerJobs(ctx);
    await registerTools(ctx);
  },

  async onHealth() {
    const ctx = pluginCtx;
    if (!ctx) return { status: "error" as const, message: "No context" };

    const config = (await ctx.config.get()) as unknown as TelegramBridgeConfig;
    const result = await verifyBotToken(ctx, config.telegramBotToken);

    return {
      status: result.ok ? ("ok" as const) : ("degraded" as const),
      message: result.ok
        ? `Telegram Bridge ready (@${result.username})`
        : "Bot token verification failed",
      details: { username: result.username },
    };
  },

  async onConfigChanged(newConfig) {
    const ctx = pluginCtx;
    if (!ctx) return;

    const config = newConfig as unknown as TelegramBridgeConfig;
    ctx.logger.info("Config changed — re-verifying bot token");

    const result = await verifyBotToken(ctx, config.telegramBotToken);
    if (result.ok) {
      ctx.logger.info(`Bot token valid: @${result.username}`);
    } else {
      ctx.logger.error("Bot token verification failed after config change");
    }
  },

  async onValidateConfig(config) {
    const errors: string[] = [];
    const warnings: string[] = [];
    const typed = config as Partial<TelegramBridgeConfig>;

    if (!typed.telegramBotToken || typed.telegramBotToken.trim() === "") {
      errors.push(
        "telegramBotToken is required. Get one from @BotFather on Telegram.",
      );
    }
    if (!typed.companyId || typed.companyId.trim() === "") {
      errors.push("companyId is required.");
    }
    if (!typed.allowedChatIds || typed.allowedChatIds.trim() === "") {
      warnings.push(
        "allowedChatIds is empty — the bot will accept messages from ANY Telegram user. " +
          "Set this to restrict access to authorized users only.",
      );
    }
    return { ok: errors.length === 0, errors, warnings };
  },

  async onWebhook(input: PluginWebhookInput) {
    const ctx = pluginCtx;
    if (!ctx) return;

    if (input.endpointKey !== WEBHOOK_KEYS.telegramUpdate) {
      ctx.logger.warn(`Unknown webhook endpoint: ${input.endpointKey}`);
      return;
    }

    const config = (await ctx.config.get()) as unknown as TelegramBridgeConfig;
    const update = input.parsedBody as TelegramUpdate;

    // ---- Dedup ----
    if (update?.update_id && (await isDuplicateUpdate(ctx, update.update_id))) {
      ctx.logger.debug("Duplicate update_id, skipping", {
        update_id: update.update_id,
      });
      return;
    }

    // Validate: must have a message with text
    if (!update?.message?.text) {
      ctx.logger.debug("Ignoring non-text update", {
        update_id: update?.update_id,
      });
      return;
    }

    const msg = update.message;
    const chatId = msg.chat.id;
    const text = msg.text as string;
    const senderName =
      msg.from?.first_name ?? msg.from?.username ?? "Unknown";

    // ---- Access control ----
    if (!isChatAllowed(config.allowedChatIds, chatId)) {
      ctx.logger.warn(`Rejected message from unauthorized chat ${chatId}`);
      return;
    }

    ctx.logger.info(
      `Received message from ${senderName} (chat ${chatId}): ${text}`,
    );

    // ---- Route commands ----
    if (text.startsWith("/start")) {
      await handleStart(ctx, config, chatId);
    } else if (text.startsWith("/status")) {
      await handleStatus(ctx, config, chatId);
    } else if (text.startsWith("/reset")) {
      await handleReset(ctx, config, chatId);
    } else if (text.startsWith("/agents")) {
      await handleAgents(ctx, config, chatId);
    } else if (text.startsWith("/task")) {
      await handleTask(ctx, config, chatId, text, senderName);
    } else {
      // Regular message → route to agent
      await routeToAgent(ctx, config, chatId, text, senderName);
    }
  },

  async onShutdown() {
    pluginCtx = null;
  },
});

export default plugin;
runWorker(plugin, import.meta.url);