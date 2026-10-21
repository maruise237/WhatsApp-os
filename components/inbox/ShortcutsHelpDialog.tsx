"use client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/hooks/i18n/useT";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const BINDINGS: { keys: string; description: string }[] = [
  { keys: "j", description: "Conversation suivante" },
  { keys: "k", description: "Conversation précédente" },
  { keys: "r", description: "Placer le curseur dans la réponse" },
  // O atalho mais usado do inbox não estava aqui — vivia só no placeholder do
  // composer, que some no instante em que você começa a escrever, ou seja,
  // exatamente quando ia precisar dele para quebrar linha.
  { keys: "Enter", description: "Envoyer le message" },
  { keys: "Shift + Enter", description: "Aller à la ligne sans envoyer" },
  { keys: "a", description: "Prendre la conversation" },
  { keys: "e", description: "Clôturer la conversation" },
  { keys: "?", description: "Afficher les raccourcis" },
];

export function ShortcutsHelpDialog({ open, onOpenChange }: Props) {
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Raccourcis clavier")}</DialogTitle>
        </DialogHeader>
        <ul className="space-y-2 text-sm">
          {BINDINGS.map((b) => (
            <li key={b.keys} className="flex items-center justify-between">
              <span className="text-muted-foreground">{t(b.description)}</span>
              <kbd className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-xs">
                {b.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
