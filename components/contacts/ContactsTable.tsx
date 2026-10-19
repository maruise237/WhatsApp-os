"use client";
import Link from "next/link";
import { format, formatRelative, isToday, isYesterday, type Locale } from "date-fns";
import { enUS, fr } from "date-fns/locale";
import { CaretDown, CaretUp, ChatCircle } from "@/lib/ui/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIdioma } from "@/hooks/i18n/useT";
import { useT } from "@/hooks/i18n/useT";
import type { ContactOrderBy } from "@/lib/schemas/contacts";
import type { Contact } from "@/lib/types/contacts";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";

interface Props {
  contacts: Contact[];
  orderBy: ContactOrderBy;
  orderDir: "asc" | "desc";
  onSort: (column: ContactOrderBy) => void;
}

function displayName(c: Contact): string {
  return rotuloDoContato(c);
}

/** Hoje/ontem: relativo ("há 2 horas", "ontem"). Mais antigo: data, não dia da semana. */
function formatUltimaAtividade(iso: string, locale: Locale, now = new Date()): string {
  const d = new Date(iso);
  if (isToday(d) || isYesterday(d)) {
    return formatRelative(d, now, { locale });
  }
  return format(d, "dd/MM/yyyy", { locale });
}

function SortableHead({
  label,
  column,
  orderBy,
  orderDir,
  onSort,
  className,
}: {
  label: string;
  column: ContactOrderBy;
  orderBy: ContactOrderBy;
  orderDir: "asc" | "desc";
  onSort: (column: ContactOrderBy) => void;
  className?: string;
}) {
  const active = orderBy === column;
  const muted = "text-muted-foreground/35";
  const emphasis = "text-foreground";

  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex items-center gap-1 font-medium hover:text-foreground"
        aria-sort={active ? (orderDir === "asc" ? "ascending" : "descending") : "none"}
      >
        {label}
        <span className="inline-flex flex-col -space-y-1" aria-hidden>
          <CaretUp
            size={12}
            weight="bold"
            className={active && orderDir === "asc" ? emphasis : muted}
          />
          <CaretDown
            size={12}
            weight="bold"
            className={active && orderDir === "desc" ? emphasis : muted}
          />
        </span>
      </button>
    </TableHead>
  );
}

export function ContactsTable({ contacts, orderBy, orderDir, onSort }: Props) {
  const t = useT();
  const idioma = useIdioma();
  const locale = idioma === "en-US" ? enUS : fr;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableHead
            label={t("Nome")}
            column="display_name"
            orderBy={orderBy}
            orderDir={orderDir}
            onSort={onSort}
          />
          <SortableHead
            label={t("Email")}
            column="email"
            orderBy={orderBy}
            orderDir={orderDir}
            onSort={onSort}
            className="hidden md:table-cell"
          />
          <SortableHead
            label={t("Telefone")}
            column="phone_number"
            orderBy={orderBy}
            orderDir={orderDir}
            onSort={onSort}
          />
          <TableHead className="hidden md:table-cell">{t("Tags")}</TableHead>
          <SortableHead
            label={t("Última atividade")}
            column="last_activity_at"
            orderBy={orderBy}
            orderDir={orderDir}
            onSort={onSort}
            className="hidden md:table-cell"
          />
          <TableHead className="hidden md:table-cell">{t("Status")}</TableHead>
          <TableHead className="w-[52px]">
            <span className="sr-only">{t("Conversa")}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {contacts.map((c) => (
          <TableRow key={c.id} className="cursor-pointer">
            <TableCell className="font-medium">
              <Link href={`/app/contacts/${c.id}`} className="hover:underline">
                {displayName(c)}
              </Link>
            </TableCell>
            {/* Mobile : nom, téléphone et conversation — le reste au-delà de md. */}
            <TableCell className="text-muted-foreground hidden md:table-cell">
              {c.email ?? "—"}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {c.phone_number ?? "—"}
            </TableCell>
            <TableCell className="hidden md:table-cell">
              <div className="flex flex-wrap gap-1">
                {c.tags.length === 0
                  ? <span className="text-muted-foreground text-xs">—</span>
                  : c.tags.map((t) => (
                      <Badge key={t} variant="neutral">{t}</Badge>
                    ))}
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground text-sm hidden md:table-cell">
              {c.last_activity_at
                ? formatUltimaAtividade(c.last_activity_at, locale)
                : "—"}
            </TableCell>
            <TableCell className="hidden md:table-cell">
              <div className="flex flex-wrap gap-1">
                {c.is_anonymized && <Badge variant="destructive">{t("Anonimizado")}</Badge>}
                {c.is_blocked && <Badge variant="warning">{t("Bloqueado")}</Badge>}
                {!c.is_anonymized && !c.is_blocked && (
                  <Badge variant="success">{t("Ativo")}</Badge>
                )}
              </div>
            </TableCell>
            <TableCell>
              {c.conversa ? (
                <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                  <Link
                    href={`/app/inbox?id=${c.conversa.id}`}
                    title="Ouvrir la conversation dans la boîte de réception"
                    aria-label={`Ouvrir la conversation avec ${displayName(c)} dans la boîte de réception`}
                  >
                    <ChatCircle size={16} weight="regular" aria-hidden />
                    {c.conversa.unread > 0 && (
                      <span className="sr-only">{c.conversa.unread} non lus</span>
                    )}
                  </Link>
                </Button>
              ) : (
                <span className="text-muted-foreground text-xs" aria-hidden>
                  —
                </span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
