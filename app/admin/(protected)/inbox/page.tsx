import { ChatCircle } from "@/lib/ui/icons";

export default function AdminInboxIndexPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
      <ChatCircle size={40} weight="duotone" className="opacity-40" aria-hidden />
      <p className="text-sm font-medium">Sélectionnez une conversation à afficher</p>
      <p className="max-w-xs text-xs opacity-70">
        Mode lecture seule. Utilisez &ldquo;Impersonate&rdquo; pour répondre en tant qu’agent de l’organisation.
      </p>
    </div>
  );
}
