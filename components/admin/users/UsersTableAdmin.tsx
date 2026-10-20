"use client";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Users } from "@/lib/ui/icons";
import type { AdminUserRow } from "@/hooks/useAdminUsers";

// ---------------------------------------------------------------------------
// Role badge
// ---------------------------------------------------------------------------

const ROLE_VARIANTS: Record<
  string,
  "success" | "info" | "warning" | "error" | "neutral"
> = {
  admin: "error",
  manager: "warning",
  agent: "info",
  viewer: "neutral",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  agent: "Agente",
  viewer: "Viewer",
};

function RoleBadge({ role }: { role: string }) {
  return (
    <Badge variant={ROLE_VARIANTS[role] ?? "neutral"}>
      {ROLE_LABELS[role] ?? role}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(new Date(iso), {
      addSuffix: true,
      locale: fr,
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export function UsersTableAdminSkeleton() {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {["Email", "Nom", "Tenant", "Rôle", "Dernier accès", "Statut", ""].map(
              (h) => (
                <TableHead key={h}>{h}</TableHead>
              ),
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              {Array.from({ length: 7 }).map((__, j) => (
                <TableCell key={j}>
                  <Skeleton className="h-4 w-full max-w-[140px]" />
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
// Main component
// ---------------------------------------------------------------------------

interface UsersTableAdminProps {
  data: AdminUserRow[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}

export function UsersTableAdmin({
  data,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: UsersTableAdminProps) {
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-md border py-16 text-center text-muted-foreground">
        <Users size={36} weight="duotone" className="opacity-40" aria-hidden />
        <p className="text-sm font-medium">Aucun utilisateur trouvé</p>
        <p className="max-w-xs text-xs opacity-70">
          Ajustez les filtres pour affiner la recherche.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>E-mail</TableHead>
              <TableHead className="w-[160px]">Nom</TableHead>
              <TableHead className="w-[160px]">Organisation</TableHead>
              <TableHead className="w-[100px]">Rôle</TableHead>
              <TableHead className="w-[160px]">Dernier accès</TableHead>
              <TableHead className="w-[100px]">Statut</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow key={`${row.user_id}:${row.organization_id}`}>
                <TableCell className="font-mono text-xs">
                  {row.email ?? "—"}
                </TableCell>
                <TableCell className="font-medium">
                  {row.full_name ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-medium">{row.tenant_name}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {row.tenant_slug}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <RoleBadge role={row.role} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {relativeDate(row.last_sign_in_at)}
                </TableCell>
                <TableCell>
                  {row.revoked_at ? (
                    <Badge variant="error">Révoqué</Badge>
                  ) : (
                    <Badge variant="success">Actif</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/admin/users/${row.user_id}`}
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    Voir
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={onLoadMore}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? "Chargement…" : "Charger davantage"}
          </Button>
        </div>
      )}
    </div>
  );
}
