/**
 * Os textos das telas que a equipe usa todo dia.
 *
 * ─── A regra de ouro deste arquivo ─────────────────────────────────────────
 *
 * A CHAVE é o texto em português. Não `inbox.filtro.todas`, não `INBOX_ALL`.
 *
 * Duas razões, e as duas doem quando se descobre tarde:
 *
 *   1. Quem lê o componente vê a frase, não um código. `t("Todas as tags")`
 *      continua legível; `t("inbox.tags.all")` obriga a abrir outro arquivo
 *      para saber o que a tela diz.
 *   2. Falta de tradução DEGRADA para português em vez de mostrar a chave. Um
 *      `t("Assumir")` sem entrada em espanhol devolve "Assumir" — feio, mas
 *      compreensível. Com chave simbólica devolveria `inbox.claim`, que não é
 *      nada para ninguém.
 *
 * ─── Parcial, e de propósito ───────────────────────────────────────────────
 *
 * Só as telas do dia a dia. Traduzir as 229 telas de uma vez é um projeto, e um
 * projeto entregue pela metade deixa a interface em dois idiomas ao mesmo
 * tempo. O que não está aqui aparece em português, que é o comportamento de
 * antes desta feature — nunca pior.
 */
import type { Idioma } from "./idiomas";

/** `pt-BR` não aparece: é a chave. Só o que DIFERE precisa de linha. */
type Traducoes = Record<string, Partial<Record<Exclude<Idioma, "pt-BR">, string>>>;

