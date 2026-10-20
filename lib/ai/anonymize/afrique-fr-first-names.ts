/**
 * Prénoms courants en Afrique francophone (Cameroun, Côte d'Ivoire, Sénégal,
 * Mali, Burkina Faso, Bénin, Togo, Gabon, Congo, Guinée) pour l'anonymiseur
 * du RAG de conversations.
 *
 * Même règle que la liste PT-BR voisine : minuscules, et on EXCLUT les prénoms
 * qui sont aussi des mots courants du français parlé dans une conversation de
 * vente (« jean » le pantalon, « pierre », « rose », « aimé », « grace »,
 * « prosper », « victoire », « patience », « espérance », « désiré », « junior »…).
 * Un faux négatif ici coûte moins qu'un faux positif qui efface le contexte
 * produit. Les prénoms composés (Jean-Pierre) ne sont pas listés : le tokeniseur
 * coupe au tiret, et « jean » / « pierre » sont exclus ci-dessus.
 */

export const FIRST_NAMES_AFRIQUE_FR: ReadonlySet<string> = new Set<string>([
  // Masculins
  "mamadou", "moussa", "ibrahima", "ousmane", "abdoulaye", "amadou", "boubacar",
  "souleymane", "seydou", "cheikh", "modou", "lamine", "aliou", "alioune",
  "babacar", "pape", "malick", "mamadi", "sékou", "sekou", "bakary", "drissa",
  "adama", "issa", "idrissa", "yacouba", "karim", "kouassi", "kouadio", "kouamé",
  "kouame", "koffi", "kofi", "yao", "konan", "kossi", "komlan", "kodjo",
  "messan", "sènou", "senou", "codjo", "hounkpè", "rodrigue", "arsène", "arsene",
  "serge", "hervé", "herve", "thierry", "christian", "patrick", "didier",
  "rodolphe", "landry", "brice", "ghislain", "steve", "fabrice",
  "franck", "cédric", "cedric", "yannick", "armel", "blaise", "wilfried",
  "mamoudou", "oumar", "omar", "salif", "tidiane", "assane", "ndiaga", "samba",
  "demba", "birame", "ablaye", "youssouf", "youssoupha", "habib", "rachid",
  "achille", "romuald", "eric", "éric", "guy", "alain",
  // Féminins
  "aïcha", "aicha", "awa", "fatou", "fatoumata", "mariam", "mariama", "aminata",
  "khadija", "kadiatou", "ramatou", "rokia", "oumou", "nafissatou", "astou",
  "coumba", "ndèye", "ndeye", "adja", "adjoua", "akissi", "affoué", "affoue",
  "aya", "amenan", "ahou", "afi", "akossiwa", "ablavi", "yawa", "edwige",
  "chantal", "pélagie", "pelagie", "solange", "clarisse", "brigitte", "nadège",
  "nadege", "laetitia", "léonie", "leonie", "sandrine", "carine", "christelle",
  "josiane", "rosine", "odile", "pauline", "mireille", "estelle", "ornella",
  "bintou", "salimata", "assita", "safiatou", "djeneba", "djénéba", "hawa",
  "kadi", "mariètou", "marietou", "sokhna", "dieynaba", "binta", "nafi",
]);
