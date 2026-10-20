"use client";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SidebarContent } from "@/components/shell/Sidebar";
import { List } from "@/lib/ui/icons";

/**
 * Navegação mobile do app autenticado.
 *
 * O estado "Recolher" é do sidebar desktop e persiste em cookie. No mobile a
 * navegação é uma gaveta temporária: abrir/fechar não escreve esse cookie, para
 * não trocar a preferência que a pessoa escolheu no laptop.
 *
 * `variant="onglet"` é o gatilho da barra inferior (`BottomNav`): o último
 * onglet, « Menu », abre esta mesma gaveta com tudo o que não coube nela.
 */
export function MobileSidebar({ variant = "icone" }: { variant?: "icone" | "onglet" }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {variant === "onglet" ? (
          <button
            type="button"
            aria-label="Ouvrir le menu"
            className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground"
          >
            <List size={22} aria-hidden />
            <span>Menu</span>
          </button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 md:hidden"
            aria-label="Ouvrir la navigation"
          >
            <List size={22} aria-hidden />
          </Button>
        )}
      </SheetTrigger>
      <SheetContent
        side="left"
        className="flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-0 p-0 sm:max-w-xs"
      >
        <SheetTitle className="sr-only">Navigation principale</SheetTitle>
        <SidebarContent
          collapsed={false}
          showCollapseControl={false}
          onNavigate={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
