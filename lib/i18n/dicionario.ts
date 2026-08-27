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
  Legenda: { "fr-FR": "Légende" },
  "Templates de script": { "fr-FR": "Modèles de script" },
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
  "parâmetro(s)": { "fr-FR": "paramètre(s)" },
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
  "Nenhum número conectado ainda.": { "fr-FR": "Aucun numéro n’est encore connecté." },
  "número conectado": { "fr-FR": "numéro connecté" },
  "números conectados": { "fr-FR": "numéros connectés" },
  "Proteção de envio": { "fr-FR": "Protection des envois" },
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
