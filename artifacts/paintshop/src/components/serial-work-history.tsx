import { useState } from "react";
import { getListJobWorkflowHistoryQueryKey, useListJobWorkflowHistory } from "@workspace/api-client-react";
import { History } from "lucide-react";
import { useLanguage } from "@/lib/language";

export function SerialWorkHistory({ serialNumberId, testId }: { serialNumberId: number; testId?: string }) {
  const { language, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const history = useListJobWorkflowHistory(serialNumberId, {
    query: {
      queryKey: getListJobWorkflowHistoryQueryKey(serialNumberId),
      enabled: open && serialNumberId > 0,
    },
  });

  return (
    <div className="mt-1">
      <button type="button" className="inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-foreground" aria-expanded={open} onClick={() => setOpen((value) => !value)} data-testid={testId ?? `button-history-${serialNumberId}`}>
        <History size={12} />{t("history")}
      </button>
      {open && (
        <div className="mt-2 border-l border-border pl-2">
          {history.isLoading ? <div className="py-2 text-[10px] text-muted-foreground">{t("loading")}</div>
            : history.error ? <p className="py-2 text-[10px] text-destructive">{t("error")}</p>
            : !(history.data?.length) ? <p className="py-2 text-[10px] text-muted-foreground">{t("historyEmpty")}</p>
            : <div className="space-y-2">{history.data.map((event) => {
              const eventKey = event.eventType === "paint_usage_recorded" ? "usageRecorded"
                : event.eventType === "progress_updated" ? "progressUpdated"
                : event.eventType === "handed_over" ? "handedOver"
                : event.eventType === "shipment_verified" ? "shipmentVerified"
                : event.eventType;
              return <div key={event.id} className="text-[10px]" data-testid={`event-work-${event.id}`}>
                <span className="font-semibold">{event.actorName || "—"}</span>
                <span className="text-muted-foreground"> · {t(eventKey)} · {event.progressPct ?? 0}%</span>
                <p className="text-muted-foreground">{new Intl.DateTimeFormat(language === "id" ? "id-ID" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.createdAt))}{event.note ? ` · ${event.note}` : ""}</p>
              </div>;
            })}</div>}
        </div>
      )}
    </div>
  );
}
