import type { Icon as PhosphorIcon } from "@phosphor-icons/react";

import { ROLE_RANK, type Role } from "@/lib/auth/types";
import {
  Bell,
  BookOpen,
  Brain,
  Buildings,
  ChartBar,
  ChartLineUp,
  ClipboardText,
  ClockCountdown,
  ClockCounterClockwise,
  FileText,
  Flag,
  FlowArrow,
  Funnel,
  Gauge,
  Inbox,
  Kanban,
  Lightbulb,
  ListChecks,
  Lock,
  Palette,
  PlugsConnected,
  PuzzlePiece,
  Receipt,
  Robot,
  ScalesSimple,
  ShieldCheck,
  Signpost,
  Storefront,
  UserCircle,
  Users,
  UsersThree,
  WebhooksLogo,
} from "@/lib/ui/icons";

/**
 * Registro de navegação — a ÚNICA lista de destinos do app do tenant.
 *
 * Antes disto, três listas descreviam o mesmo conjunto e divergiam: `NAV_ITEMS`
 * no Sidebar, `LINKS` no hub de Configurações e `TABS` na área de IA. Sete telas
 * só eram alcançáveis por dentro da própria seção e uma não tinha link nenhum.
 *
 * Sidebar, hubs e a paleta ⌘K são PROJEÇÕES puras deste array — nenhum deles
 * decide o que existe, só desenha o que sai daqui. Tela nova aparece nos três
 * sem editar três arquivos, e `tests/unit/navegacao-completude.test.ts` reprova
 * o CI se uma rota nascer fora daqui.
 *
 * Doutrina: docs/doctrine/sistema-vivo.md — "por qual porta se chega até mim?"
 */

export type NavGroupId = "atendimento" | "crm" | "ia" | "canais" | "analise" | "organizacao";

export interface NavGroup {
  id: NavGroupId;
  label: string;
  /**
   * Hub do grupo, quando ele tem telas demais para caber no sidebar.
   * O rótulo é declarado junto do href porque não é derivável: "Ver tudo em IA"
   * é útil, "Ver tudo em Organização" seria gratuito quando a tela já se chama
   * Configurações e o usuário a conhece por esse nome.
   */
  hub?: { href: string; label: string };
}

export interface NavDestination {
  href: string;
  label: string;
  /** Aparece no card do hub e é texto buscável no ⌘K. Nunca vazio. */
  description: string;
  icon: PhosphorIcon;
  group: NavGroupId;
  /** Obrigatória em grupo com hub — é o agrupamento por jornada dentro dele. */
  section?: string;
  /** Ausente = viewer. Ver a regra de escolha abaixo. */
  minRole?: Role;
  /** Ausente = só no hub. `true` = uso diário, sobe para o sidebar. */
  sidebar?: boolean;
  healthDot?: boolean;
}

/**
 * Grupos por OBJETIVO, na ordem de uso: o que se abre toda hora primeiro, o que
 * se ajusta uma vez por mês por último.
 *
 * "Análise" e não "Observabilidade": quem instala isto numa VPS é dono de PME,
 * não engenheiro. E configurar o sistema (grupo IA) é atividade diferente de
 * observar o sistema funcionando (grupo Análise) — por isso Evolução da IA mora
 * aqui, e não junto dos agentes.
 *
 * Hub só onde o grupo passa de 4 telas. Abaixo disso ele cabe inteiro no
 * sidebar, e um hub de 3 itens seria só um clique a mais para chegar onde já
 * dava para chegar.
 */
export const NAV_GROUPS: NavGroup[] = [
  { id: "atendimento", label: "Assistance" },
  { id: "crm", label: "CRM" },
  { id: "ia", label: "Agent IA", hub: { href: "/app/ai", label: "Voir tout en IA" } },
  { id: "canais", label: "Canaux" },
  { id: "analise", label: "Analyse" },
  {
    id: "organizacao",
    label: "Organisation",
    hub: { href: "/app/settings", label: "Paramètres" },
  },
];

