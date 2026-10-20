"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter as useNextRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Signpost, Plus } from "@/lib/ui/icons";
import { usePermission } from "@/hooks/auth/AuthProvider";
import { useRouters, useCreateRouter, type RouterListItem } from "@/hooks/ai/useRouters";
import type { ChannelSessionLite } from "../agents/[id]/_components/AgentForm";
import { rotuloDoEstadoDoCanal } from "@/lib/channels/estado";

interface Props {
  initialState: { routers: RouterListItem[] };
  channelSessions: ChannelSessionLite[];
}

function channelLabel(sessions: ChannelSessionLite[], id: string): string {
  const s = sessions.find((c) => c.id === id);
  if (!s) return "Numéro supprimé";
  return s.phone_number ? `${s.display_name} · ${s.phone_number}` : s.display_name;
}

export function RoutersClient({ initialState, channelSessions }: Props) {
  const { data } = useRouters(initialState);
  const routers = data?.routers ?? [];
  const canManagePerm = usePermission("ai.routers.manage");
  const [createOpen, setCreateOpen] = React.useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex sm:justify-end">
        {canManagePerm && (
          <Button onClick={() => setCreateOpen(true)} className="w-full sm:w-auto">
            <Plus /> Nouveau routeur
          </Button>
        )}
      </div>

      {routers.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <Signpost size={32} className="text-muted-foreground" aria-hidden />
          <p className="max-w-md text-sm text-muted-foreground">
            Un routeur comprend ce que veut le client et confie la conversation au bon agent — l’agent commercial parle à ceux qui veulent acheter, le support à ceux qui sont déjà clients, le tout sur le même WhatsApp. Créez-en un pour votre numéro et choisissez quels agents il sollicite.
          </p>
          {canManagePerm && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> Créer mon premier routeur
            </Button>
          )}
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {routers.map((r) => (
            <li key={r.id}>
              <Link href={`/app/ai/routers/${r.id}`}>
                <Card className="flex h-full flex-col gap-2 p-4 transition-colors hover:border-accent">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="truncate font-medium" title={r.name}>
                      {r.name}
                    </h3>
                    <Badge variant={r.is_active ? "success" : "neutral"} className="shrink-0 text-xs">
                      {r.is_active ? "ativo" : "inativo"}
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {channelLabel(channelSessions, r.channel_session_id)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.member_count === 0
                      ? "Aucune intention configurée"
                      : `${r.member_count} ${r.member_count === 1 ? "intention" : "intentions"}`}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <CreateRouterDialog
        key={createOpen ? "open" : "closed"}
        open={createOpen}
        onOpenChange={setCreateOpen}
        channelSessions={channelSessions}
      />
    </div>
  );
}

function CreateRouterDialog({
  open,
  onOpenChange,
  channelSessions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelSessions: ChannelSessionLite[];
}) {
  const nextRouter = useNextRouter();
  const create = useCreateRouter();
  const [name, setName] = React.useState("");
  const [channelSessionId, setChannelSessionId] = React.useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate(
      { name, channel_session_id: channelSessionId },
      {
        onSuccess: (res) => {
          toast.success("Routeur créé — choisissez maintenant les intentions.");
          onOpenChange(false);
          nextRouter.push(`/app/ai/routers/${res.id}`);
        },
        onError: showApiError,
      },
    );
  }

  const valid = name.trim().length > 0 && channelSessionId.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau routeur</DialogTitle>
          <DialogDescription>
            Choisissez le numéro WhatsApp qu’il va servir. Une fois créé, vous définissez les intentions et l’agent vers lequel chacune est dirigée.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="router-name">Nom</Label>
            <Input
              id="router-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. : Routeur commercial"
              maxLength={120}
              autoFocus
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="router-channel">Numéro WhatsApp</Label>
            <Select value={channelSessionId || undefined} onValueChange={setChannelSessionId}>
              <SelectTrigger id="router-channel">
                <SelectValue placeholder="Sélectionnez un numéro" />
              </SelectTrigger>
              <SelectContent>
                {channelSessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {/* Mesmo JSX do editor de agente, e o mesmo defeito: o
                        estado saía cru. Consertar só um lado deixaria o outro. */}
                    {s.display_name}
                    {s.phone_number ? ` · ${s.phone_number}` : ""} ·{" "}
                    {rotuloDoEstadoDoCanal(s.status)}
                  </SelectItem>
                ))}
                {channelSessions.length === 0 ? (
                  <SelectItem value="__none__" disabled>
                    Aucun numéro connecté
                  </SelectItem>
                ) : null}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Un seul routeur actif par numéro est possible.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={!valid || create.isPending}>
              {create.isPending ? "Création…" : "Créer le routeur"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
