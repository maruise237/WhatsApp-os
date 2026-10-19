"use client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Clock } from "@/lib/ui/icons";
import { useSnoozeConversation } from "@/hooks/inbox/useSnoozeConversation";

interface Props {
  conversationId: string;
  snoozeUntil: string | null;
  disabled?: boolean;
}

const DURATIONS: Array<{ hours: 1 | 3 | 24; label: string }> = [
  { hours: 1, label: "Dans 1 heure" },
  { hours: 3, label: "Dans 3 heures" },
  { hours: 24, label: "Dans 24 heures" },
];

function isSnoozeActive(snoozeUntil: string | null): boolean {
  return snoozeUntil != null && new Date(snoozeUntil).getTime() > Date.now();
}

export function SnoozeButton({ conversationId, snoozeUntil, disabled }: Props) {
  const { snooze, cancel } = useSnoozeConversation();
  const isActive = isSnoozeActive(snoozeUntil);
  const isPending = snooze.isPending || cancel.isPending;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || isPending}
          className="flex items-center gap-1"
        >
          <Clock size={12} weight="regular" aria-hidden />
          {isActive ? "Lembrete ativo" : "Lembrar"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {isActive ? (
          <DropdownMenuItem
            onClick={() => cancel.mutate({ conversation_id: conversationId })}
          >
            Annuler le rappel
          </DropdownMenuItem>
        ) : (
          DURATIONS.map((d) => (
            <DropdownMenuItem
              key={d.hours}
              onClick={() =>
                snooze.mutate({ conversation_id: conversationId, duration_hours: d.hours })
              }
            >
              {d.label}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
