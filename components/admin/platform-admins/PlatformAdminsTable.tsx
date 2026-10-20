"use client";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PlatformAdminEntry } from "@/hooks/useAdminPlatformAdmins";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeDate(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: fr });
  } catch {
    return iso;
  }
}

function shortEmail(email: string | null): string {
  if (!email) return "—";
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const shortDomain = domain.split(".")[0];
  return `${local}@${shortDomain}`;
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export function PlatformAdminsTableSkeleton() {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {["Usuário", "Concedido em", "Concedido por", "Scope", "MFA", "Status", "Motivo"].map(
              (h) => (
                <TableHead key={h}>{h}</TableHead>
              ),
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 4 }).map((_, i) => (
            <TableRow key={i}>
              {Array.from({ length: 7 }).map((__, j) => (
                <TableCell key={j}>
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
      <p className="text-sm font-medium text-muted-foreground">
        Aucun administrateur de la plateforme trouvé
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Les administrateurs de la plateforme sont configurés exclusivement par le DBA.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reason cell with tooltip for long text
// ---------------------------------------------------------------------------

function ReasonCell({ reason }: { reason: string | null }) {
  if (!reason) return <span className="text-muted-foreground">—</span>;
  const MAX = 40;
  if (reason.length <= MAX) {
    return <span className="text-xs">{reason}</span>;
  }
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help truncate text-xs underline decoration-dotted">
            {reason.slice(0, MAX)}…
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs break-words">{reason}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

interface PlatformAdminsTableProps {
  data: PlatformAdminEntry[];
}

export function PlatformAdminsTable({ data }: PlatformAdminsTableProps) {
  if (data.length === 0) return <EmptyState />;

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[200px]">Utilisateur</TableHead>
            <TableHead className="w-[140px]">Accordé le</TableHead>
            <TableHead className="w-[160px]">Accordé par</TableHead>
            <TableHead className="w-[120px]">Portée</TableHead>
            <TableHead className="w-[60px]">MFA</TableHead>
            <TableHead className="w-[90px]">Statut</TableHead>
            <TableHead>Motif</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row) => {
            const isRevoked = !!row.revoked_at;
            return (
              <TableRow key={row.id} className={isRevoked ? "opacity-60" : undefined}>
                {/* User */}
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">
                      {row.user_email ?? (
                        <span className="font-mono text-xs text-muted-foreground">
                          {row.user_id.slice(0, 8)}
                        </span>
                      )}
                    </span>
                    {row.user_name && (
                      <span className="text-xs text-muted-foreground">{row.user_name}</span>
                    )}
                  </div>
                </TableCell>

                {/* Granted At */}
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {relativeDate(row.granted_at)}
                </TableCell>

                {/* Granted By */}
                <TableCell className="text-xs text-muted-foreground">
                  {shortEmail(row.granted_by_email)}
                </TableCell>

                {/* Scope */}
                <TableCell>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {row.scope ?? "platform"}
                  </Badge>
                </TableCell>

                {/* MFA Required */}
                <TableCell>
                  {row.mfa_required ? (
                    <Badge variant="default" className="text-[10px]">
                      Oui
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">
                      Non
                    </Badge>
                  )}
                </TableCell>

                {/* Status */}
                <TableCell>
                  {isRevoked ? (
                    <Badge variant="destructive" className="text-[10px]">
                      Révoqué
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-green-500 text-[10px] text-green-700"
                    >
                      Actif
                    </Badge>
                  )}
                </TableCell>

                {/* Reason */}
                <TableCell className="max-w-[200px]">
                  <ReasonCell reason={row.reason} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
