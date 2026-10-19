"use client";
import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { formatDistanceToNowStrict } from "date-fns";
import { fr } from "date-fns/locale";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { copyToClipboard } from "@/lib/clipboard";
import { Copy, Trash, CaretDown } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import {
  useDeleteWebhookSource,
  useUpdateWebhookSource,
  useWebhookSourceEvents,
  type WebhookSourceRow,
} from "@/hooks/webhooks/useWebhookSources";

interface Props {
  source: WebhookSourceRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function publicUrl(pathToken: string): string {
  // window.location.origin > env: NEXT_PUBLIC_APP_URL é inlined no build e num
  // Docker self-host fica congelada no placeholder do Dockerfile — a origem da
  // página é o único valor confiável em runtime.
  const base =
    typeof window !== "undefined"
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_APP_URL ?? "");
  return `${base}/api/v1/webhooks/in/${pathToken}`;
}

function formSnippet(url: string): string {
  return `<form action="${url}" method="POST">
  <input name="nome" placeholder="Votre nom" required />
  <input name="telefone" placeholder="Votre WhatsApp" required />
  <input name="email" type="email" placeholder="Votre e-mail" />
  <button type="submit">Quero receber contato</button>
</form>`;
}

function curlSnippet(url: string): string {
  return `curl -X POST ${url} \\\n  -H 'Content-Type: application/json' \\\n  -d '{"nome":"...","telefone":"..."}'`;
}

async function copy(text: string, label: string): Promise<void> {
  const ok = await copyToClipboard(text);
  if (ok) toast.success(label);
  else toast.error("Impossible de copier — sélectionnez et copiez manuellement.");
}

function relativeReceivedAt(iso: string): string {
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true, locale: fr });
}

export function SourceDetail({ source, open, onOpenChange }: Props) {
  const update = useUpdateWebhookSource();
  const del = useDeleteWebhookSource();
  const { data: eventsRes, refetch: refetchEvents } = useWebhookSourceEvents(
    open ? source.id : null,
  );
  const [testing, setTesting] = React.useState(false);
  const [testOk, setTestOk] = React.useState(false);

  const url = publicUrl(source.path_token);
  const events = eventsRes?.data ?? [];

  const sendTestLead = async () => {
    setTesting(true);
    setTestOk(false);
    try {
      // URL relativa de propósito: o teste bate no host que está servindo a
      // página, mesmo que NEXT_PUBLIC_APP_URL (usada na URL exibida p/ forms
      // externos) esteja desalinhada num self-host atrás de proxy.
      const res = await fetch(`/api/v1/webhooks/in/${source.path_token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: "Lead de test", telefone: "11999990000", utm_source: "teste" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(
          body?.error?.message ??
            "Cela n’a pas fonctionné. Vérifiez que la source est active et que le tableau/l’étape existent toujours.",
        );
        return;
      }
      toast.success("Ça fonctionne ! Un lead de test est entré dans votre tableau.");
      setTestOk(true);
      void refetchEvents();
    } catch {
      toast.error("Impossible de joindre l’adresse. Vérifiez votre connexion internet et réessayez.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <SheetTitle>{source.name}</SheetTitle>
            <Badge variant={source.is_active ? "success" : "neutral"}>
              {source.is_active ? "Ativa" : "Pausada"}
            </Badge>
          </div>
          <SheetDescription>
            Chaque envoi vers l’adresse ci-dessous devient automatiquement un lead dans votre tableau.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <section className="space-y-2">
            <p className="text-sm font-medium text-text">Adresse de la source</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-sm border border-border bg-muted px-3 py-2 text-xs">
                {url}
              </code>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={() => copy(url, "Endereço copiado.")}
              >
                <Copy />
              </Button>
            </div>
          </section>

          <section className="space-y-2">
            <p className="text-sm font-medium text-text">Formulaire prêt à coller sur votre site</p>
            <Textarea readOnly rows={6} value={formSnippet(url)} className="font-mono text-xs" />
            <Button
              type="button"
              variant="secondary"
              onClick={() => copy(formSnippet(url), "Formulário copiado.")}
            >
              <Copy /> Copier le formulaire
            </Button>
          </section>

          <section className="space-y-2 rounded-sm border border-border">
            <details className="group p-3">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-text">
                Comment le connecter dans votre cas
                <CaretDown className="transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-3 space-y-4 text-sm text-muted-foreground">
                <div>
                  <p className="font-medium text-text">WordPress / Elementor</p>
                  <p>Collez l’adresse ci-dessus dans le champ &quot;Action&quot; (ou &quot;URL d’envoi&quot;) de votre formulaire.</p>
                </div>
                <div>
                  <p className="font-medium text-text">Zapier / n8n</p>
                  <p>Utilisez l’action &quot;Webhooks&quot; → POST, pointant vers l’adresse ci-dessus.</p>
                </div>
                <div>
                  <p className="font-medium text-text">Formulaire personnalisé</p>
                  <p>Utilisez le HTML prêt à l’emploi juste au-dessus — il pointe déjà vers la bonne adresse.</p>
                </div>
              </div>
            </details>
          </section>

          <details className="rounded-sm border border-border p-3">
            <summary className="cursor-pointer list-none text-sm font-medium text-text">
              Pour les développeurs
            </summary>
            <pre className="mt-3 overflow-x-auto rounded-sm bg-muted p-3 text-xs">
              <code>{curlSnippet(url)}</code>
            </pre>
          </details>

          <section className="space-y-3">
            <Button type="button" onClick={sendTestLead} disabled={testing}>
              {testing ? "Enviando…" : "Envoyer un lead de test"}
            </Button>
            {testOk ? (
              <p className="text-sm">
                <Link href="/app/kanban" className="text-accent underline underline-offset-4">
                  Voir dans le Kanban
                </Link>
              </p>
            ) : null}
          </section>

          <section className="space-y-2">
            <p className="text-sm font-medium text-text">Dernières réceptions</p>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">Rien n’est encore arrivé ici.</p>
            ) : (
              <ul className="space-y-1">
                {events.map((ev) => (
                  <li key={ev.id} className="flex items-center gap-2 text-sm">
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        ev.valid_signature === false ? "bg-error" : "bg-success",
                      )}
                    />
                    <span className="text-muted-foreground">{relativeReceivedAt(ev.created_at)}</span>
                    {ev.valid_signature === false ? (
                      <span className="text-xs text-error">signature invalide</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex items-center justify-between rounded-sm border border-border p-3">
            <div>
              <p className="text-sm font-medium text-text">Source active</p>
              <p className="text-xs text-muted-foreground">En pause, elle n’accepte plus de nouveaux envois.</p>
            </div>
            <Switch
              checked={source.is_active}
              disabled={update.isPending}
              onCheckedChange={(checked) =>
                update.mutate(
                  { id: source.id, is_active: checked },
                  {
                    onSuccess: () =>
                      toast.success(checked ? "Fonte ativada." : "Fonte pausada."),
                  },
                )
              }
            />
          </section>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="destructive">
                <Trash /> Supprimer la source
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer cette source ?</AlertDialogTitle>
                <AlertDialogDescription>
                  L’adresse cesse de fonctionner immédiatement. Les leads déjà reçus restent dans votre tableau — seule la captation future est interrompue. Cette action est irréversible.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    await del.mutateAsync(source.id);
                    toast.success("Source supprimée.");
                    onOpenChange(false);
                  }}
                >
                  Supprimer
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </SheetContent>
    </Sheet>
  );
}
