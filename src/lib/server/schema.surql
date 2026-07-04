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
DEFINE FIELD OVERWRITE billing        ON user TYPE option<object>;
DEFINE FIELD OVERWRITE shipping       ON user TYPE option<object>;
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
