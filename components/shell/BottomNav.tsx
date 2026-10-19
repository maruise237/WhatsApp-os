"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { canSee, NAV_DESTINATIONS } from "@/lib/navigation/registry";
import { cn } from "@/lib/utils";

import { MobileSidebar } from "./MobileSidebar";

/**
 * Barre d'onglets du téléphone, à portée de pouce.
 *
 * Mesuré en 390×844 : les trois écrans où la vendeuse passe sa journée (Inbox,
 * Ventes, Contacts) étaient derrière le ☰, au milieu de dix-huit entrées.
 * Ici, un tap. Le reste du menu reste à un tap aussi, via « Menu ».
 *
 * Masquée dans une conversation ouverte : comme dans WhatsApp, le champ de
 * saisie prend le bas de l'écran. Le signal est le DOM (`data-conversa-aberta`,
 * posé par l'inbox), pas l'URL : choisir une conversation dans la liste ne
 * change pas l'URL, et une barre masquée d'après `?id=` restait par-dessus le
 * champ de saisie.
 */
const ONGLETS = ["/app/inbox", "/app/sales", "/app/contacts"] as const;

export function BottomNav() {
  const t = useT();
  const pathname = usePathname();
  const { user, activeOrg } = useAuth();

  const onglets = ONGLETS.map((href) => NAV_DESTINATIONS.find((d) => d.href === href))
    .filter((d) => d !== undefined)
    .filter((d) => canSee(d, user.is_platform_admin, activeOrg?.role ?? null));

  return (
    <nav
      data-bottom-nav
      aria-label="Navigation rapide"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid h-16" style={{ gridTemplateColumns: `repeat(${onglets.length + 1}, minmax(0, 1fr))` }}>
        {onglets.map((d) => {
          const actif = pathname === d.href || pathname.startsWith(`${d.href}/`);
          const Icon = d.icon;
          return (
            <li key={d.href}>
              <Link
                href={d.href}
                aria-current={actif ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                  actif ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon size={22} weight={actif ? "fill" : "regular"} aria-hidden />
                <span className="truncate">{t(d.label)}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <MobileSidebar variant="onglet" />
        </li>
      </ul>
    </nav>
  );
}