/**
 * Grupo cujo hub vive no RODAPÉ fixo do sidebar, fora da área que rola.
 *
 * Medido em tela (1280×768, o notebook comum): com todos os grupos na área
 * rolável, o conteúdo dava 1019px contra 663px visíveis — Configurações ficava
 * fora da dobra em TODAS as alturas testadas, inclusive 1080px. É o item que
 * mais se procura quando não se acha algo; deixá-lo dependendo de scroll
 * recriaria, em outra forma, o problema que esta reorganização veio resolver.
 */
export const GRUPO_NO_RODAPE: NavGroupId = "organizacao";

/**
 * Como `minRole` foi escolhido — medido tela a tela, não estimado:
 *
 *   1. A página redireciona por papel?  → usa esse papel. Assim a navegação
 *      nunca mostra um link que morre em /403.
 *   2. Não redireciona, mas a navegação antiga já filtrava? → mantém o filtro
 *      antigo, para esta mudança reorganizar sem alterar quem vê o quê.
 *   3. Nenhum dos dois → viewer.
 *
 * `ROLE_RANK` só distingue papel dentro do tenant; capacidade interna da tela
 * (`canShare` em Respostas rápidas, `canCompare` em Desempenho) NÃO é porta
 * fechada e por isso não vira `minRole`.
 */
