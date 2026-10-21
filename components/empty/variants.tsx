"use client";

import {
  ChatCircle,
  Kanban,
  UsersThree,
  ListMagnifyingGlass,
  Funnel,
  ArrowsLeftRight,
  Key,
  ClockCounterClockwise,
  GitBranch,
  Users,
} from "@phosphor-icons/react";
import { EmptyState, type EmptyStateAction } from "./EmptyState";
import { useT } from "@/hooks/i18n/useT";

interface VariantProps {
  primary?: EmptyStateAction;
  secondary?: EmptyStateAction;
}

export function EmptyInbox({ primary, secondary }: VariantProps = {}) {
  const t = useT();
  return (
    <EmptyState
      icon={ChatCircle}
      headline={t("Aucune conversation ici")}
      subcopy={t("Lorsque des messages arriveront, ils apparaîtront ici en temps réel.")}
      primary={primary}
      secondary={secondary}
    />
  );
}

export function EmptyKanban({ primary, secondary }: VariantProps = {}) {
  const t = useT();
  return (
    <EmptyState
      icon={Kanban}
      headline={t("Tableau vide")}
      subcopy={t(
        "Aucun client ici pour le moment. Dès que la première conversation commencera, la carte apparaîtra dans cette colonne.",
      )}
      primary={primary}
      secondary={secondary}
    />
  );
}

export function EmptyContacts({ primary, secondary }: VariantProps = {}) {
  const t = useT();
  return (
    <EmptyState
      icon={UsersThree}
      headline={t("Aucun contact pour le moment")}
      subcopy={t("Les contacts arrivent automatiquement via WhatsApp ou vos formulaires.")}
      primary={primary}
      secondary={secondary}
    />
  );
}

export function EmptyAudit({ primary, secondary }: VariantProps = {}) {
  const t = useT();
  return (
    <EmptyState
      icon={ListMagnifyingGlass}
      headline={t("Aucun événement sur la période")}
      subcopy={t("Ajustez le filtre de dates ou la recherche pour afficher des événements.")}
      primary={primary}
      secondary={secondary}
    />
  );
}

export function EmptyPipeline({ primary, secondary }: VariantProps = {}) {
  const t = useT();
  return (
    <EmptyState
      icon={GitBranch}
      headline={t("Aucun pipeline pour le moment")}
      subcopy={t(
        "Un pipeline représente le parcours du client jusqu’à la conversion. Créez le premier pour obtenir un tableau.",
      )}
      primary={primary}
      secondary={secondary}
    />
  );
}

export function EmptyTeam({ primary, secondary }: VariantProps = {}) {
  const t = useT();
  return (
    <EmptyState
      icon={Users}
      headline={t("Aucun membre dans l’équipe")}
      subcopy={t("Invitez des collègues à répondre ensemble.")}
      primary={primary}
      secondary={secondary}
    />
  );
}

export function EmptyApiTokens({ primary, secondary }: VariantProps = {}) {
  const t = useT();
  return (
    <EmptyState
      icon={Key}
      headline={t("Aucun jeton créé")}
      subcopy={t("Les jetons permettent les intégrations de serveur à serveur.")}
      primary={primary}
      secondary={secondary}
    />
  );
}

export function EmptyTimeline({ primary, secondary }: VariantProps = {}) {
  const t = useT();
  return (
    <EmptyState
      icon={ClockCounterClockwise}
      headline={t("Aucune activité enregistrée")}
      subcopy={t("La chronologie affiche les messages, les changements d’étape et les notes.")}
      primary={primary}
      secondary={secondary}
    />
  );
}

export function EmptyMergeQueue({ primary, secondary }: VariantProps = {}) {
  const t = useT();
  return (
    <EmptyState
      icon={ArrowsLeftRight}
      headline={t("Aucun candidat à la fusion")}
      subcopy={t("Les contacts en double apparaîtront ici pour vérification.")}
      primary={primary}
      secondary={secondary}
    />
  );
}

export function EmptyFilterResults({ primary, secondary }: VariantProps = {}) {
  const t = useT();
  return (
    <EmptyState
      icon={Funnel}
      headline={t("Aucun résultat")}
      subcopy={t("Essayez d’ajuster les filtres ou la recherche.")}
      primary={primary}
      secondary={secondary}
    />
  );
}
