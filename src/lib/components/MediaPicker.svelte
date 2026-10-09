<script lang="ts">
  /**
   * Choisir une image dans la médiathèque : une fenêtre avec recherche et
   * vignettes ; `onselect` reçoit { id, url }. Complète ImageUpload (dépôt d'un
   * nouveau fichier) là où une image existante peut servir (réclames…).
   */
  import { Images, MagnifyingGlass, X } from 'phosphor-svelte';
  let { onselect, label = 'Choisir dans la médiathèque' }: { onselect: (m: { id: string; url: string }) => void; label?: string } = $props();
  let open = $state(false);
  let q = $state('');
  let medias = $state<{ id: string; url: string; nom: string; alt?: string; usage: string; liens: string[] }[]>([]);
  let total = $state(0);
  let page = $state(1);
  let loading = $state(false);
  let timer: ReturnType<typeof setTimeout>;
  async function charger() {
    loading = true;
    try {
      const r = await fetch(`/admin/api/medias?q=${encodeURIComponent(q)}&page=${page}`);
      const d = r.ok ? await r.json() : { medias: [], total: 0 };
      medias = d.medias; total = d.total;
    } catch { medias = []; } finally { loading = false; }
  }
  const ouvrir = () => { open = true; page = 1; charger(); };
  const chercher = () => { clearTimeout(timer); timer = setTimeout(() => { page = 1; charger(); }, 220); };
  const choisir = (m: { id: string; url: string }) => { onselect({ id: m.id, url: m.url }); open = false; };
</script>

<button type="button" onclick={ouvrir} class="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm hover:bg-muted"><Images size={16} /> {label}</button>

{#if open}
  <div class="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[8vh]" role="dialog" aria-modal="true" aria-label="Médiathèque">
    <button type="button" class="absolute inset-0 cursor-default bg-black/50" aria-label="Fermer" onclick={() => (open = false)}></button>
    <div class="relative z-10 flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl">
      <div class="flex items-center gap-3 border-b border-border px-4">
        <MagnifyingGlass size={16} class="shrink-0 text-muted-foreground" />
        <input bind:value={q} oninput={chercher} placeholder="Nom de fichier, légende…" autocomplete="off" class="h-12 flex-1 bg-transparent text-sm outline-none" />
        <span class="text-xs text-muted-foreground">{total} image{total > 1 ? 's' : ''}</span>
        <button type="button" onclick={() => (open = false)} class="grid size-8 place-items-center text-muted-foreground hover:text-foreground" aria-label="Fermer"><X size={18} /></button>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto p-4">
        {#if loading && !medias.length}
          <p class="py-10 text-center text-sm text-muted-foreground">Chargement…</p>
        {:else if !medias.length}
          <p class="py-10 text-center text-sm text-muted-foreground">Aucune image.</p>
        {:else}
          <div class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {#each medias as m (m.id)}
              <button type="button" onclick={() => choisir(m)} class="group text-left" title={[m.nom, ...m.liens].join(' · ')}>
                <span class="block aspect-square overflow-hidden rounded-md border border-border bg-muted group-hover:border-foreground"><img src={m.url} alt={m.alt ?? ''} loading="lazy" class="size-full object-cover" /></span>
                <span class="mt-1 block truncate text-[11px] text-muted-foreground">{m.liens[0] ?? m.nom}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
      {#if total > 36}
        <div class="flex items-center justify-between border-t border-border px-4 py-2 text-sm">
          <button type="button" disabled={page <= 1} onclick={() => { page--; charger(); }} class="text-muted-foreground hover:text-foreground disabled:opacity-40">← Précédentes</button>
          <span class="text-xs text-muted-foreground">page {page} / {Math.ceil(total / 36)}</span>
          <button type="button" disabled={page * 36 >= total} onclick={() => { page++; charger(); }} class="text-muted-foreground hover:text-foreground disabled:opacity-40">Suivantes →</button>
        </div>
      {/if}
    </div>
  </div>
{/if}
