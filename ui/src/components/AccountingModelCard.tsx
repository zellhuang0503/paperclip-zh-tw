import { useTranslation } from "react-i18next";
import { Database, Gauge, ReceiptText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function AccountingModelCard() {
  const { t } = useTranslation();

  const SURFACES = [
    {
      titleKey: "finance.inferenceLedger",
      descriptionKey: "finance.inferenceLedgerDesc",
      icon: Database,
      pointKeys: ["finance.inferenceLedgerPoint1", "finance.inferenceLedgerPoint2", "finance.inferenceLedgerPoint3"],
      tone: "from-sky-500/12 via-sky-500/6 to-transparent",
    },
    {
      titleKey: "finance.financeLedger",
      descriptionKey: "finance.financeLedgerDesc",
      icon: ReceiptText,
      pointKeys: ["finance.financeLedgerPoint1", "finance.financeLedgerPoint2", "finance.financeLedgerPoint3"],
      tone: "from-amber-500/14 via-amber-500/6 to-transparent",
    },
    {
      titleKey: "finance.liveQuotas",
      descriptionKey: "finance.liveQuotasDesc",
      icon: Gauge,
      pointKeys: ["finance.liveQuotasPoint1", "finance.liveQuotasPoint2", "finance.liveQuotasPoint3"],
      tone: "from-emerald-500/14 via-emerald-500/6 to-transparent",
    },
  ] as const;

  return (
    <Card className="relative overflow-hidden border-border/70">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.08),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.1),transparent_32%)]" />
      <CardHeader className="relative px-5 pt-5 pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {t("finance.accountingModel")}
        </CardTitle>
        <CardDescription className="max-w-2xl text-sm leading-6">
          {t("finance.accountingModelDesc")}
        </CardDescription>
      </CardHeader>
      <CardContent className="relative grid gap-3 px-5 pb-5 md:grid-cols-3">
        {SURFACES.map((surface) => {
          const Icon = surface.icon;
          return (
            <div
              key={surface.titleKey}
              className={`rounded-2xl border border-border/70 bg-gradient-to-br ${surface.tone} p-4 shadow-sm`}
            >
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-background/80">
                  <Icon className="h-4 w-4 text-foreground" />
                </div>
                <div>
                  <div className="text-sm font-semibold">{t(surface.titleKey)}</div>
                  <div className="text-xs text-muted-foreground">{t(surface.descriptionKey)}</div>
                </div>
              </div>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                {surface.pointKeys.map((pointKey) => (
                  <div key={pointKey}>{t(pointKey)}</div>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
