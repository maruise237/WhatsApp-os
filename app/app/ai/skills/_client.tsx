"use client";
import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { PuzzlePiece, UploadSimple, DownloadSimple, Trash, Info } from "@/lib/ui/icons";
import { usePermission } from "@/hooks/auth/AuthProvider";
import {
  useSkills,
  useInstallSkill,
  useUninstallSkill,
  useImportSkill,
  type SkillsState,
} from "@/hooks/ai/useSkills";

interface Props {
  initialState: SkillsState;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SkillsClient({ initialState }: Props) {
  const { data } = useSkills(initialState);
  const installed = data?.installed ?? [];
  const catalog = data?.catalog ?? [];
  const canManage = usePermission("ai.skills.manage");

  const install = useInstallSkill();
  const uninstall = useUninstallSkill();
  const importSkill = useImportSkill();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [pendingName, setPendingName] = React.useState<string | null>(null);

  function handleInstall(name: string) {
    setPendingName(name);
    install.mutate(name, {
      onSuccess: () => {
        toast.success(`Compétence "${name}" installée — elle s’applique déjà aux agents de cette organisation.`);
        setPendingName(null);
      },
      onError: (err) => {
        showApiError(err);
        setPendingName(null);
      },
    });
  }

  function handleUninstall(name: string) {
    setPendingName(name);
    uninstall.mutate(name, {
      onSuccess: () => {
        toast.success(`Skill "${name}" desinstalada.`);
        setPendingName(null);
      },
      onError: (err) => {
        showApiError(err);
        setPendingName(null);
      },
    });
  }

  function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    importSkill.mutate(file, {
      onSuccess: (res) => {
        toast.success(`Compétence "${res.data.name}" envoyée et installée avec succès.`);
      },
      onError: showApiError,
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Compétences installées</CardTitle>
              <CardDescription>
                Ce que vos agents savent déjà faire au-delà de la conversation courante — chaque compétence n’entre en action que lorsque le sujet le demande.
              </CardDescription>
            </div>
            {canManage && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip"
                  className="hidden"
                  onChange={handleFileChosen}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={importSkill.isPending}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadSimple /> {importSkill.isPending ? "Enviando…" : "Envoyer une compétence (.zip)"}
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {installed.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              Aucune compétence installée pour le moment. Installez-en une toute prête depuis le catalogue ci-dessous ou envoyez la vôtre via « Envoyer une compétence (.zip) ».
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {installed.map((skill) => (
                <li
                  key={skill.name}
                  className="flex flex-col gap-1.5 rounded-md border border-border/60 p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <PuzzlePiece className="text-accent" aria-hidden />
                    <span className="font-medium">{skill.name}</span>
                    <Badge variant={skill.source === "catalog" ? "info" : "neutral"} className="text-[10px]">
                      {skill.source === "catalog" ? "du catalogue" : "manual"}
                    </Badge>
                    <span className="ml-auto text-xs text-muted-foreground">
                      mise à jour le {formatDate(skill.updated_at)}
                    </span>
                  </div>
                  {skill.description && <p className="text-text-muted">{skill.description}</p>}
                  {canManage && (
                    <div className="flex sm:justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={uninstall.isPending && pendingName === skill.name}
                        onClick={() => handleUninstall(skill.name)}
                        className="w-full sm:w-auto"
                      >
                        <Trash /> Désinstaller
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-start gap-2 rounded-md bg-accent-soft p-3 text-xs text-text-muted">
            <Info className="mt-0.5 shrink-0" aria-hidden />
            <p>
              Pour personnaliser une compétence installée, renvoyez simplement un .zip portant le même nom — votre version remplace celle du catalogue. Il n’y a pas d’éditeur dans le système pour l’instant.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Catalogue</CardTitle>
          <CardDescription>
            Compétences prêtes à l’emploi, maintenues par la plateforme, installables en un clic.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {catalog.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              Aucune nouvelle compétence dans le catalogue — vous avez déjà installé tout ce que la plateforme propose aujourd’hui.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {catalog.map((skill) => (
                <li
                  key={skill.name}
                  className="flex flex-col gap-1.5 rounded-md border border-border/60 p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <PuzzlePiece aria-hidden />
                    <span className="font-medium">{skill.name}</span>
                  </div>
                  {skill.description && <p className="text-text-muted">{skill.description}</p>}
                  {canManage && (
                    <div className="flex sm:justify-end">
                      <Button
                        size="sm"
                        disabled={install.isPending && pendingName === skill.name}
                        onClick={() => handleInstall(skill.name)}
                        className="w-full sm:w-auto"
                      >
                        <DownloadSimple />
                        {install.isPending && pendingName === skill.name ? "Instalando…" : "Instalar"}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
