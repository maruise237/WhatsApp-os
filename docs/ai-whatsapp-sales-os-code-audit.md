# Audit constitution–code — 2026-08-26

## État du checkout
## [32mmain[m...[31morigin/main[m
 [31mM[m AGENTS.md
 [31mM[m CLAUDE.md
 [31mM[m lib/api/errors.ts
 [31mM[m tasks/todo.md
[31m??[m 02-ai-whatsapp-sales-os-spec.md
[31m??[m 03-ai-whatsapp-sales-os-plan.md
[31m??[m 04-ai-whatsapp-sales-os-tasks.md
[31m??[m docs/ai-whatsapp-sales-os-code-audit.md
[31m??[m docs/ai-whatsapp-sales-os-traceability.md
[31m??[m lib/api/errors.test.ts

## Services Docker actuels
  waha:
  worker:

## Tables candidates présentes dans le baseline
create table if not exists public.conversation_assignment_events (
create table if not exists public.webhook_sources (
create table if not exists public.automation_rules (
create table if not exists public.automation_rule_runs (
create table if not exists public.attendant_availability (
create table if not exists public.attendant_availability (
create table if not exists public.crm_lead_scores (
create table if not exists public.crm_lead_risk_states (
create table if not exists public.crm_lead_reactivations (
create table if not exists public.system_version (
create table if not exists public.system_update_runs (
create table if not exists public.meta_templates (
create table if not exists public.demandas (
create table if not exists public.demanda_conversas (
create table if not exists public.ai_purpose_bindings (
create table if not exists public.contact_field_proposals (
create table if not exists public.org_guardrail_layers (
create table if not exists public.platform_branding (
create table if not exists public.webhook_lead_captures (

## Signaux de modèle Sales OS déjà présents
app/(public)/login/page.tsx
app/(public)/signup/page.tsx
app/actions/onboarding/montarQuadro.ts
app/admin/(protected)/audit/[entryId]/_client.tsx
app/admin/(protected)/inbox/_components/AdminSidePanel.tsx
app/admin/(protected)/inbox/_components/AdminThread.tsx
app/admin/(protected)/inbox/_components/InboxList.tsx
app/admin/(protected)/inbox/layout.tsx
app/admin/(protected)/lgpd/requests/[id]/_client.tsx
app/admin/(protected)/marca/_estado.tsx
app/admin/(protected)/marca/_form.tsx
app/admin/(protected)/platform-admins/_client.tsx
app/admin/(protected)/tenants/[id]/_client.tsx
app/admin/(protected)/tenants/[id]/_tab-nav.tsx
app/admin/(protected)/tenants/[id]/health/_client.tsx
app/admin/(protected)/usage/_client.tsx
app/api/v1/admin/audit/route.ts
app/api/v1/admin/dashboard/kpis/route.ts
app/api/v1/admin/inbox/conversations/[id]/route.ts
app/api/v1/admin/inbox/conversations/route.ts
app/api/v1/admin/incidents/[id]/route.test.ts
app/api/v1/admin/incidents/[id]/route.ts
app/api/v1/admin/incidents/route.ts
app/api/v1/admin/lgpd/requests/[id]/route.ts
app/api/v1/admin/lgpd/requests/route.ts
app/api/v1/admin/platform-admins/route.test.ts
app/api/v1/admin/platform-admins/route.ts
app/api/v1/admin/tenants/[id]/health/route.test.ts
app/api/v1/admin/tenants/[id]/health/route.ts
app/api/v1/admin/tenants/[id]/route.test.ts
app/api/v1/admin/tenants/[id]/route.ts
app/api/v1/admin/tenants/route.ts
app/api/v1/admin/users/[id]/route.ts
app/api/v1/admin/users/route.test.ts
app/api/v1/admin/users/route.ts
app/api/v1/ai/agents/[id]/proposals/route.ts
app/api/v1/ai/agents/[id]/runs/route.ts
app/api/v1/ai/agents/[id]/tool-usage/route.ts
app/api/v1/ai/agents/[id]/versions/route.ts
app/api/v1/ai/agents/assignable/route.ts
app/api/v1/ai/agents/route.ts
app/api/v1/ai/budget/route.ts
app/api/v1/ai/credentials/route.ts
app/api/v1/ai/evolution/route.test.ts
app/api/v1/ai/evolution/route.ts
app/api/v1/ai/followup-flows/[id]/route.ts
app/api/v1/ai/followup-flows/route.ts
app/api/v1/ai/followups/enrollments/[id]/route.ts
app/api/v1/ai/followups/enrollments/route.ts
app/api/v1/ai/followups/queue/route.ts
app/api/v1/ai/inbox/[id]/route.ts
app/api/v1/ai/inbox/route.ts
app/api/v1/ai/knowledge/sources/route.test.ts
app/api/v1/ai/knowledge/sources/route.ts
app/api/v1/ai/memory/route.test.ts
app/api/v1/ai/memory/route.ts
app/api/v1/ai/pacing/route.ts
app/api/v1/ai/providers/[provider]/models/route.ts
app/api/v1/ai/providers/route.ts
app/api/v1/ai/routers/[id]/route.ts
app/api/v1/ai/routers/route.test.ts
app/api/v1/ai/routers/route.ts
app/api/v1/ai/runs/route.ts
app/api/v1/ai/usage/route.ts
app/api/v1/audit/export/route.ts
app/api/v1/audit/route.ts
app/api/v1/automation-rules/[id]/runs/route.ts
app/api/v1/automation-rules/route.ts
app/api/v1/automation-rules/runs/route.ts
app/api/v1/channel-sessions/[id]/route.test.ts
app/api/v1/channel-sessions/route.ts
app/api/v1/channels/partner/templates/route.ts
app/api/v1/channels/templates/route.ts
app/api/v1/contacts/[id]/crm-summary/route.ts
app/api/v1/contacts/[id]/proposals/route.ts
app/api/v1/contacts/[id]/timeline/route.ts
app/api/v1/contacts/_handler.ts
app/api/v1/contacts/route.ts
app/api/v1/conversations/[id]/claim/route.ts
app/api/v1/conversations/[id]/close/route.ts
app/api/v1/conversations/[id]/notes/route.ts
app/api/v1/conversations/[id]/pause-ai/route.ts
app/api/v1/conversations/[id]/reactivate-bot/route.ts
app/api/v1/conversations/[id]/release/route.ts
app/api/v1/conversations/[id]/retention/route.ts
app/api/v1/conversations/_handler.ts
app/api/v1/cron/contact-avatars/route.ts
app/api/v1/cron/contact-phones/route.ts
app/api/v1/cron/recover-stuck-messages/route.ts
app/api/v1/cron/snooze-watcher/route.ts
app/api/v1/lead-captures/route.ts
app/api/v1/leads/[id]/timeline/route.ts
app/api/v1/leads/_handler.ts
app/api/v1/leads/proposals/route.ts
app/api/v1/leads/reactivations/route.ts
app/api/v1/lgpd/requests/[id]/preview/route.ts
app/api/v1/lgpd/requests/[id]/route.ts
app/api/v1/lgpd/requests/route.ts
app/api/v1/message-templates/route.ts
app/api/v1/messages/_handler.ts
app/api/v1/pipelines/[id]/agent-mapping/route.test.ts
app/api/v1/pipelines/[id]/agent-mapping/route.ts
app/api/v1/pipelines/[id]/board/route.ts
app/api/v1/pipelines/_funis.ts
app/api/v1/pipelines/_handler.ts
app/api/v1/pipelines/default/route.ts
app/api/v1/settings/api-tokens/route.ts
app/api/v1/system/agent/route.test.ts
app/api/v1/system/agent/route.ts
app/api/v1/system/update/route.ts
app/api/v1/system/version/route.test.ts
app/api/v1/system/version/route.ts
app/api/v1/team/assignable/route.ts
app/api/v1/team/route.ts
app/api/v1/webhook-sources/[id]/events/route.ts
app/api/v1/webhooks/nuvemshop/[event]/route.ts
app/api/v1/webhooks/nuvemshop/customer-data-request/route.ts
app/api/v1/webhooks/nuvemshop/customer-redact/route.ts
app/app/ai/agents/[id]/_actions.ts
app/app/ai/agents/[id]/_components/AgentForm.tsx
app/app/ai/agents/[id]/_components/FollowupFlowPicker.tsx
app/app/ai/agents/[id]/_components/FunisDoAgente.tsx
app/app/ai/agents/[id]/_components/HandoffKeywordsInput.tsx
app/app/ai/agents/[id]/_components/PainelDoOperador.tsx
app/app/ai/agents/[id]/_components/ProposalsPanel.tsx
app/app/ai/agents/[id]/_components/PublishConfirmDialog.tsx
app/app/ai/agents/[id]/_components/RunDetailDrawer.tsx
app/app/ai/agents/[id]/_components/RunTrace.tsx
app/app/ai/agents/[id]/_components/RunsTable.tsx
app/app/ai/agents/[id]/_components/TestPanel.tsx
app/app/ai/agents/[id]/_components/ToolPicker.tsx
app/app/ai/agents/[id]/_components/TriggerEditor.tsx
app/app/ai/agents/[id]/_components/UsoDasCapacidades.tsx
app/app/ai/agents/[id]/_components/VersionDiff.tsx
app/app/ai/agents/[id]/_components/VersionHistory.tsx
app/app/ai/agents/[id]/page.tsx
app/app/ai/agents/page.tsx
app/app/ai/cases/_components/CaseDetail.tsx
app/app/ai/cases/_components/CaseList.tsx
app/app/ai/cases/_components/CaseReplyPanel.tsx
app/app/ai/credentials/_components/CredentialsList.tsx
app/app/ai/credentials/page.tsx
app/app/ai/evolution/_client.tsx
app/app/ai/followups/[id]/_components/EdgeConfigPanel.tsx
app/app/ai/followups/[id]/_components/FlowCanvas.tsx
app/app/ai/followups/[id]/_components/NodeConfigPanel.tsx
app/app/ai/followups/[id]/_components/NodePalette.tsx
app/app/ai/followups/[id]/_components/PublishBar.tsx
app/app/ai/followups/[id]/_components/forms/ConditionForm.tsx
app/app/ai/followups/[id]/_components/nodes/NodeCard.tsx
app/app/ai/followups/[id]/_components/nodes/nodeVisuals.ts
app/app/ai/followups/[id]/page.tsx
app/app/ai/followups/_components/FlowsList.tsx
app/app/ai/followups/_components/QueueTab.tsx
app/app/ai/followups/enrollments/[id]/_components/DossieDoFollowup.tsx
app/app/ai/followups/enrollments/[id]/_components/PlanoDeTempo.tsx
app/app/ai/followups/page.tsx
app/app/ai/inbox/_components/AgentInboxList.tsx
app/app/ai/knowledge/sources/page.tsx
app/app/ai/memory/_client.tsx
app/app/ai/memory/page.tsx
app/app/ai/proposals/_components/ProposalsList.tsx
app/app/ai/providers/_components/PainelDeProvedores.tsx
app/app/ai/routers/[id]/_client.tsx
app/app/ai/routers/[id]/page.tsx
app/app/ai/routers/_client.tsx
app/app/ai/routers/page.tsx
app/app/ai/runs/_components/ExecucoesDeIa.tsx
app/app/ai/skills/_client.tsx
app/app/ai/usage/_client.tsx
app/app/ai/usage/page.tsx
app/app/contacts/[id]/_client.tsx
app/app/contacts/_client.tsx
app/app/inbox/loading.tsx
app/app/integrations/nuvemshop/page.tsx
app/app/kanban/_client.tsx
app/app/kanban/page.tsx
app/app/lgpd/requests/RequestsTable.tsx
app/app/lgpd/requests/SlaBanner.tsx
app/app/lgpd/requests/[id]/AuditTrail.tsx

## Adaptateurs WhatsApp présents
lib/channels/adapters/meta-cloud.ts
lib/channels/adapters/waha.ts
lib/channels/adapters/zernio.ts
lib/channels/archived.ts
lib/channels/arquivo-de-webhook.ts
lib/channels/atribuicao-de-anuncio-oficial.ts
lib/channels/capabilities.ts
lib/channels/conferir-definicao.ts
lib/channels/connect.ts
lib/channels/estado.ts
lib/channels/frases-de-falha.ts
lib/channels/health.ts
lib/channels/inbound.ts
lib/channels/index.ts
lib/channels/janela.ts
lib/channels/meta/build-components.ts
lib/channels/meta/contact-card.test.ts
lib/channels/meta/contact-card.ts
lib/channels/meta/contract-hash.ts
lib/channels/meta/credentials.ts
lib/channels/meta/envelope.ts
lib/channels/meta/ingest.ts
lib/channels/meta/render-template.ts
lib/channels/meta/send-template-for-session.ts
lib/channels/meta/send-template-outcome.ts
lib/channels/meta/send-template.ts
lib/channels/meta/session.ts
lib/channels/meta/template-binding.ts
lib/channels/meta/template-contract.ts
lib/channels/meta/template-sync.ts
lib/channels/meta/validate-credentials.ts
lib/channels/meta/webhook.ts
lib/channels/numero-observado.ts
lib/channels/phone-variants.ts
lib/channels/pos-entrada.ts
lib/channels/reactivate.ts
lib/channels/retencao-do-arquivo.ts
lib/channels/selectable.ts
lib/channels/session-ref.ts
lib/channels/template-conteudo.ts
lib/channels/templates-fonte.ts
lib/channels/transporte.test.ts
lib/channels/transporte.ts
lib/channels/types.ts
lib/channels/zernio/avisos.ts
lib/channels/zernio/credentials.ts
lib/channels/zernio/envelope.ts
lib/channels/zernio/ingest.ts
lib/channels/zernio/templates.ts
lib/channels/zernio/webhook.ts
lib/waha/README.md
lib/waha/atribuicao-de-anuncio.ts
lib/waha/client.ts
lib/waha/contact-card.test.ts
lib/waha/contact-card.ts
lib/waha/envelope.ts
lib/waha/ingest-celular.test.ts
lib/waha/ingest-chat-desconhecido.test.ts
lib/waha/ingest-redos.test.ts
lib/waha/ingest.ts
lib/waha/media-send.ts
lib/waha/message-id.test.ts
lib/waha/message-id.ts
lib/waha/resolve-contact-whatsapp-id.test.ts
lib/waha/resolve-contact-whatsapp-id.ts
lib/waha/send.ts
lib/waha/webhook-auth.test.ts
lib/waha/webhook-auth.ts

## Routes WhatsApp présentes
app/api/v1/admin/inbox/conversations/[id]/route.ts
app/api/v1/admin/inbox/conversations/route.ts
app/api/v1/channel-sessions/[id]/qr/route.ts
app/api/v1/channel-sessions/[id]/reconnect/route.ts
app/api/v1/channel-sessions/[id]/route.test.ts
app/api/v1/channel-sessions/[id]/route.ts
app/api/v1/channel-sessions/route.ts
app/api/v1/channels/official/route.ts
app/api/v1/channels/partner/route.ts
app/api/v1/channels/partner/templates/media/route.ts
app/api/v1/channels/partner/templates/route.ts
app/api/v1/channels/templates/route.ts
app/api/v1/conversation-tags/route.ts
app/api/v1/conversations/[id]/claim/route.ts
app/api/v1/conversations/[id]/close/route.ts
app/api/v1/conversations/[id]/draft-reply/route.ts
app/api/v1/conversations/[id]/mark-read/route.ts
app/api/v1/conversations/[id]/media/route.ts
app/api/v1/conversations/[id]/messages/route.ts
app/api/v1/conversations/[id]/notes/[noteId]/route.ts
app/api/v1/conversations/[id]/notes/route.ts
app/api/v1/conversations/[id]/pause-ai/route.ts
app/api/v1/conversations/[id]/reactivate-bot/route.ts
app/api/v1/conversations/[id]/release/route.ts
app/api/v1/conversations/[id]/retention/route.ts
app/api/v1/conversations/[id]/route.ts
app/api/v1/conversations/[id]/snooze/route.ts
app/api/v1/conversations/[id]/transfer/route.ts
app/api/v1/conversations/[id]/usable-for-rag/route.ts
app/api/v1/conversations/_handler.ts
app/api/v1/conversations/counts/route.ts
app/api/v1/conversations/open-with-contact/route.ts
app/api/v1/conversations/route.ts
app/api/v1/cron/channel-health/route.ts
app/api/v1/cron/kb-conversations-batch/route.ts
app/api/v1/cron/recover-stuck-messages/route.ts
app/api/v1/message-templates/[id]/route.ts
app/api/v1/message-templates/route.ts
app/api/v1/messages/[id]/media/route.ts
app/api/v1/messages/_handler.ts
app/api/v1/messages/route.ts
app/api/v1/onboarding/whatsapp/qr/route.ts
app/api/v1/onboarding/whatsapp/session/route.ts
app/api/v1/webhooks/channel/[token]/route.ts
app/api/v1/webhooks/waha/[token]/route.ts
app/api/v1/webhooks/waha/route.ts

## Décision DIRC — 2026-08-26

Le dépôt contient déjà `nuvemshop_products` et `orders`, mais ces tables représentent des objets synchronisés depuis un fournisseur e-commerce externe : elles imposent `external_provider`, `external_id` et des statuts de fulfillment qui ne correspondent pas à la machine `en_cours → en_attente_paiement → payée → a_livrer → livree` du Sales OS. Elles sont conservées pour la compatibilité Nuvemshop et ne sont pas réutilisées comme commandes locales.

Le dépôt contient déjà `organizations`, `contacts`, `conversations`, `messages`, `channel_sessions`, `event_log`, `agent_inbox_items` et les tables d’assignation. Ces tables sont réutilisées. Le modèle Sales OS ajoutera donc uniquement les tables métier absentes : `whatsapp_instances` si `channel_sessions` ne porte pas le mapping Evolution Go requis, `products`, `product_media`, `sales_orders`, `sales_order_items`, `payment_proofs` et éventuellement `gateway_events` si `event_log` ne couvre pas le contrat d’idempotence entrant. La décision finale se fera après lecture des contraintes et RLS de chaque table existante.

Le chemin de canal actuel est clairement WAHA : compose `waha` + `worker`, adaptateurs `lib/waha/*`, routes `/api/v1/webhooks/waha/*` et routes de session. L’adaptateur doit être isolé avant d’introduire Evolution Go ; aucune suppression brutale de WAHA n’est autorisée tant que les tests de canal ne sont pas portés vers le contrat abstrait.

## Décision DIRC complémentaire — channel_sessions

`channel_sessions` porte déjà `organization_id`, le nom de session du transport, le token de webhook, le statut, le numéro, la limite quotidienne et les informations de warm-up. Il constitue donc le registre de l’instance par vendeur. Une nouvelle table `whatsapp_instances` serait redondante au lancement.

La migration cible ajoutera un champ explicite `evolution_instance_name` et les index/contraintes nécessaires, avec un backfill depuis `waha_session_name` lorsque cela est possible. `waha_session_name` reste temporairement pour la compatibilité de l’adaptateur historique. Une tâche ultérieure pourra retirer l’ancien champ seulement après migration des références et des tests.

Le `event_log` existant est le bus interne et `idempotency_keys` couvre déjà les POSTs. Le gateway pourra réutiliser ces primitives ; une table `gateway_events` ne sera créée que si un besoin de rétention ou d’idempotence spécifique au webhook ne peut pas être satisfait par le modèle actuel.
