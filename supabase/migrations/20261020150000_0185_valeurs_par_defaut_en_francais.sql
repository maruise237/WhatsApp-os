-- Valeurs par défaut visibles en français (0185)
--
-- Le produit est servi en français (défaut) et en anglais ; plusieurs valeurs
-- semées en base étaient encore en portugais et s'affichaient telles quelles :
--
--   1. le nom d'organisation par défaut « Minha empresa » ;
--   2. le tableau par défaut des organisations créées AVANT 0181 (« Pedidos »,
--      « Carrinho abandonado »…) — 0181 n'avait changé que la graine ;
--   3. les deux compétences de plateforme (`objecao-preco`, `agendamento`),
--      dont le corps est injecté dans le prompt de l'agent : en portugais, le
--      modèle répondait au client final dans la mauvaise langue, et leurs
--      mots-clés (« tá caro », « agendar ») ne se déclenchaient jamais.
--
-- Règle commune : on ne touche QU'AUX lignes qui portent encore la valeur
-- portugaise d'origine. Ce qu'un client a renommé ou réécrit reste intact.
-- Idempotent : une seconde application ne trouve plus rien à changer.

-- 1. Nom d'organisation par défaut
update public.organizations
   set display_name = 'Mon entreprise'
 where display_name in ('Minha empresa', 'Minha Empresa');

-- 2. Tableau par défaut (slug inchangé, nom seulement s'il est encore d'origine)
update public.crm_pipelines
   set name = 'Commandes'
 where slug = 'pedidos' and name = 'Pedidos';

update public.crm_stages s
   set name = v.fr
  from (values
    ('carrinho_abandonado',  'Carrinho abandonado',  'Panier abandonné'),
    ('aguardando_pagamento', 'Aguardando pagamento', 'Paiement attendu'),
    ('pago',                 'Pago',                 'Payée'),
    ('em_separacao',         'Em separação',         'En préparation'),
    ('enviado',              'Enviado',              'Expédiée'),
    ('entregue',             'Entregue',             'Livrée'),
    ('pos_venda',            'Pós-venda',            'Après-vente'),
    ('cancelado',            'Cancelado',            'Annulée')
  ) as v(slug, pt, fr)
 where s.slug = v.slug and s.name = v.pt;