export const NAV_DESTINATIONS: NavDestination[] = [
  // ---- Atendimento — onde o operador passa o dia ----
  {
    href: "/app/inbox",
    label: "Inbox",
    description: "Les conversations WhatsApp, avec vous et l’IA qui répondent côte à côte.",
    icon: Inbox,
    group: "atendimento",
    sidebar: true,
  },
  {
    href: "/app/radar",
    label: "Radar",
    description: "Ceux qui se sont refroidis et sont encore ouverts — ce qui risque de mourir sans réponse.",
    icon: ClockCountdown,
    group: "atendimento",
    sidebar: true,
  },
  {
    // Renomeado de "Templates": estes são scripts do atendente, consumidos pelo
    // Composer do inbox. O nome "Templates" fica livre para os da Meta (HSM),
    // onde é o termo técnico correto.
    href: "/app/templates",
    label: "Réponses rapides",
    description: "Scripts enregistrés pour répondre plus vite, les vôtres ou ceux de l’équipe.",
    icon: FileText,
    group: "atendimento",
    sidebar: true,
  },

  // ---- CRM — o funil ----
  {
    // ⚠️ ERA "Kanban", e a URL continua sendo. O nome saiu da interface porque o
    // produto tinha CINCO vocabulários para a mesma coisa — "Kanban" no menu,
    // "Pipelines" no título desta tela, "Funis" no menu ao lado, "funil" em todo
    // o corpo dela e "quadro" no onboarding inteiro. Três deles no mesmo
    // viewport: o <h1> dizia "Pipelines", o estado vazio dizia "Sem pipelines
    // configurados" e o botão embaixo dizia "Criar meu primeiro funil".
    //
    // Ficou "Funis" porque é o que esta tela É: a lista dos funis, de onde se
    // abre o quadro de cada um. "Pipeline" é palavra de quem construiu o
    // sistema; "funil de vendas" é palavra de quem vende.
    href: "/app/kanban",
    label: "Tableaux",
    description: "Vos tableaux de vente — cliquez sur l’un d’eux pour ouvrir le tableau des clients.",
    icon: Kanban,
    group: "crm",
    sidebar: true,
  },
  {
    href: "/app/contacts",
    label: "Contacts",
    description: "Les personnes de l’autre côté de la conversation et leur historique.",
    icon: Users,
    group: "crm",
    sidebar: true,
  },
  {
    href: "/app/sales",
    label: "Ventes",
    description: "Catalogue, commandes et preuves de paiement à vérifier avant expédition.",
    icon: Storefront,
    group: "crm",
    minRole: "agent",
    sidebar: true,
  },
  {
    // Estava enterrado em Configurações e ninguém sabia que existia — o achado
    // que originou esta reorganização. A URL não muda; só o lugar na navegação.
    //
    // ⚠️ ERA "Funis", nome que ele DISPUTAVA com o destino acima: os dois
    // listavam as mesmas linhas de `crm_pipelines`, lado a lado no mesmo grupo,
    // com nomes que não diziam qual servia para quê. A diferença real é o VERBO,
    // e é ela que o nome carrega agora: lá se ABRE o funil, aqui se CONFIGURA o
    // que ele significa.
    href: "/app/settings/tenant/pipelines",
    label: "Étapes du tableau",
    description: "Les colonnes de chaque tableau, le vocabulaire de l’activité et les motifs de perte.",
    icon: Funnel,
    group: "crm",
    minRole: "manager",
    sidebar: true,
  },

  // ---- Agente de IA — montar, ensinar, acompanhar ----
  {
    href: "/app/ai/agents",
    label: "Agents",
    description: "Qui répond à votre place : instructions, modèle, outils et publication.",
    icon: Robot,
    group: "ia",
    section: "Montar o agente",
    minRole: "manager",
    sidebar: true,
  },
  {
    href: "/app/ai/followups",
    label: "Follow-ups",
    description: "Comment l’agent relance une conversation refroidie, pour qu’aucune ne meure dans le silence.",
    icon: FlowArrow,
    group: "ia",
    section: "Montar o agente",
    minRole: "manager",
    sidebar: true,
  },
  {
    href: "/app/ai/routers",
    label: "Routeurs",
    description: "Quel agent prend quelle conversation, et quand l’humain prend le relais.",
    icon: Signpost,
    group: "ia",
    section: "Montar o agente",
    minRole: "manager",
    sidebar: true,
  },
  {
    href: "/app/ai/knowledge/sources",
    label: "Connaissances",
    description: "Les documents que l’agent consulte avant de répondre sur votre activité.",
    icon: BookOpen,
    group: "ia",
    section: "Ensinar o agente",
    minRole: "manager",
  },
  {
    href: "/app/ai/memory",
    label: "Mémoire",
    description: "Ce que l’agent a déjà appris sur votre activité et qu’il réutilise.",
    icon: Brain,
    group: "ia",
    section: "Ensinar o agente",
    minRole: "manager",
  },
  {
    href: "/app/ai/skills",
    label: "Compétences",
    description: "Les actions que l’agent peut exécuter seul pendant les échanges.",
    icon: PuzzlePiece,
    group: "ia",
    section: "Ensinar o agente",
    minRole: "manager",
  },
  {
    href: "/app/ai/cases",
    label: "Cas",
    description: "Les échanges que l’agent a menés, du début à la fin.",
    icon: ClipboardText,
    group: "ia",
    section: "Acompanhar o agente",
    minRole: "agent",
  },
  {
    href: "/app/ai/inbox",
    label: "Alertes",
    description: "Ce que l’IA a trouvé et qui nécessite une décision de votre part.",
    icon: Flag,
    group: "ia",
    section: "Acompanhar o agente",
  },
  {
    // Órfã: nenhum lugar do app linkava para cá. O flywheel gerava propostas de
    // melhoria do agente e a fila só era vista por quem soubesse a URL.
    href: "/app/ai/proposals",
    label: "Propositions",
    description: "Améliorations que l’IA se suggère à elle-même, en attente de votre décision.",
    icon: Lightbulb,
    group: "ia",
    section: "Acompanhar o agente",
  },
  {
    // A tela de Uso responde "quanto gastei". Esta responde a pergunta que não
    // tinha lugar nenhum: "o agente parou de responder, o que aconteceu?".
    // Antes da migration 0128 ela seria impossível de construir com honestidade
    // — llm_calls só registrava sucesso.
    href: "/app/ai/runs",
    label: "Exécutions",
    description: "Ce que l’IA a fait — et, en cas d’échec, ce qui s’est passé et quoi faire.",
    icon: ListChecks,
    group: "ia",
    section: "Acompanhar o agente",
    minRole: "manager",
    // Idem: fora da sidebar para o menu não passar da dobra. Quem vem para cá
    // está diagnosticando, e chega pelo hub ou pelo link do aviso na Central.
  },
  {
    href: "/app/ai/usage",
    label: "Utilisation et budget",
    description: "Combien l’IA a consommé et quel est le plafond de dépense du mois.",
    icon: Gauge,
    group: "ia",
    section: "Acompanhar o agente",
    minRole: "manager",
  },

  // ---- Canais — por onde as mensagens entram e saem ----
  {
    href: "/app/connections",
    label: "Connexions",
    // Cobre os DOIS caminhos desde o PR #105: número por QR e canal oficial da
    // Meta (com os templates dele), cada um numa aba. A descrição cita "oficial"
    // e "Meta" de propósito — é por esses nomes que se procura no ⌘K, e a busca
    // varre a descrição além do rótulo.
    description:
      "Vos numéros WhatsApp : par QR ou canal officiel Meta, avec santé, reconnexion et modèles.",
    icon: PlugsConnected,
    group: "canais",
    minRole: "admin",
    sidebar: true,
    healthDot: true,
  },
  // `/app/integrations/nuvemshop` saiu da navegação : intégration brésilienne
  // masquée pour le marché africain. La page, les Server Actions et les routes
  // API restent (clones existants) — voir NAV_ALLOWLIST dans
  // tests/unit/navegacao-completude.test.ts.
  {
    href: "/app/webhooks",
    label: "Webhooks",
    description: "Prévenez d’autres systèmes quand quelque chose se passe ici.",
    icon: WebhooksLogo,
    group: "canais",
    minRole: "manager",
    sidebar: true,
  },

  // ---- Análise — olhar o sistema funcionando ----
  {
    href: "/app/metrics",
    label: "Performance",
    description: "Tableau et performance par conseiller sur les 30 derniers jours.",
    icon: ChartBar,
    group: "analise",
    sidebar: true,
  },
  {
    // Observabilidade, não configuração: por isso não fica junto dos agentes.
    href: "/app/ai/evolution",
    label: "Évolution de l'IA",
    description: "Si l’agent progresse, où il se trompe et ce qu’il reste à lui apprendre.",
    icon: ChartLineUp,
    group: "analise",
    minRole: "manager",
    sidebar: true,
  },
  {
    href: "/app/audit",
    label: "Journal d'audit",
    description: "Qui a fait quoi, quand — l’historique qui ne s’efface pas.",
    icon: ClockCounterClockwise,
    group: "analise",
    minRole: "manager",
    sidebar: true,
  },

  // ---- Organização — conta, empresa, acesso ----
  {
    href: "/app/settings/profile",
    label: "Profil",
    description: "Votre nom, langue, fuseau horaire et avatar.",
    icon: UserCircle,
    group: "organizacao",
    section: "Sua conta",
  },
  {
    href: "/app/settings/security",
    label: "Sécurité",
    description: "Validation en deux étapes, codes de récupération et sessions.",
    icon: ShieldCheck,
    group: "organizacao",
    section: "Sua conta",
  },
  {
    href: "/app/settings/notifications",
    label: "Notifications",
    description: "Par quel canal et à quel sujet vous voulez être prévenu.",
    icon: Bell,
    group: "organizacao",
    section: "Sua conta",
  },
  {
    href: "/app/team",
    label: "Équipe",
    description: "Qui travaille ici, avec quel rôle et combien de conversations chacun peut gérer.",
    icon: UsersThree,
    group: "organizacao",
    section: "Sua empresa",
  },
  {
    // A porta que faltava (issue #144): rodízio de atendimento e restrição de
    // visibilidade existiam inteiros no backend e não tinham NENHUMA tela — só
    // dava para ligar com UPDATE à mão no banco.
    href: "/app/settings/atendimento",
    label: "Répartition des échanges",
    description: "Qui reçoit chaque nouveau client, et ce que chaque conseiller voit.",
    icon: UsersThree,
    group: "organizacao",
    section: "Sua empresa",
    minRole: "manager",
  },
  {
    href: "/app/settings/tenant",
    label: "Organisation",
    description: "Données de l’entreprise, conservation des données et délégué à la protection des données.",
    icon: Buildings,
    group: "organizacao",
    section: "Sua empresa",
    minRole: "admin",
  },
  {
    href: "/app/settings/marca",
    label: "Marque",
    description: "Le nom et la couleur que votre entreprise affiche dans le système.",
    icon: Palette,
    group: "organizacao",
    section: "Sua empresa",
    // `admin` pelo mesmo motivo da linha de cima: o que se edita ali é
    // identidade da empresa, e dá-lo a `manager` o colocaria abaixo de billing e
    // de API tokens na mesma prancheta.
    minRole: "admin",
    // SEM `sidebar`: fica só no hub. Trocar a marca é tarefa de uma vez, e
    // agrupar o menu já o fez crescer — duas telas a mais estouraram a dobra em
    // 900px, medido pelo e2e `navegacao.spec.ts`.
  },
  {
    href: "/app/settings/billing",
    label: "Facturation",
    description: "Offre et facturation.",
    icon: Receipt,
    group: "organizacao",
    section: "Sua empresa",
    minRole: "admin",
  },
  {
    href: "/app/lgpd/requests",
    label: "Protection des données",
    description: "Demandes d’export et de suppression de données faites par les clients.",
    icon: ScalesSimple,
    group: "organizacao",
    section: "Dados e acesso",
    minRole: "admin",
  },
  {
    href: "/app/settings/api-tokens",
    label: "Jetons API",
    description: "Des clés pour qu’un autre système dialogue avec votre CRM.",
    icon: Lock,
    group: "organizacao",
    section: "Dados e acesso",
    minRole: "admin",
  },
];

