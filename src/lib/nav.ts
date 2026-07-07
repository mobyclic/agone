/**
 * Configuration de navigation (site monolingue : libellés en clair).
 */
export interface NavItem {
  label: string;
  href: string;
  icon?: string; // nom d'icône phosphor (ex: 'BookOpen')
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

/** Back-office (/admin). */
export const ADMIN_NAV: NavItem[] = [
  { label: 'Tableau de bord', href: '/admin', icon: 'SquaresFour' },
  { label: 'Antichambre', href: '/admin/contenu', icon: 'Article' },
  { label: 'Catalogue', href: '/admin/catalogue', icon: 'BookOpen' },
  { label: 'Auteurs', href: '/admin/auteurs', icon: 'PenNib' },
  { label: 'Rencontres', href: '/admin/rencontres', icon: 'CalendarDots' },
  { label: 'Utilisateurs', href: '/admin/utilisateurs', icon: 'Users' },
  { label: 'Commandes', href: '/admin/commandes', icon: 'Receipt' },
  { label: 'Statistiques', href: '/admin/statistiques', icon: 'ChartBar' },
  { label: 'Newsletter', href: '/admin/newsletter', icon: 'EnvelopeSimple' },
  { label: 'Droits d’auteur', href: '/admin/droits', icon: 'Coins' },
  { label: 'Paramètres', href: '/admin/parametres', icon: 'GearSix' }
];
