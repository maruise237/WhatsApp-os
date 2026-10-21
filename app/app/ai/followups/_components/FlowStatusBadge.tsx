import { Badge } from "@/components/ui/badge";
import type { FollowupFlowStatus } from "@/hooks/followup/useFollowupFlows";
import { useT } from "@/hooks/i18n/useT";

const LABEL: Record<FollowupFlowStatus, string> = {
  draft: "Rascunho",
  active: "Actif",
  disabled: "Désactivé",
};

const VARIANT: Record<FollowupFlowStatus, "neutral" | "success" | "warning"> = {
  draft: "neutral",
  active: "success",
  disabled: "warning",
};

export function FlowStatusBadge({ status }: { status: FollowupFlowStatus }) {
  const t = useT();
  return (
    <Badge variant={VARIANT[status]} aria-label={`${t("statut :")} ${t(LABEL[status])}`}>
      {t(LABEL[status])}
    </Badge>
  );
}