-- 3. Compétences de plateforme : nouvelle version FR + pointeur déplacé,
--    uniquement si le pointeur désigne encore la version portugaise d'origine
--    (`skill_versions` est immuable : on n'écrase jamais une version).
do $skills$
declare
  v_id uuid;
begin
  if exists (
    select 1
      from skill_pointers p
      join skill_versions v on v.id = p.version_id
     where p.organization_id is null and p.name = 'objecao-preco'
       and v.description like 'Playbook pra contornar objeção de preço%'
  ) then
    insert into skill_versions (organization_id, name, description, body, matcher)
    values (
      null,
      'objecao-preco',
      'Playbook pour traiter l’objection sur le prix sur WhatsApp — identifie la vraie raison derrière le « c’est cher » avant de réagir, sans accorder de remise non autorisée.',
      $body$# Playbook : traiter l’objection sur le prix

## Quand l’utiliser
Le lead a réagi au prix avec résistance — directe (« c’est cher ») ou indirecte (il a
demandé une remise, comparé avec un concurrent, disparu après avoir vu le prix). Objectif :
comprendre l’objection réelle derrière le « c’est cher » avant de réagir, et ne jamais
accorder une remise que l’organisation n’a pas autorisée.

## D’abord le diagnostic — « cher » ne concerne presque jamais le chiffre
Avant de répondre, identifiez QUELLE objection se cache derrière :

1. **Budget réellement insuffisant** — « je n’ai pas ce montant maintenant », « c’est hors de mon budget »
2. **N’a pas encore perçu la valeur** — « pourquoi ça coûte ça ? », silence après le prix, comparaison vague
3. **Comparaison avec un concurrent / une option moins chère** — « j’ai vu moins cher chez [X] »
4. **Tactique de négociation** — demande une remise d’emblée, sans avoir rien demandé sur le produit
5. **Timing** — « je vais réfléchir », « je dois voir avec [associé/conjoint] » déguisé en objection de prix

Si le message ne permet pas de diagnostiquer, DEMANDEZ avant d’argumenter : « Pour mieux
vous aider — c’est le montant en lui-même, ou vous attendiez autre chose que ce que je
vous ai proposé ? »

## Si-alors selon le diagnostic

**SI budget réellement insuffisant :**
- N’insistez pas sur le prix plein. Proposez : paiement échelonné, offre d’entrée, version
  réduite — UNIQUEMENT ce qui est documenté comme option légitime dans la base de
  connaissances.
- N’inventez JAMAIS un échelonnement ou une remise non documentés — si vous ne connaissez
  pas la politique, passez la main à un humain.
- Ne dévalorisez pas le lead parce qu’il n’a pas le budget. C’est une information, pas un refus.

**SI la valeur n’est pas encore perçue :**
- Ne répétez pas le prix. Mettez en avant le résultat concret pour le client (pas la liste
  des fonctionnalités).
- Utilisez un chiffre ou une preuve sociale réelle si la base de connaissances en contient.
- Question de relance : « Est-ce que ce que cela résout vous parle, ou il reste un doute sur
  ce qui est inclus ? »

**SI comparaison avec un concurrent :**
- N’attaquez pas le concurrent. Demandez ce qu’il a vu de différent (« qu’est-ce qu’il y
  avait dans cette autre option ? ») — cela révèle souvent si c’est vraiment le prix ou un
  autre critère (délai, assistance, garantie).
- Mettez en avant le vrai point fort de l’entreprise (ce que la base de connaissances dit de
  son positionnement), pas un argument générique.

**SI tactique de négociation (remise demandée sans contexte) :**
- Ne cédez pas automatiquement. Demandez ce qui permettrait de conclure aujourd’hui —
  cela révèle souvent le montant réel que le lead a en tête.
- Remise UNIQUEMENT si l’organisation a une politique documentée dans la base de
  connaissances pour ce cas. Sinon, relais humain — une décision de prix hors script
  revient à un humain.

**SI c’est un timing déguisé (« je vais réfléchir ») :**
- Ne mettez pas la pression. Demandez simplement ce qui manque pour décider (« qu’est-ce
  qui vous aiderait à décider plus sereinement ? »).
- Planifiez une relance explicite (date/heure), ne laissez pas en suspens — un lead qui « va
  réfléchir » sans relance planifiée refroidit.

## Règles strictes
- Ne promettez jamais de remise, de cadeau ou de condition spéciale qui ne figure pas dans la
  base de connaissances ou dans la configuration de l’agent.
- Ne mentez jamais sur une « promotion qui se termine aujourd’hui » et ne créez pas de fausse urgence.
- Si le lead devient hostile, menace d’annuler ou demande à parler à un humain — relais
  immédiat, sans insister une fois de plus.
- Si après 2 échanges l’objection n’est pas levée, proposez explicitement le relais :
  « Voulez-vous que je demande à quelqu’un de l’équipe de finaliser les détails avec vous ? »

## Exemples de réponse (le ton, pas à copier mot pour mot)
- « Je comprends — avant de vous proposer autre chose, dites-moi : c’est le montant en
  lui-même ou vous attendiez autre chose que ce que je vous ai montré ? »
- « C’est entendu. Pour le montant, nous avons aujourd’hui [option documentée]. Est-ce que
  cela vous conviendrait mieux en ce moment ? »
- « Très bien, je vérifie avec vous : qu’est-ce qui vous permettrait de conclure aujourd’hui ? »

## Ce qu’il ne faut PAS faire
- Ne renvoyez pas la liste des prix sans contexte.
- N’ignorez pas l’objection pour changer de sujet.
- N’utilisez pas de formules de pression comme « seulement aujourd’hui » si cette condition n’existe pas vraiment.
$body$,
      '{"any_keywords": ["cher", "c''est cher", "trop cher", "remise", "réduction", "baisser le prix", "moins cher", "j''ai vu moins cher", "hors de mon budget", "pas dans mon budget", "prix élevé", "promo"], "probe_keywords": ["combien", "quel est le prix", "c''est combien", "paiement en plusieurs fois", "conditions de paiement", "moyen de paiement"]}'::jsonb
    )
    returning id into v_id;

    update skill_pointers
       set version_id = v_id, updated_at = now()
     where organization_id is null and name = 'objecao-preco';
  end if;

  if exists (
    select 1
      from skill_pointers p
      join skill_versions v on v.id = p.version_id
     where p.organization_id is null and p.name = 'agendamento'
       and v.description like 'Playbook pra marcar/remarcar horário%'
  ) then
    insert into skill_versions (organization_id, name, description, body, matcher)
    values (
      null,
      'agendamento',
      'Playbook pour fixer ou déplacer un rendez-vous (consultation, visite, séance) — propose des créneaux concrets de l’agenda réel, n’invente jamais de disponibilité, confirme par écrit avant de conclure.',
      $body$# Playbook : prise de rendez-vous

## Quand l’utiliser
Le lead demande à fixer un rendez-vous, une consultation, une visite, une démonstration ou
une séance — tout engagement avec une date et une heure. Fréquent dans les cliniques,
l’immobilier (visites), les services et le conseil.

## Règle d’or : ne jamais inventer de disponibilité
Si l’agent n’a pas d’accès confirmé à l’agenda réel de l’entreprise (intégration ou
consultation des disponibilités), NE proposez PAS d’horaire précis. Dites que vous allez
vérifier et passez la main, ou demandez la préférence du lead en indiquant que la
confirmation suivra. Promettre un horaire qui n’existe pas casse la confiance et oblige à
reprogrammer.

## Déroulé standard (si-alors)

**1. Identifiez le service/motif avant de proposer un horaire**
- SI le lead a seulement dit « je veux un rendez-vous » sans contexte → demandez d’abord le
  motif/service. Réserver sans savoir quoi crée des erreurs (ex. : une consultation de
  20 min placée sur un créneau d’1 h de soin).

**2. Proposez des options fermées, pas une question ouverte**
- SI vous avez accès à l’agenda réel → proposez 2 ou 3 créneaux concrets (« j’ai mardi 14h
  ou mercredi 10h, lequel vous convient ? »). Une question ouverte comme « quel horaire
  préférez-vous ? » crée des allers-retours inutiles.
- SI vous n’avez pas accès à l’agenda → n’inventez pas. Dites par exemple « je vérifie les
  disponibilités et je reviens vers vous dans un instant », et signalez le relais à la
  personne qui y a accès.

**3. Recueillez les informations obligatoires avant de confirmer**
- Nom complet du lead (ou confirmez celui déjà présent dans le CRM).
- Service/motif précis.
- Agence/lieu, si l’entreprise en a plusieurs.
- En cas de report, l’ancien horaire à remplacer.

**4. Confirmez par écrit avant de clôturer**
- SI le lead accepte un horaire → reformulez par écrit : « Confirmé : [service] le [date]
  à [heure], à [lieu]. Vous me le confirmez ? »
- Ne considérez le rendez-vous comme fixé qu’après un « oui » explicite du lead — un
  silence ou un « ok » vague ne suffit pas quand une absence coûte cher.

**5. Report et annulation**
- SI le lead demande à déplacer → traitez-le comme un nouveau rendez-vous : demandez le
  nouvel horaire et annulez/remplacez explicitement l’ancien (ne laissez pas les deux).
- SI le lead demande à annuler → confirmez l’annulation et proposez de reprogrammer,
  sans insister.

**6. Risque d’absence**
- Si l’entreprise a une politique de confirmation la veille documentée dans la base de
  connaissances, suivez-la. Sinon, n’inventez pas de politique — confirmez simplement le
  rendez-vous.

## Règles strictes
- Ne confirmez jamais un horaire sans avoir vérifié la disponibilité réelle (ou sans
  indiquer que la confirmation reste à venir).
- Ne fixez jamais deux rendez-vous en conflit pour le même lead sans le signaler.
- Si le lead demande un horaire hors des heures d’ouverture et que les règles de
  l’entreprise ne le prévoient pas, ne confirmez pas — expliquez les horaires réels.
- Une donnée sensible (adresse complète, pièce d’identité) n’est demandée que si le
  processus de l’entreprise l’exige vraiment.

## Exemples de réponse (le ton, pas à copier mot pour mot)
- « Pour bien vous placer : c’est pour quel service/motif ? »
- « J’ai jeudi à 15h ou vendredi à 9h — qu’est-ce qui vous arrange le mieux ? »
- « Confirmé : consultation le 28/07 à 15h, à l’agence du centre. Vous me le confirmez ? »

## Ce qu’il ne faut PAS faire
- Ne demandez pas « quel horaire préférez-vous ? » sans proposer d’options concrètes quand
  vous avez l’agenda.
- Ne confirmez pas un rendez-vous sans réponse explicite du lead.
- N’inventez pas une disponibilité que vous n’avez pas vérifiée.
$body$,
      '{"any_keywords": ["rendez-vous", "prendre rendez-vous", "réserver", "fixer un rendez-vous", "une visite", "agenda", "à quelle heure", "créneau", "disponibilité", "reporter", "décaler", "annuler le rendez-vous"], "probe_keywords": ["quelle heure", "quel jour", "vous êtes ouverts", "disponible"]}'::jsonb
    )
    returning id into v_id;

    update skill_pointers
       set version_id = v_id, updated_at = now()
     where organization_id is null and name = 'agendamento';
  end if;
end
$skills$;
