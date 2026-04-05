import { useTranslation } from "react-i18next";
import { Link } from "@/lib/router";
import { Identity } from "./Identity";
import { timeAgo } from "../lib/timeAgo";
import { cn } from "../lib/utils";
import { deriveProjectUrlKey, type ActivityEvent, type Agent } from "@paperclipai/shared";

function humanizeValue(value: unknown): string {
  if (typeof value !== "string") return String(value ?? "none");
  return value.replace(/_/g, " ");
}

function formatVerb(action: string, details: Record<string, unknown> | null | undefined, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (action === "issue.updated" && details) {
    const previous = (details._previous ?? {}) as Record<string, unknown>;
    if (details.status !== undefined) {
      const from = previous.status;
      return from
        ? t("activity.changedStatusFromTo", { from: humanizeValue(from), to: humanizeValue(details.status) })
        : t("activity.changedStatusTo", { to: humanizeValue(details.status) });
    }
    if (details.priority !== undefined) {
      const from = previous.priority;
      return from
        ? t("activity.changedPriorityFromTo", { from: humanizeValue(from), to: humanizeValue(details.priority) })
        : t("activity.changedPriorityTo", { to: humanizeValue(details.priority) });
    }
  }

  const ACTION_VERBS: Record<string, string> = {
    "issue.created": t("activity.verb.created"),
    "issue.updated": t("activity.verb.updated"),
    "issue.checked_out": t("activity.verb.checkedOut"),
    "issue.released": t("activity.verb.released"),
    "issue.comment_added": t("activity.verb.commentedOn"),
    "issue.attachment_added": t("activity.verb.attachedFileTo"),
    "issue.attachment_removed": t("activity.verb.removedAttachmentFrom"),
    "issue.document_created": t("activity.verb.createdDocumentFor"),
    "issue.document_updated": t("activity.verb.updatedDocumentOn"),
    "issue.document_deleted": t("activity.verb.deletedDocumentFrom"),
    "issue.commented": t("activity.verb.commentedOn"),
    "issue.deleted": t("activity.verb.deleted"),
    "agent.created": t("activity.verb.created"),
    "agent.updated": t("activity.verb.updated"),
    "agent.paused": t("activity.verb.paused"),
    "agent.resumed": t("activity.verb.resumed"),
    "agent.terminated": t("activity.verb.terminated"),
    "agent.key_created": t("activity.verb.createdApiKeyFor"),
    "agent.budget_updated": t("activity.verb.updatedBudgetFor"),
    "agent.runtime_session_reset": t("activity.verb.resetSessionFor"),
    "heartbeat.invoked": t("activity.verb.invokedHeartbeatFor"),
    "heartbeat.cancelled": t("activity.verb.cancelledHeartbeatFor"),
    "approval.created": t("activity.verb.requestedApproval"),
    "approval.approved": t("activity.verb.approved"),
    "approval.rejected": t("activity.verb.rejected"),
    "project.created": t("activity.verb.created"),
    "project.updated": t("activity.verb.updated"),
    "project.deleted": t("activity.verb.deleted"),
    "goal.created": t("activity.verb.created"),
    "goal.updated": t("activity.verb.updated"),
    "goal.deleted": t("activity.verb.deleted"),
    "cost.reported": t("activity.verb.reportedCostFor"),
    "cost.recorded": t("activity.verb.recordedCostFor"),
    "company.created": t("activity.verb.createdCompany"),
    "company.updated": t("activity.verb.updatedCompany"),
    "company.archived": t("activity.verb.archived"),
    "company.budget_updated": t("activity.verb.updatedBudgetFor"),
  };

  return ACTION_VERBS[action] ?? action.replace(/[._]/g, " ");
}

function entityLink(entityType: string, entityId: string, name?: string | null): string | null {
  switch (entityType) {
    case "issue": return `/issues/${name ?? entityId}`;
    case "agent": return `/agents/${entityId}`;
    case "project": return `/projects/${deriveProjectUrlKey(name, entityId)}`;
    case "goal": return `/goals/${entityId}`;
    case "approval": return `/approvals/${entityId}`;
    default: return null;
  }
}

interface ActivityRowProps {
  event: ActivityEvent;
  agentMap: Map<string, Agent>;
  entityNameMap: Map<string, string>;
  entityTitleMap?: Map<string, string>;
  className?: string;
}

export function ActivityRow({ event, agentMap, entityNameMap, entityTitleMap, className }: ActivityRowProps) {
  const { t } = useTranslation();
  const verb = formatVerb(event.action, event.details, t);

  const isHeartbeatEvent = event.entityType === "heartbeat_run";
  const heartbeatAgentId = isHeartbeatEvent
    ? (event.details as Record<string, unknown> | null)?.agentId as string | undefined
    : undefined;

  const name = isHeartbeatEvent
    ? (heartbeatAgentId ? entityNameMap.get(`agent:${heartbeatAgentId}`) : null)
    : entityNameMap.get(`${event.entityType}:${event.entityId}`);

  const entityTitle = entityTitleMap?.get(`${event.entityType}:${event.entityId}`);

  const link = isHeartbeatEvent && heartbeatAgentId
    ? `/agents/${heartbeatAgentId}/runs/${event.entityId}`
    : entityLink(event.entityType, event.entityId, name);

  const actor = event.actorType === "agent" ? agentMap.get(event.actorId) : null;
  const actorName = actor?.name ?? (event.actorType === "system" ? t("activity.system") : event.actorType === "user" ? t("activity.board") : event.actorId || t("activity.unknown"));

  const inner = (
    <div className="flex gap-3">
      <p className="flex-1 min-w-0 truncate">
        <Identity
          name={actorName}
          size="xs"
          className="align-baseline"
        />
        <span className="text-muted-foreground ml-1">{verb} </span>
        {name && <span className="font-medium">{name}</span>}
        {entityTitle && <span className="text-muted-foreground ml-1">— {entityTitle}</span>}
      </p>
      <span className="text-xs text-muted-foreground shrink-0 pt-0.5">{timeAgo(event.createdAt)}</span>
    </div>
  );

  const classes = cn(
    "px-4 py-2 text-sm",
    link && "cursor-pointer hover:bg-accent/50 transition-colors",
    className,
  );

  if (link) {
    return (
      <Link to={link} className={cn(classes, "no-underline text-inherit block")}>
        {inner}
      </Link>
    );
  }

  return (
    <div className={classes}>
      {inner}
    </div>
  );
}
