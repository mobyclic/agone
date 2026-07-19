/**
 * Référentiel de pays (codes ISO-2 + nom FR) pour la livraison.
 * Liste ciblée : France, Union européenne et principales destinations.
 */
export interface Country {
  code: string;
  name: string;
}

export const COUNTRIES: Country[] = [
  { code: 'FR', name: 'France' },
  { code: 'BE', name: 'Belgique' },
  { code: 'CH', name: 'Suisse' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'DE', name: 'Allemagne' },
  { code: 'AT', name: 'Autriche' },
  { code: 'BG', name: 'Bulgarie' },
  { code: 'CY', name: 'Chypre' },
  { code: 'HR', name: 'Croatie' },
  { code: 'DK', name: 'Danemark' },
  { code: 'ES', name: 'Espagne' },
  { code: 'EE', name: 'Estonie' },
  { code: 'FI', name: 'Finlande' },
  { code: 'GR', name: 'Grèce' },
  { code: 'HU', name: 'Hongrie' },
  { code: 'IE', name: 'Irlande' },
  { code: 'IT', name: 'Italie' },
  { code: 'LV', name: 'Lettonie' },
  { code: 'LT', name: 'Lituanie' },
  { code: 'MT', name: 'Malte' },
  { code: 'NL', name: 'Pays-Bas' },
  { code: 'PL', name: 'Pologne' },
  { code: 'PT', name: 'Portugal' },
  { code: 'CZ', name: 'Tchéquie' },
  { code: 'RO', name: 'Roumanie' },
  { code: 'SK', name: 'Slovaquie' },
  { code: 'SI', name: 'Slovénie' },
  { code: 'SE', name: 'Suède' },
  { code: 'GB', name: 'Royaume-Uni' },
  { code: 'NO', name: 'Norvège' },
  { code: 'IS', name: 'Islande' },
  { code: 'CA', name: 'Canada' },
  { code: 'US', name: 'États-Unis' },
  { code: 'MA', name: 'Maroc' },
  { code: 'DZ', name: 'Algérie' },
  { code: 'TN', name: 'Tunisie' },
  { code: 'SN', name: 'Sénégal' },
  { code: 'CI', name: "Côte d'Ivoire" },
  { code: 'CM', name: 'Cameroun' },
  { code: 'JP', name: 'Japon' },
  { code: 'AU', name: 'Australie' },
  { code: 'BR', name: 'Brésil' }
];

const NAME_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c.name]));
export const countryName = (code?: string) => (code ? NAME_BY_CODE.get(code) ?? code : '');
