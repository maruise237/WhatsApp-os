"use client";
import { useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ShieldCheck, PencilSimple } from "@/lib/ui/icons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useContact } from "@/hooks/contacts/useContact";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { ROLE_RANK } from "@/lib/auth/types";
import { TimelineView } from "@/components/contacts/TimelineView";
import { EditContactDialog } from "@/components/contacts/EditContactDialog";
import { AnonymizeDialog } from "@/components/contacts/AnonymizeDialog";
import { PropostasDeDado } from "@/components/contacts/PropostasDeDado";
import { ConversaNoDossie } from "@/components/kanban/ConversaNoDossie";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { useT } from "@/hooks/i18n/useT";

interface Props {
  contactId: string;
}

export function ContactDetailClient({ contactId }: Props) {
  const t = useT();
  const q = useContact(contactId);
  const { user, activeOrg } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [anonOpen, setAnonOpen] = useState(false);

  if (q.isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (q.isError || !q.data) {
    return (
      <div className="p-6">
        <Card className="p-6 text-center text-sm text-error-fg">
          {t("Erreur lors du chargement du contact.")}
        </Card>
      </div>
    );
  }

  const contact = q.data.data;
  const isAdmin =
    user.is_platform_admin || (activeOrg && ROLE_RANK[activeOrg.role] >= ROLE_RANK.admin);

  // Uma decisão, um lugar (lib/contacts/rotulo-do-contato.ts). Esta tela era
  // uma das DUAS que ignoravam o telefone: contato com número e sem nome
  // aparecia como "Sem nome" aqui e com o número no inbox.
  const displayName = rotuloDoContato(contact);

  return (
    <div className="space-y-4 p-6">
      {contact.is_anonymized && (
        <div
          role="alert"
          className="border-error-fg/30 sticky top-0 z-20 flex items-center gap-3 rounded-md border bg-error-bg p-3 text-sm text-error-fg"
        >
          <ShieldCheck size={18} weight="duotone" aria-hidden />
          <span>
            {t("Contact anonymisé (protection des données)")}
            {contact.anonymized_at &&
              ` le ${format(new Date(contact.anonymized_at), "dd/MM/yyyy", { locale: fr })}`}
            {` — ${t("modification bloquée.")}`}
          </span>
        </div>
      )}

      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          {/* Sem truncar: nome é dado que a tela existe pra mostrar, e cortar
              com reticências sem um jeito de ver o resto violaria o princípio
              de nunca esconder informação crítica. Deixa quebrar linha. */}
          <h1 className="break-words text-2xl font-semibold tracking-tight">{displayName}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {contact.email && <span>{contact.email}</span>}
            {contact.email && contact.phone_number && <span>•</span>}
            {contact.phone_number && <span>{contact.phone_number}</span>}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {contact.tags.map((t) => (
              <Badge key={t} variant="neutral">
                {t}
              </Badge>
            ))}
            {contact.is_blocked && <Badge variant="warning">{t("Bloqué")}</Badge>}
            {contact.is_anonymized && <Badge variant="destructive">{t("Anonymisé")}</Badge>}
          </div>
        </div>
        {!contact.is_anonymized && (
          <Button variant="outline" onClick={() => setEditOpen(true)} className="shrink-0">
            <PencilSimple size={16} weight="bold" aria-hidden />
            <span>{t("Modifier")}</span>
          </Button>
        )}
      </header>

      <ConversaNoDossie conversa={contact.conversa} />

      {/* ANTES das abas, e não dentro de uma delas: é o único conteúdo desta
          tela que PEDE uma ação. Enterrado numa aba, viraria pendência que só
          quem já sabe que existe encontra — e a fila deixaria de ser fila.
          Some sozinho quando não há nada aguardando. */}
      {!contact.is_anonymized && (
        <PropostasDeDado
          contactId={contactId}
          podeDecidir={Boolean(activeOrg && ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent)}
          aoDecidir={() => void q.refetch()}
        />
      )}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t("Vue d’ensemble")}</TabsTrigger>
          <TabsTrigger value="timeline">{t("Chronologie")}</TabsTrigger>
          {isAdmin && <TabsTrigger value="lgpd">{t("Protection des données")}</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card className="p-4">
            <dl className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
              <div>
                <dt className="text-xs uppercase text-muted-foreground">{t("Nom")}</dt>
                <dd className="mt-1">{contact.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">{t("Nom d’affichage")}</dt>
                <dd className="mt-1">{contact.display_name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">{t("E-mail")}</dt>
                <dd className="mt-1">{contact.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">{t("Téléphone")}</dt>
                <dd className="mt-1">{contact.phone_number ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">{t("Origine")}</dt>
                <dd className="mt-1">{contact.source}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">{t("Dernière activité")}</dt>
                <dd className="mt-1">
                  {contact.last_activity_at
                    ? format(new Date(contact.last_activity_at), "dd/MM/yyyy HH:mm", {
                        locale: fr,
                      })
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">{t("Créé le")}</dt>
                <dd className="mt-1">
                  {format(new Date(contact.created_at), "dd/MM/yyyy", { locale: fr })}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">{t("Tags")}</dt>
                <dd className="mt-1 flex flex-wrap gap-1">
                  {contact.tags.length === 0
                    ? "—"
                    : contact.tags.map((t) => (
                        <Badge key={t} variant="neutral">
                          {t}
                        </Badge>
                      ))}
                </dd>
              </div>
            </dl>
          </Card>
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <TimelineView contactId={contactId} />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="lgpd" className="mt-4">
            <Card className="space-y-4 p-4">
              <div>
                <h2 className="text-lg font-semibold">{t("Droit à l’effacement (données personnelles)")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t(
                    "A anonimização é irreversível. Use somente após confirmação formal do titular ou ordem judicial.",
                  )}
                </p>
              </div>
              {contact.is_anonymized ? (
                <p className="text-sm text-muted-foreground">
                  {t("Ce contact a déjà été anonymisé")}
                  {contact.anonymized_at &&
                    ` le ${format(new Date(contact.anonymized_at), "dd/MM/yyyy HH:mm", { locale: fr })}`}
                  .
                </p>
              ) : (
                <Button variant="destructive" onClick={() => setAnonOpen(true)}>
                  {t("Anonymiser le contact")}
                </Button>
              )}
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <EditContactDialog contact={contact} open={editOpen} onOpenChange={setEditOpen} />
      <AnonymizeDialog contactId={contactId} open={anonOpen} onOpenChange={setAnonOpen} />
    </div>
  );
}
