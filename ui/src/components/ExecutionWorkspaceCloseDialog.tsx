import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ExecutionWorkspace } from "@paperclipai/shared";
import { useTranslation } from "react-i18next";
import { Link } from "@/lib/router";
import { Loader2 } from "lucide-react";
import { executionWorkspacesApi } from "../api/execution-workspaces";
import { useToast } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { formatDateTime, issueUrl } from "../lib/utils";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

type ExecutionWorkspaceCloseDialogProps = {
  workspaceId: string;
  workspaceName: string;
  currentStatus: ExecutionWorkspace["status"];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClosed?: (workspace: ExecutionWorkspace) => void;
};

function readinessTone(state: "ready" | "ready_with_warnings" | "blocked") {
  if (state === "blocked") {
    return "border-destructive/30 bg-destructive/5 text-destructive";
  }
  if (state === "ready_with_warnings") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300";
  }
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
}

export function ExecutionWorkspaceCloseDialog({
  workspaceId,
  workspaceName,
  currentStatus,
  open,
  onOpenChange,
  onClosed,
}: ExecutionWorkspaceCloseDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const actionLabel = currentStatus === "cleanup_failed" ? t("workspaceClose.retryClose") : t("workspaceClose.closeWorkspace");

  const readinessQuery = useQuery({
    queryKey: queryKeys.executionWorkspaces.closeReadiness(workspaceId),
    queryFn: () => executionWorkspacesApi.getCloseReadiness(workspaceId),
    enabled: open,
  });

  const closeWorkspace = useMutation({
    mutationFn: () => executionWorkspacesApi.update(workspaceId, { status: "archived" }),
    onSuccess: (workspace) => {
      queryClient.setQueryData(queryKeys.executionWorkspaces.detail(workspace.id), workspace);
      queryClient.invalidateQueries({ queryKey: queryKeys.executionWorkspaces.closeReadiness(workspace.id) });
      pushToast({
        title: currentStatus === "cleanup_failed" ? t("workspaceClose.toastRetried") : t("workspaceClose.toastClosed"),
        tone: "success",
      });
      onOpenChange(false);
      onClosed?.(workspace);
    },
    onError: (error) => {
      pushToast({
        title: t("workspaceClose.toastFailed"),
        body: error instanceof Error ? error.message : t("workspaceClose.unknownError"),
        tone: "error",
      });
    },
  });

  const readiness = readinessQuery.data ?? null;
  const blockingIssues = readiness?.linkedIssues.filter((issue) => !issue.isTerminal) ?? [];
  const otherLinkedIssues = readiness?.linkedIssues.filter((issue) => issue.isTerminal) ?? [];
  const confirmDisabled =
    currentStatus === "archived" ||
    closeWorkspace.isPending ||
    readinessQuery.isLoading ||
    readiness == null ||
    readiness.state === "blocked";

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!closeWorkspace.isPending) onOpenChange(nextOpen);
    }}>
      <DialogContent className="max-h-[85vh] overflow-x-hidden overflow-y-auto p-4 sm:max-w-2xl sm:p-6 [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>{actionLabel}</DialogTitle>
          <DialogDescription className="break-words text-xs sm:text-sm">
            {t("workspaceClose.archiveDescription", { name: workspaceName })}
          </DialogDescription>
        </DialogHeader>

        {readinessQuery.isLoading ? (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-xs sm:px-4 sm:py-3 sm:text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            {t("workspaceClose.checkingSafe")}
          </div>
        ) : readinessQuery.error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs sm:px-4 sm:py-3 sm:text-sm text-destructive">
            {readinessQuery.error instanceof Error ? readinessQuery.error.message : t("workspaceClose.failedToInspect")}
          </div>
        ) : readiness ? (
          <div className="min-w-0 space-y-3 sm:space-y-4">
            <div className={`rounded-xl border px-3 py-2.5 text-xs sm:px-4 sm:py-3 sm:text-sm ${readinessTone(readiness.state)}`}>
              <div className="font-medium">
                {readiness.state === "blocked"
                  ? t("workspaceClose.closeBlocked")
                  : readiness.state === "ready_with_warnings"
                    ? t("workspaceClose.closeAllowedWithWarnings")
                    : t("workspaceClose.closeReady")}
              </div>
              <div className="mt-1 text-xs opacity-80">
                {readiness.isSharedWorkspace
                  ? t("workspaceClose.sharedWorkspaceDesc")
                  : readiness.git?.workspacePath && readiness.git.repoRoot && readiness.git.workspacePath !== readiness.git.repoRoot
                    ? t("workspaceClose.ownCheckoutDesc")
                    : readiness.isProjectPrimaryWorkspace
                      ? t("workspaceClose.primaryWorkspaceDesc")
                      : t("workspaceClose.disposableDesc")}
              </div>
            </div>

            {blockingIssues.length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-xs font-medium sm:text-sm">{t("workspaceClose.blockingIssues")}</h3>
                <div className="space-y-1.5 sm:space-y-2">
                  {blockingIssues.map((issue) => (
                    <div key={issue.id} className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs sm:px-4 sm:py-3 sm:text-sm">
                      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                        <Link to={issueUrl(issue)} className="min-w-0 break-words font-medium hover:underline">
                          {issue.identifier ?? issue.id} · {issue.title}
                        </Link>
                        <span className="text-xs text-muted-foreground">{issue.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {readiness.blockingReasons.length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-xs font-medium sm:text-sm">{t("workspaceClose.blockingReasons")}</h3>
                <ul className="space-y-1.5 text-xs sm:space-y-2 sm:text-sm text-muted-foreground">
                  {readiness.blockingReasons.map((reason, idx) => (
                    <li key={`blocking-${idx}`} className="break-words rounded-lg border border-destructive/20 bg-destructive/5 px-2.5 py-1.5 sm:px-3 sm:py-2 text-destructive">
                      {reason}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {readiness.warnings.length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-xs font-medium sm:text-sm">{t("workspaceClose.warnings")}</h3>
                <ul className="space-y-1.5 text-xs sm:space-y-2 sm:text-sm text-muted-foreground">
                  {readiness.warnings.map((warning, idx) => (
                    <li key={`warning-${idx}`} className="break-words rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5 sm:px-3 sm:py-2">
                      {warning}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {readiness.git ? (
              <section className="space-y-2">
                <h3 className="text-xs font-medium sm:text-sm">{t("workspaceClose.gitStatus")}</h3>
                <div className="overflow-hidden rounded-xl border border-border bg-muted/20 px-3 py-2.5 text-xs sm:px-4 sm:py-3 sm:text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="min-w-0">
                      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{t("workspaceClose.branch")}</div>
                      <div className="truncate font-mono text-xs">{readiness.git.branchName ?? t("workspaceClose.unknown")}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{t("workspaceClose.baseRef")}</div>
                      <div className="truncate font-mono text-xs">{readiness.git.baseRef ?? t("workspaceClose.notSet")}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{t("workspaceClose.mergedIntoBase")}</div>
                      <div>{readiness.git.isMergedIntoBase == null ? t("workspaceClose.unknown") : readiness.git.isMergedIntoBase ? t("workspaceClose.yes") : t("workspaceClose.no")}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{t("workspaceClose.aheadBehind")}</div>
                      <div>
                        {(readiness.git.aheadCount ?? 0).toString()} / {(readiness.git.behindCount ?? 0).toString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{t("workspaceClose.dirtyTrackedFiles")}</div>
                      <div>{readiness.git.dirtyEntryCount}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{t("workspaceClose.untrackedFiles")}</div>
                      <div>{readiness.git.untrackedEntryCount}</div>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {otherLinkedIssues.length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-xs font-medium sm:text-sm">{t("workspaceClose.otherLinkedIssues")}</h3>
                <div className="space-y-1.5 sm:space-y-2">
                  {otherLinkedIssues.map((issue) => (
                    <div key={issue.id} className="rounded-xl border border-border bg-muted/20 px-3 py-2 text-xs sm:px-4 sm:py-3 sm:text-sm">
                      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                        <Link to={issueUrl(issue)} className="min-w-0 break-words font-medium hover:underline">
                          {issue.identifier ?? issue.id} · {issue.title}
                        </Link>
                        <span className="text-xs text-muted-foreground">{issue.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {readiness.runtimeServices.length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-xs font-medium sm:text-sm">{t("workspaceClose.attachedRuntimeServices")}</h3>
                <div className="space-y-1.5 sm:space-y-2">
                  {readiness.runtimeServices.map((service) => (
                    <div key={service.id} className="rounded-xl border border-border bg-muted/20 px-3 py-2 text-xs sm:px-4 sm:py-3 sm:text-sm">
                      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{service.serviceName}</span>
                        <span className="text-xs text-muted-foreground">{service.status} · {service.lifecycle}</span>
                      </div>
                      <div className="mt-1 break-words text-xs text-muted-foreground">
                        {service.url ?? service.command ?? service.cwd ?? t("workspaceClose.noAdditionalDetails")}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="space-y-2">
              <h3 className="text-xs font-medium sm:text-sm">{t("workspaceClose.cleanupActions")}</h3>
              <div className="space-y-1.5 sm:space-y-2">
                {readiness.plannedActions.map((action, index) => (
                  <div key={`${action.kind}-${index}`} className="rounded-xl border border-border bg-muted/20 px-3 py-2 text-xs sm:px-4 sm:py-3 sm:text-sm">
                    <div className="font-medium">{action.label}</div>
                    <div className="mt-1 break-words text-muted-foreground">{action.description}</div>
                    {action.command ? (
                      <pre className="mt-2 whitespace-pre-wrap break-all rounded-lg bg-background px-3 py-2 font-mono text-xs text-foreground">
                        {action.command}
                      </pre>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>

            {currentStatus === "cleanup_failed" ? (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs sm:px-4 sm:py-3 sm:text-sm text-muted-foreground">
                {t("workspaceClose.cleanupFailedMessage")}
              </div>
            ) : null}

            {currentStatus === "archived" ? (
              <div className="rounded-xl border border-border bg-muted/20 px-3 py-2.5 text-xs sm:px-4 sm:py-3 sm:text-sm text-muted-foreground">
                {t("workspaceClose.alreadyArchived")}
              </div>
            ) : null}

            {readiness.git?.repoRoot ? (
              <div className="overflow-hidden break-words text-xs text-muted-foreground">
                {t("workspaceClose.repoRoot")} <span className="font-mono break-all">{readiness.git.repoRoot}</span>
                {readiness.git.workspacePath ? (
                  <>
                    {" · "}{t("workspaceClose.workspacePath")} <span className="font-mono break-all">{readiness.git.workspacePath}</span>
                  </>
                ) : null}
              </div>
            ) : null}

            <div className="text-xs text-muted-foreground">
              {t("workspaceClose.lastChecked")} {formatDateTime(new Date())}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={closeWorkspace.isPending}
          >
            {t("workspaceClose.cancel")}
          </Button>
          <Button
            variant={currentStatus === "cleanup_failed" ? "default" : "destructive"}
            onClick={() => closeWorkspace.mutate()}
            disabled={confirmDisabled}
          >
            {closeWorkspace.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
