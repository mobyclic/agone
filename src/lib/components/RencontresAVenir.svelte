<script lang="ts">
  /** Bloc de colonne latérale : rencontres à venir liées à la fiche (livre ou auteur). */
  import { MapPin } from 'phosphor-svelte';
  interface Rencontre { slug: string; title: string; start_at?: string; venue_name?: string; venue_city?: string }
  let { rencontres }: { rencontres: Rencontre[] } = $props();

  const jour = (s?: string) => (s ? new Date(s).getDate() : '');
  const mois = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '') : '');
  const heure = (s?: string) => {
    if (!s) return '';
    const d = new Date(s);
    return d.getHours() || d.getMinutes() ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
  };
  // Trois d'abord : au-delà, le bloc repoussait les livres hors de vue.
  const VISIBLES = 3;
  let tout = $state(false);
  const jourSemaine = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { weekday: 'long' }) : '');
</script>

{#if rencontres.length}
  <div>
    <div class="tick-label mb-3">Rencontre{rencontres.length > 1 ? 's' : ''} à venir</div>
    <ul class="max-w-[400px] divide-y divide-border border-y border-border">
      {#each tout ? rencontres : rencontres.slice(0, VISIBLES) as r (r.slug)}
        <li>
          <a href="/rencontres/{r.slug}" class="group flex items-baseline gap-4 py-3">
            <span class="flex w-11 shrink-0 flex-col font-display leading-none">
              <span class="text-3xl font-bold text-link">{jour(r.start_at)}</span>
              <span class="mt-1 text-xs uppercase text-muted-foreground">{mois(r.start_at)}</span>
            </span>
            <span class="min-w-0">
              <span class="block font-display text-base font-medium uppercase leading-tight group-hover:underline group-hover:underline-offset-4">{r.title}</span>
              <span class="mt-1 block text-xs text-muted-foreground">
                <span class="first-letter:uppercase">{jourSemaine(r.start_at)}</span>{#if heure(r.start_at)}{' '}· {heure(r.start_at)}{/if}
                {#if r.venue_name}<br /><MapPin size={11} class="mb-0.5 mr-0.5 inline" />{r.venue_name}{r.venue_city ? `, ${r.venue_city}` : ''}{/if}
              </span>
            </span>
          </a>
        </li>
      {/each}
    </ul>
    {#if rencontres.length > VISIBLES}
      <button type="button" onclick={() => (tout = !tout)} class="link mt-2 font-display text-sm uppercase tracking-wide">
        {tout ? 'Réduire' : `+ ${rencontres.length - VISIBLES} autre${rencontres.length - VISIBLES > 1 ? 's' : ''} rencontre${rencontres.length - VISIBLES > 1 ? 's' : ''}`}
      </button>
    {/if}
  </div>
{/if}
