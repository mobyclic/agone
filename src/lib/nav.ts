/**
 * Configuration de navigation (site monolingue : libellés en clair).
 */
export interface NavItem {
  label: string;
  href: string;
  icon?: string; // nom d'icône phosphor (ex: 'BookOpen')
}

/** Groupe de navigation (titre de section optionnel). */
export interface NavSection {
  title?: string;
  items: NavItem[];
}

/** Navigation publique principale. */
export const PUBLIC_NAV: NavItem[] = [
  { label: 'Catalogue', href: '/catalogue', icon: 'BookOpen' },
  { label: 'Auteurs', href: '/auteurs', icon: 'Users' },
  { label: 'Rencontres', href: '/rencontres', icon: 'CalendarDots' },
  { label: 'L’Antichambre', href: '/antichambre', icon: 'Article' },
  { label: 'À propos', href: '/a-propos', icon: 'Info' }
];

/** Espace client connecté (/compte). */
export const ACCOUNT_NAV: NavItem[] = [
  { label: 'Ma bibliothèque', href: '/compte/bibliotheque', icon: 'BookOpen' },
  { label: 'Mes commandes', href: '/compte/commandes', icon: 'Receipt' },
  { label: 'Mon profil', href: '/compte/profil', icon: 'User' }
];

/** Back-office (/admin) — organisé en sections. */
export const ADMIN_NAV: NavSection[] = [
  { items: [{ label: 'Tableau de bord', href: '/admin', icon: 'SquaresFour' }] },
  {
    title: 'Antichambre',
    items: [
      { label: 'Articles', href: '/admin/articles', icon: 'Article' },
      { label: 'Catégories', href: '/admin/categories', icon: 'Tag' },
      { label: 'Rencontres', href: '/admin/rencontres', icon: 'CalendarDots' }
    ]
  },
  {
    title: 'Catalogue',
    items: [
      { label: 'Livres', href: '/admin/catalogue', icon: 'BookOpen' },
      { label: 'Collections', href: '/admin/collections', icon: 'Books' },
      { label: 'Auteurs', href: '/admin/auteurs', icon: 'PenNib' }
    ]
  },
  {
    title: 'Boutique',
    items: [
      { label: 'Commandes', href: '/admin/commandes', icon: 'Receipt' },
      { label: 'Utilisateurs', href: '/admin/utilisateurs', icon: 'Users' },
      { label: 'Codes promo', href: '/admin/promos', icon: 'Percent' },
      { label: 'Livraison', href: '/admin/livraison', icon: 'Truck' },
      { label: 'Facturation', href: '/admin/factures', icon: 'Invoice' },
      { label: 'Statistiques', href: '/admin/statistiques', icon: 'ChartBar' }
    ]
  },
  {
    title: 'Outils',
    items: [
      { label: 'Newsletter', href: '/admin/newsletter', icon: 'EnvelopeSimple' },
      { label: 'Droits d’auteur', href: '/admin/droits', icon: 'Coins' },
      { label: 'Paramètres', href: '/admin/parametres', icon: 'GearSix' }
    ]
  }
];