export const DICIONARIO: Traducoes = {
  // ─── Cabeçalhos de grupo da barra lateral ───
  //
  // ⚠️ NUNCA TIVERAM TRADUÇÃO, e o defeito era invisível: `Sidebar.tsx:83` já
  // chamava `t(group.label)`, então o espanhol recebia os cabeçalhos em
  // português e nada ficava vermelho — `traduzir()` devolve a chave ausente
  // como está. Achado pelo cruzamento novo entre DICIONARIO e NAV_GROUPS.
  Atendimento: { "fr-FR": "Assistance", es: "Atención" },
  CRM: { "fr-FR": "CRM", es: "CRM" },
  "Agente de IA": { "fr-FR": "Agent IA", es: "Agente de IA" },
  Canais: { "fr-FR": "Canaux", es: "Canales" },
  Análise: { "fr-FR": "Analyse", es: "Análisis" },
  Organização: { "fr-FR": "Organisation", es: "Organización" },

  // ─── Navegação (a barra lateral, presente em toda tela) ───
  Inbox: { "fr-FR": "Inbox", es: "Inbox" },
  Radar: { "fr-FR": "Radar", es: "Radar" },
  "Respostas rápidas": { "fr-FR": "Réponses rapides", es: "Respuestas rápidas" },
  Contatos: { "fr-FR": "Contacts", es: "Contactos" },
  Ventes: { "fr-FR": "Ventes", es: "Ventas" },
  // A CHAVE É O TEXTO PT-BR, então renomear um rótulo no registro de navegação
  // sem mexer aqui NÃO quebra teste nenhum — degrada em silêncio: `traduzir()`
  // devolve a chave ausente como português e o espanhol da barra lateral some.
  // "Kanban" saiu do menu (a tela virou "Funis"); "Etapas do funil" é o nome novo
  // da tela de configuração, que antes disputava "Funis" com ela.
  Funis: { "fr-FR": "Entonnoirs", es: "Embudos" },
  "Etapas do funil": { "fr-FR": "Étapes de l'entonnoir", es: "Etapas del embudo" },
  Agentes: { "fr-FR": "Agents", es: "Agentes" },
  "Follow-ups": { "fr-FR": "Follow-ups", es: "Seguimientos" },
  Roteadores: { "fr-FR": "Routeurs", es: "Enrutadores" },
  "Ver tudo em IA": { "fr-FR": "Voir tout en IA", es: "Ver todo en IA" },
  Conexões: { "fr-FR": "Connexions", es: "Conexiones" },
  Webhooks: { "fr-FR": "Webhooks", es: "Webhooks" },
  Desempenho: { "fr-FR": "Performance", es: "Rendimiento" },
  "Evolução da IA": { "fr-FR": "Évolution de l'IA", es: "Evolución de la IA" },
  "Audit Log": { "fr-FR": "Journal d'audit", es: "Registro de auditoría" },
  Configurações: { "fr-FR": "Paramètres", es: "Configuración" },
  Recolher: { "fr-FR": "Réduire", es: "Contraer" },
  Buscar: { "fr-FR": "Rechercher", es: "Buscar" },

  // ─── Inbox: filtros e lista ───
  "Buscar mensagens…": { "fr-FR": "Rechercher des messages…", es: "Buscar mensajes…" },
  "Todos os números": { "fr-FR": "Tous les numéros", es: "Todos los números" },
  "Todas as tags": { "fr-FR": "Toutes les étiquettes", es: "Todas las etiquetas" },
  "Apenas não lidos": { "fr-FR": "Uniquement non lus", es: "Solo no leídos" },
  Fila: { "fr-FR": "File d'attente", es: "Cola" },
  Minhas: { "fr-FR": "Mes", es: "Mías" },
  Todas: { "fr-FR": "Toutes", es: "Todas" },
  Fechadas: { "fr-FR": "Fermées", es: "Cerradas" },
  IA: { "fr-FR": "IA", es: "IA" },
  "Sem mensagens": { "fr-FR": "Sans messages", es: "Sin mensajes" },
  "Nenhuma conversa": { "fr-FR": "Aucune conversation", es: "Ninguna conversación" },

  // ─── Inbox: cabeçalho e ações da conversa ───
  Assumir: { "fr-FR": "Prendre en charge", es: "Asumir" },
  Liberar: { "fr-FR": "Libérer", es: "Liberar" },
  Transferir: { "fr-FR": "Transférer", es: "Transferir" },
  Lembrar: { "fr-FR": "Rappeler", es: "Recordar" },
  Fechar: { "fr-FR": "Fermer", es: "Cerrar" },
  "Devolver ao automático": { "fr-FR": "Remettre à l'automatique", es: "Devolver al automático" },
  Aberta: { "fr-FR": "Ouverte", es: "Abierta" },
  Fechada: { "fr-FR": "Fermée", es: "Cerrada" },
  "Em atendimento": { "fr-FR": "En cours", es: "En atención" },
  "Aguardando atendente": { "fr-FR": "En attente d'un agent", es: "Esperando agente" },
  "Automático atendendo": { "fr-FR": "Automatique en cours", es: "Automático atendiendo" },
  "Automático pausado": { "fr-FR": "Automatique en pause", es: "Automático pausado" },
  // Os motivos do silêncio (lib/inbox/comando-da-conversa.ts). "Automático
  // pausado" sozinho respondia a três situações que pedem ações diferentes:
  // alguém assumiu, o cliente inteiro está travado, ou foi pausa explícita.
  "Automático pausado — alguém assumiu": {
    "fr-FR": "Automatique en pause — quelqu'un a pris le relais",
    es: "Automático pausado — alguien la asumió",
  },
  "Automático pausado para este cliente": {
    "fr-FR": "Automatique en pause pour ce client",
    es: "Automático pausado para este cliente",
  },
  "Automático volta em instantes": {
    "fr-FR": "Automatique revient dans un instant",
    es: "El automático vuelve en instantes",
  },
  "Pausar o automático": { "fr-FR": "Mettre l'automatique en pause", es: "Pausar el automático" },
  "Ver contato": { "fr-FR": "Voir le contact", es: "Ver contacto" },

  // ─── Inbox: composer ───
  Responder: { "fr-FR": "Répondre", es: "Responder" },
  "Nota interna": { "fr-FR": "Note interne", es: "Nota interna" },
  "Escreva uma mensagem…": { "fr-FR": "Écrivez un message…", es: "Escribí un mensaje…" },
  "Escreva uma nota interna… (só o time vê)": {
    "fr-FR": "Écrivez une note interne… (seulement l'équipe la voit)",
    es: "Escribí una nota interna… (solo la ve el equipo)",
  },
  Enviar: { "fr-FR": "Envoyer", es: "Enviar" },
  "Enviar modelo": { "fr-FR": "Envoyer un modèle", es: "Enviar plantilla" },
  "Escolha um modelo aprovado…": {
    "fr-FR": "Choisissez un modèle approuvé…",
    es: "Elegí una plantilla aprobada…",
  },

  // ─── Painel do contato ───
  CONTATO: { "fr-FR": "CONTACT", es: "CONTACTO" },
  "TAGS DA CONVERSA": {
    "fr-FR": "ÉTIQUETTES DE LA CONVERSATION",
    es: "ETIQUETAS DE LA CONVERSACIÓN",
  },
  "DEMANDAS ABERTAS": { "fr-FR": "DEMANDES OUVERTES", es: "PEDIDOS ABIERTOS" },
  "LEADS RECENTES": { "fr-FR": "LEADS RÉCENTS", es: "LEADS RECIENTES" },
  "PEDIDOS RECENTES": { "fr-FR": "COMMANDES RÉCENTES", es: "PEDIDOS RECIENTES" },
  ATIVIDADE: { "fr-FR": "ACTIVITÉ", es: "ACTIVIDAD" },
  "Sem tags.": { "fr-FR": "Aucune étiquette.", es: "Sin etiquetas." },
  "Sem leads.": { "fr-FR": "Aucun lead.", es: "Sin leads." },
  "Sem pedidos.": { "fr-FR": "Aucune commande.", es: "Sin pedidos." },
  "Sem atividade.": { "fr-FR": "Aucune activité.", es: "Sin actividad." },
  "Nova tag…": { "fr-FR": "Nouvelle étiquette…", es: "Nueva etiqueta…" },
  "Sem próximo passo definido": {
    "fr-FR": "Aucune prochaine étape définie",
    es: "Sin próximo paso definido",
  },
  "Marcar próximo passo": { "fr-FR": "Définir la prochaine étape", es: "Marcar próximo paso" },
  Lead: { "fr-FR": "Lead", es: "Lead" },
  Tags: { "fr-FR": "Tags" },
  Tag: { "fr-FR": "Étiquette", es: "Etiqueta" },
  "Não consegui salvar o próximo passo. Tente de novo.": {
    "fr-FR": "Impossible d’enregistrer la prochaine étape. Réessayez.",
  },
  "O que acontece a seguir?": { "fr-FR": "Que se passe-t-il ensuite ?" },
  "Próximo passo desta demanda": { "fr-FR": "Prochaine étape de cette demande" },
  "Nenhum funil configurado nesta organização.": {
    "fr-FR": "Aucun pipeline n’est configuré dans cette organisation.",
  },
  "Selecione uma conversa para ver detalhes do contato.": {
    "fr-FR": "Sélectionnez une conversation pour voir les détails du contact.",
  },
  Contato: { "fr-FR": "Contact" },
  "Demandas abertas": { "fr-FR": "Demandes ouvertes" },
  "Leads recentes": { "fr-FR": "Leads récents" },
  "Pedidos recentes": { "fr-FR": "Commandes récentes" },
  Atividade: { "fr-FR": "Activité" },
  "Tentar de novo": { "fr-FR": "Réessayer" },
  "Não consegui ler estes dados.": { "fr-FR": "Impossible de lire ces données." },
  "Aguardando o cliente": { "fr-FR": "En attente du client" },
  há: { "fr-FR": "il y a" },
  "Atividade registrada": { "fr-FR": "Activité enregistrée" },
  "Você/time": { "fr-FR": "Vous/équipe" },
  Agente: { "fr-FR": "Agent" },
  Automação: { "fr-FR": "Automatisation" },
  Sistema: { "fr-FR": "Système" },
  "Autor não registrado": { "fr-FR": "Auteur non enregistré" },
  "Entrou pelo WhatsApp": { "fr-FR": "Entré par WhatsApp" },
  "Mudou de estágio": { "fr-FR": "Étape modifiée" },
  "Correção do que o assistente tinha feito": { "fr-FR": "Correction d’une action de l’assistant" },
  Anotação: { "fr-FR": "Annotation" },
  "Atendimento da IA": { "fr-FR": "Prise en charge par l’IA" },
  "Envio bloqueado": { "fr-FR": "Envoi bloqué" },
  "Passou para humano": { "fr-FR": "Transmis à un humain" },
  "Voltou para o atendimento automático": { "fr-FR": "Revenu au traitement automatique" },
  "Próxima ação aprovada": { "fr-FR": "Prochaine action approuvée" },
  "Próxima ação descartada": { "fr-FR": "Prochaine action écartée" },
  "Dados do negócio alterados": { "fr-FR": "Données de l’affaire modifiées" },
  "Negócio esfriou": { "fr-FR": "L’affaire s’est refroidie" },
  "Negócio voltou a andar": { "fr-FR": "L’affaire a repris" },
  "Retomada de contato aprovada": { "fr-FR": "Reprise du contact approuvée" },
  "Retomada de contato descartada": { "fr-FR": "Reprise du contact écartée" },
  "Sugestão de retomada venceu sem decisão": {
    "fr-FR": "La suggestion de reprise a expiré sans décision",
  },
  "Retorno agendado": { "fr-FR": "Relance planifiée" },
  "Retorno cancelado": { "fr-FR": "Relance annulée" },
  "Follow-up pausado": { "fr-FR": "Suivi mis en pause" },
  "Follow-up retomado": { "fr-FR": "Suivi repris" },
  "Follow-up adiado": { "fr-FR": "Suivi reporté" },
  "Passo do follow-up pulado": { "fr-FR": "Étape du suivi ignorée" },
  "Promessa sem responsável": { "fr-FR": "Promesse sans responsable" },
  "Demanda encerrada": { "fr-FR": "Demande clôturée" },
  "Consentimento de contato recusado no formulário": {
    "fr-FR": "Consentement au contact refusé dans le formulaire",
  },
  "Assumiu a conversa": { "fr-FR": "A pris la conversation" },
  "Transferiu a conversa": { "fr-FR": "A transféré la conversation" },
  "Liberou a conversa": { "fr-FR": "A libéré la conversation" },
  "Pausou o automático": { "fr-FR": "A mis l’automatisation en pause" },

  // ─── Kanban ───
  Frio: { "fr-FR": "Froid" },
  Morno: { "fr-FR": "Tiède" },
  Quente: { "fr-FR": "Chaud" },
  Probabilidade: { "fr-FR": "Probabilité" },
  "Ver o porquê.": { "fr-FR": "Voir pourquoi." },
  "ver a mensagem": { "fr-FR": "voir le message" },
  "registro que sustenta": { "fr-FR": "enregistrement justificatif" },
  "Sem evidências registradas.": { "fr-FR": "Aucune preuve enregistrée." },
  "Carregando a linha do tempo…": { "fr-FR": "Chargement de la chronologie…" },
  "Não consegui carregar a linha do tempo. Tente de novo em instantes.": {
    "fr-FR": "Impossible de charger la chronologie. Réessayez dans quelques instants.",
  },
  "Nada aconteceu com este negócio ainda.": {
    "fr-FR": "Rien ne s’est encore produit pour cette affaire.",
  },
  agora: { "fr-FR": "à l’instant" },
  ações: { "fr-FR": "actions" },
  Responsável: { "fr-FR": "Responsable" },
  "Responsável:": { "fr-FR": "Responsable :" },
  "Retomar contato?": { "fr-FR": "Reprendre le contact ?" },
  "Este negócio parou de responder": { "fr-FR": "Cette affaire a cessé de répondre" },
  "A sugestão vence em": { "fr-FR": "La suggestion expire dans" },
  "Retomar contato com este negócio": { "fr-FR": "Reprendre le contact avec cette affaire" },
  Retomar: { "fr-FR": "Reprendre" },
  "Encerrar: não retomar este negócio": { "fr-FR": "Clôturer : ne pas reprendre cette affaire" },
  Encerrar: { "fr-FR": "Clôturer" },
  "Ações do lead": { "fr-FR": "Actions du lead" },
  "Marcar como ganho": { "fr-FR": "Marquer comme gagné" },
  Todos: { "fr-FR": "Tous" },
  Abertos: { "fr-FR": "Ouverts" },
  Ganhos: { "fr-FR": "Gagnés" },
  Perdidos: { "fr-FR": "Perdus" },
  Eu: { "fr-FR": "Moi" },
  "Tag: todas": { "fr-FR": "Tag : toutes" },
  "Buscar por título…": { "fr-FR": "Rechercher par titre…" },
  "Status:": { "fr-FR": "Statut :" },
  "Limpar filtros": { "fr-FR": "Effacer les filtres" },
  "selecionado(s)": { "fr-FR": "sélectionné(s)" },
  "lead(s)": { "fr-FR": "lead(s)" },
  "atribuído(s)": { "fr-FR": "attribué(s)" },
  "Mover para…": { "fr-FR": "Déplacer vers…" },
  Stage: { "fr-FR": "Étape" },
  "Atribuir a…": { "fr-FR": "Attribuer à…" },
  "Remover responsável": { "fr-FR": "Retirer le responsable" },
  "Tag…": { "fr-FR": "Tag…" },
  "nova tag": { "fr-FR": "nouveau tag" },
  Adicionar: { "fr-FR": "Ajouter" },
  "Esta ação remove os leads selecionados. Não pode ser desfeita.": {
    "fr-FR": "Cette action supprime les leads sélectionnés. Elle est irréversible.",
  },
  "Apenas atrasados": { "fr-FR": "Uniquement en retard", es: "Solo atrasados" },
  "Sem responsável": { "fr-FR": "Aucun responsable", es: "Sin responsable" },
  "Editar campos": { "fr-FR": "Modifier les champs", es: "Editar campos" },
  "Linha do tempo": { "fr-FR": "Chronologie", es: "Línea de tiempo" },
  "DADOS DO NEGÓCIO": { "fr-FR": "DONNÉES DE L'AFFAIRE", es: "DATOS DEL NEGOCIO" },
  Título: { "fr-FR": "Titre", es: "Título" },
  Descrição: { "fr-FR": "Description", es: "Descripción" },
  "Fechamento previsto": { "fr-FR": "Clôture prévue", es: "Cierre previsto" },
  "Tags (separadas por vírgula)": {
    "fr-FR": "Étiquettes (séparées par des virgules)",
    es: "Etiquetas (separadas por coma)",
  },
  Salvar: { "fr-FR": "Enregistrer", es: "Guardar" },
  vazio: { "fr-FR": "vide", es: "vacío" },
  "sem ler": { "fr-FR": "non lu(s)" },
  "Abrir conversa no Inbox": {
    "fr-FR": "Ouvrir la conversation dans Inbox",
    es: "Abrir conversación en el Inbox",
  },

  // ─── Contatos ───
  "Buscar contatos…": { "fr-FR": "Rechercher des contacts…", es: "Buscar contactos…" },
  Nome: { "fr-FR": "Nom", es: "Nombre" },
  Telefone: { "fr-FR": "Téléphone", es: "Teléfono" },
  "Nenhum contato": { "fr-FR": "Aucun contact", es: "Ningún contacto" },
  Bloqueado: { "fr-FR": "Bloqué", es: "Bloqueado" },

  // ─── Conexões ───
  "Números por QR": { "fr-FR": "Numéros via QR", es: "Números por QR" },
  "API Oficial (Meta)": { "fr-FR": "API Officielle (Meta)", es: "API Oficial (Meta)" },
  "Provedor parceiro": { "fr-FR": "Fournisseur partenaire", es: "Proveedor asociado" },
  Conexão: { "fr-FR": "Connexion", es: "Conexión" },
  "Modelos do parceiro": { "fr-FR": "Modèles du partenaire", es: "Plantillas del asociado" },
  "Templates da Meta": { "fr-FR": "Modèles de Meta", es: "Plantillas de Meta" },
  Sincronizar: { "fr-FR": "Synchroniser", es: "Sincronizar" },
  "Criar modelo": { "fr-FR": "Créer un modèle", es: "Crear plantilla" },
  Cancelar: { "fr-FR": "Annuler", es: "Cancelar" },
  "Enviar para revisão": { "fr-FR": "Envoyer pour révision", es: "Enviar a revisión" },
  Reconectar: { "fr-FR": "Reconnecter", es: "Reconectar" },
  Conectar: { "fr-FR": "Connecter", es: "Conectar" },
  Desconectar: { "fr-FR": "Déconnecter", es: "Desconectar" },
  "Fuso horário da janela": {
    "fr-FR": "Fuseau horaire de la fenêtre",
    es: "Huso horario de la ventana",
  },

  // ─── Estados e avisos que aparecem em várias telas ───
  "Carregando…": { "fr-FR": "Chargement…", es: "Cargando…" },
  "Iniciando…": { "fr-FR": "Démarrage…" },
  "Guardando uma cópia de segurança dos seus dados": { "fr-FR": "Sauvegarde de vos données" },
  "Baixando a versão nova": { "fr-FR": "Téléchargement de la nouvelle version" },
  "Atualizando o banco de dados": { "fr-FR": "Mise à jour de la base de données" },
  "Reiniciando o sistema": { "fr-FR": "Redémarrage du système" },
  "Atualizar agora": { "fr-FR": "Mettre à jour maintenant" },
  "O sistema sai do ar por cerca de 2 minutos e volta sozinho. Faço uma cópia de segurança dos seus dados antes.":
    {
      "fr-FR":
        "Le système sera indisponible pendant environ 2 minutes, puis redémarrera seul. Une sauvegarde de vos données sera effectuée avant.",
    },
  "Detalhes técnicos (útil se for pedir ajuda)": {
    "fr-FR": "Détails techniques (utile pour demander de l’aide)",
  },
  "Atualização do sistema": { "fr-FR": "Mise à jour du système" },
  "Reiniciando…": { "fr-FR": "Redémarrage…" },
  "O sistema está voltando. Esta página se atualiza sozinha em alguns instantes.": {
    "fr-FR":
      "Le système redémarre. Cette page se mettra à jour automatiquement dans quelques instants.",
  },
  Copiado: { "fr-FR": "Copié" },
  "Nenhum resultado": { "fr-FR": "Aucun résultat", es: "Ningún resultado" },
  Erro: { "fr-FR": "Erreur", es: "Error" },
  Excluir: { "fr-FR": "Supprimer", es: "Eliminar" },
  Editar: { "fr-FR": "Modifier", es: "Editar" },
  Voltar: { "fr-FR": "Retour", es: "Volver" },

  // ─── Récupération de compte et MFA ───
  "Email inválido. Confira o campo.": { "fr-FR": "E-mail invalide. Vérifiez le champ." },
  "Não foi possível enviar o e-mail. Tente novamente.": {
    "fr-FR": "Impossible d’envoyer l’e-mail. Réessayez.",
  },
  "Enviando...": { "fr-FR": "Envoi…" },
  "Enviar link de redefinição": { "fr-FR": "Envoyer le lien de réinitialisation" },
  "Verifique seu e-mail": { "fr-FR": "Vérifiez votre e-mail" },
  "Se existir uma conta com esse e-mail, enviamos um link para redefinir a senha.": {
    "fr-FR":
      "Si un compte existe avec cette adresse e-mail, un lien de réinitialisation du mot de passe vous a été envoyé.",
  },
  "Código inválido ou já utilizado.": { "fr-FR": "Code invalide ou déjà utilisé." },
  "Serviço de recuperação indisponível. Contate o administrador.": {
    "fr-FR": "Le service de récupération est indisponible. Contactez l’administrateur.",
  },
  "Código de recuperação": { "fr-FR": "Code de récupération" },
  "Use um dos 10 códigos que você salvou ao configurar a verificação em duas etapas.": {
    "fr-FR":
      "Utilisez l’un des 10 codes enregistrés lors de la configuration de la validation en deux étapes.",
  },
  "Validando...": { "fr-FR": "Validation…" },
  "Recuperar acesso": { "fr-FR": "Récupérer l’accès" },
  "Nova senha": { "fr-FR": "Nouveau mot de passe" },
  "Confirmar nova senha": { "fr-FR": "Confirmer le nouveau mot de passe" },
  "Código de verificação (2 etapas)": { "fr-FR": "Code de validation (2 étapes)" },
  "Sua conta tem verificação em duas etapas. Digite o código de 6 dígitos do seu app autenticador para concluir.":
    {
      "fr-FR":
        "Votre compte utilise la validation en deux étapes. Saisissez le code à 6 chiffres de votre application d’authentification pour terminer.",
    },
  "Código de verificação inválido. Tente de novo.": {
    "fr-FR": "Code de validation invalide. Réessayez.",
  },
  "Sessão de redefinição expirada. Peça um novo link em Recuperar senha.": {
    "fr-FR":
      "La session de réinitialisation a expiré. Demandez un nouveau lien via « Mot de passe oublié ».",
  },
  "A nova senha precisa ser diferente da atual.": {
    "fr-FR": "Le nouveau mot de passe doit être différent de l’actuel.",
  },
  "Não foi possível redefinir a senha. Tente novamente.": {
    "fr-FR": "Impossible de réinitialiser le mot de passe. Réessayez.",
  },
  "Salvando...": { "fr-FR": "Enregistrement…" },
  "Definir nova senha": { "fr-FR": "Définir le nouveau mot de passe" },
  "Código inválido. Tente novamente.": { "fr-FR": "Code invalide. Réessayez." },
  "Verificando...": { "fr-FR": "Vérification…" },
  Verificar: { "fr-FR": "Vérifier" },
  "Perdi acesso ao autenticador": {
    "fr-FR": "J’ai perdu l’accès à mon application d’authentification",
  },
  "Email inválido": { "fr-FR": "E-mail invalide" },
  "Senha deve ter pelo menos 8 caracteres": {
    "fr-FR": "Le mot de passe doit comporter au moins 8 caractères",
  },
  "Nome da empresa deve ter pelo menos 2 caracteres": {
    "fr-FR": "Le nom de l’entreprise doit comporter au moins 2 caractères",
  },
  "Nome da empresa deve ter no máximo 120 caracteres": {
    "fr-FR": "Le nom de l’entreprise doit comporter au maximum 120 caractères",
  },
  "As senhas não coincidem": { "fr-FR": "Les mots de passe ne correspondent pas" },

  // ─── Onboarding ───
  "Aceite os termos para continuar.": { "fr-FR": "Acceptez les conditions pour continuer." },
  Falha: { "fr-FR": "Échec" },
  "Como se chama o seu negócio?": { "fr-FR": "Comment s’appelle votre entreprise ?" },
  "É o nome que aparece para o seu time e nos relatórios. Pode ser clínica, loja, escritório — o que for seu.":
    {
      "fr-FR":
        "C’est le nom affiché à votre équipe et dans les rapports. Il peut s’agir d’une clinique, d’un magasin, d’un cabinet ou de toute autre activité.",
    },
  "O que vocês fazem?": { "fr-FR": "Que fait votre entreprise ?" },
  "Ex.: clínica odontológica, ou venda de roupa fitness pelo WhatsApp": {
    "fr-FR": "Ex. : cabinet dentaire ou vente de vêtements de sport via WhatsApp",
  },
  "Uma linha basta. É com isso que seu funcionário aprende com quem ele está falando — e que a gente monta o quadro de clientes do seu jeito.":
    {
      "fr-FR":
        "Une ligne suffit. Ces informations aident votre assistant à comprendre son interlocuteur et nous permettent d’adapter votre tableau clients.",
    },
  "Onde você atende": { "fr-FR": "Où exercez-vous votre activité ?" },
  "Decide o horário em que seu funcionário pode falar com clientes.": {
    "fr-FR":
      "Détermine les horaires pendant lesquels votre assistant peut échanger avec les clients.",
  },
  "Li e aceito os": { "fr-FR": "J’ai lu et j’accepte les" },
  "e a": { "fr-FR": "et la" },
  "Termos de Uso": { "fr-FR": "Conditions d’utilisation" },
  "Política de Privacidade": { "fr-FR": "Politique de confidentialité" },
  Continuar: { "fr-FR": "Continuer" },
  "São Paulo, Rio, Brasília, Sul e Sudeste": {
    "fr-FR": "São Paulo, Rio, Brasília, Sud et Sud-Est",
  },
  "Recife, Salvador, Fortaleza e Nordeste": { "fr-FR": "Recife, Salvador, Fortaleza et Nord-Est" },
  "Belém e Pará": { "fr-FR": "Belém et Pará" },
  "Manaus e Amazonas": { "fr-FR": "Manaus et Amazonas" },
  "Cuiabá e Mato Grosso": { "fr-FR": "Cuiabá et Mato Grosso" },
  "Rio Branco e Acre": { "fr-FR": "Rio Branco et Acre" },
  "Nova York": { "fr-FR": "New York" },
  "Outro (horário universal)": { "fr-FR": "Autre (temps universel)" },
  "Tudo pronto!": { "fr-FR": "Tout est prêt !" },
  "Seu funcionário está montado. Daqui em diante é só acompanhar.": {
    "fr-FR": "Votre assistant est prêt. Il ne vous reste plus qu’à suivre son activité.",
  },
  "Seu funcionário já está de pé. O que ficou para depois continua te esperando.": {
    "fr-FR":
      "Votre assistant est déjà opérationnel. Les éléments reportés vous attendent toujours.",
  },
  " (você pulou)": { "fr-FR": " (vous avez ignoré cette étape)" },
  " (ainda não)": { "fr-FR": " (pas encore)" },
  "O que mais tem aqui": { "fr-FR": "Que trouve-t-on d’autre ici ?" },
  "Você não precisa mexer em nada disso agora. É só para saber que existe.": {
    "fr-FR":
      "Vous n’avez rien à modifier maintenant. Cette section vous présente simplement les fonctionnalités disponibles.",
  },
  "Como funciona": { "fr-FR": "Comment ça fonctionne" },
  "Finalizando...": { "fr-FR": "Finalisation…" },
  "Começar a usar": { "fr-FR": "Commencer à utiliser" },

  // ─── Test de l’agent ───
  "seu funcionário": { "fr-FR": "votre assistant" },
  "Você ainda não montou seu funcionário.": {
    "fr-FR": "Vous n’avez pas encore configuré votre assistant.",
  },
  "Sem ninguém treinado, não há o que testar. Dá para voltar ao passo anterior agora ou fazer isso depois, em IA › Agentes.":
    {
      "fr-FR":
        "Sans assistant formé, rien ne peut être testé. Vous pouvez revenir à l’étape précédente ou le faire plus tard via IA › Agents.",
    },
  rascunho: { "fr-FR": "brouillon" },
  "Rascunho não responde mensagem, então não há o que ensaiar. O passo anterior explicou o que falta; você pode resolver depois em IA › Agentes.":
    {
      "fr-FR":
        "Un brouillon ne répond pas aux messages : rien ne peut donc être testé. L’étape précédente explique ce qui manque ; vous pourrez le résoudre plus tard via IA › Agents.",
    },
  "Escreva como se fosse um cliente": { "fr-FR": "Écrivez comme si vous étiez un client" },
  "Ele está pensando...": { "fr-FR": "Il réfléchit…" },
  "Mandar mensagem": { "fr-FR": "Envoyer le message" },
  "a respondeu": { "fr-FR": "a répondu" },
  "Esta conversa não foi enviada a ninguém e não aparece no seu inbox.": {
    "fr-FR": "Cette conversation n’a été envoyée à personne et n’apparaît pas dans votre Inbox.",
  },
  "Ele não conseguiu responder — e é melhor descobrir isso agora do que com um cliente de verdade.":
    {
      "fr-FR":
        "Il n’a pas pu répondre — mieux vaut le découvrir maintenant qu’avec un vrai client.",
    },
  "Motivo:": { "fr-FR": "Motif :" },
  "As causas mais comuns são a chave da empresa de IA sem saldo ou o modelo indisponível. Dá para conferir em IA › Credenciais e seguir daqui mesmo — o que você montou está salvo.":
    {
      "fr-FR":
        "Les causes les plus fréquentes sont une clé IA sans crédit ou un modèle indisponible. Vérifiez via IA › Identifiants et poursuivez ici : votre configuration est enregistrée.",
    },
  "Não consegui salvar este passo.": { "fr-FR": "Impossible d’enregistrer cette étape." },
  Pular: { "fr-FR": "Ignorer" },
  "Oi! Vocês atendem hoje? Queria saber o preço.": {
    "fr-FR": "Bonjour ! Êtes-vous ouverts aujourd’hui ? Je voudrais connaître le prix.",
  },
  "Adicione ao menos um email ou clique em Pular.": {
    "fr-FR": "Ajoutez au moins une adresse e-mail ou cliquez sur Ignorer.",
  },
  "Máximo 20 emails por convite.": { "fr-FR": "Maximum 20 adresses e-mail par invitation." },
  "convite(s) não puderam ser enviados por email. Copie os links abaixo e envie você mesmo.": {
    "fr-FR":
      "invitation(s) n’ont pas pu être envoyée(s) par e-mail. Copiez les liens ci-dessous et envoyez-les vous-même.",
  },
  "E-mail de quem vai trabalhar com ele": {
    "fr-FR": "E-mail des personnes qui travailleront avec lui",
  },
  "O que essas pessoas podem fazer": { "fr-FR": "Ce que ces personnes peuvent faire" },
  "Somente leitura": { "fr-FR": "Lecture seule" },
  Atendente: { "fr-FR": "Agent" },
  Gerente: { "fr-FR": "Responsable" },
  Administrador: { "fr-FR": "Administrateur" },
  "Esta instalação não envia e-mail. Os convites estão prontos — copie o link de cada pessoa e mande por onde você já fala com ela:":
    {
      "fr-FR":
        "Cette installation n’envoie pas d’e-mails. Les invitations sont prêtes : copiez le lien de chaque personne et envoyez-le par votre canal habituel :",
    },
  "Link copiado.": { "fr-FR": "Lien copié." },
  "Não consegui copiar — selecione e copie o link manualmente.": {
    "fr-FR": "Impossible de copier ; sélectionnez et copiez le lien manuellement.",
  },
  "Copiar link": { "fr-FR": "Copier le lien" },
  "Pular por enquanto": { "fr-FR": "Ignorer pour le moment" },
  "Enviar convites": { "fr-FR": "Envoyer les invitations" },

  // ─── Contacts ───
  "Dados inválidos": { "fr-FR": "Données invalides" },
  "Contato criado": { "fr-FR": "Contact créé" },
  "Novo contato": { "fr-FR": "Nouveau contact" },
  "Preencha pelo menos um identificador (email ou telefone).": {
    "fr-FR": "Renseignez au moins un identifiant (e-mail ou téléphone).",
  },
  "Telefone (E.164)": { "fr-FR": "Téléphone (E.164)" },
  "CPF (opcional)": { "fr-FR": "CPF (facultatif)" },
  "Criando…": { "fr-FR": "Création…" },
  "Criar contato": { "fr-FR": "Créer le contact" },
  "Contato atualizado": { "fr-FR": "Contact mis à jour" },
  "Editar contato": { "fr-FR": "Modifier le contact" },
  "Valor inválido": { "fr-FR": "Valeur invalide" },
  "Valor (R$)": { "fr-FR": "Montant (R$)" },
  "Lead criado": { "fr-FR": "Lead créé" },
  "Novo Lead": { "fr-FR": "Nouveau lead" },
  "Crie um lead manualmente neste pipeline.": {
    "fr-FR": "Créez un lead manuellement dans ce pipeline.",
  },
  "Ex: Pedido Maria — combo presente": { "fr-FR": "Ex. : Commande de Marie — coffret cadeau" },
  "Contexto, observações, links…": { "fr-FR": "Contexte, remarques, liens…" },
  Etapa: { "fr-FR": "Étape" },
  "Selecione a etapa": { "fr-FR": "Sélectionnez l’étape" },
  "Criar lead": { "fr-FR": "Créer le lead" },
  "Lead atualizado": { "fr-FR": "Lead mis à jour" },
  "Marcar como perdido": { "fr-FR": "Marquer comme perdu" },
  "Informe o motivo. Essa informação ajuda a melhorar o funil.": {
    "fr-FR": "Indiquez le motif. Cette information aide à améliorer le pipeline.",
  },
  Motivo: { "fr-FR": "Motif" },
  "Cliente solicitou cancelamento": { "fr-FR": "Le client a demandé l’annulation" },
  Preço: { "fr-FR": "Prix" },
  "Sem resposta do cliente": { "fr-FR": "Aucune réponse du client" },
  "Produto indisponível": { "fr-FR": "Produit indisponible" },
  "Cancelado pela loja": { "fr-FR": "Annulé par le magasin" },
  "Cancelado pelo cliente": { "fr-FR": "Annulé par le client" },
  "Falha no pagamento": { "fr-FR": "Échec du paiement" },
  "Outro motivo": { "fr-FR": "Autre motif" },
  "Detalhe (opcional)": { "fr-FR": "Détail (facultatif)" },
  "Ex: Cliente desistiu por X motivo": {
    "fr-FR": "Ex. : Le client s’est désisté pour telle raison",
  },
  Confirmar: { "fr-FR": "Confirmer" },
  "Editar lead": { "fr-FR": "Modifier le lead" },
  "Atualize os campos. Mover de etapa ou marcar ganho/perdido tem opções próprias.": {
    "fr-FR":
      "Mettez à jour les champs. Le changement d’étape et le marquage gagné/perdu disposent de leurs propres actions.",
  },
  "Atualize os dados deste contato.": { "fr-FR": "Mettez à jour les informations de ce contact." },
  "Não foi possível importar o arquivo.": { "fr-FR": "Impossible d’importer le fichier." },
  "Importar contatos de planilha": { "fr-FR": "Importer des contacts depuis un tableur" },
  "Envie um arquivo .csv com cabeçalho — colunas reconhecidas: nome, telefone, email, cpf, nascimento, tags. Excel: use “Salvar como” → “CSV UTF-8”. Máximo de 500 linhas por arquivo.":
    {
      "fr-FR":
        "Envoyez un fichier .csv avec en-têtes — colonnes reconnues : nom, téléphone, e-mail, CPF, date de naissance, étiquettes. Excel : utilisez « Enregistrer sous » → « CSV UTF-8 ». Maximum 500 lignes par fichier.",
    },
  "Arquivo CSV": { "fr-FR": "Fichier CSV" },
  Importar: { "fr-FR": "Importer" },
  "Importando…": { "fr-FR": "Importation…" },
  "linha(s) lidas": { "fr-FR": "ligne(s) lue(s)" },
  "linha(s) com problema": { "fr-FR": "ligne(s) en erreur" },
  "importado(s)": { "fr-FR": "importé(s)" },
  "já existente(s)": { "fr-FR": "déjà existant(s)" },
  "com erro": { "fr-FR": "en erreur" },
  Linha: { "fr-FR": "Ligne" },
  "Importar outro arquivo": { "fr-FR": "Importer un autre fichier" },
  Concluir: { "fr-FR": "Terminer" },
  "Resolver merge de contatos": { "fr-FR": "Résoudre la fusion de contacts" },
  "Comparação dos candidatos detectados. A resolução automática via API ainda não está disponível neste MVP — entre em contato com o admin para mesclar via SQL.":
    {
      "fr-FR":
        "Comparaison des candidats détectés. La résolution automatique via API n’est pas encore disponible dans ce MVP ; contactez l’administrateur pour effectuer la fusion via SQL.",
    },
  "Nenhum candidato disponível.": { "fr-FR": "Aucun candidat disponible." },
  "Endpoint de resolução não implementado neste MVP": {
    "fr-FR": "Le point d’accès de résolution n’est pas implémenté dans ce MVP",
  },
  "Resolver via SQL (em breve)": { "fr-FR": "Résoudre via SQL (bientôt disponible)" },

  // ─── Connexion WhatsApp ───
  "Pronto para conectar": { "fr-FR": "Prêt à connecter" },
  "Preparando o código…": { "fr-FR": "Préparation du code…" },
  "Conectado!": { "fr-FR": "Connecté !" },
  "O código expirou": { "fr-FR": "Le code a expiré" },
  "Não consegui falar com o WhatsApp": { "fr-FR": "Impossible de communiquer avec WhatsApp" },
  "Escaneie o código abaixo com o celular que vai atender.": {
    "fr-FR": "Scannez le code ci-dessous avec le téléphone qui répondra aux clients.",
  },
  "Isso leva alguns segundos. O código aparece aqui sozinho.": {
    "fr-FR": "Cela prend quelques secondes. Le code apparaîtra ici automatiquement.",
  },
  "O número está no ar. Seguindo para o próximo passo.": {
    "fr-FR": "Le numéro est connecté. Passage à l’étape suivante.",
  },
  "É normal — ele vale poucos minutos. Dá para gerar outro.": {
    "fr-FR":
      "C’est normal : il n’est valable que quelques minutes. Vous pouvez en générer un autre.",
  },
  "O serviço roda no seu servidor e não respondeu agora.": {
    "fr-FR": "Le service fonctionne sur votre serveur et n’a pas répondu cette fois.",
  },
  "Falha ao pular:": { "fr-FR": "Impossible d’ignorer l’étape :" },
  "Falha ao marcar passo:": { "fr-FR": "Impossible de marquer l’étape :" },
  "Falha ao avançar:": { "fr-FR": "Impossible de continuer :" },
  "Conectei em outro lugar": { "fr-FR": "Je l’ai connecté ailleurs" },
  "Escolher outra forma": { "fr-FR": "Choisir une autre méthode" },
  "Como você já usa esse número?": { "fr-FR": "Comment utilisez-vous déjà ce numéro ?" },
  "Existe mais de um jeito de ter WhatsApp para empresa, e cada um conecta de um jeito. Se você nunca ouviu falar dos outros dois, é o primeiro.":
    {
      "fr-FR":
        "Il existe plusieurs façons d’utiliser WhatsApp pour une entreprise, chacune avec sa propre connexion. Si vous ne connaissez pas les deux autres, choisissez la première.",
    },
  "Leio um código com o celular": { "fr-FR": "Je scanne un code avec mon téléphone" },
  "É assim para quase todo mundo. Você abre o WhatsApp no celular que vai atender e aponta para um código que aparece aqui.":
    {
      "fr-FR":
        "C’est la méthode la plus courante. Ouvrez WhatsApp sur le téléphone qui répondra aux clients et scannez le code affiché ici.",
    },
  "Tenho conta oficial na Meta": { "fr-FR": "J’ai un compte officiel Meta" },
  "Você cadastrou o número na Meta e tem as credenciais em mãos. Não usa o celular para conectar.":
    {
      "fr-FR":
        "Vous avez enregistré le numéro auprès de Meta et disposez de ses identifiants. Le téléphone n’est pas utilisé pour la connexion.",
    },
  "Contrato de um provedor parceiro": { "fr-FR": "J’ai un contrat avec un fournisseur partenaire" },
  "Uma empresa parceira cuida do seu WhatsApp e te deu uma chave de acesso.": {
    "fr-FR": "Une entreprise partenaire gère votre WhatsApp et vous a fourni une clé d’accès.",
  },
  "Este servidor ainda não está pronto para RECEBER por este caminho.": {
    "fr-FR": "Ce serveur n’est pas encore prêt à RECEVOIR par cette méthode.",
  },
  "Dá para conectar e já enviar, mas as respostas do cliente não vão chegar até quem instalou o sistema completar uma configuração no servidor. Se você quer atender hoje, o caminho do código com o celular funciona agora — e dá para trocar depois, sem perder nada.":
    {
      "fr-FR":
        "Vous pouvez connecter le numéro et envoyer des messages, mais les réponses des clients n’arriveront pas tant qu’une configuration serveur ne sera pas terminée. Si vous devez répondre aujourd’hui, la méthode du code avec le téléphone fonctionne immédiatement et pourra être remplacée plus tard sans perte de données.",
    },
  "O WhatsApp desta instalação ainda não subiu.": {
    "fr-FR": "Le WhatsApp de cette installation n’est pas encore démarré.",
  },
  "Ele roda no seu próprio servidor. Dá para seguir sem ele agora e conectar o número depois, em Canais › Conexões — seu funcionário fica pronto de qualquer jeito, só não terá por onde atender ainda.":
    {
      "fr-FR":
        "Il fonctionne sur votre propre serveur. Vous pouvez continuer sans lui et connecter le numéro plus tard via Canaux › Connexions ; votre assistant sera prêt, mais ne pourra pas encore répondre aux clients.",
    },
  "Não consegui carregar o código agora. Ele deve reaparecer sozinho em instantes — se não aparecer, gere outro abaixo.":
    {
      "fr-FR":
        "Impossible de charger le code pour le moment. Il devrait réapparaître dans quelques instants ; sinon, générez-en un nouveau ci-dessous.",
    },
  "Código QR para conectar o WhatsApp": { "fr-FR": "Code QR pour connecter WhatsApp" },
  "✓ Conectado! Avançando…": { "fr-FR": "✓ Connecté ! Passage à l’étape suivante…" },
  "O código expirou antes de alguém escanear. É normal — ele vale só alguns minutos.": {
    "fr-FR":
      "Le code a expiré avant d’être scanné. C’est normal : il n’est valable que quelques minutes.",
  },
  "Deixe o WhatsApp já aberto em Aparelhos conectados antes de gerar o próximo, que aí dá tempo de sobra.":
    {
      "fr-FR":
        "Laissez WhatsApp ouvert dans « Appareils connectés » avant de générer le prochain code pour avoir suffisamment de temps.",
    },
  "Gerando…": { "fr-FR": "Génération…" },
  "Gerar novo QR Code": { "fr-FR": "Générer un nouveau code QR" },
  "O serviço de WhatsApp desta instalação não respondeu. Ele roda no seu servidor, junto com o resto do sistema — quem instalou consegue religá-lo.":
    {
      "fr-FR":
        "Le service WhatsApp de cette installation n’a pas répondu. Il fonctionne sur votre serveur avec le reste du système ; la personne qui l’a installé peut le redémarrer.",
    },
  "Detalhe técnico:": { "fr-FR": "Détail technique :" },
  "Tentando…": { "fr-FR": "Nouvelle tentative…" },

  // ─── Configuration de l’agent IA ───
  "Atendente IA": { "fr-FR": "Assistant IA" },
  "Como ele vai se chamar": { "fr-FR": "Comment s’appellera-t-il ?" },
  "É o nome que aparece para o seu time. O cliente vê só a conversa.": {
    "fr-FR": "C’est le nom affiché à votre équipe. Le client ne voit que la conversation.",
  },
  "O jeito dele falar": { "fr-FR": "Sa façon de parler" },
  "Próximo e caloroso": { "fr-FR": "Chaleureux et accessible" },
  "Conversa como gente, puxa assunto, tranquiliza. Bom para quem vende no dia a dia.": {
    "fr-FR":
      "Il parle naturellement, crée le contact et rassure. Idéal pour les activités commerciales du quotidien.",
  },
  "Objetivo e cordial": { "fr-FR": "Direct et cordial" },
  "Vai direto ao ponto sem ser seco, e sempre indica o próximo passo.": {
    "fr-FR": "Il va droit au but sans être froid et indique toujours la prochaine étape.",
  },
  "Curto e prático": { "fr-FR": "Bref et pratique" },
  "Frases curtas, pergunta só o essencial e chama uma pessoa cedo.": {
    "fr-FR":
      "Il utilise des phrases courtes, pose uniquement les questions essentielles et passe rapidement le relais à une personne.",
  },
  "As regras da casa (opcional)": { "fr-FR": "Règles internes (facultatif)" },
  "Nunca prometa desconto sem confirmar com uma pessoa.\nHorário de atendimento: 9h às 18h, de segunda a sexta.\nSempre chame o cliente pelo primeiro nome.":
    {
      "fr-FR":
        "Ne promettez jamais de remise sans confirmation humaine.\nHoraires d’ouverture : de 9 h à 18 h, du lundi au vendredi.\nAppelez toujours le client par son prénom.",
    },
  "O que vale para qualquer atendimento aqui. Pode deixar em branco agora e escrever depois — ele aprende com você ao longo do tempo.":
    {
      "fr-FR":
        "Ces règles s’appliquent à tous les échanges. Vous pouvez laisser ce champ vide et les ajouter plus tard : votre assistant apprend avec vous au fil du temps.",
    },
  "Ele já vem sabendo": { "fr-FR": "Ce qu’il sait déjà faire" },
  "E nunca vai fazer": { "fr-FR": "Ce qu’il ne fera jamais" },
  "Essas conferências acontecem antes de cada mensagem sair, e não têm interruptor.": {
    "fr-FR": "Ces contrôles sont effectués avant chaque envoi et ne peuvent pas être désactivés.",
  },
  "Falha ao criar agente:": { "fr-FR": "Impossible de créer l’agent :" },
  "Atendente criado, mas ainda não está no ar.": {
    "fr-FR": "Assistant créé, mais pas encore publié.",
  },
  "Agente criado, mas ainda não publicado.": { "fr-FR": "Agent créé, mais pas encore publié." },
  "O atendente foi criado, mas as regras da casa não foram gravadas. Copie o que você escreveu antes de sair — e salve de novo em IA › Memória.":
    {
      "fr-FR":
        "L’assistant a été créé, mais les règles internes n’ont pas été enregistrées. Copiez votre texte avant de quitter, puis enregistrez-le à nouveau via IA › Mémoire.",
    },
  "Erro do banco de dados:": { "fr-FR": "Erreur de base de données :" },
  "Seu atendente foi criado, mas ficou como rascunho — ele ainda não tem com o que pensar.": {
    "fr-FR":
      "Votre assistant a été créé, mais il est resté en brouillon : il ne dispose pas encore des éléments nécessaires pour réfléchir.",
  },
  "Não achei chave de": { "fr-FR": "Aucune clé" },
  "nem cadastrada aqui, nem vinda da instalação. Cole a chave no campo acima («o cérebro dele») e crie o atendente de novo — ou cadastre em IA › Credenciais.":
    {
      "fr-FR":
        "n’a été trouvée ici ni dans la configuration de l’installation. Collez la clé dans le champ ci-dessus (« son cerveau ») et recréez l’assistant, ou ajoutez-la via IA › Identifiants.",
    },
  "Continuar sem publicar": { "fr-FR": "Continuer sans publier" },
  "Seu atendente foi criado, mas ficou como rascunho — e rascunho não responde mensagem.": {
    "fr-FR":
      "Votre assistant a été créé, mais il est resté en brouillon : un brouillon ne répond pas aux messages.",
  },
  "Os modelos": { "fr-FR": "Les modèles" },
  "que esta instalação conhece não sabem usar ferramentas — sem isso ele conversaria bem e nunca criaria um cliente nem moveria um negócio no funil. Escolha outra empresa de IA em":
    {
      "fr-FR":
        "connus de cette installation ne savent pas utiliser les outils : il pourrait converser correctement, mais ne créerait jamais de client ni ne déplacerait de lead dans le pipeline. Choisissez un autre fournisseur IA via",
    },
  "Esta instalação ainda não tem a lista de modelos": {
    "fr-FR": "Cette installation ne possède pas encore la liste des modèles",
  },
  "Ela é baixada automaticamente uma vez por dia; depois disso, publique em": {
    "fr-FR":
      "Elle est téléchargée automatiquement une fois par jour ; ensuite, publiez l’agent via",
  },
  "Seu agente foi criado, mas ficou como rascunho: não consegui ler os números de WhatsApp desta instalação, então não dá pra dizer em qual número ele atenderia — e rascunho não responde mensagem.":
    {
      "fr-FR":
        "Votre agent a été créé, mais il est resté en brouillon : impossible de lire les numéros WhatsApp de cette installation, donc le numéro de réponse ne peut pas être déterminé. Un brouillon ne répond pas aux messages.",
    },
  "Tente de novo no botão abaixo (clicar de novo não cria um segundo agente) ou siga agora e publique depois em":
    {
      "fr-FR":
        "Réessayez avec le bouton ci-dessous (un nouveau clic ne crée pas un second agent) ou continuez maintenant et publiez-le plus tard via",
    },
  "Criar e continuar": { "fr-FR": "Créer et continuer" },
  "da inteligência escolhida na instalação": {
    "fr-FR": "de l’intelligence choisie lors de l’installation",
  },
  "Ele ainda não tem cérebro": { "fr-FR": "Il n’a pas encore de cerveau" },
  "Seu funcionário pensa com a inteligência artificial que você contratar. A instalação não trouxe nenhuma chave — cole a sua aqui e ele já nasce funcionando.":
    {
      "fr-FR":
        "Votre assistant fonctionne avec le service d’intelligence artificielle que vous choisissez. L’installation ne contient aucune clé : collez la vôtre ici pour qu’il soit opérationnel dès sa création.",
    },
  "Qual você contratou": { "fr-FR": "Quel service avez-vous choisi ?" },
  "A chave": { "fr-FR": "La clé" },
  "Cole aqui a chave que a empresa de IA te deu": {
    "fr-FR": "Collez ici la clé fournie par le service IA",
  },
  "Chave guardada. Agora ele pode pensar.": {
    "fr-FR": "Clé enregistrée. Il peut maintenant réfléchir.",
  },
  "Guardando...": { "fr-FR": "Enregistrement…" },
  "Guardar a chave": { "fr-FR": "Enregistrer la clé" },
  "Ela é guardada cifrada — nem nós conseguimos lê-la depois.": {
    "fr-FR": "Elle est enregistrée de façon chiffrée : même nous ne pouvons pas la lire ensuite.",
  },
  "O cérebro dele:": { "fr-FR": "Son cerveau :" },
  "Conferindo se a chave tem crédito…": { "fr-FR": "Vérification du crédit de la clé…" },
  "Testei agora: a chave respondeu e tem crédito.": {
    "fr-FR": "Test effectué : la clé a répondu et dispose de crédit.",
  },
  "A chave foi aceita, mas o teste não passou:": {
    "fr-FR": "La clé a été acceptée, mais le test a échoué :",
  },
  "Se for falta de crédito, adicione saldo na conta da empresa de IA — sem isso ele não responde a nenhum cliente.":
    {
      "fr-FR":
        "S’il manque du crédit, rechargez le compte du service IA : sans cela, l’assistant ne répondra à aucun client.",
    },
  "Não consegui testar o crédito agora. Dá para seguir — mas confira o saldo na conta da empresa de IA antes de confiar nele.":
    {
      "fr-FR":
        "Impossible de tester le crédit pour le moment. Vous pouvez continuer, mais vérifiez le solde du compte IA avant de lui faire confiance.",
    },
  "Pronta para uso.": { "fr-FR": "Prête à l’emploi." },

  // ─── Détail contact ───
  "Erro ao carregar contato.": { "fr-FR": "Erreur lors du chargement du contact." },
  "Contato anonimizado (LGPD)": { "fr-FR": "Contact anonymisé (LGPD)" },
  Anonimizado: { "fr-FR": "Anonymisé" },
  "edição bloqueada.": { "fr-FR": "modification bloquée." },
  "Visão geral": { "fr-FR": "Vue d’ensemble" },
  Timeline: { "fr-FR": "Chronologie" },
  LGPD: { "fr-FR": "LGPD" },
  "Display name": { "fr-FR": "Nom d’affichage" },
  Origem: { "fr-FR": "Origine" },
  "Última atividade": { "fr-FR": "Dernière activité" },
  Online: { "fr-FR": "En ligne" },
  Offline: { "fr-FR": "Hors ligne" },
  Dom: { "fr-FR": "Dim" },
  Seg: { "fr-FR": "Lun" },
  Ter: { "fr-FR": "Mar" },
  Qua: { "fr-FR": "Mer" },
  Qui: { "fr-FR": "Jeu" },
  Sex: { "fr-FR": "Ven" },
  Sáb: { "fr-FR": "Sam" },
  "Horário de": { "fr-FR": "Horaires de" },
  "Sem janelas = disponível 24/7. Adicione janelas para restringir o roteamento a horários específicos.":
    {
      "fr-FR":
        "Sans plage horaire, disponibilité 24 h/24 et 7 j/7. Ajoutez des plages pour limiter le routage à des horaires précis.",
    },
  "Fuso horário": { "fr-FR": "Fuseau horaire" },
  "Nenhuma janela — disponível 24/7.": { "fr-FR": "Aucune plage — disponible 24 h/24 et 7 j/7." },
  "Dia da semana": { "fr-FR": "Jour de la semaine" },
  Início: { "fr-FR": "Début" },
  Fim: { "fr-FR": "Fin" },
  "Remover janela": { "fr-FR": "Supprimer la plage" },
  "Adicionar janela": { "fr-FR": "Ajouter une plage" },
  "Modo de roteamento": { "fr-FR": "Mode de routage" },
  "Como as conversas novas são distribuídas entre os atendentes da organização.": {
    "fr-FR":
      "Comment les nouvelles conversations sont distribuées entre les agents de l’organisation.",
  },
  Modo: { "fr-FR": "Mode" },
  "Manual (atendente puxa da fila)": { "fr-FR": "Manuel (l’agent prend dans la file)" },
  "Rodízio (distribui automático)": { "fr-FR": "Rotation (distribution automatique)" },
  "Balanceamento por carga (em breve)": { "fr-FR": "Équilibrage par charge (bientôt disponible)" },
  "Tentativas máx.": { "fr-FR": "Tentatives max." },
  "Backoff (s)": { "fr-FR": "Backoff (s)" },
  "Erro ao carregar a configuração de roteamento.": {
    "fr-FR": "Impossible de charger la configuration du routage.",
  },
  Atendentes: { "fr-FR": "Agents" },
  Carga: { "fr-FR": "Charge" },
  Capacidade: { "fr-FR": "Capacité" },
  Horário: { "fr-FR": "Horaires" },
  Disponível: { "fr-FR": "Disponible" },
  "Status, carga atual e capacidade de cada atendente da organização.": {
    "fr-FR": "Statut, charge actuelle et capacité de chaque agent de l’organisation.",
  },
  "Erro ao carregar atendentes.": { "fr-FR": "Impossible de charger les agents." },
  "Nenhum atendente na organização. Convide membros com papel de atendente ou superior.": {
    "fr-FR":
      "Aucun agent dans l’organisation. Invitez des membres ayant le rôle d’agent ou un rôle supérieur.",
  },
  "Capacidade de": { "fr-FR": "Capacité de" },
  "Editar horário de": { "fr-FR": "Modifier les horaires de" },
  "Disponibilidade de": { "fr-FR": "Disponibilité de" },
  Membro: { "fr-FR": "Membre" },
  Role: { "fr-FR": "Rôle" },
  Status: { "fr-FR": "Statut" },
  "Papel de": { "fr-FR": "Rôle de" },
  Aceito: { "fr-FR": "Accepté" },
  Pendente: { "fr-FR": "En attente" },
  Ações: { "fr-FR": "Actions" },
  "Revogar acesso": { "fr-FR": "Révoquer l’accès" },
  "perderá acesso ao tenant. Esta ação pode ser desfeita reconvidando o membro.": {
    "fr-FR":
      "perdra l’accès au tenant. Cette action peut être annulée en renvoyant une invitation au membre.",
  },
  você: { "fr-FR": "vous" },
  "Acesso revogado.": { "fr-FR": "Accès révoqué." },
  Revogar: { "fr-FR": "Révoquer" },
  "Criado em": { "fr-FR": "Créé le" },
  "Direito ao esquecimento (LGPD)": { "fr-FR": "Droit à l’effacement (LGPD)" },
  "A anonimização é irreversível. Use somente após confirmação formal do titular ou ordem judicial.":
    {
      "fr-FR":
        "L’anonymisation est irréversible. Utilisez-la uniquement après confirmation formelle de la personne concernée ou sur ordonnance judiciaire.",
    },
  "Este contato já foi anonimizado": { "fr-FR": "Ce contact a déjà été anonymisé" },
  "Anonimizar contato": { "fr-FR": "Anonymiser le contact" },
  "Contato já estava anonimizado.": { "fr-FR": "Le contact était déjà anonymisé." },
  "Contato anonimizado.": { "fr-FR": "Contact anonymisé." },
  "Anonimizar contato (LGPD)": { "fr-FR": "Anonymiser le contact (LGPD)" },
  'Esta ação é irreversível. O nome será substituído por "Contato Anonimizado #N", email/telefone/CPF serão limpos, e atividades terão conteúdo redigido.':
    {
      "fr-FR":
        "Cette action est irréversible. Le nom sera remplacé par « Contact anonymisé #N », l’e-mail, le téléphone et le CPF seront supprimés, et le contenu des activités sera anonymisé.",
    },
  "Justificativa (mínimo 10 caracteres)": { "fr-FR": "Justification (10 caractères minimum)" },
  "Ex.: Solicitação formal do titular via email em DD/MM/YYYY": {
    "fr-FR": "Ex. : Demande formelle de la personne concernée par e-mail le JJ/MM/AAAA",
  },
  "caracteres mínimos": { "fr-FR": "caractères minimum" },
  "Para confirmar, digite": { "fr-FR": "Pour confirmer, saisissez" },
  Confirmação: { "fr-FR": "Confirmation" },
  "Anonimizando…": { "fr-FR": "Anonymisation…" },
  "Anonimizar permanentemente": { "fr-FR": "Anonymiser définitivement" },
  "Não foi possível carregar as sugestões agora.": {
    "fr-FR": "Impossible de charger les suggestions pour le moment.",
  },
  "Não foi possível registrar a decisão.": { "fr-FR": "Impossible d’enregistrer la décision." },
  "O assistente ouviu isto na conversa": {
    "fr-FR": "L’assistant a relevé ceci dans la conversation",
  },
  "aguardando você": { "fr-FR": "en attente de votre validation" },
  "Nada foi salvo ainda. Confira o que a pessoa escreveu e decida.": {
    "fr-FR": "Rien n’a encore été enregistré. Vérifiez ce que la personne a écrit et décidez.",
  },
  "(hoje:": { "fr-FR": "(actuellement :" },
  "Está certo, salvar": { "fr-FR": "C’est correct, enregistrer" },
  Descartar: { "fr-FR": "Rejeter" },
  "Salvando…": { "fr-FR": "Enregistrement…" },
  Hoje: { "fr-FR": "Aujourd’hui" },
  Ontem: { "fr-FR": "Hier" },
  "Erro ao carregar timeline.": { "fr-FR": "Erreur lors du chargement de la chronologie." },
  "Erro ao carregar conversas.": { "fr-FR": "Erreur lors du chargement des conversations." },
  "Selecione uma conversa": { "fr-FR": "Sélectionnez une conversation" },
  "Erro ao carregar mensagens.": { "fr-FR": "Erreur lors du chargement des messages." },
  "Nenhuma mensagem nesta conversa.": { "fr-FR": "Aucun message dans cette conversation." },
  "Carregar mais antigas": { "fr-FR": "Charger les messages plus anciens" },
  "Sem conversas por aqui": { "fr-FR": "Aucune conversation ici" },
  "Quando chegarem mensagens, elas aparecem aqui em tempo real.": {
    "fr-FR": "Lorsque des messages arriveront, ils apparaîtront ici en temps réel.",
  },
  "Quadro vazio": { "fr-FR": "Tableau vide" },
  "Ainda não há nenhum cliente aqui. Assim que a primeira conversa começar, o cartão aparece nesta coluna.":
    {
      "fr-FR":
        "Aucun client ici pour le moment. Dès que la première conversation commencera, la carte apparaîtra dans cette colonne.",
    },
  "Nenhum contato ainda": { "fr-FR": "Aucun contact pour le moment" },
  "Contatos chegam automaticamente via WhatsApp ou Nuvemshop.": {
    "fr-FR": "Les contacts arrivent automatiquement via WhatsApp ou Nuvemshop.",
  },
  "Sem eventos no período": { "fr-FR": "Aucun événement sur la période" },
  "Ajuste o filtro de datas ou a busca pra ver eventos.": {
    "fr-FR": "Ajustez le filtre de dates ou la recherche pour afficher des événements.",
  },
  "Nenhum funil ainda": { "fr-FR": "Aucun pipeline pour le moment" },
  "Um funil é o caminho que o cliente percorre até fechar. Crie o primeiro para ter um quadro.": {
    "fr-FR":
      "Un pipeline représente le parcours du client jusqu’à la conversion. Créez le premier pour obtenir un tableau.",
  },
  "Sem membros no time": { "fr-FR": "Aucun membre dans l’équipe" },
  "Convide colegas pra atender em conjunto.": {
    "fr-FR": "Invitez des collègues à répondre ensemble.",
  },
  "Nenhum token criado": { "fr-FR": "Aucun jeton créé" },
  "Tokens permitem integrações server-to-server.": {
    "fr-FR": "Les jetons permettent les intégrations de serveur à serveur.",
  },
  "Sem atividades registradas": { "fr-FR": "Aucune activité enregistrée" },
  "A timeline mostra mensagens, mudanças de stage e notas.": {
    "fr-FR": "La chronologie affiche les messages, les changements d’étape et les notes.",
  },
  "Sem candidatos a merge": { "fr-FR": "Aucun candidat à la fusion" },
  "Contatos duplicados aparecerão aqui pra revisão.": {
    "fr-FR": "Les contacts en double apparaîtront ici pour vérification.",
  },
  "Remover tag": { "fr-FR": "Supprimer l’étiquette" },
  "Sem tags no contato.": { "fr-FR": "Aucune étiquette sur ce contact." },
  "Adicionar tag ao contato": { "fr-FR": "Ajouter une étiquette au contact" },
  "Adicionar tag": { "fr-FR": "Ajouter une étiquette" },
  "Tags da conversa": { "fr-FR": "Étiquettes de la conversation" },
  "Adicionar tag à conversa": { "fr-FR": "Ajouter une étiquette à la conversation" },
  "Tente ajustar os filtros ou a busca.": {
    "fr-FR": "Essayez d’ajuster les filtres ou la recherche.",
  },
  "Buscar conversas": { "fr-FR": "Rechercher des conversations" },
  "Filtrar por número de WhatsApp": { "fr-FR": "Filtrer par numéro WhatsApp" },
  "Filtrar por tag": { "fr-FR": "Filtrer par étiquette" },
  "Número removido": { "fr-FR": "Numéro supprimé" },
  Alguém: { "fr-FR": "Quelqu’un" },
  "Nota interna · só o time vê": { "fr-FR": "Note interne · visible par l’équipe uniquement" },
  "Excluir nota": { "fr-FR": "Supprimer la note" },
  "Próxima conversa": { "fr-FR": "Conversation suivante" },
  "Conversa anterior": { "fr-FR": "Conversation précédente" },
  "Focar resposta": { "fr-FR": "Placer le curseur dans la réponse" },
  "Enviar a mensagem": { "fr-FR": "Envoyer le message" },
  "Quebrar linha sem enviar": { "fr-FR": "Insérer un retour à la ligne sans envoyer" },
  "Assumir conversa": { "fr-FR": "Prendre la conversation" },
  "Fechar conversa": { "fr-FR": "Fermer la conversation" },
  "Mostrar atalhos": { "fr-FR": "Afficher les raccourcis" },
  "Atalhos de teclado": { "fr-FR": "Raccourcis clavier" },
  "Enviar contato": { "fr-FR": "Envoyer un contact" },
  "Mídia indisponível": { "fr-FR": "Média indisponible" },
  "Pausar áudio": { "fr-FR": "Mettre l’audio en pause" },
  "Não consegui acessar o microfone. Verifique a permissão do navegador.": {
    "fr-FR": "Impossible d’accéder au microphone. Vérifiez l’autorisation du navigateur.",
  },
  Anexar: { "fr-FR": "Joindre" },
  "Fotos e vídeos": { "fr-FR": "Photos et vidéos" },
  Documento: { "fr-FR": "Document" },
  Emoji: { "fr-FR": "Emoji" },
  "Sugerir resposta": { "fr-FR": "Suggérer une réponse" },
  "Gravar áudio": { "fr-FR": "Enregistrer un audio" },
  "Cancelar gravação": { "fr-FR": "Annuler l’enregistrement" },
  "Enviar áudio": { "fr-FR": "Envoyer l’audio" },
  "Reproduzir áudio": { "fr-FR": "Lire l’audio" },
  "Progresso do áudio": { "fr-FR": "Progression de l’audio" },
  "Velocidade de reprodução": { "fr-FR": "Vitesse de lecture" },
  Baixar: { "fr-FR": "Télécharger" },
  Áudio: { "fr-FR": "Audio" },
  Lida: { "fr-FR": "Lue" },
  Entregue: { "fr-FR": "Livrée" },
  Enviada: { "fr-FR": "Envoyée" },
  "Responder a esta mensagem": { "fr-FR": "Répondre à ce message" },
  Mensagem: { "fr-FR": "Message" },
  "Cancelar resposta": { "fr-FR": "Annuler la réponse" },
  "Enter salva a nota · Shift+Enter quebra linha": {
    "fr-FR": "Entrée enregistre la note · Maj+Entrée insère un retour à la ligne",
  },
  "Enter envia · Shift+Enter quebra linha": {
    "fr-FR": "Entrée envoie · Maj+Entrée insère un retour à la ligne",
  },
  Você: { "fr-FR": "Vous" },
  Cliente: { "fr-FR": "Client" },
  "Esta mensagem foi apagada": { "fr-FR": "Ce message a été supprimé" },
  "(sem texto)": { "fr-FR": "(sans texte)" },
  "O autor editou esta mensagem": { "fr-FR": "L’auteur a modifié ce message" },
  editada: { "fr-FR": "modifiée" },
  Falhou: { "fr-FR": "Échec" },
  "Erro desconhecido": { "fr-FR": "Erreur inconnue" },
  "Enviar anexo": { "fr-FR": "Envoyer la pièce jointe" },
  "Legenda (opcional)": { "fr-FR": "Légende (facultatif)" },
  "Credencial salva. Validando…": { "fr-FR": "Identifiant enregistré. Validation en cours…" },
  "Credencial salva. Validação em segundo plano.": {
    "fr-FR": "Identifiant enregistré. Validation en arrière-plan.",
  },
  Validada: { "fr-FR": "Validée" },
  "modelos disponíveis.": { "fr-FR": "modèles disponibles." },
  "Validação falhou": { "fr-FR": "Échec de la validation" },
  "Adicionar credencial": { "fr-FR": "Ajouter un identifiant" },
  "A chave é cifrada (AES-GCM) antes de gravar e nunca é retornada em texto claro.": {
    "fr-FR":
      "La clé est chiffrée (AES-GCM) avant son enregistrement et n’est jamais renvoyée en clair.",
  },
  Provider: { "fr-FR": "Fournisseur" },
  Label: { "fr-FR": "Libellé" },
  "Ex: Produção": { "fr-FR": "Ex. : Production" },
  "API key": { "fr-FR": "Clé API" },
  "Salvar e validar": { "fr-FR": "Enregistrer et valider" },
  Obrigatório: { "fr-FR": "Obligatoire" },
  "API key muito curta": { "fr-FR": "Clé API trop courte" },
  "Cole o conteúdo antes de criar.": { "fr-FR": "Collez le contenu avant de créer la source." },
  "Não consegui criar a fonte.": { "fr-FR": "Impossible de créer la source." },
  "Fonte criada. A indexação começa em instantes.": {
    "fr-FR": "Source créée. L’indexation commence dans un instant.",
  },
  "Não consegui falar com o servidor.": { "fr-FR": "Impossible de joindre le serveur." },
  Cadastrar: { "fr-FR": "Enregistrer" },
  "Cole as perguntas e respostas. O agente passa a consultar isso antes de responder.": {
    "fr-FR": "Collez les questions et réponses. L’agent les consultera avant de répondre.",
  },
  "Nome da fonte": { "fr-FR": "Nom de la source" },
  "Uma linha": { "fr-FR": "Une ligne" },
  "e uma": { "fr-FR": "et une" },
  "por item, separados": { "fr-FR": "par élément, séparées" },
  "por uma linha em branco.": { "fr-FR": "par une ligne vide." },
  "Criar fonte": { "fr-FR": "Créer la source" },
  Gatilho: { "fr-FR": "Déclencheur" },
  Aguardar: { "fr-FR": "Attendre" },
  Condição: { "fr-FR": "Condition" },
  "Classificar (IA)": { "fr-FR": "Classer (IA)" },
  "Enviar mensagem": { "fr-FR": "Envoyer un message" },
  "Etiqueta do contato": { "fr-FR": "Étiquette du contact" },
  "Passos já dados no fluxo": { "fr-FR": "Étapes déjà effectuées dans le flow" },
  "Desfecho do passo anterior": { "fr-FR": "Résultat de l’étape précédente" },
  "está na etapa": { "fr-FR": "est dans l’étape" },
  "não está na etapa": { "fr-FR": "n’est pas dans l’étape" },
  contém: { "fr-FR": "contient" },
  "é pelo menos": { "fr-FR": "est au moins égal à" },
  "é no máximo": { "fr-FR": "est au plus égal à" },
  "tem a etiqueta": { "fr-FR": "a l’étiquette" },
  "não tem a etiqueta": { "fr-FR": "n’a pas l’étiquette" },
  "é exatamente": { "fr-FR": "est exactement égal à" },
  "não é": { "fr-FR": "n’est pas égal à" },
  foi: { "fr-FR": "était" },
  "não foi": { "fr-FR": "n’était pas" },
  "Todas as condições": { "fr-FR": "Toutes les conditions" },
  "Qualquer uma das condições": { "fr-FR": "Au moins une condition" },
  "Como as regras decidem o caminho": { "fr-FR": "Comment les règles déterminent le chemin" },
  "Avaliar as regras juntas (uma saída de sim e uma de não)": {
    "fr-FR": "Évaluer les règles ensemble (une sortie oui et une sortie non)",
  },
  "Uma saída por regra": { "fr-FR": "Une sortie par règle" },
  "Trocar de modo deixa": { "fr-FR": "Changer de mode laisse" },
  "ligação sem saída": { "fr-FR": "liaison sans sortie" },
  "ligações sem saída": { "fr-FR": "liaisons sans sortie" },
  "neste nó. Elas continuam desenhadas, mas param de levar a lugar nenhum até você religá-las.": {
    "fr-FR":
      "sur ce nœud. Elles restent affichées, mais ne mènent nulle part jusqu’à ce que vous les reconnectiez.",
  },
  "Trocar mesmo assim": { "fr-FR": "Changer quand même" },
  "Remover condição": { "fr-FR": "Supprimer la condition" },
  "Nome da saída": { "fr-FR": "Nom de la sortie" },
  "Nome desta saída (opcional)": { "fr-FR": "Nom de cette sortie (facultatif)" },
  Campo: { "fr-FR": "Champ" },
  Operador: { "fr-FR": "Opérateur" },
  Valor: { "fr-FR": "Valeur" },
  "Ex.: 3": { "fr-FR": "Ex. : 3" },
  Teste: { "fr-FR": "Test" },
  Capacidades: { "fr-FR": "Capacités" },
  Execuções: { "fr-FR": "Exécutions" },
  Histórico: { "fr-FR": "Historique" },
  Propostas: { "fr-FR": "Propositions" },
  Publicado: { "fr-FR": "Publié" },
  Pausado: { "fr-FR": "En pause" },
  Arquivado: { "fr-FR": "Archivé" },
  Inválido: { "fr-FR": "Invalide" },
  "Buscar por nome…": { "fr-FR": "Rechercher par nom…" },
  "Buscar agents": { "fr-FR": "Rechercher des agents" },
  "Incluir arquivados": { "fr-FR": "Inclure les agents archivés" },
  "Menu de ações": { "fr-FR": "Menu des actions" },
  Duplicar: { "fr-FR": "Dupliquer" },
  "Agent duplicado.": { "fr-FR": "Agent dupliqué." },
  Renomear: { "fr-FR": "Renommer" },
  Despausar: { "fr-FR": "Reprendre" },
  "Agent reativado.": { "fr-FR": "Agent réactivé." },
  Pausar: { "fr-FR": "Mettre en pause" },
  "Agent pausado.": { "fr-FR": "Agent mis en pause." },
  Arquivar: { "fr-FR": "Archiver" },
  "Arquivar “": { "fr-FR": "Archiver « " },
  "O agent deixa de responder gatilhos e some das listas ativas. Versões publicadas são preservadas para auditoria. Não é possível desarquivar pela UI nesta versão.":
    {
      "fr-FR":
        "L’agent cesse de répondre aux déclencheurs et disparaît des listes actives. Les versions publiées sont conservées pour l’audit. Il n’est pas possible de désarchiver depuis l’interface dans cette version.",
    },
  "Agent arquivado.": { "fr-FR": "Agent archivé." },
  "Modelo da versão publicada — é o que atende o cliente.": {
    "fr-FR": "Modèle de la version publiée — celui qui répond au client.",
  },
  "Modelo do cadastro; nenhuma versão publicada ainda.": {
    "fr-FR": "Modèle de la fiche ; aucune version publiée pour le moment.",
  },
  Tipo: { "fr-FR": "Type" },
  Prioridade: { "fr-FR": "Priorité" },
  Visualizar: { "fr-FR": "Afficher" },
  "Nenhum agent configurado": { "fr-FR": "Aucun agent configuré" },
  "Crie um agent para responder a conversas no WhatsApp com IA. Você configura prompt, tools, gatilhos e janela de contexto.":
    {
      "fr-FR":
        "Créez un agent pour répondre aux conversations WhatsApp avec l’IA. Vous configurez le prompt, les outils, les déclencheurs et la fenêtre de contexte.",
    },
  "Novo agente": { "fr-FR": "Nouvel agent" },
  "Nenhum agent corresponde aos filtros atuais.": {
    "fr-FR": "Aucun agent ne correspond aux filtres actuels.",
  },
  Resultado: { "fr-FR": "Résultat" },
  "Nota (opcional)": { "fr-FR": "Note (facultatif)" },
  Convertido: { "fr-FR": "Converti" },
  Esgotado: { "fr-FR": "Épuisé" },
  Personalizado: { "fr-FR": "Personnalisé" },
  "Esperar a resposta por (minutos)": { "fr-FR": "Attendre la réponse pendant (minutes)" },
  "Última resposta": { "fr-FR": "Dernière réponse" },
  Resumo: { "fr-FR": "Résumé" },
  "O que a IA vai ler": { "fr-FR": "Ce que l’IA va lire" },
  "Instrução (opcional)": { "fr-FR": "Instruction (facultatif)" },
  "Classes (separadas por vírgula)": { "fr-FR": "Classes (séparées par des virgules)" },
  "interessado, sem interesse": { "fr-FR": "intéressé, pas intéressé" },
  Sempre: { "fr-FR": "Toujours" },
  "Sem resposta": { "fr-FR": "Sans réponse" },
  "Se o contato não responder dentro desse tempo, o fluxo segue sozinho pelo caminho “Sem resposta”. Mínimo de 15 minutos.":
    {
      "fr-FR":
        "Si le contact ne répond pas dans ce délai, le flow suit automatiquement le chemin « Sans réponse ». Minimum : 15 minutes.",
    },
  "Carregando seus modelos…": { "fr-FR": "Chargement de vos modèles…" },
  "Não consegui carregar seus modelos de mensagem. Recarregue a página.": {
    "fr-FR": "Impossible de charger vos modèles de messages. Rechargez la page.",
  },
  "Você ainda não tem modelos de mensagem. Crie um em Ajustes → Modelos e ele aparece aqui.": {
    "fr-FR":
      "Vous n’avez encore aucun modèle de message. Créez-en un dans Paramètres → Modèles pour le voir ici.",
  },
  "Escolha um modelo": { "fr-FR": "Choisissez un modèle" },
  Nenhum: { "fr-FR": "Aucun" },
  "Como escrever a mensagem": { "fr-FR": "Comment rédiger le message" },
  "Instrução para a IA": { "fr-FR": "Instruction pour l’IA" },
  "Se a IA não conseguir escrever, mandar este modelo": {
    "fr-FR": "Si l’IA ne peut pas rédiger le message, envoyer ce modèle",
  },
  "Modelo de mensagem": { "fr-FR": "Modèle de message" },
  "Mensagem escrita pela IA": { "fr-FR": "Message rédigé par l’IA" },
  "Modelo de mensagem pronto": { "fr-FR": "Modèle de message prédéfini" },
  "Pausar durante handoff": { "fr-FR": "Mettre en pause pendant le relais humain" },
  "Cancelar durante handoff": { "fr-FR": "Annuler pendant le relais humain" },
  "Permitir durante handoff": { "fr-FR": "Autoriser pendant le relais humain" },
  "Fluxo reprovado na validação — corrija os nós destacados.": {
    "fr-FR": "Flow rejeté lors de la validation — corrigez les nœuds signalés.",
  },
  "Alterações não salvas": { "fr-FR": "Modifications non enregistrées" },
  "Política de handoff": { "fr-FR": "Politique de relais humain" },
  "Publicando…": { "fr-FR": "Publication…" },
  Desativar: { "fr-FR": "Désactiver" },
  Rollback: { "fr-FR": "Rétablir la version précédente" },
  "Tempo fixo": { "fr-FR": "Durée fixe" },
  "A IA escolhe a hora": { "fr-FR": "L’IA choisit l’heure" },
  "Como calcular a espera": { "fr-FR": "Comment calculer l’attente" },
  "Duração (minutos)": { "fr-FR": "Durée (minutes)" },
  "Mínimo (min)": { "fr-FR": "Minimum (min)" },
  "Máximo (min)": { "fr-FR": "Maximum (min)" },
  "Orientação (opcional)": { "fr-FR": "Consigne (facultatif)" },
  "Configuração inválida.": { "fr-FR": "Configuration invalide." },
  "minutos.": { "fr-FR": "minutes." },
  "Rótulo precisa ter 1 a 60 caracteres.": {
    "fr-FR": "Le libellé doit contenir entre 1 et 60 caractères.",
  },
  "Alterações aplicam no rascunho ao digitar — salve na barra de publicação.": {
    "fr-FR":
      "Les modifications s’appliquent au brouillon pendant la saisie — enregistrez-les dans la barre de publication.",
  },
  Rótulo: { "fr-FR": "Libellé" },
  "Início do fluxo — sem configuração adicional. O disparo (manual, mudança de etapa, silêncio ou fim de conversa) é definido nas configurações do fluxo.":
    {
      "fr-FR":
        "Début du flow — aucune configuration supplémentaire. Le déclenchement (manuel, changement d’étape, silence ou fin de conversation) est défini dans les paramètres du flow.",
    },
  "Condição da aresta": { "fr-FR": "Condition de l’arête" },
  "Quando seguir por esta aresta": { "fr-FR": "Quand suivre cette arête" },
  "São as saídas do nó": { "fr-FR": "Ce sont les sorties du nœud" },
  "as mesmas que aparecem no card.": { "fr-FR": "les mêmes que celles affichées sur la carte." },
  Manual: { "fr-FR": "Manuel" },
  Silêncio: { "fr-FR": "Silence" },
  "Etapa do funil": { "fr-FR": "Étape de l’entonnoir" },
  "Agente pediu ajuda": { "fr-FR": "L’agent a demandé de l’aide" },
  "Gatilho: Silêncio": { "fr-FR": "Déclencheur : silence" },
  "Gatilho: entrou em": { "fr-FR": "Déclencheur : entrée dans" },
  "Gatilho: Etapa do funil": { "fr-FR": "Déclencheur : étape de l’entonnoir" },
  "Gatilho: quando o agente pede ajuda": {
    "fr-FR": "Déclencheur : lorsque l’agent demande de l’aide",
  },
  "Gatilho: Manual": { "fr-FR": "Déclencheur : manuel" },
  indisponível: { "fr-FR": "indisponible" },
  "Tipo de gatilho": { "fr-FR": "Type de déclencheur" },
  "Etapa que dispara o fluxo": { "fr-FR": "Étape qui déclenche le flow" },
  "Carregando etapas…": { "fr-FR": "Chargement des étapes…" },
  "Escolha a etapa": { "fr-FR": "Choisissez l’étape" },
  "Nenhuma etapa ativa encontrada — crie o funil antes de armar este gatilho.": {
    "fr-FR": "Aucune étape active trouvée — créez l’entonnoir avant d’armer ce déclencheur.",
  },
  "O fluxo começa quando um negócio entra nesta etapa, por arrasto no quadro ou por automação. A entrada na fila leva poucos minutos, não é instantânea.":
    {
      "fr-FR":
        "Le flow commence lorsqu’une affaire entre dans cette étape, par glisser-déposer dans le tableau ou par automatisation. Son entrée dans la file prend quelques minutes, elle n’est pas instantanée.",
    },
  "O fluxo começa quando o agente abre um caso — o momento em que ele diz que precisa de uma pessoa. Não há o que escolher aqui: vale para qualquer caso desta conta.":
    {
      "fr-FR":
        "Le flow commence lorsque l’agent ouvre un dossier — au moment où il indique avoir besoin d’une personne. Il n’y a rien à choisir ici : cela vaut pour tous les dossiers de ce compte.",
    },
  "Comece o fluxo por uma espera.": { "fr-FR": "Commencez le flow par une attente." },
  "O agente continua conversando depois de abrir o caso — sem espera, o cliente recebe duas mensagens ao mesmo tempo.":
    {
      "fr-FR":
        "L’agent continue de converser après l’ouverture du dossier — sans attente, le client reçoit deux messages en même temps.",
    },
  "Se o caso for resolvido antes, o follow-up é cancelado sozinho.": {
    "fr-FR": "Si le dossier est résolu avant, le follow-up est automatiquement annulé.",
  },
  "Minutos de silêncio": { "fr-FR": "Minutes de silence" },
  "Segmentos (tags, opcional)": { "fr-FR": "Segments (étiquettes, facultatif)" },
  "Mínimo de": { "fr-FR": "Minimum de" },
  "Cancelar se o lead responder": { "fr-FR": "Annuler si le lead répond" },
  "Salvar gatilho": { "fr-FR": "Enregistrer le déclencheur" },
  "Adicionar nó": { "fr-FR": "Ajouter un nœud" },
  "Aguardando resposta": { "fr-FR": "En attente de réponse" },
  "Pausado (atendimento humano)": { "fr-FR": "En pause (traitement humain)" },
  "Pausado por uma pessoa": { "fr-FR": "Mis en pause par une personne" },
  Concluído: { "fr-FR": "Terminé" },
  Cancelado: { "fr-FR": "Annulé" },
  "Parou de tentar": { "fr-FR": "Tentatives arrêtées" },
  Agendada: { "fr-FR": "Planifiée" },
  Concluída: { "fr-FR": "Terminée" },
  Cancelada: { "fr-FR": "Annulée" },
  "Buscar contato…": { "fr-FR": "Rechercher un contact…" },
  "Buscar contato": { "fr-FR": "Rechercher un contact" },
  "Filtrar por status": { "fr-FR": "Filtrer par statut" },
  "Todos os status": { "fr-FR": "Tous les statuts" },
  "Filtrar por fluxo": { "fr-FR": "Filtrer par flow" },
  "Todos os fluxos": { "fr-FR": "Tous les flows" },
  "Nenhum item na fila": { "fr-FR": "Aucun élément dans la file" },
  "Enrollments ativos e promessas de retorno agendadas pela IA aparecem aqui.": {
    "fr-FR": "Les enrôlements actifs et les relances planifiées par l’IA apparaissent ici.",
  },
  "Fluxo / Promessa": { "fr-FR": "Flow / Relance" },
  "Nó atual / Motivo": { "fr-FR": "Nœud actuel / Motif" },
  "Próximo disparo": { "fr-FR": "Prochaine exécution" },
  Promessa: { "fr-FR": "Relance" },
  agente: { "fr-FR": "agent" },
  "Cancelar retorno": { "fr-FR": "Annuler la relance" },
  "Cancelar follow-up": { "fr-FR": "Annuler le follow-up" },
  "Carregando...": { "fr-FR": "Chargement…" },
  "Carregar mais": { "fr-FR": "Charger davantage" },
  "Cancelar este retorno?": { "fr-FR": "Annuler cette relance ?" },
  "Cancelar este follow-up?": { "fr-FR": "Annuler ce follow-up ?" },
  "O agente não voltará a falar com esta pessoa no horário combinado, e vai saber que você desmarcou.":
    {
      "fr-FR":
        "L’agent ne recontactera pas cette personne à l’heure prévue et saura que vous avez annulé la relance.",
    },
  "O lead não receberá mais mensagens deste fluxo. Essa ação não pode ser desfeita.": {
    "fr-FR": "Le lead ne recevra plus de messages de ce flow. Cette action est irréversible.",
  },
  "status:": { "fr-FR": "statut :" },
  Rascunho: { "fr-FR": "Brouillon" },
  Desativado: { "fr-FR": "Désactivé" },
  "Novo fluxo": { "fr-FR": "Nouveau flow" },
  "Nenhum fluxo de follow-up ainda": { "fr-FR": "Aucun flow de follow-up pour le moment" },
  "Follow-ups reengajam contatos automaticamente após silêncio, mudança de etapa ou fim de conversa — sem depender de alguém lembrar de mandar mensagem.":
    {
      "fr-FR":
        "Les follow-ups réengagent automatiquement les contacts après un silence, un changement d’étape ou la fin d’une conversation — sans dépendre de la mémoire de l’équipe.",
    },
  Versão: { "fr-FR": "Version" },
  publicada: { "fr-FR": "publiée" },
  Handoff: { "fr-FR": "Relais humain" },
  "Atualizado em": { "fr-FR": "Mis à jour le" },
  "Novo fluxo de follow-up": { "fr-FR": "Nouveau flow de follow-up" },
  "Nasce como rascunho. Você monta as etapas no editor visual em seguida.": {
    "fr-FR":
      "Le flow est créé comme brouillon. Vous pourrez ensuite construire ses étapes dans l’éditeur visuel.",
  },
  "Ex: Recuperação de carrinho abandonado": { "fr-FR": "Ex. : Récupération d’un panier abandonné" },
  "Não consegui criar o fluxo. Tente de novo.": {
    "fr-FR": "Impossible de créer le flow. Réessayez.",
  },
  "Criar fluxo": { "fr-FR": "Créer le flow" },
  "Carregando fluxo…": { "fr-FR": "Chargement du flow…" },
  Guardrails: { "fr-FR": "Garde-fous" },
  "Carregando agent…": { "fr-FR": "Chargement de l’agent…" },
  "Agent default · ": { "fr-FR": "Agent par défaut · " },
  Geral: { "fr-FR": "Général" },
  Modelo: { "fr-FR": "Modèle" },
  RAG: { "fr-FR": "RAG" },
  "Descrição interna do agent": { "fr-FR": "Description interne de l’agent" },
  "Agent ativo": { "fr-FR": "Agent actif" },
  "Default:": { "fr-FR": "Par défaut :" },
  Sim: { "fr-FR": "Oui" },
  Não: { "fr-FR": "Non" },
  "gerenciado pelo backend": { "fr-FR": "géré par le backend" },
  "Temperature (0–2)": { "fr-FR": "Température (0–2)" },
  "Max tokens (64–4096)": { "fr-FR": "Nombre maximal de tokens (64–4096)" },
  "Janela de contexto (msgs, 1–50)": { "fr-FR": "Fenêtre de contexte (messages, 1–50)" },
  "Top K (1–20)": { "fr-FR": "Top K (1–20)" },
  "Similarity threshold (0–1)": { "fr-FR": "Seuil de similarité (0–1)" },
  "Confidence threshold (0–1)": { "fr-FR": "Seuil de confiance (0–1)" },
  "Top K = quantos trechos buscar. Similarity threshold = mínimo de relevância (cosine). Confidence = limiar abaixo do qual o agent escala para humano.":
    {
      "fr-FR":
        "Top K = nombre d’extraits à rechercher. Seuil de similarité = pertinence minimale (cosinus). Confiance = seuil en dessous duquel l’agent transmet à un humain.",
    },
  "Guardrails inválidos.": { "fr-FR": "Guardrails invalides." },
  "Nada para salvar.": { "fr-FR": "Rien à enregistrer." },
  "Campos inválidos.": { "fr-FR": "Champs invalides." },
  "Erro ao salvar:": { "fr-FR": "Erreur lors de l’enregistrement :" },
  "System prompt": { "fr-FR": "Prompt système" },
  "Você é um assistente da loja. Responda com clareza e cordialidade…": {
    "fr-FR": "Vous êtes un assistant de boutique. Répondez avec clarté et courtoisie…",
  },
  "Mínimo 20 caracteres, máximo 10.000. Use placeholders para injetar contexto dinâmico.": {
    "fr-FR":
      "20 caractères minimum, 10 000 maximum. Utilisez des placeholders pour injecter le contexte dynamique.",
  },
  Placeholders: { "fr-FR": "Placeholders" },
  Inserir: { "fr-FR": "Insérer" },
  "Vocabulário do tenant para 'lead' (ex: cliente)": {
    "fr-FR": "Vocabulaire de l’organisation pour « lead » (ex. : client)",
  },
  "Vocabulário do tenant para 'deal' (ex: pedido)": {
    "fr-FR": "Vocabulaire de l’organisation pour « deal » (ex. : commande)",
  },
  "Vocabulário do tenant para 'won' (ex: pago)": {
    "fr-FR": "Vocabulaire de l’organisation pour « won » (ex. : payé)",
  },
  "Vocabulário do tenant para 'lost' (ex: cancelado)": {
    "fr-FR": "Vocabulaire de l’organisation pour « lost » (ex. : annulé)",
  },
  "Nome do contato em atendimento": { "fr-FR": "Nom du contact pris en charge" },
  "Locale do contato (ex: pt-BR)": { "fr-FR": "Locale du contact (ex. : pt-BR)" },
  "Últimas N mensagens da conversa": { "fr-FR": "N derniers messages de la conversation" },
  "Trechos da base de conhecimento (RAG)": {
    "fr-FR": "Extraits de la base de connaissances (RAG)",
  },
  "Carregando orçamento...": { "fr-FR": "Chargement du budget…" },
  "Orçamento mensal de IA": { "fr-FR": "Budget mensuel de l’IA" },
  "Gasto de ": { "fr-FR": "Dépense de " },
  "valores em dólar (é a moeda em que o provedor de IA cobra)": {
    "fr-FR": "montants en dollars (la devise facturée par le fournisseur d’IA)",
  },
  "IA parada por gasto": { "fr-FR": "IA arrêtée pour dépassement de budget" },
  "Passou do limite": { "fr-FR": "Limite dépassée" },
  "gastos de ": { "fr-FR": "dépensés sur " },
  "gastos este mês": { "fr-FR": "dépensés ce mois-ci" },
  "do limite": { "fr-FR": "de la limite" },
  "Sem limite definido — a IA não vai parar sozinha por gasto.": {
    "fr-FR":
      "Aucune limite définie — l’IA ne s’arrêtera pas automatiquement pour dépassement de budget.",
  },
  "Isto é só acompanhamento. A IA não vai parar sozinha por gasto.": {
    "fr-FR":
      "C’est uniquement un suivi. L’IA ne s’arrêtera pas automatiquement pour dépassement de budget.",
  },
  "Avisamos ao passar de": { "fr-FR": "Alerte au-delà de" },
  "do limite. A IA não para.": { "fr-FR": "de la limite. L’IA ne s’arrête pas." },
  "A parada começa a valer em": { "fr-FR": "L’arrêt prendra effet le" },
  "Até lá, só avisamos.": { "fr-FR": "D’ici là, seules les alertes sont activées." },
  "A IA para de responder ao chegar em": { "fr-FR": "L’IA arrête de répondre à" },
  "Quando isso acontecer, as conversas em andamento vão para a fila de atendimento": {
    "fr-FR": "À ce moment-là, les conversations en cours sont placées dans la file de traitement",
  },
  "humano e voltam ao automático uma a uma, pelo cabeçalho de cada conversa.": {
    "fr-FR":
      "humain et reviennent une à une à l’automatique depuis l’en-tête de chaque conversation.",
  },
  "Proteção de gasto desligada nesta instalação (AI_BUDGET_ENFORCEMENT=off). O que estiver escolhido aqui não vale enquanto quem cuida do servidor não religar.":
    {
      "fr-FR":
        "La protection contre les dépenses est désactivée sur cette installation (AI_BUDGET_ENFORCEMENT=off). Le choix effectué ici ne s’applique pas tant que l’administrateur du serveur ne la réactive pas.",
    },
  'Nesta instalação a proteção só avisa (AI_BUDGET_ENFORCEMENT=avisar): mesmo com "Parar a IA" escolhido, ela vai continuar respondendo.':
    {
      "fr-FR":
        'Sur cette installation, la protection ne fait qu’alerter (AI_BUDGET_ENFORCEMENT=avisar) : même si "Arrêter l’IA" est choisi, elle continuera de répondre.',
    },
  "Parte do que a IA gastou este mês não entra nesta conta: o produto ainda não sabe o preço do modelo que está em uso, então o número abaixo é MENOR que o real e a parada no limite pode não acontecer. Enquanto isso, acompanhe o gasto direto no painel do seu provedor de IA.":
    {
      "fr-FR":
        "Une partie des dépenses de l’IA ce mois-ci n’est pas incluse dans ce calcul : le produit ne connaît pas encore le prix du modèle utilisé. Le montant ci-dessous est donc INFÉRIEUR au montant réel et l’arrêt à la limite peut ne pas se déclencher. En attendant, suivez les dépenses directement dans le tableau de bord de votre fournisseur d’IA.",
    },
  "Só acompanhar": { "fr-FR": "Uniquement suivre" },
  "A IA nunca para por gasto. Você vê o número nesta tela e decide o que fazer.": {
    "fr-FR":
      "L’IA ne s’arrête jamais pour dépassement de budget. Consultez le montant ici et décidez de la suite.",
  },
  "Abrimos um aviso na Central de avisos. A IA continua respondendo normalmente.": {
    "fr-FR":
      "Une alerte est ouverte dans le centre des alertes. L’IA continue de répondre normalement.",
  },
  "Parar a IA ao chegar em": { "fr-FR": "Arrêter l’IA à" },
  "As conversas em andamento vão para a fila de atendimento humano — ninguém fica sem resposta, mas alguém precisa responder.":
    {
      "fr-FR":
        "Les conversations en cours sont placées dans la file de traitement humain — personne ne reste sans réponse, mais quelqu’un doit répondre.",
    },
  'Cada uma volta ao automático pelo botão "Devolver ao automático" no cabeçalho dela.': {
    "fr-FR":
      'Chacune revient à l’automatique avec le bouton "Remettre à l’automatique" dans son en-tête.',
  },
  "Atenção: o produto ainda não sabe o preço do modelo em uso, então o gasto medido é menor que o real e esta parada pode não disparar.":
    {
      "fr-FR":
        "Attention : le produit ne connaît pas encore le prix du modèle utilisé ; les dépenses mesurées sont donc inférieures aux dépenses réelles et cet arrêt peut ne pas se déclencher.",
    },
  'Disponível depois de salvar "Me avisar" — e, quando você armar a parada, ela só começa a valer 72 horas depois.':
    {
      "fr-FR":
        'Disponible après avoir enregistré "M’alerter" — lorsque vous armez l’arrêt, celui-ci ne prend effet qu’après 72 heures.',
    },
  "Limite mensal (US$)": { "fr-FR": "Limite mensuelle (US$)" },
  "Avisar ao chegar em (% do limite)": { "fr-FR": "Alerter à (% de la limite)" },
  "Editar limite": { "fr-FR": "Modifier la limite" },
  "Escolha o que acontece quando o gasto do mês chega no limite. Os valores são em dólar — é a moeda em que o provedor de IA cobra.":
    {
      "fr-FR":
        "Choisissez ce qui se passe lorsque les dépenses du mois atteignent la limite. Les montants sont en dollars — la devise facturée par le fournisseur d’IA.",
    },
  "Me avisar ao passar de": { "fr-FR": "M’alerter au-delà de" },
  "Começar a valer agora, sem esperar as 72 horas": {
    "fr-FR": "Prendre effet maintenant, sans attendre les 72 heures",
  },
  "A parada começa a valer": { "fr-FR": "L’arrêt prendra effet" },
  "depois de salvar. É o tempo de você ver o aviso chegar antes que alguma conversa pare.": {
    "fr-FR":
      "après l’enregistrement. Cela vous laisse le temps de voir l’alerte arriver avant qu’une conversation ne s’arrête.",
  },
  "Para avisar ou parar no limite, ele precisa ser de pelo menos": {
    "fr-FR": "Pour alerter ou arrêter à la limite, celle-ci doit être d’au moins",
  },
  "por mês. Abaixo disso não é orçamento de um atendimento — é erro de digitação.": {
    "fr-FR":
      "par mois. En dessous, ce n’est pas le budget d’un traitement — c’est probablement une erreur de saisie.",
  },
  "Se você só quer acompanhar o gasto sem limite, escolha": {
    "fr-FR": "Si vous souhaitez uniquement suivre les dépenses sans limite, choisissez",
  },
  "Regex output block": { "fr-FR": "Blocage de sortie par regex" },
  "Documento PDF de políticas (troca, devolução, privacidade).": {
    "fr-FR": "Document PDF des politiques (échange, retour, confidentialité).",
  },
  "Conversas opt-in": { "fr-FR": "Conversations avec consentement" },
  "Conversas anonimizadas para aprendizado.": {
    "fr-FR": "Conversations anonymisées pour l’apprentissage.",
  },
  "Entra sozinha: conversas resolvidas que alguém marcar como aproveitáveis pela IA são anonimizadas e indexadas em lote. Não há conteúdo para colar aqui.":
    {
      "fr-FR":
        "Automatique : les conversations résolues marquées comme exploitables par l’IA sont anonymisées et indexées par lots. Aucun contenu à coller ici.",
    },
  "Produtos sincronizados do e-commerce.": {
    "fr-FR": "Produits synchronisés depuis le commerce en ligne.",
  },
  "Os produtos vêm da sincronização com o e-commerce, não de conteúdo digitado aqui.": {
    "fr-FR":
      "Les produits proviennent de la synchronisation avec le commerce en ligne, et non d’un contenu saisi ici.",
  },
  "Nenhuma fonte configurada.": { "fr-FR": "Aucune source configurée." },
  Configurar: { "fr-FR": "Configurer" },
  "Editor de FAQ em breve.": { "fr-FR": "L’éditeur de FAQ sera bientôt disponible." },
  "Editar conteúdo": { "fr-FR": "Modifier le contenu" },
  "Upload de política em breve.": {
    "fr-FR": "L’importation d’une politique sera bientôt disponible.",
  },
  "Upload novo arquivo": { "fr-FR": "Importer un nouveau fichier" },
  "Última indexação": { "fr-FR": "Dernière indexation" },
  "Chunks indexados": { "fr-FR": "Segments indexés" },
  "Detalhes do erro": { "fr-FR": "Détails de l’erreur" },
  "Reindexando...": { "fr-FR": "Réindexation…" },
  "Re-indexar": { "fr-FR": "Réindexer" },
  "Nunca indexado": { "fr-FR": "Jamais indexé" },
  "agora há pouco": { "fr-FR": "à l’instant" },
  min: { "fr-FR": "min" },
  h: { "fr-FR": "h" },
  d: { "fr-FR": "j" },
  "RAG must hit": { "fr-FR": "Résultat RAG obligatoire" },
  "Regex input block": { "fr-FR": "Blocage d’entrée par regex" },
  "Janela horária": { "fr-FR": "Fenêtre horaire" },
  "Contact flag": { "fr-FR": "Indicateur du contact" },
  "Tipo do novo guardrail": { "fr-FR": "Type du nouveau guardrail" },
  "Adicionar guardrail": { "fr-FR": "Ajouter un guardrail" },
  "Nenhum guardrail definido. O agent responde sem restrições adicionais.": {
    "fr-FR": "Aucun guardrail défini. L’agent répond sans restrictions supplémentaires.",
  },
  "Campos inválidos. Ajuste antes de salvar.": {
    "fr-FR": "Champs invalides. Corrigez-les avant l’enregistrement.",
  },
  "Citações mínimas": { "fr-FR": "Citations minimales" },
  "Hora início (0-23)": { "fr-FR": "Heure de début (0–23)" },
  "Hora fim (0-23)": { "fr-FR": "Heure de fin (0–23)" },
  Timezone: { "fr-FR": "Fuseau horaire" },
  "Valor esperado": { "fr-FR": "Valeur attendue" },
  "Mostrar citações da resposta": { "fr-FR": "Afficher les citations de la réponse" },
  "Citações da resposta IA": { "fr-FR": "Citations de la réponse IA" },
  "Resposta sem RAG hits — modelo respondeu sem usar a base de conhecimento.": {
    "fr-FR":
      "Réponse sans résultats RAG : le modèle a répondu sans utiliser la base de connaissances.",
  },
  Política: { "fr-FR": "Politique" },
  Conversa: { "fr-FR": "Conversation" },
  Catálogo: { "fr-FR": "Catalogue" },
  Fonte: { "fr-FR": "Source" },
  Legenda: { "fr-FR": "Légende" },
  "Etapa atualizada.": { "fr-FR": "Étape mise à jour." },
  "A coluna sai do quadro e para de receber negócios novos. Nada é apagado — o histórico de quem passou por ela continua guardado —, mas":
    {
      "fr-FR":
        "La colonne quitte le tableau et ne reçoit plus de nouvelles opportunités. Rien n’est supprimé — l’historique des passages est conservé —, mais",
    },
  "não dá para trazer a coluna de volta por aqui": {
    "fr-FR": "la colonne ne peut pas être restaurée ici",
  },
  negócio: { "fr-FR": "opportunité" },
  negócios: { "fr-FR": "opportunités" },
  está: { "fr-FR": "est" },
  estão: { "fr-FR": "sont" },
  "nesta etapa e não há outra coluna em aberto para recebê-": {
    "fr-FR": "à cette étape et aucune autre colonne ouverte ne peut le recevoir",
  },
  lo: { "fr-FR": "" },
  los: { "fr-FR": "" },
  "Crie uma etapa antes de arquivar": { "fr-FR": "Créez une étape avant d’archiver" },
  "está nesta etapa. Para onde ele vai?": { "fr-FR": "est dans cette étape. Où doit-il aller ?" },
  "estão nesta etapa. Para onde eles vão?": {
    "fr-FR": "sont dans cette étape. Où doivent-ils aller ?",
  },
  "Para onde vão os negócios de": { "fr-FR": "Où vont les opportunités de" },
  "Esta etapa é a que o assistente usa para «": {
    "fr-FR": "Cette étape est celle que l’assistant utilise pour «",
  },
  "Arquivando, ele para de mover o card nesse passo até você escolher outra etapa em": {
    "fr-FR":
      "En l’archivant, l’assistant cesse de déplacer le card à cette étape jusqu’à ce que vous en choisissiez une autre dans",
  },
  "«Para onde o card vai em cada passo»": { "fr-FR": "« Où va le card à chaque étape »" },
  "Mover os negócios e arquivar": { "fr-FR": "Déplacer les opportunités et archiver" },
  "Ir para o mapeamento do assistente": { "fr-FR": "Accéder au mappage de l’assistant" },
  "Nome da etapa": { "fr-FR": "Nom de l’étape" },
  "saiu do quadro.": { "fr-FR": "a quitté le tableau." },
  "entrou no fim do funil.": { "fr-FR": "a été ajoutée à la fin du pipeline." },
  "O assistente usa esta etapa para «": { "fr-FR": "L’assistant utilise cette étape pour «" },
  "». ": { "fr-FR": " ». " },
  "Etapas deste funil": { "fr-FR": "Étapes de ce pipeline" },
  "Estas são as colunas do seu quadro, na ordem em que o cliente avança. Você pode renomear, criar, reordenar e arquivar.":
    {
      "fr-FR":
        "Voici les colonnes de votre tableau, dans l’ordre de progression du client. Vous pouvez les renommer, en créer, les réordonner et les archiver.",
    },
  "Duas colunas têm papel especial: a de fechamento é onde o negócio vira venda, e a de perda é onde ele se perde. Cada funil precisa de uma de cada — por isso a marcação se muda de lugar, não se apaga.":
    {
      "fr-FR":
        "Deux colonnes ont un rôle spécial : la conclusion est celle où l’opportunité devient une vente, et la perte est celle où elle est abandonnée. Chaque pipeline en exige une de chaque ; le rôle est donc déplacé, jamais supprimé.",
    },
  Mover: { "fr-FR": "Déplacer" },
  "uma coluna para trás": { "fr-FR": "d’une colonne vers l’arrière" },
  "uma coluna para frente": { "fr-FR": "d’une colonne vers l’avant" },
  "Papel de «": { "fr-FR": "Rôle de «" },
  "» no funil": { "fr-FR": " » dans le pipeline" },
  "Mudar isso": { "fr-FR": "Modifier cela" },
  "Marcar mesmo assim": { "fr-FR": "Marquer quand même" },
  "Acrescentar etapa ao fim": { "fr-FR": "Ajouter une étape à la fin" },
  "Nome da nova coluna": { "fr-FR": "Nom de la nouvelle colonne" },
  "Nome da nova etapa": { "fr-FR": "Nom de la nouvelle étape" },
  "Não foi possível carregar as etapas deste funil agora. Recarregue a página.": {
    "fr-FR": "Impossible de charger les étapes de ce pipeline pour le moment. Rechargez la page.",
  },
  "Carregando as etapas deste funil…": { "fr-FR": "Chargement des étapes de ce pipeline…" },
  "Nome da coluna (clique para renomear)": { "fr-FR": "Nom de la colonne (cliquez pour renommer)" },
  Ordem: { "fr-FR": "Ordre" },
  "O que acontece nesta coluna": { "fr-FR": "Ce qui se passe dans cette colonne" },
  "Nada especial": { "fr-FR": "Rien de particulier" },
  "Aqui o cliente fecha": { "fr-FR": "Ici, le client conclut" },
  "Aqui o cliente desiste": { "fr-FR": "Ici, le client abandonne" },
  "a pessoa acabou de chamar e ninguém respondeu ainda": {
    "fr-FR": "la personne vient de contacter l’entreprise et personne n’a encore répondu",
  },
  "o agente já respondeu pela primeira vez": {
    "fr-FR": "l’agent a déjà répondu pour la première fois",
  },
  "o agente está entendendo o que a pessoa precisa": {
    "fr-FR": "l’agent cherche à comprendre le besoin de la personne",
  },
  "o agente já entendeu a necessidade": { "fr-FR": "l’agent a déjà compris le besoin" },
  "conversa de preço, proposta ou agendamento": {
    "fr-FR": "discussion de prix, de proposition ou de rendez-vous",
  },
  "a pessoa fechou": { "fr-FR": "la personne a conclu" },
  "a pessoa desistiu ou parou de responder": {
    "fr-FR": "la personne a abandonné ou a cessé de répondre",
  },
  "As etapas que serviriam para este passo já estão sendo usadas por outros passos. Libere uma delas para poder escolhê-la aqui.":
    {
      "fr-FR":
        "Les étapes adaptées à ce passage sont déjà utilisées par d’autres passages. Libérez-en une pour pouvoir la choisir ici.",
    },
  "Este funil não tem nenhuma etapa marcada como fechamento, então não há para onde levar o card quando a pessoa fecha. Marque uma etapa como «aqui o cliente fecha» em «Etapas deste funil».":
    {
      "fr-FR":
        "Ce pipeline ne contient aucune étape marquée comme conclusion ; le card ne peut donc être déplacé lorsque la personne conclut. Marquez une étape comme « ici, le client conclut » dans « Étapes de ce pipeline ».",
    },
  "Este funil não tem nenhuma etapa marcada como perda, então não há para onde levar o card quando a pessoa desiste. Marque uma etapa como «aqui o cliente desiste» em «Etapas deste funil».":
    {
      "fr-FR":
        "Ce pipeline ne contient aucune étape marquée comme perte ; le card ne peut donc être déplacé lorsque la personne abandonne. Marquez une étape comme « ici, le client abandonne » dans « Étapes de ce pipeline ».",
    },
  "Este funil só tem etapas de fechamento e de perda, então não há etapa comum para receber o card neste passo. Crie as etapas do meio do caminho em «Etapas deste funil».":
    {
      "fr-FR":
        "Ce pipeline ne contient que des étapes de conclusion et de perte ; aucune étape commune ne peut donc recevoir le card à ce passage. Créez les étapes intermédiaires dans « Étapes de ce pipeline ».",
    },
  "Sua sessão expirou. Entre de novo para salvar suas escolhas.": {
    "fr-FR": "Votre session a expiré. Reconnectez-vous pour enregistrer vos choix.",
  },
  "Você não tem permissão para mudar a configuração deste funil.": {
    "fr-FR": "Vous n’avez pas l’autorisation de modifier la configuration de ce pipeline.",
  },
  "Não deu para salvar agora. Tente de novo em instantes.": {
    "fr-FR": "Impossible d’enregistrer pour le moment. Réessayez dans quelques instants.",
  },
  "Para onde o card vai em cada passo": { "fr-FR": "Où va le card à chaque étape" },
  "Quando o agente avança no atendimento, o card do cliente pode andar sozinho no seu funil. Escolha para qual etapa ele vai em cada momento. Deixar em «não mover» é uma escolha válida — o card fica onde está e o agente segue trabalhando.":
    {
      "fr-FR":
        "Lorsque l’agent avance dans le traitement, le card du client peut se déplacer automatiquement dans votre pipeline. Choisissez l’étape correspondante à chaque moment. Laisser « ne pas déplacer » est un choix valide : le card reste où il est et l’agent continue son travail.",
    },
  "Ir para as etapas do funil": { "fr-FR": "Accéder aux étapes du pipeline" },
  "Não mover o card": { "fr-FR": "Ne pas déplacer le card" },
  "As escolhas voltaram para o que está gravado agora — confira e escolha de novo.": {
    "fr-FR":
      "Les choix ont été rétablis selon les données actuellement enregistrées : vérifiez-les et choisissez à nouveau.",
  },
  "Salvar estas escolhas": { "fr-FR": "Enregistrer ces choix" },
  "Ação contém": { "fr-FR": "L’action contient" },
  "Tipo de recurso": { "fr-FR": "Type de ressource" },
  De: { "fr-FR": "Du" },
  Até: { "fr-FR": "Au" },
  "Exportar CSV": { "fr-FR": "Exporter en CSV" },
  Quando: { "fr-FR": "Quand" },
  Ator: { "fr-FR": "Auteur" },
  Ação: { "fr-FR": "Action" },
  Recurso: { "fr-FR": "Ressource" },
  "Request ID": { "fr-FR": "ID de requête" },
  Metadata: { "fr-FR": "Métadonnées" },
  "Nenhum log no período.": { "fr-FR": "Aucun journal sur cette période." },

  "Templates de script": { "fr-FR": "Modèles de script" },
  "Sincronizado:": { "fr-FR": "Synchronisé :" },
  "novo(s)": { "fr-FR": "nouveau(x)" },
  "atualizado(s)": { "fr-FR": "mis à jour" },
  "desativado(s)": { "fr-FR": "désactivé(s)" },
  "Canal oficial não conectado": { "fr-FR": "Canal officiel non connecté" },
  "Os templates vivem na sua conta do WhatsApp Business (Meta) — esta tela é um espelho deles. Conecte o canal oficial em Conexões WhatsApp para começar a sincronizar.":
    {
      "fr-FR":
        "Les templates vivent dans votre compte WhatsApp Business (Meta) : cet écran en est le miroir. Connectez le canal officiel dans Connexions WhatsApp pour commencer la synchronisation.",
    },
  "Espelho da conta": { "fr-FR": "Miroir du compte" },
  "template(s)": { "fr-FR": "template(s)" },
  "Sincronizar com a Meta": { "fr-FR": "Synchroniser avec Meta" },
  "Nenhum template ainda": { "fr-FR": "Aucun template pour l’instant" },
  "Crie templates no Gerenciador do WhatsApp e clique em": {
    "fr-FR": "Créez des templates dans le Gestionnaire WhatsApp et cliquez sur",
  },
  "Só templates aprovados podem ser enviados fora da janela de 24 horas.": {
    "fr-FR":
      "Seuls les templates approuvés peuvent être envoyés en dehors de la fenêtre de 24 heures.",
  },
  "sem parâmetros": { "fr-FR": "sans paramètres" },
  "parâmetro(s)": { "fr-FR": "paramètre(s)" },
  "Recusado:": { "fr-FR": "Refusé :" },
  "arquivo de": { "fr-FR": "fichier de" },
  "enviado no disparo": { "fr-FR": "envoyé lors de l’envoi" },
  "Nenhum template. Crie em Configurações.": {
    "fr-FR": "Aucun modèle. Créez-en un dans les Paramètres.",
  },
  "Modelo enviado — a janela reabre quando o cliente responder.": {
    "fr-FR": "Modèle envoyé : la fenêtre se rouvrira lorsque le client répondra.",
  },
  "Não consegui enviar o modelo.": { "fr-FR": "Impossible d’envoyer le modèle." },
  "Nenhum modelo aprovado ainda. Crie um em Conexões → Templates e envie quando a plataforma aprovar.":
    {
      "fr-FR":
        "Aucun modèle approuvé pour le moment. Créez-en un via Connexions → Modèles, puis envoyez-le lorsque la plateforme l’aura approuvé.",
    },
  "Modelo aprovado": { "fr-FR": "Modèle approuvé" },
  "Este modelo pede {count} valor(es) e ainda não dá para preenchê-los aqui — envie por Conexões → Templates, ou escolha um modelo sem parâmetros.":
    {
      "fr-FR":
        "Ce modèle demande {count} valeur(s), mais il n’est pas encore possible de les renseigner ici. Envoyez-le via Connexions → Modèles ou choisissez un modèle sans paramètres.",
    },
  "Enviando…": { "fr-FR": "Envoi…" },
  "Escolha alguém da base ou informe nome e telefone — como no WhatsApp.": {
    "fr-FR":
      "Choisissez une personne dans la base ou saisissez son nom et son téléphone, comme dans WhatsApp.",
  },
  "Buscar por nome ou telefone…": { "fr-FR": "Rechercher par nom ou téléphone…" },
  "Nenhum contato encontrado na base.": { "fr-FR": "Aucun contact trouvé dans la base." },
  "Nenhum contato com telefone na base.": {
    "fr-FR": "Aucun contact avec un numéro de téléphone dans la base.",
  },
  "Enviar número informado": { "fr-FR": "Envoyer le numéro saisi" },
  "Ou informe um contato": { "fr-FR": "Ou saisir un contact" },
  "Nome (opcional)": { "fr-FR": "Nom (facultatif)" },
  "Como aparece no cartão": { "fr-FR": "Nom affiché sur la fiche" },
  "Sem nome": { "fr-FR": "Sans nom" },
  "Transferir conversa": { "fr-FR": "Transférer la conversation" },
  "A transferência é imediata: o atendente escolhido vira o responsável agora e a mudança fica registrada no histórico.":
    {
      "fr-FR":
        "Le transfert est immédiat : l’agent choisi devient responsable dès maintenant et la modification est enregistrée dans l’historique.",
    },
  "Transferir para": { "fr-FR": "Transférer à" },
  "Carregando atendentes…": { "fr-FR": "Chargement des agents…" },
  "Escolha o atendente": { "fr-FR": "Choisissez l’agent" },
  "Nenhum outro atendente disponível nesta organização.": {
    "fr-FR": "Aucun autre agent n’est disponible dans cette organisation.",
  },
  "Motivo (opcional)": { "fr-FR": "Motif (facultatif)" },
  "Ex.: cliente pediu falar com o financeiro": {
    "fr-FR": "Ex. : le client souhaite parler au service financier",
  },
  "Transferindo…": { "fr-FR": "Transfert…" },
  Gestor: { "fr-FR": "Responsable" },
  "Atualizar saúde": { "fr-FR": "Actualiser l’état" },
  "Escaneie o QR": { "fr-FR": "Scannez le QR" },
  "Conectando…": { "fr-FR": "Connexion en cours…" },
  Parado: { "fr-FR": "Arrêté" },
  Caiu: { "fr-FR": "Déconnecté" },
  "Situação desconhecida": { "fr-FR": "Situation inconnue" },
  "O serviço do WhatsApp não está configurado.": {
    "fr-FR": "Le service WhatsApp n’est pas configuré.",
  },
  "Faltam o endereço e a chave do serviço": {
    "fr-FR": "L’adresse et la clé du service sont absentes",
  },
  "Esta instalação está com o banco atrasado.": {
    "fr-FR": "Cette installation utilise une base de données obsolète.",
  },
  "Falta aplicar a migration que registra canal excluído. Até lá, um número que você excluir continua aparecendo nesta lista.":
    {
      "fr-FR":
        "La migration qui enregistre les canaux supprimés doit encore être appliquée. D’ici là, un numéro supprimé continuera d’apparaître dans cette liste.",
    },
  "Não foi possível carregar seus números — esta lista não está mostrando o que existe.": {
    "fr-FR":
      "Impossible de charger vos numéros : cette liste ne reflète peut-être pas les numéros existants.",
  },
  "Não conecte um número novo por causa disto: recarregue a página. Se persistir, o servidor do sistema está fora do ar.":
    {
      "fr-FR":
        "Ne connectez pas un nouveau numéro pour l’instant : rechargez la page. Si le problème persiste, le serveur de l’installation est peut-être indisponible.",
    },
  "Conecte seu primeiro número de WhatsApp para começar a atender.": {
    "fr-FR": "Connectez votre premier numéro WhatsApp pour commencer à répondre aux clients.",
  },
  "Carregando conexões…": { "fr-FR": "Chargement des connexions…" },
  "Não foi possível carregar seus números.": { "fr-FR": "Impossible de charger vos numéros." },
  "Criar token": { "fr-FR": "Créer un jeton" },
  "Selecione ao menos um escopo.": { "fr-FR": "Sélectionnez au moins un périmètre." },
  "Nenhum token criado ainda.": { "fr-FR": "Aucun jeton n’a encore été créé." },
  Prefixo: { "fr-FR": "Préfixe" },
  Escopos: { "fr-FR": "Périmètres" },
  Expira: { "fr-FR": "Expiration" },
  Revogado: { "fr-FR": "Révoqué" },
  Ativo: { "fr-FR": "Actif" },
  "Token revogado.": { "fr-FR": "Jeton révoqué." },
  "Criar novo token": { "fr-FR": "Créer un nouveau jeton" },
  "O plaintext será mostrado apenas uma vez.": {
    "fr-FR": "Le texte brut ne sera affiché qu’une seule fois.",
  },
  "Expira em (dias) — opcional": { "fr-FR": "Expire dans (jours) — facultatif" },
  Criar: { "fr-FR": "Créer" },
  "Token criado": { "fr-FR": "Jeton créé" },
  "Copie e guarde agora — não conseguiremos exibir novamente.": {
    "fr-FR": "Copiez-le et conservez-le maintenant : il ne pourra plus être affiché.",
  },
  "Token copiado.": { "fr-FR": "Jeton copié." },
  "Não foi possível copiar — selecione o token acima.": {
    "fr-FR": "Impossible de copier : sélectionnez le jeton ci-dessus.",
  },
  "Copiar para clipboard": { "fr-FR": "Copier dans le presse-papiers" },
  "Agentes de IA podem LER o CRM (MCP)": { "fr-FR": "Les agents IA peuvent LIRE le CRM (MCP)" },
  "Agentes de IA podem AGIR no CRM (MCP)": {
    "fr-FR": "Les agents IA peuvent AGIR dans le CRM (MCP)",
  },
  "Tratar o token como gerente (necessário p/ criar e atribuir)": {
    "fr-FR": "Traiter le jeton comme responsable (nécessaire pour créer et attribuer)",
  },
  "Ler contatos": { "fr-FR": "Lire les contacts" },
  "Criar e editar contatos": { "fr-FR": "Créer et modifier les contacts" },
  "Ler leads": { "fr-FR": "Lire les leads" },
  "Criar e editar leads": { "fr-FR": "Créer et modifier les leads" },
  "Ler mensagens": { "fr-FR": "Lire les messages" },
  "Enviar mensagens": { "fr-FR": "Envoyer des messages" },
  "Ler o log de auditoria": { "fr-FR": "Lire le journal d’audit" },
  "Nenhum número conectado ainda.": { "fr-FR": "Aucun numéro n’est encore connecté." },
  "número conectado": { "fr-FR": "numéro connecté" },
  "números conectados": { "fr-FR": "numéros connectés" },
  "Canal conectado.": { "fr-FR": "Canal connecté." },
  "Não foi possível conectar.": { "fr-FR": "Impossible de connecter le canal." },
  "provedor parceiro": { "fr-FR": "fournisseur partenaire" },
  "Conectar por": { "fr-FR": "Connecter via" },
  "Um número oficial (WhatsApp Business) conectado através do seu provedor. As mensagens entram e saem pelo CRM, e os modelos aprovados são os mesmos da sua conta.":
    {
      "fr-FR":
        "Un numéro officiel (WhatsApp Business) connecté via votre fournisseur. Les messages entrent et sortent par le CRM, et les modèles approuvés sont les mêmes que ceux de votre compte.",
    },
  Conectado: { "fr-FR": "Connecté" },
  "Não conectado": { "fr-FR": "Non connecté" },
  "Número conectado": { "fr-FR": "Numéro connecté" },
  "sem número informado": { "fr-FR": "aucun numéro renseigné" },
  Conta: { "fr-FR": "Compte" },
  "id da conta conectada no provedor": {
    "fr-FR": "identifiant du compte connecté chez le fournisseur",
  },
  "É o identificador do número no painel do provedor — não o da Meta.": {
    "fr-FR":
      "Il s’agit de l’identifiant du numéro dans le panneau du fournisseur, et non de celui de Meta.",
  },
  "Chave de API": { "fr-FR": "Clé API" },
  "gravada — preencha para trocar": { "fr-FR": "enregistrée — remplissez pour la remplacer" },
  "cole a chave": { "fr-FR": "collez la clé" },
  "Guardada cifrada. Depois de gravar ela não é mostrada de novo — para trocar, cole a nova.": {
    "fr-FR":
      "Conservée chiffrée. Après l’enregistrement, elle n’est plus affichée ; pour la remplacer, collez la nouvelle clé.",
  },
  "Verificando…": { "fr-FR": "Vérification…" },
  "A credencial é testada contra o provedor antes de ser gravada.": {
    "fr-FR": "L’identifiant est testé auprès du fournisseur avant d’être enregistré.",
  },
  "Falta ligar a volta": { "fr-FR": "Il reste à connecter le retour" },
  "Cole os dois valores abaixo no webhook do seu provedor. Sem isso o CRM": {
    "fr-FR":
      "Collez les deux valeurs ci-dessous dans le webhook de votre fournisseur. Sans cela, le CRM",
  },
  "envia mas não recebe": { "fr-FR": "envoie mais ne reçoit pas" },
  "a resposta do cliente não chega, e nada na tela avisa. O segredo aparece": {
    "fr-FR":
      "la réponse du client n’arrive pas et rien à l’écran ne l’indique. Le secret s’affiche",
  },
  "uma única vez": { "fr-FR": "une seule fois" },
  "se sair desta tela sem copiá-lo, reconecte para gerar outro.": {
    "fr-FR":
      "une seule fois ; si vous quittez cet écran sans le copier, reconnectez-vous pour en générer un autre.",
  },
  "URL do webhook": { "fr-FR": "URL du webhook" },
  "Segredo (assinatura)": { "fr-FR": "Secret (signature)" },
  "Qualidade do número segundo a plataforma:": {
    "fr-FR": "Qualité du numéro selon la plateforme :",
  },
  Webhook: { "fr-FR": "Webhook" },
  "O endereço que o provedor usa para entregar as mensagens. O segredo não é mostrado de novo — para obter um novo, reconecte.":
    {
      "fr-FR":
        "L’adresse utilisée par le fournisseur pour livrer les messages. Le secret n’est plus affiché ; pour en obtenir un nouveau, reconnectez-vous.",
    },
  "Copiado.": { "fr-FR": "Copié." },
  "Conectado:": { "fr-FR": "Connecté :" },
  Copiar: { "fr-FR": "Copier" },
  "não configurado nesta instalação — defina no servidor antes de continuar": {
    "fr-FR":
      "non configuré dans cette installation — définissez-le sur le serveur avant de continuer",
  },
  "credencial guardada": { "fr-FR": "identifiant enregistré" },
  "sem credencial": { "fr-FR": "sans identifiant" },
  número: { "fr-FR": "numéro" },
  "Cole isto no painel da Meta": { "fr-FR": "Collez ceci dans le panneau Meta" },
  Configuração: { "fr-FR": "Configuration" },
  "na seção de Webhook. Sem esse passo o canal envia, mas não recebe — as respostas do cliente não chegam e a janela de 24 horas nunca abre.":
    {
      "fr-FR":
        "dans la section Webhook. Sans cette étape, le canal envoie mais ne reçoit pas : les réponses du client n’arrivent pas et la fenêtre de 24 heures ne s’ouvre jamais.",
    },
  "URL de callback": { "fr-FR": "URL de rappel" },
  "Token de verificação": { "fr-FR": "Jeton de vérification" },
  "Campos a assinar": { "fr-FR": "Champs à signer" },
  "Trocar credencial": { "fr-FR": "Remplacer l’identifiant" },
  "Conectar canal oficial": { "fr-FR": "Connecter le canal officiel" },
  "Os três valores vêm do seu app na Meta (WhatsApp → Configuração da API). A credencial é validada com a Meta antes de ser gravada — se o número não responder, nada é salvo.":
    {
      "fr-FR":
        "Les trois valeurs proviennent de votre application Meta (WhatsApp → Configuration de l’API). L’identifiant est validé auprès de Meta avant d’être enregistré : si le numéro ne répond pas, rien n’est sauvegardé.",
    },
  "ID do número de telefone": { "fr-FR": "ID du numéro de téléphone" },
  "ID da conta do WhatsApp Business": { "fr-FR": "ID du compte WhatsApp Business" },
  "Token de acesso": { "fr-FR": "Jeton d’accès" },
  "•••• (já guardado — preencha para trocar)": {
    "fr-FR": "•••• (déjà enregistré — remplissez pour remplacer)",
  },
  "Guardado cifrado. Não é exibido de volta em nenhum momento.": {
    "fr-FR": "Enregistré chiffré. Il n’est jamais réaffiché.",
  },
  "Validando com a Meta…": { "fr-FR": "Validation auprès de Meta…" },
  "Validar e conectar": { "fr-FR": "Valider et connecter" },
  "Proteção de envio": { "fr-FR": "Protection des envois" },
  "Proteção de envio atualizada.": { "fr-FR": "Protection des envois mise à jour." },
  "Salvar proteção": { "fr-FR": "Enregistrer la protection" },
  "sincronizada(s)": { "fr-FR": "synchronisée(s)" },
  de: { "fr-FR": "sur" },
  "Não consegui falar com a plataforma.": { "fr-FR": "Impossible de joindre la plateforme." },
  "Não consegui subir a imagem.": { "fr-FR": "Impossible d’envoyer l’image." },
  "Utilidade — aviso de pedido, agendamento, cobrança": {
    "fr-FR": "Utilité — avis de commande, rendez-vous, facturation",
  },
  "Marketing — promoção, novidade, reengajamento": {
    "fr-FR": "Marketing — promotion, nouveauté, réengagement",
  },
  "Autenticação — código de verificação": { "fr-FR": "Authentification — code de vérification" },
  "Nenhum modelo espelhado ainda.": { "fr-FR": "Aucun modèle synchronisé pour l’instant." },
  "Clique em": { "fr-FR": "Cliquez sur" },
  "para trazer os que já existem na plataforma.": {
    "fr-FR": "pour importer ceux qui existent déjà sur la plateforme.",
  },
  "O que a plataforma aprovou para este número. É daqui que sai a mensagem quando a janela de 24h fecha.":
    {
      "fr-FR":
        "Ce que la plateforme a approuvé pour ce numéro. C’est ici que vient le message lorsque la fenêtre de 24 h est fermée.",
    },
  "Sincronizando…": { "fr-FR": "Synchronisation…" },
  "Nome do modelo": { "fr-FR": "Nom du modèle" },
  Idioma: { "fr-FR": "Langue" },
  Categoria: { "fr-FR": "Catégorie" },
  "Cabeçalho de texto (opcional)": { "fr-FR": "En-tête texte (facultatif)" },
  "Cabeçalho de texto": { "fr-FR": "En-tête texte" },
  "Subindo…": { "fr-FR": "Envoi…" },
  "Trocar imagem": { "fr-FR": "Remplacer l’image" },
  "Subir imagem (JPG/PNG)": { "fr-FR": "Envoyer une image (JPG/PNG)" },
  "Imagem do cabeçalho": { "fr-FR": "Image de l’en-tête" },
  "Texto da mensagem. Use {{1}}, {{2}} para os valores que mudam.": {
    "fr-FR": "Texte du message. Utilisez {{1}}, {{2}} pour les valeurs variables.",
  },
  Conteúdo: { "fr-FR": "Contenu" },
  "Rodapé (opcional) — texto pequeno no fim da mensagem": {
    "fr-FR": "Pied de page (facultatif) — petit texte à la fin du message",
  },
  Rodapé: { "fr-FR": "Pied de page" },
  "Resposta rápida": { "fr-FR": "Réponse rapide" },
  "Abrir link": { "fr-FR": "Ouvrir un lien" },
  Ligar: { "fr-FR": "Appeler" },
  "Tipo do botão": { "fr-FR": "Type du bouton" },
  "Texto do botão": { "fr-FR": "Texte du bouton" },
  "URL do botão": { "fr-FR": "URL du bouton" },
  "Telefone do botão": { "fr-FR": "Téléphone du bouton" },
  "Remover botão": { "fr-FR": "Supprimer le bouton" },
  remover: { "fr-FR": "supprimer" },
  "Adicionar botão": { "fr-FR": "Ajouter un bouton" },
  "A revisão exige um exemplo de cada valor. Sem eles o modelo é recusado.": {
    "fr-FR": "La révision exige un exemple pour chaque valeur. Sans eux, le modèle est refusé.",
  },
  "Exemplo do valor": { "fr-FR": "Exemple de la valeur" },
  "ex.: María": { "fr-FR": "ex. : María" },
  "A plataforma revisa antes de aprovar — o modelo nasce pendente e some da lista de envio até ela decidir.":
    {
      "fr-FR":
        "La plateforme vérifie avant d’approuver : le modèle est créé en attente et reste absent de la liste d’envoi jusqu’à sa décision.",
    },
  "Nenhum modelo espelhado ainda. Clique em Sincronizar para trazer os que já existem na plataforma.":
    {
      "fr-FR":
        "Aucun modèle synchronisé pour l’instant. Cliquez sur Synchroniser pour importer ceux qui existent déjà sur la plateforme.",
    },
  "valor(es)": { "fr-FR": "valeur(s)" },
  Cabeçalho: { "fr-FR": "En-tête" },
  mídia: { "fr-FR": "média" },
  "Sem corpo espelhado — sincronize para trazer o conteúdo.": {
    "fr-FR": "Aucun corps synchronisé — synchronisez pour importer le contenu.",
  },
  "Sincronizado em": { "fr-FR": "Synchronisé le" },
  "Tipo do botão ": { "fr-FR": "Type du bouton " },
  "Não foi possível salvar.": { "fr-FR": "Impossible d’enregistrer." },
  "Estes limites protegem o número contra bloqueio do WhatsApp. Campo vazio usa o padrão seguro do sistema (mostrado no campo).":
    {
      "fr-FR":
        "Ces limites protègent le numéro contre le blocage de WhatsApp. Un champ vide utilise la valeur sûre par défaut du système (affichée dans le champ).",
    },
  "Este número é usado desde": { "fr-FR": "Ce numéro est utilisé depuis" },
  "A conexão pode ser nova sem que o número seja. O aquecimento conta a idade do NÚMERO — se você deixar em branco, ele é tratado como recém-criado e começa liberando pouco por dia.":
    {
      "fr-FR":
        "La connexion peut être nouvelle sans que le numéro le soit. Le réchauffement tient compte de l’âge du NUMÉRO : si vous laissez ce champ vide, il est considéré comme nouveau et commence avec un faible plafond quotidien.",
    },
  "Este número já está aquecido — pular o aquecimento": {
    "fr-FR": "Ce numéro est déjà réchauffé — ignorer le réchauffement",
  },
  "Vale só o teto diário abaixo. Use apenas se o número já envia há semanas: pular o aquecimento num número novo é o caminho mais rápido para o bloqueio.":
    {
      "fr-FR":
        "Seul le plafond quotidien ci-dessous s’applique. Utilisez cette option uniquement si le numéro envoie depuis plusieurs semaines : ignorer le réchauffement d’un nouveau numéro est le chemin le plus rapide vers le blocage.",
    },
  "Número com": { "fr-FR": "Numéro utilisé depuis" },
  "dia(s) de uso — já formado. Vale só o teto diário abaixo.": {
    "fr-FR": "jour(s) — déjà établi. Seul le plafond quotidien ci-dessous s’applique.",
  },
  "Hoje o aquecimento libera": { "fr-FR": "Aujourd’hui, le réchauffement autorise" },
  "envio(s) — o número tem": { "fr-FR": "envoi(s) — le numéro est utilisé depuis" },
  "dia(s) de uso.": { "fr-FR": "jour(s)." },
  "Enquanto esse número for menor que o teto diário, é ELE que limita, e mexer no teto diário não muda nada.":
    {
      "fr-FR":
        "Tant que ce nombre est inférieur au plafond quotidien, c’est lui qui limite l’envoi ; modifier le plafond quotidien ne change rien.",
    },
  "Janela de envio (horário local)": { "fr-FR": "Fenêtre d’envoi (heure locale)" },
  "Hora de início da janela": { "fr-FR": "Heure de début de la fenêtre" },
  "h até": { "fr-FR": "h à" },
  "Hora de fim da janela": { "fr-FR": "Heure de fin de la fenêtre" },
  "O assistente só envia mensagens dentro desta janela. Fora dela, a resposta fica agendada para a próxima abertura — você vê o motivo na conversa.":
    {
      "fr-FR":
        "L’assistant n’envoie des messages que pendant cette fenêtre. En dehors, la réponse est planifiée pour la prochaine ouverture ; la raison apparaît dans la conversation.",
    },
  "Enviar aos domingos": { "fr-FR": "Envoyer le dimanche" },
  "Ligado por padrão: quem escreve no domingo espera resposta no domingo. Desligue se você faz prospecção ativa e prefere não incomodar no fim de semana.":
    {
      "fr-FR":
        "Activé par défaut : une personne qui écrit le dimanche attend une réponse le dimanche. Désactivez cette option si vous prospectez activement et préférez ne pas déranger le week-end.",
    },
  "Ritmo entre envios (segundos)": { "fr-FR": "Intervalle entre les envois (secondes)" },
  "Intervalo mínimo entre envios em segundos": {
    "fr-FR": "Intervalle minimal entre les envois, en secondes",
  },
  "+ variação de até": { "fr-FR": "+ variation maximale de" },
  "Variação aleatória máxima em segundos": { "fr-FR": "Variation aléatoire maximale, en secondes" },
  "Intervalo mínimo entre mensagens do mesmo número, mais uma variação aleatória — ritmo cravado parece robô para o WhatsApp.":
    {
      "fr-FR":
        "Intervalle minimal entre les messages du même numéro, avec une variation aléatoire : un rythme parfaitement régulier ressemble à un robot pour WhatsApp.",
    },
  "Teto diário de envios": { "fr-FR": "Plafond quotidien d’envois" },
  "sem teto definido": { "fr-FR": "aucun plafond défini" },
  "Teto diário de mensagens": { "fr-FR": "Plafond quotidien de messages" },
  "Máximo de mensagens que este número envia por dia. Números novos também respeitam o aquecimento automático abaixo, o que for menor.":
    {
      "fr-FR":
        "Nombre maximal de messages envoyés par ce numéro chaque jour. Les nouveaux numéros respectent également le réchauffement automatique ci-dessous ; la limite la plus basse s’applique.",
    },
  "Fuso horário IANA": { "fr-FR": "Fuseau horaire IANA" },
  "Usar o padrão": { "fr-FR": "Utiliser la valeur par défaut" },
  "A janela de envio é avaliada neste fuso (ex.: America/Sao_Paulo).": {
    "fr-FR": "La fenêtre d’envoi est évaluée dans ce fuseau (ex. : America/Sao_Paulo).",
  },
  "Aquecimento automático de número novo": {
    "fr-FR": "Réchauffement automatique d’un nouveau numéro",
  },
  "a partir de": { "fr-FR": "à partir de" },
  "dias: sem limite de aquecimento": { "fr-FR": "jours : aucun plafond de réchauffement" },
  "+ dias: até": { "fr-FR": "+ jours : jusqu’à" },
  "/dia": { "fr-FR": "/jour" },
  "Número recém-conectado envia pouco e sobe aos poucos — enviar demais no início é a causa nº 1 de bloqueio.":
    {
      "fr-FR":
        "Un numéro nouvellement connecté envoie peu de messages et augmente progressivement ; envoyer trop au début est la première cause de blocage.",
    },
  "Ainda não verificado": { "fr-FR": "Pas encore vérifié" },
  "Número sem nome": { "fr-FR": "Numéro sans nom" },
  "WhatsApp conectado!": { "fr-FR": "WhatsApp connecté !" },
  "Não foi possível iniciar a conexão.": { "fr-FR": "Impossible de démarrer la connexion." },
  "Não foi possível reconectar.": { "fr-FR": "Impossible de reconnecter." },
  "Não foi possível excluir o canal.": { "fr-FR": "Impossible de supprimer le canal." },
  "no inbox.": { "fr-FR": "dans l’Inbox." },
  "indisponível enquanto o serviço do WhatsApp não estiver ativo": {
    "fr-FR": "indisponible tant que le service WhatsApp n’est pas actif",
  },
  "Este número não tem conversa, mensagem nem configuração ligada a ele.": {
    "fr-FR": "Ce numéro n’a aucune conversation, aucun message ni aucune configuration associée.",
  },
  conversa: { "fr-FR": "conversation" },
  conversas: { "fr-FR": "conversations" },
  mensagem: { "fr-FR": "message" },
  mensagens: { "fr-FR": "messages" },
  "versão de agente": { "fr-FR": "version d’agent" },
  "versões de agente": { "fr-FR": "versions d’agent" },
  "roteador de IA": { "fr-FR": "routeur IA" },
  "roteadores de IA": { "fr-FR": "routeurs IA" },
  "ajuste de proteção de envio": { "fr-FR": "réglage de protection des envois" },
  "ajustes de proteção de envio": { "fr-FR": "réglages de protection des envois" },
  "Continua no inbox:": { "fr-FR": "Reste dans l’Inbox :" },
  "Fica salvo, mas sem número — para de atender:": {
    "fr-FR": "Reste enregistré, mais sans numéro — il cesse de répondre :",
  },
  "Este canal tem registros internos, por isso ele é arquivado em vez de apagado.": {
    "fr-FR":
      "Ce canal contient des enregistrements internes ; il est donc archivé au lieu d’être supprimé.",
  },
  "Canal excluído.": { "fr-FR": "Canal supprimé." },
  "Canal removido.": { "fr-FR": "Canal retiré." },
  "conversa continua": { "fr-FR": "conversation continue" },
  "conversas continuam": { "fr-FR": "conversations continuent" },
  "O que estava ligado a ele continua guardado.": {
    "fr-FR": "Les éléments qui lui étaient liés restent enregistrés.",
  },
  "Excluir canal": { "fr-FR": "Supprimer le canal" },
  "O número será desconectado do WhatsApp e sai desta lista.": {
    "fr-FR": "Le numéro sera déconnecté de WhatsApp et retiré de cette liste.",
  },
  "Verificando o que está ligado a este número…": {
    "fr-FR": "Vérification des éléments liés à ce numéro…",
  },
  "Não foi possível verificar o que está ligado a este número. A exclusão continua possível — quem decide apagar ou arquivar é o servidor, e ele preserva o histórico quando existe.":
    {
      "fr-FR":
        "Impossible de vérifier les éléments liés à ce numéro. La suppression reste possible : le serveur décide de supprimer ou d’archiver et préserve l’historique lorsqu’il existe.",
    },
  "Para usar este número de novo, será preciso conectá-lo outra vez.": {
    "fr-FR": "Pour utiliser à nouveau ce numéro, vous devrez le reconnecter.",
  },
  "Por onde seu negócio fala com o cliente. Conecte números por QR ou o número oficial da Meta, e acompanhe a saúde de cada um.":
    {
      "fr-FR":
        "Les canaux par lesquels votre entreprise échange avec ses clients. Connectez des numéros par QR ou le numéro officiel Meta et surveillez l’état de chacun.",
    },
};

/**
 * Traduz, ou devolve o próprio texto.
 *
 * Nunca lança e nunca devolve vazio: um texto sem tradução aparece em
 * português, que é exatamente o comportamento de antes desta feature. Uma
 * tradução parcial não pode deixar a tela PIOR do que estava.
 */
export function traduzir(texto: string, idioma: Idioma): string {
  if (idioma === "pt-BR") return texto;
  return DICIONARIO[texto]?.[idioma] ?? texto;
}
