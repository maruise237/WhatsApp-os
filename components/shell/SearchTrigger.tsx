"use client";
import { useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { MagnifyingGlass } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { CommandPalette } from "@/components/shell/CommandPalette";

export function SearchTrigger() {
  const [open, setOpen] = useState(false);

  // `enableOnFormTags`: o atalho precisa funcionar com o cursor dentro do
  // composer do inbox, que é onde o operador passa o dia.
  useHotkeys("mod+k", () => setOpen(true), { preventDefault: true, enableOnFormTags: true });

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        // Sur mobile : une icône à côté de la cloche, pas un champ vide flottant
        // au milieu de l'en-tête.
        className="gap-2 text-muted-foreground max-md:size-9 max-md:border-0 max-md:bg-transparent max-md:px-0 max-md:shadow-none"
        aria-label="Rechercher"
        onClick={() => setOpen(true)}
      >
        <MagnifyingGlass size={18} className="md:size-3.5" aria-hidden />
        <span className="hidden md:inline">Rechercher...</span>
        <kbd className="ml-2 hidden md:inline rounded border bg-muted px-1.5 py-0.5 text-[10px]">⌘K</kbd>
      </Button>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
}
