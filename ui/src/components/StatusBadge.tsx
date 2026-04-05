import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import { statusBadge, statusBadgeDefault } from "../lib/status-colors";

const STATUS_KEY_MAP: Record<string, string> = {
  backlog: "status.backlog",
  todo: "status.todo",
  in_progress: "status.inProgress",
  in_review: "status.inReview",
  done: "status.done",
  cancelled: "status.cancelled",
  blocked: "status.blocked",
  active: "status.active",
  running: "status.running",
  paused: "status.paused",
  idle: "status.idle",
  archived: "status.archived",
  error: "status.error",
  pending: "status.pendingApproval",
  pending_approval: "status.pendingApproval",
  terminated: "status.terminated",
  planned: "status.planned",
  achieved: "status.achieved",
  completed: "status.completed",
  failed: "status.failed",
  timed_out: "status.timedOut",
  succeeded: "status.succeeded",
  revision_requested: "status.revisionRequested",
  approved: "status.approved",
  rejected: "status.rejected",
};

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const translationKey = STATUS_KEY_MAP[status];
  const displayText = translationKey ? t(translationKey) : status.replace("_", " ");

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap shrink-0",
        statusBadge[status] ?? statusBadgeDefault
      )}
    >
      {displayText}
    </span>
  );
}
