"use client";
import { useSystemVersion } from "@/hooks/system/useSystemVersion";
import { cn } from "@/lib/utils";

/** Version de l'image en service, au pied de la barre latérale. */
export function VersionFooter({
  collapsed,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const { data } = useSystemVersion();
  if (!data?.current_version) return null;

  const label = data.current_version.replace(/^v/i, "");
  return (
    <p
      className={cn("px-3 py-1 text-[11px] text-muted-foreground/70", collapsed && "px-0 text-center")}
      title={`Version ${label}`}
    >
      {collapsed ? label.split(".").slice(0, 2).join(".") : `version ${label}`}
    </p>
  );
}
