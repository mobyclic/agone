-- ============================================================================
-- AGONE 2.0 — Schéma SurrealDB
--
-- Refonte du site des Éditions Agone (agone.org). Pensé GRAPHE : le catalogue,
-- les auteurs, les commandes et les droits d'auteur sont reliés par des arêtes
-- RELATE. L'ISBN-13 (isbn_paper) est la colonne vertébrale qui relie catalogue,
-- couvertures (R2), stock/EDI Belles Lettres et redevances.
--
-- Conventions :
--   • Connexion applicative en root (autorisations gérées côté app, pas de SCOPE).
--   • Tables SCHEMAFULL, champs option<> pour tolérer les anciens enregistrements.
--   • OVERWRITE partout → schéma idempotent (ré-exécutable sans risque).
--   • Site MONOLINGUE (fr) : contenu éditorial stocké en texte simple (pas d'i18n).
--   • updated_at : VALUE time::now() → mis à jour à chaque écriture.
--   • legacy_wp_id : clé de correspondance avec l'ancien WordPress (migration).
--
-- Ce fichier pose le CŒUR AUTH (média + comptes + sessions) et une PREMIÈRE
-- ÉBAUCHE du domaine catalogue (collection, author, book + arête contributed_by).
-- Les modules commande / ebook / stock / droits d'auteur seront ajoutés par phase.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- ANALYZERS (recherche plein-texte BM25)
-- ─────────────────────────────────────────────────────────────
DEFINE ANALYZER OVERWRITE ana_text
  TOKENIZERS blank, class, camel
  FILTERS lowercase, ascii;

DEFINE ANALYZER OVERWRITE ana_prefix
  TOKENIZERS blank, class
  FILTERS lowercase, ascii, edgengram(2, 12);

-- ─────────────────────────────────────────────────────────────
-- FONCTIONS UTILITAIRES
-- ─────────────────────────────────────────────────────────────
DEFINE FUNCTION OVERWRITE fn::slugify($t: string) {
  RETURN string::slug($t);
};

-- ══════════════════════════════════════════════════════════════
-- MEDIA (fichiers hébergés sur Cloudflare R2 : couvertures, portraits, PDF…)
-- ══════════════════════════════════════════════════════════════
DEFINE TABLE OVERWRITE media SCHEMAFULL;
DEFINE FIELD OVERWRITE key         ON media TYPE string;
DEFINE FIELD OVERWRITE url         ON media TYPE string;
DEFINE FIELD OVERWRITE kind        ON media TYPE string DEFAULT 'image'
  ASSERT $value IN ['image','logo','document','avatar','cover'];
DEFINE FIELD OVERWRITE mime        ON media TYPE option<string>;
DEFINE FIELD OVERWRITE filename    ON media TYPE option<string>;
DEFINE FIELD OVERWRITE size        ON media TYPE option<int>;
DEFINE FIELD OVERWRITE width       ON media TYPE option<int>;
DEFINE FIELD OVERWRITE height      ON media TYPE option<int>;
DEFINE FIELD OVERWRITE alt         ON media TYPE option<string>;
DEFINE FIELD OVERWRITE owner       ON media TYPE option<record<user>>;
DEFINE FIELD OVERWRITE created_at  ON media TYPE datetime DEFAULT time::now();

-- ══════════════════════════════════════════════════════════════
-- USER — compte (client, éditorial, admin)
-- ══════════════════════════════════════════════════════════════
DEFINE TABLE OVERWRITE user SCHEMAFULL;
DEFINE FIELD OVERWRITE email          ON user TYPE option<string>
  ASSERT $value = NONE OR string::is_email($value);
DEFINE FIELD OVERWRITE password_hash  ON user TYPE option<string>;
DEFINE FIELD OVERWRITE first_name     ON user TYPE string DEFAULT '';
DEFINE FIELD OVERWRITE last_name      ON user TYPE string DEFAULT '';
DEFINE FIELD OVERWRITE full_name      ON user TYPE string
  VALUE string::trim(string::concat($this.first_name, ' ', $this.last_name));
DEFINE FIELD OVERWRITE slug           ON user TYPE option<string>;
DEFINE FIELD OVERWRITE phone          ON user TYPE option<string>;
DEFINE FIELD OVERWRITE avatar         ON user TYPE option<record<media>>;
-- Rôle : admin | editor | customer | pending (cf. src/lib/roles.ts)
DEFINE FIELD OVERWRITE role           ON user TYPE string
  ASSERT $value IN ['admin','editor','customer','pending'] DEFAULT 'pending';
-- Adresses (facturation / livraison) — objets libres pour la boutique (Phase 2).
DEFINE FIELD OVERWRITE billing        ON user TYPE option<object> FLEXIBLE;
DEFINE FIELD OVERWRITE shipping       ON user TYPE option<object> FLEXIBLE;
DEFINE FIELD OVERWRITE stripe_customer_id ON user TYPE option<string>;
DEFINE FIELD OVERWRITE is_active      ON user TYPE bool DEFAULT true;
DEFINE FIELD OVERWRITE email_verified ON user TYPE bool DEFAULT false;
DEFINE FIELD OVERWRITE accepts_newsletter ON user TYPE bool DEFAULT true;
DEFINE FIELD OVERWRITE unsubscribe_token  ON user TYPE option<string>;
DEFINE FIELD OVERWRITE notes          ON user TYPE option<string>;
DEFINE FIELD OVERWRITE legacy_wp_id   ON user TYPE option<int>;
DEFINE FIELD OVERWRITE created_at     ON user TYPE datetime DEFAULT time::now();
DEFINE FIELD OVERWRITE updated_at     ON user TYPE datetime DEFAULT time::now() VALUE time::now();

DEFINE INDEX OVERWRITE idx_user_email   ON user FIELDS email UNIQUE;
DEFINE INDEX OVERWRITE idx_user_slug    ON user FIELDS slug UNIQUE;
DEFINE INDEX OVERWRITE idx_user_role    ON user FIELDS role;
DEFINE INDEX OVERWRITE idx_user_legacy  ON user FIELDS legacy_wp_id;

-- ══════════════════════════════════════════════════════════════
-- AUTH — sessions, magic links, OTP, reset password
-- ══════════════════════════════════════════════════════════════
DEFINE TABLE OVERWRITE session SCHEMAFULL;
DEFINE FIELD OVERWRITE user       ON session TYPE record<user>;
DEFINE FIELD OVERWRITE expires_at ON session TYPE datetime;
DEFINE FIELD OVERWRITE user_agent ON session TYPE option<string>;
DEFINE FIELD OVERWRITE ip         ON session TYPE option<string>;
DEFINE FIELD OVERWRITE created_at ON session TYPE datetime DEFAULT time::now();
DEFINE INDEX OVERWRITE idx_session_user ON session FIELDS user;

DEFINE TABLE OVERWRITE magic_link SCHEMAFULL;
DEFINE FIELD OVERWRITE email      ON magic_link TYPE string;
DEFINE FIELD OVERWRITE next       ON magic_link TYPE option<string>;
DEFINE FIELD OVERWRITE used       ON magic_link TYPE bool DEFAULT false;
DEFINE FIELD OVERWRITE expires_at ON magic_link TYPE datetime;
DEFINE FIELD OVERWRITE created_at ON magic_link TYPE datetime DEFAULT time::now();

DEFINE TABLE OVERWRITE email_otp SCHEMAFULL;
DEFINE FIELD OVERWRITE email      ON email_otp TYPE string;
DEFINE FIELD OVERWRITE purpose    ON email_otp TYPE string DEFAULT 'login';
DEFINE FIELD OVERWRITE code_hash  ON email_otp TYPE string;
DEFINE FIELD OVERWRITE attempts   ON email_otp TYPE int DEFAULT 0;
DEFINE FIELD OVERWRITE used       ON email_otp TYPE bool DEFAULT false;
DEFINE FIELD OVERWRITE expires_at ON email_otp TYPE datetime;
DEFINE FIELD OVERWRITE created_at ON email_otp TYPE datetime DEFAULT time::now();
DEFINE INDEX OVERWRITE idx_otp_email ON email_otp FIELDS email, purpose;

DEFINE TABLE OVERWRITE password_reset SCHEMAFULL;
DEFINE FIELD OVERWRITE user       ON password_reset TYPE record<user>;
DEFINE FIELD OVERWRITE used       ON password_reset TYPE bool DEFAULT false;
DEFINE FIELD OVERWRITE expires_at ON password_reset TYPE datetime;
DEFINE FIELD OVERWRITE created_at ON password_reset TYPE datetime DEFAULT time::now();

-- ══════════════════════════════════════════════════════════════
-- SITE_SETTING — clé/valeur (bandeau, compteurs de numéro, TVA…)
-- ══════════════════════════════════════════════════════════════
DEFINE TABLE OVERWRITE site_setting SCHEMAFULL;
DEFINE FIELD OVERWRITE key   ON site_setting TYPE string;
DEFINE FIELD OVERWRITE value ON site_setting TYPE option<object> FLEXIBLE;
DEFINE INDEX OVERWRITE idx_setting_key ON site_setting FIELDS key UNIQUE;

-- ══════════════════════════════════════════════════════════════
-- DOMAINE CATALOGUE — première ébauche (Phase 1)
-- ══════════════════════════════════════════════════════════════

-- COLLECTION (taxonomie éditeur : Contre-feux, L'Épreuve des faits, Éléments…)
DEFINE TABLE OVERWRITE collection SCHEMAFULL;
DEFINE FIELD OVERWRITE name        ON collection TYPE string;
DEFINE FIELD OVERWRITE slug        ON collection TYPE string;
DEFINE FIELD OVERWRITE description ON collection TYPE option<string>;
DEFINE FIELD OVERWRITE sort        ON collection TYPE int DEFAULT 0;
DEFINE FIELD OVERWRITE legacy_term_id ON collection TYPE option<int>;
DEFINE FIELD OVERWRITE created_at  ON collection TYPE datetime DEFAULT time::now();
DEFINE FIELD OVERWRITE updated_at  ON collection TYPE datetime DEFAULT time::now() VALUE time::now();
DEFINE INDEX OVERWRITE idx_collection_slug ON collection FIELDS slug UNIQUE;

-- AUTHOR (contributeur : auteur, traducteur, préfacier, illustrateur, éditeur…)
DEFINE TABLE OVERWRITE author SCHEMAFULL;
DEFINE FIELD OVERWRITE first_name  ON author TYPE string DEFAULT '';
DEFINE FIELD OVERWRITE last_name   ON author TYPE string DEFAULT '';
DEFINE FIELD OVERWRITE full_name   ON author TYPE string
  VALUE string::trim(string::concat($this.first_name, ' ', $this.last_name));
DEFINE FIELD OVERWRITE slug        ON author TYPE string;
DEFINE FIELD OVERWRITE bio_html    ON author TYPE option<string>;
DEFINE FIELD OVERWRITE portrait    ON author TYPE option<record<media>>;
DEFINE FIELD OVERWRITE hidden      ON author TYPE bool DEFAULT false;
DEFINE FIELD OVERWRITE nationality ON author TYPE option<string>;
DEFINE FIELD OVERWRITE birth_year  ON author TYPE option<int>;
DEFINE FIELD OVERWRITE death_year  ON author TYPE option<int>;
DEFINE FIELD OVERWRITE website     ON author TYPE option<string>;
-- Identité fiscale pour le paiement des droits (sensible ; renseignée au besoin).
DEFINE FIELD OVERWRITE legal_name  ON author TYPE option<string>;
DEFINE FIELD OVERWRITE siret       ON author TYPE option<string>;
DEFINE FIELD OVERWRITE legacy_wp_id ON author TYPE option<int>;
DEFINE FIELD OVERWRITE created_at  ON author TYPE datetime DEFAULT time::now();
DEFINE FIELD OVERWRITE updated_at  ON author TYPE datetime DEFAULT time::now() VALUE time::now();
DEFINE INDEX OVERWRITE idx_author_slug   ON author FIELDS slug UNIQUE;
DEFINE INDEX OVERWRITE idx_author_legacy ON author FIELDS legacy_wp_id;
DEFINE INDEX OVERWRITE ft_author_name ON author FIELDS full_name FULLTEXT ANALYZER ana_text BM25;

-- BOOK (le catalogue ; ex-CPT `livres`)
DEFINE TABLE OVERWRITE book SCHEMAFULL;
DEFINE FIELD OVERWRITE title        ON book TYPE string;
DEFINE FIELD OVERWRITE subtitle     ON book TYPE option<string>;
DEFINE FIELD OVERWRITE slug         ON book TYPE string;
DEFINE FIELD OVERWRITE description_html ON book TYPE option<string>;
DEFINE FIELD OVERWRITE title_original    ON book TYPE option<string>;
DEFINE FIELD OVERWRITE language_original ON book TYPE option<string>;
DEFINE FIELD OVERWRITE status       ON book TYPE string
  ASSERT $value IN ['draft','published','forthcoming','out_of_print'] DEFAULT 'draft';
DEFINE FIELD OVERWRITE isbn_paper   ON book TYPE option<string>;   -- EAN-13 (colonne vertébrale)
DEFINE FIELD OVERWRITE isbn_ebook   ON book TYPE option<string>;
DEFINE FIELD OVERWRITE price_paper        ON book TYPE option<number>;  -- € TTC
DEFINE FIELD OVERWRITE price_ebook        ON book TYPE option<number>;
DEFINE FIELD OVERWRITE subscription_price ON book TYPE option<number>;
DEFINE FIELD OVERWRITE subscription_end   ON book TYPE option<datetime>;
DEFINE FIELD OVERWRITE published_at  ON book TYPE option<datetime>;
DEFINE FIELD OVERWRITE published_original ON book TYPE option<datetime>;
DEFINE FIELD OVERWRITE page_count    ON book TYPE option<int>;
DEFINE FIELD OVERWRITE width_cm      ON book TYPE option<number>;
DEFINE FIELD OVERWRITE height_cm     ON book TYPE option<number>;
DEFINE FIELD OVERWRITE stock_qty     ON book TYPE int DEFAULT 0;    -- autorité = sync BLDD
DEFINE FIELD OVERWRITE stock_synced_at ON book TYPE option<datetime>;
DEFINE FIELD OVERWRITE featured      ON book TYPE bool DEFAULT false;
DEFINE FIELD OVERWRITE cover         ON book TYPE option<record<media>>;
DEFINE FIELD OVERWRITE collections   ON book TYPE option<array<record<collection>>>;
DEFINE FIELD OVERWRITE vat_rate      ON book TYPE number DEFAULT 5.5; -- TVA livre France
DEFINE FIELD OVERWRITE legacy_wp_id  ON book TYPE option<int>;
DEFINE FIELD OVERWRITE created_at    ON book TYPE datetime DEFAULT time::now();
DEFINE FIELD OVERWRITE updated_at    ON book TYPE datetime DEFAULT time::now() VALUE time::now();
DEFINE INDEX OVERWRITE idx_book_slug   ON book FIELDS slug UNIQUE;
DEFINE INDEX OVERWRITE idx_book_isbn    ON book FIELDS isbn_paper;
DEFINE INDEX OVERWRITE idx_book_legacy ON book FIELDS legacy_wp_id;
DEFINE INDEX OVERWRITE idx_book_status ON book FIELDS status;
DEFINE INDEX OVERWRITE ft_book_title ON book FIELDS title FULLTEXT ANALYZER ana_text BM25;

-- ARÊTE — contribution d'un auteur à un livre, TYPÉE PAR RÔLE + part (droits d'auteur).
-- Remplace les 5 champs ACF parallèles de WordPress et pose la base des redevances.
DEFINE TABLE OVERWRITE contributed_by TYPE RELATION IN book OUT author SCHEMAFULL;
DEFINE FIELD OVERWRITE role     ON contributed_by TYPE string
  ASSERT $value IN ['author','editor','translator','preface','postface','illustrator','other'] DEFAULT 'author';
DEFINE FIELD OVERWRITE share    ON contributed_by TYPE number DEFAULT 100;  -- % du pool du rôle
DEFINE FIELD OVERWRITE position ON contributed_by TYPE int DEFAULT 0;       -- ordre des co-auteurs
DEFINE FIELD OVERWRITE created_at ON contributed_by TYPE datetime DEFAULT time::now();
DEFINE INDEX OVERWRITE idx_contrib_uniq ON contributed_by FIELDS in, out, role UNIQUE;

-- BOOK — champs complémentaires (Phase 1)
DEFINE FIELD OVERWRITE title_alt        ON book TYPE option<string>;
DEFINE FIELD OVERWRITE extra_info_html  ON book TYPE option<string>;   -- infos_additionnelles
DEFINE FIELD OVERWRITE rubriques        ON book TYPE option<array<record<rubrique>>>;
DEFINE FIELD OVERWRITE primary_collection ON book TYPE option<record<collection>>;

-- RUBRIQUE (thèmes/rayons — taxonomie partagée livres & blog)
DEFINE TABLE OVERWRITE rubrique SCHEMAFULL;
DEFINE FIELD OVERWRITE name        ON rubrique TYPE string;
DEFINE FIELD OVERWRITE slug        ON rubrique TYPE string;
DEFINE FIELD OVERWRITE kind        ON rubrique TYPE string
  ASSERT $value IN ['book','blog','both'] DEFAULT 'both';
DEFINE FIELD OVERWRITE sort        ON rubrique TYPE int DEFAULT 0;
DEFINE FIELD OVERWRITE legacy_term_id ON rubrique TYPE option<int>;
DEFINE FIELD OVERWRITE created_at  ON rubrique TYPE datetime DEFAULT time::now();
DEFINE INDEX OVERWRITE idx_rubrique_slug ON rubrique FIELDS slug UNIQUE;

-- VENUE (lieux de rencontres — RÉUTILISABLES & GÉOLOCALISÉS ; dédup par place_id/slug)
DEFINE TABLE OVERWRITE venue SCHEMAFULL;
DEFINE FIELD OVERWRITE name         ON venue TYPE string;
DEFINE FIELD OVERWRITE slug         ON venue TYPE string;
DEFINE FIELD OVERWRITE address      ON venue TYPE option<string>;      -- adresse complète formatée
DEFINE FIELD OVERWRITE street       ON venue TYPE option<string>;
DEFINE FIELD OVERWRITE city         ON venue TYPE option<string>;
DEFINE FIELD OVERWRITE post_code    ON venue TYPE option<string>;
DEFINE FIELD OVERWRITE state        ON venue TYPE option<string>;
DEFINE FIELD OVERWRITE country      ON venue TYPE option<string>;
DEFINE FIELD OVERWRITE country_short ON venue TYPE option<string>;
DEFINE FIELD OVERWRITE lat          ON venue TYPE option<number>;
DEFINE FIELD OVERWRITE lng          ON venue TYPE option<number>;
DEFINE FIELD OVERWRITE geo          ON venue TYPE option<geometry<point>>;
DEFINE FIELD OVERWRITE place_id     ON venue TYPE option<string>;      -- Google Place ID (clé de dédup)
DEFINE FIELD OVERWRITE event_count  ON venue TYPE int DEFAULT 0;       -- nb de rencontres (dénormalisé)
DEFINE FIELD OVERWRITE created_at   ON venue TYPE datetime DEFAULT time::now();
DEFINE FIELD OVERWRITE updated_at   ON venue TYPE datetime DEFAULT time::now() VALUE time::now();
DEFINE INDEX OVERWRITE idx_venue_slug  ON venue FIELDS slug UNIQUE;
DEFINE INDEX OVERWRITE idx_venue_place ON venue FIELDS place_id;
DEFINE INDEX OVERWRITE ft_venue_name   ON venue FIELDS name FULLTEXT ANALYZER ana_text BM25;

-- EVENT (rencontres) — pointe vers un venue réutilisable
DEFINE TABLE OVERWRITE event SCHEMAFULL;
DEFINE FIELD OVERWRITE title       ON event TYPE string;
DEFINE FIELD OVERWRITE slug        ON event TYPE string;
DEFINE FIELD OVERWRITE body_html   ON event TYPE option<string>;      -- description = post_content
DEFINE FIELD OVERWRITE cover       ON event TYPE option<record<media>>;
DEFINE FIELD OVERWRITE start_at    ON event TYPE option<datetime>;
DEFINE FIELD OVERWRITE end_at      ON event TYPE option<datetime>;
DEFINE FIELD OVERWRITE venue       ON event TYPE option<record<venue>>;
DEFINE FIELD OVERWRITE authors     ON event TYPE option<array<record<author>>>;
DEFINE FIELD OVERWRITE books       ON event TYPE option<array<record<book>>>;
DEFINE FIELD OVERWRITE legacy_wp_id ON event TYPE option<int>;
DEFINE FIELD OVERWRITE created_at  ON event TYPE datetime DEFAULT time::now();
DEFINE FIELD OVERWRITE updated_at  ON event TYPE datetime DEFAULT time::now() VALUE time::now();
DEFINE INDEX OVERWRITE idx_event_slug   ON event FIELDS slug UNIQUE;
DEFINE INDEX OVERWRITE idx_event_start  ON event FIELDS start_at;
DEFINE INDEX OVERWRITE idx_event_legacy ON event FIELDS legacy_wp_id;

-- ARTICLE (blog / L'Antichambre)
DEFINE TABLE OVERWRITE article SCHEMAFULL;
DEFINE FIELD OVERWRITE title        ON article TYPE string;
DEFINE FIELD OVERWRITE slug         ON article TYPE string;
DEFINE FIELD OVERWRITE body_html    ON article TYPE option<string>;
DEFINE FIELD OVERWRITE excerpt      ON article TYPE option<string>;
DEFINE FIELD OVERWRITE cover        ON article TYPE option<record<media>>;
DEFINE FIELD OVERWRITE published_at ON article TYPE option<datetime>;
DEFINE FIELD OVERWRITE rubrique     ON article TYPE option<record<rubrique>>;
DEFINE FIELD OVERWRITE is_newsletter_issue ON article TYPE bool DEFAULT false;  -- [LettrInfo NN]
DEFINE FIELD OVERWRITE authors      ON article TYPE option<array<record<author>>>;
DEFINE FIELD OVERWRITE books        ON article TYPE option<array<record<book>>>;
DEFINE FIELD OVERWRITE status       ON article TYPE string
  ASSERT $value IN ['draft','published'] DEFAULT 'published';
DEFINE FIELD OVERWRITE legacy_wp_id ON article TYPE option<int>;
DEFINE FIELD OVERWRITE created_at   ON article TYPE datetime DEFAULT time::now();
DEFINE FIELD OVERWRITE updated_at   ON article TYPE datetime DEFAULT time::now() VALUE time::now();
DEFINE INDEX OVERWRITE idx_article_slug   ON article FIELDS slug UNIQUE;
DEFINE INDEX OVERWRITE idx_article_pub    ON article FIELDS published_at;
DEFINE INDEX OVERWRITE idx_article_legacy ON article FIELDS legacy_wp_id;
DEFINE INDEX OVERWRITE ft_article_title   ON article FIELDS title FULLTEXT ANALYZER ana_text BM25;

-- PAGE (pages éditoriales statiques : à propos, contact, CGV, mentions, à paraître…)
DEFINE TABLE OVERWRITE page SCHEMAFULL;
DEFINE FIELD OVERWRITE title        ON page TYPE string;
DEFINE FIELD OVERWRITE slug         ON page TYPE string;
DEFINE FIELD OVERWRITE body_html    ON page TYPE option<string>;
DEFINE FIELD OVERWRITE status       ON page TYPE string
  ASSERT $value IN ['draft','published'] DEFAULT 'published';
DEFINE FIELD OVERWRITE legacy_wp_id ON page TYPE option<int>;
DEFINE FIELD OVERWRITE created_at   ON page TYPE datetime DEFAULT time::now();
DEFINE FIELD OVERWRITE updated_at   ON page TYPE datetime DEFAULT time::now() VALUE time::now();
DEFINE INDEX OVERWRITE idx_page_slug ON page FIELDS slug UNIQUE;

-- ══════════════════════════════════════════════════════════════
-- DROITS D'AUTEUR (Phase 4) — contrats à paliers, ventes multi-canaux, reddition
-- ══════════════════════════════════════════════════════════════

-- CANAL DE VENTE (référentiel extensible : web, bldd, + autres à venir)
DEFINE TABLE OVERWRITE sales_channel SCHEMAFULL;
DEFINE FIELD OVERWRITE code       ON sales_channel TYPE string;         -- 'web' | 'bldd' | …
DEFINE FIELD OVERWRITE name       ON sales_channel TYPE string;
DEFINE FIELD OVERWRITE sort       ON sales_channel TYPE int DEFAULT 0;
DEFINE FIELD OVERWRITE created_at ON sales_channel TYPE datetime DEFAULT time::now();
DEFINE INDEX OVERWRITE idx_channel_code ON sales_channel FIELDS code UNIQUE;

-- CONTRAT DE DROITS : par livre × contributeur (× rôle)
DEFINE TABLE OVERWRITE royalty_contract SCHEMAFULL;
DEFINE FIELD OVERWRITE book        ON royalty_contract TYPE record<book>;
DEFINE FIELD OVERWRITE author      ON royalty_contract TYPE record<author>;
DEFINE FIELD OVERWRITE role        ON royalty_contract TYPE string
  ASSERT $value IN ['author','editor','translator','preface','postface','illustrator','other'] DEFAULT 'author';
-- Barème par PALIERS (droits progressifs) : liste ordonnée { up_to?: cumul max du palier, rate: % }
--   ex. [{up_to:2000, rate:8}, {up_to:5000, rate:10}, {rate:12}]  (dernier palier sans plafond)
DEFINE FIELD OVERWRITE tiers       ON royalty_contract TYPE array<object> DEFAULT [];
DEFINE FIELD OVERWRITE tiers.*.up_to ON royalty_contract TYPE option<int>;
DEFINE FIELD OVERWRITE tiers.*.rate  ON royalty_contract TYPE number;
-- Périmètre & base de calcul
DEFINE FIELD OVERWRITE scope       ON royalty_contract TYPE string
  ASSERT $value IN ['paper','ebook','all'] DEFAULT 'all';
DEFINE FIELD OVERWRITE base        ON royalty_contract TYPE string
  ASSERT $value IN ['ppht','ppttc','net'] DEFAULT 'ppht';   -- prix public HT / TTC / net éditeur
DEFINE FIELD OVERWRITE net_rate    ON royalty_contract TYPE number DEFAULT 60;  -- % du prix public si base='net'
-- À-valoir / avance
DEFINE FIELD OVERWRITE advance          ON royalty_contract TYPE number DEFAULT 0;   -- montant à-valoir
DEFINE FIELD OVERWRITE advance_recouped ON royalty_contract TYPE number DEFAULT 0;   -- déjà récupéré (cumul)
DEFINE FIELD OVERWRITE min_guarantee    ON royalty_contract TYPE option<number>;
DEFINE FIELD OVERWRITE signed_at   ON royalty_contract TYPE option<datetime>;
DEFINE FIELD OVERWRITE term_start  ON royalty_contract TYPE option<datetime>;
DEFINE FIELD OVERWRITE term_end    ON royalty_contract TYPE option<datetime>;
DEFINE FIELD OVERWRITE document    ON royalty_contract TYPE option<record<media>>;   -- contrat scanné
DEFINE FIELD OVERWRITE status      ON royalty_contract TYPE string
  ASSERT $value IN ['draft','active','ended'] DEFAULT 'active';
DEFINE FIELD OVERWRITE notes       ON royalty_contract TYPE option<string>;
DEFINE FIELD OVERWRITE created_at  ON royalty_contract TYPE datetime DEFAULT time::now();
DEFINE FIELD OVERWRITE updated_at  ON royalty_contract TYPE datetime DEFAULT time::now() VALUE time::now();
DEFINE INDEX OVERWRITE idx_contract_book   ON royalty_contract FIELDS book;
DEFINE INDEX OVERWRITE idx_contract_author ON royalty_contract FIELDS author;
DEFINE INDEX OVERWRITE idx_contract_uniq   ON royalty_contract FIELDS book, author, role UNIQUE;

-- RELEVÉ DE VENTES : une période × un canal (import ou saisie)
DEFINE TABLE OVERWRITE sales_report SCHEMAFULL;
DEFINE FIELD OVERWRITE channel      ON sales_report TYPE record<sales_channel>;
DEFINE FIELD OVERWRITE period_start ON sales_report TYPE datetime;
DEFINE FIELD OVERWRITE period_end   ON sales_report TYPE datetime;
DEFINE FIELD OVERWRITE label        ON sales_report TYPE option<string>;
DEFINE FIELD OVERWRITE source_file  ON sales_report TYPE option<record<media>>;
DEFINE FIELD OVERWRITE imported_at  ON sales_report TYPE datetime DEFAULT time::now();
DEFINE FIELD OVERWRITE created_at   ON sales_report TYPE datetime DEFAULT time::now();
DEFINE INDEX OVERWRITE idx_report_period ON sales_report FIELDS period_start, period_end;

-- LIGNE DE VENTE : un livre × relevé (unités vendues / retournées / SP)
DEFINE TABLE OVERWRITE sales_line SCHEMAFULL;
DEFINE FIELD OVERWRITE report         ON sales_line TYPE record<sales_report>;
DEFINE FIELD OVERWRITE book           ON sales_line TYPE option<record<book>>;  -- résolu par ISBN
DEFINE FIELD OVERWRITE isbn           ON sales_line TYPE option<string>;
DEFINE FIELD OVERWRITE format         ON sales_line TYPE string
  ASSERT $value IN ['paper','ebook','souscription'] DEFAULT 'paper';
DEFINE FIELD OVERWRITE units_sold     ON sales_line TYPE int DEFAULT 0;
DEFINE FIELD OVERWRITE units_returned ON sales_line TYPE int DEFAULT 0;
DEFINE FIELD OVERWRITE units_free     ON sales_line TYPE int DEFAULT 0;   -- SP / service de presse
DEFINE FIELD OVERWRITE gross_price    ON sales_line TYPE option<number>;  -- prix unitaire de référence
DEFINE FIELD OVERWRITE created_at     ON sales_line TYPE datetime DEFAULT time::now();
DEFINE INDEX OVERWRITE idx_saleline_report ON sales_line FIELDS report;
DEFINE INDEX OVERWRITE idx_saleline_book   ON sales_line FIELDS book;

-- REDDITION DE COMPTES : un état par auteur × période
DEFINE TABLE OVERWRITE royalty_statement SCHEMAFULL;
DEFINE FIELD OVERWRITE author       ON royalty_statement TYPE record<author>;
DEFINE FIELD OVERWRITE period_start ON royalty_statement TYPE datetime;
DEFINE FIELD OVERWRITE period_end   ON royalty_statement TYPE datetime;
DEFINE FIELD OVERWRITE status       ON royalty_statement TYPE string
  ASSERT $value IN ['draft','issued','paid'] DEFAULT 'draft';
-- lignes détaillées (snapshot du calcul)
DEFINE FIELD OVERWRITE lines            ON royalty_statement TYPE array<object> DEFAULT [];
DEFINE FIELD OVERWRITE lines.*.contract        ON royalty_statement TYPE option<string>;
DEFINE FIELD OVERWRITE lines.*.book            ON royalty_statement TYPE option<string>;
DEFINE FIELD OVERWRITE lines.*.book_title       ON royalty_statement TYPE option<string>;
DEFINE FIELD OVERWRITE lines.*.role            ON royalty_statement TYPE option<string>;
DEFINE FIELD OVERWRITE lines.*.units           ON royalty_statement TYPE option<number>;
DEFINE FIELD OVERWRITE lines.*.base_amount      ON royalty_statement TYPE option<number>;
DEFINE FIELD OVERWRITE lines.*.rate            ON royalty_statement TYPE option<number>;
DEFINE FIELD OVERWRITE lines.*.gross           ON royalty_statement TYPE option<number>;
DEFINE FIELD OVERWRITE lines.*.advance_applied  ON royalty_statement TYPE option<number>;
DEFINE FIELD OVERWRITE lines.*.net             ON royalty_statement TYPE option<number>;
DEFINE FIELD OVERWRITE gross_total      ON royalty_statement TYPE number DEFAULT 0;
DEFINE FIELD OVERWRITE advance_applied  ON royalty_statement TYPE number DEFAULT 0;
DEFINE FIELD OVERWRITE total_due        ON royalty_statement TYPE number DEFAULT 0;
DEFINE FIELD OVERWRITE issued_at    ON royalty_statement TYPE option<datetime>;
DEFINE FIELD OVERWRITE paid_at      ON royalty_statement TYPE option<datetime>;
DEFINE FIELD OVERWRITE document     ON royalty_statement TYPE option<record<media>>;
DEFINE FIELD OVERWRITE created_at   ON royalty_statement TYPE datetime DEFAULT time::now();
DEFINE FIELD OVERWRITE updated_at   ON royalty_statement TYPE datetime DEFAULT time::now() VALUE time::now();
DEFINE INDEX OVERWRITE idx_statement_author ON royalty_statement FIELDS author;
DEFINE INDEX OVERWRITE idx_statement_period ON royalty_statement FIELDS period_start, period_end;

-- ══════════════════════════════════════════════════════════════
-- COMMERCE (Phase 2) — commandes, lignes, ebooks, bibliothèque
-- ══════════════════════════════════════════════════════════════

-- COMMANDE
DEFINE TABLE OVERWRITE order SCHEMAFULL;
DEFINE FIELD OVERWRITE number       ON order TYPE int;                 -- séquentiel (compteur site_setting)
DEFINE FIELD OVERWRITE customer     ON order TYPE option<record<user>>;
DEFINE FIELD OVERWRITE email        ON order TYPE option<string>;
DEFINE FIELD OVERWRITE status       ON order TYPE string
  ASSERT $value IN ['pending','paid','processing','sent_to_bl','completed','cancelled','refunded','failed'] DEFAULT 'pending';
DEFINE FIELD OVERWRITE currency     ON order TYPE string DEFAULT 'EUR';
DEFINE FIELD OVERWRITE billing      ON order TYPE option<object> FLEXIBLE;
DEFINE FIELD OVERWRITE shipping     ON order TYPE option<object> FLEXIBLE;
DEFINE FIELD OVERWRITE item_count   ON order TYPE int DEFAULT 0;
DEFINE FIELD OVERWRITE subtotal     ON order TYPE number DEFAULT 0;
DEFINE FIELD OVERWRITE shipping_total ON order TYPE number DEFAULT 0;
DEFINE FIELD OVERWRITE tax_total    ON order TYPE number DEFAULT 0;
DEFINE FIELD OVERWRITE total        ON order TYPE number DEFAULT 0;
DEFINE FIELD OVERWRITE has_ebook    ON order TYPE bool DEFAULT false;
DEFINE FIELD OVERWRITE has_physical ON order TYPE bool DEFAULT false;
DEFINE FIELD OVERWRITE stripe_session        ON order TYPE option<string>;
DEFINE FIELD OVERWRITE stripe_payment_intent ON order TYPE option<string>;
DEFINE FIELD OVERWRITE invoice_number ON order TYPE option<int>;
DEFINE FIELD OVERWRITE bl_exported_at ON order TYPE option<datetime>;
DEFINE FIELD OVERWRITE paid_at      ON order TYPE option<datetime>;
DEFINE FIELD OVERWRITE completed_at ON order TYPE option<datetime>;
DEFINE FIELD OVERWRITE created_at   ON order TYPE datetime DEFAULT time::now();
DEFINE FIELD OVERWRITE updated_at   ON order TYPE datetime DEFAULT time::now() VALUE time::now();
DEFINE FIELD OVERWRITE legacy_wp_id ON order TYPE option<int>;
DEFINE INDEX OVERWRITE idx_order_number  ON order FIELDS number UNIQUE;
DEFINE INDEX OVERWRITE idx_order_customer ON order FIELDS customer;
DEFINE INDEX OVERWRITE idx_order_status  ON order FIELDS status;
DEFINE INDEX OVERWRITE idx_order_legacy  ON order FIELDS legacy_wp_id;

-- ARÊTE — une ligne de commande (order -> book)
DEFINE TABLE OVERWRITE contains TYPE RELATION IN order OUT book SCHEMAFULL;
DEFINE FIELD OVERWRITE format         ON contains TYPE string
  ASSERT $value IN ['papier','epub','souscription'] DEFAULT 'papier';
DEFINE FIELD OVERWRITE qty            ON contains TYPE int DEFAULT 1;
DEFINE FIELD OVERWRITE unit_price     ON contains TYPE number DEFAULT 0;
DEFINE FIELD OVERWRITE line_total     ON contains TYPE number DEFAULT 0;
DEFINE FIELD OVERWRITE title_snapshot ON contains TYPE option<string>;
DEFINE FIELD OVERWRITE isbn_snapshot  ON contains TYPE option<string>;

-- EBOOK (fichier .epub/.pdf hébergé sur R2 PRIVÉ)
DEFINE TABLE OVERWRITE ebook_asset SCHEMAFULL;
DEFINE FIELD OVERWRITE book         ON ebook_asset TYPE record<book>;
DEFINE FIELD OVERWRITE format       ON ebook_asset TYPE string ASSERT $value IN ['epub','pdf'] DEFAULT 'epub';
DEFINE FIELD OVERWRITE r2_key       ON ebook_asset TYPE string;
DEFINE FIELD OVERWRITE filename     ON ebook_asset TYPE option<string>;
DEFINE FIELD OVERWRITE size         ON ebook_asset TYPE option<int>;
DEFINE FIELD OVERWRITE content_type ON ebook_asset TYPE option<string>;
DEFINE FIELD OVERWRITE status       ON ebook_asset TYPE string
  ASSERT $value IN ['available','announced_no_file'] DEFAULT 'available';
DEFINE FIELD OVERWRITE legacy_attachment_id ON ebook_asset TYPE option<int>;
DEFINE FIELD OVERWRITE created_at   ON ebook_asset TYPE datetime DEFAULT time::now();
DEFINE INDEX OVERWRITE idx_ebook_book ON ebook_asset FIELDS book;

-- ARÊTE — droit d'accès (bibliothèque) : user possède un ebook
DEFINE TABLE OVERWRITE owns TYPE RELATION IN user OUT ebook_asset SCHEMAFULL;
DEFINE FIELD OVERWRITE order       ON owns TYPE option<record<order>>;
DEFINE FIELD OVERWRITE acquired_at ON owns TYPE datetime DEFAULT time::now();
DEFINE INDEX OVERWRITE idx_owns_uniq ON owns FIELDS in, out UNIQUE;

-- JOURNAL DE TÉLÉCHARGEMENT
DEFINE TABLE OVERWRITE download_log SCHEMAFULL;
DEFINE FIELD OVERWRITE user        ON download_log TYPE option<record<user>>;
DEFINE FIELD OVERWRITE ebook_asset ON download_log TYPE record<ebook_asset>;
DEFINE FIELD OVERWRITE at          ON download_log TYPE datetime DEFAULT time::now();
DEFINE FIELD OVERWRITE ip          ON download_log TYPE option<string>;

-- ══════════════════════════════════════════════════════════════
-- BELLES LETTRES (Phase 3) — stock (import) & expéditions EDI (export)
-- ══════════════════════════════════════════════════════════════

-- Mouvement de stock (audit de chaque sync BLDD)
DEFINE TABLE OVERWRITE stock_movement SCHEMAFULL;
DEFINE FIELD OVERWRITE book       ON stock_movement TYPE option<record<book>>;
DEFINE FIELD OVERWRITE isbn       ON stock_movement TYPE option<string>;
DEFINE FIELD OVERWRITE old_qty    ON stock_movement TYPE int DEFAULT 0;
DEFINE FIELD OVERWRITE new_qty    ON stock_movement TYPE int DEFAULT 0;
DEFINE FIELD OVERWRITE delta      ON stock_movement TYPE int DEFAULT 0;
DEFINE FIELD OVERWRITE source     ON stock_movement TYPE string DEFAULT 'bldd';
DEFINE FIELD OVERWRITE synced_at  ON stock_movement TYPE datetime DEFAULT time::now();
DEFINE INDEX OVERWRITE idx_movement_book ON stock_movement FIELDS book;
DEFINE INDEX OVERWRITE idx_movement_at   ON stock_movement FIELDS synced_at;

-- Fichier d'export EDI vers les Belles Lettres (une ligne par fichier généré)
DEFINE TABLE OVERWRITE bl_export SCHEMAFULL;
DEFINE FIELD OVERWRITE filename    ON bl_export TYPE string;           -- CDAGO{YmdHis}.txt
DEFINE FIELD OVERWRITE body        ON bl_export TYPE string;           -- contenu EDI complet
DEFINE FIELD OVERWRITE order_count ON bl_export TYPE int DEFAULT 0;
DEFINE FIELD OVERWRITE book_count  ON bl_export TYPE int DEFAULT 0;
DEFINE FIELD OVERWRITE order_refs  ON bl_export TYPE option<array<string>>;
DEFINE FIELD OVERWRITE status      ON bl_export TYPE string
  ASSERT $value IN ['staged','uploaded','failed'] DEFAULT 'staged';   -- 'uploaded' seulement en prod
DEFINE FIELD OVERWRITE dry_run     ON bl_export TYPE bool DEFAULT true;
DEFINE FIELD OVERWRITE created_at  ON bl_export TYPE datetime DEFAULT time::now();
DEFINE FIELD OVERWRITE uploaded_at ON bl_export TYPE option<datetime>;
DEFINE INDEX OVERWRITE idx_blexport_at ON bl_export FIELDS created_at;