/**
 * Único ponto de decisão de permissão da navegação.
 *
 * É o que dispensa os sete `usePermission()` que o Sidebar chamava em sequência
 * — hooks não rodam em laço condicional, então cada permissão exigia sua linha.
 * Como função pura, um `.filter()` resolve todas.
 */
export function canSee(d: NavDestination, isPlatformAdmin: boolean, role: Role | null): boolean {
  if (isPlatformAdmin) return true;
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[d.minRole ?? "viewer"];
}

/** Projeção do sidebar: só o uso diário, agrupado, sem grupo vazio. */
export function sidebarGroups(
  isPlatformAdmin: boolean,
  role: Role | null,
): Array<{ group: NavGroup; items: NavDestination[] }> {
  return NAV_GROUPS.map((group) => ({
    group,
    items: NAV_DESTINATIONS.filter(
      (d) => d.group === group.id && d.sidebar && canSee(d, isPlatformAdmin, role),
    ),
  })).filter((g) => g.items.length > 0);
}

/**
 * Projeção do hub: TODAS as telas do grupo — inclusive as que já estão no
 * sidebar. O hub é inventário, não sobra; é onde se descobre o que existe.
 *
 * A ordem das seções é a de primeira aparição no registro, então reordenar a
 * jornada é reordenar o array — não há uma segunda lista para manter em sincronia.
 */
export function hubSections(
  group: NavGroupId,
  isPlatformAdmin: boolean,
  role: Role | null,
): Array<{ section: string; items: NavDestination[] }> {
  const porSecao = new Map<string, NavDestination[]>();
  for (const d of NAV_DESTINATIONS) {
    if (d.group !== group || !canSee(d, isPlatformAdmin, role)) continue;
    const secao = d.section ?? "";
    const atual = porSecao.get(secao);
    if (atual) atual.push(d);
    else porSecao.set(secao, [d]);
  }
  return [...porSecao.entries()].map(([section, items]) => ({ section, items }));
}

/** Projeção do ⌘K: todo destino visível, do sidebar ou não. */
export function searchable(isPlatformAdmin: boolean, role: Role | null): NavDestination[] {
  return NAV_DESTINATIONS.filter((d) => canSee(d, isPlatformAdmin, role));
}
