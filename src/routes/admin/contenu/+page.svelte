<script lang="ts">
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { Plus, MagnifyingGlass, Trash, Tag } from 'phosphor-svelte';
  import { CONTENT_STATUS_LABEL } from '$lib/labels';

  let { data, form } = $props();
  const pageCount = $derived(Math.max(1, Math.ceil(data.total / data.limit)));
  const dateFr = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

  let q = $state(untrack(() => data.q ?? ''));
  let timer: ReturnType<typeof setTimeout>;
  function nav(params: Record<string, string | number | undefined>) {
    const merged: Record<string, string | number | undefined> = { q, status: data.status, rubrique: data.rubrique, page: data.page, ...params };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === '' || (k === 'page' && v === 1)) continue;
      sp.set(k, String(v));
    }
    const s = sp.toString();
    goto(`/admin/contenu${s ? `?${s}` : ''}`, { keepFocus: true, replaceState: true, noScroll: true });
  }
  function onSearch() {
    clearTimeout(timer);
    timer = setTimeout(() => nav({ q, page: 1 }), 220);
  }

  const input = 'h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-primary';
</script>

<svelte:head><title>Contenu · Admin Agone</title></svelte:head>

<div class="mb-5 flex flex-wrap items-center justify-between gap-3">
  <div>
    <h2 class="text-xl font-bold">L'Antichambre</h2>
    <p class="text-sm text-muted-foreground">{data.total} article{data.total > 1 ? 's' : ''}</p>
  </div>
  <Button href="/admin/contenu/nouveau"><Plus size={16} /> Nouvel article</Button>
</div>

<div class="grid gap-6 lg:grid-cols-[1fr_320px]">
  <!-- Articles -->
  <div>
    <div class="mb-4 flex flex-wrap gap-2">
      <div class="relative min-w-[200px] flex-1">
        <MagnifyingGlass size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input bind:value={q} oninput={onSearch} placeholder="Rechercher un titre…" autocomplete="off"
          class="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary" />
      </div>
      <select value={data.status ?? ''} onchange={(e) => nav({ status: e.currentTarget.value || undefined, page: 1 })}
        class="h-10 rounded-md border border-border bg-background px-3 text-sm">
        <option value="">Tous</option>
        <option value="published">Publiés</option>
        <option value="draft">Brouillons</option>
      </select>
      <select value={data.rubrique ?? ''} onchange={(e) => nav({ rubrique: e.currentTarget.value || undefined, page: 1 })}
        class="h-10 rounded-md border border-border bg-background px-3 text-sm">
        <option value="">Toutes rubriques</option>
        {#each data.rubriques as r (r.id)}<option value={r.slug}>{r.name}</option>{/each}
      </select>
    </div>

    <div class="overflow-x-auto rounded-lg border border-border bg-card">
      <table class="w-full text-sm">
        <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th class="px-3 py-2 font-medium">Titre</th>
            <th class="px-3 py-2 font-medium">Rubrique</th>
            <th class="px-3 py-2 font-medium">Statut</th>
            <th class="px-3 py-2 text-right font-medium">Date</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          {#each data.articles as a (a.id)}
            <tr class="hover:bg-muted/30">
              <td class="px-3 py-2">
                <a href="/admin/contenu/{a.id}" class="font-medium hover:text-link">{a.title}</a>
                {#if a.is_newsletter_issue}<span class="ml-1.5 rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">LettrInfo</span>{/if}
                {#if a.author}<div class="text-xs text-muted-foreground">{a.author}</div>{/if}
              </td>
              <td class="px-3 py-2 text-muted-foreground">{a.rubrique_name ?? '—'}</td>
              <td class="px-3 py-2">
                <span class="rounded px-2 py-0.5 text-xs font-medium {a.status === 'published' ? 'bg-success/15 text-success' : 'bg-secondary text-muted-foreground'}">{CONTENT_STATUS_LABEL[a.status] ?? a.status}</span>
              </td>
              <td class="px-3 py-2 text-right text-muted-foreground">{dateFr(a.published_at)}</td>
            </tr>
          {/each}
          {#if data.articles.length === 0}
            <tr><td colspan="4" class="px-3 py-10 text-center text-muted-foreground">Aucun article.</td></tr>
          {/if}
        </tbody>
      </table>
    </div>

    {#if pageCount > 1}
      <div class="mt-6 flex items-center justify-center gap-2 text-sm">
        {#if data.page > 1}<button type="button" onclick={() => nav({ page: data.page - 1 })} class="rounded-md border border-border px-3 py-2 hover:bg-muted">←</button>{/if}
        <span class="px-3 py-2 text-muted-foreground">Page {data.page} / {pageCount}</span>
        {#if data.page < pageCount}<button type="button" onclick={() => nav({ page: data.page + 1 })} class="rounded-md border border-border px-3 py-2 hover:bg-muted">→</button>{/if}
      </div>
    {/if}
  </div>

  <!-- Rubriques -->
  <aside>
    <div class="mb-3 flex items-center gap-2">
      <Tag size={18} class="text-link" />
      <h3 class="text-base font-semibold">Rubriques</h3>
    </div>
    {#if form?.rubError}<p class="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{form.rubError}</p>{/if}

    <div class="space-y-2">
      {#each data.rubriques as r (r.id)}
        <div class="rounded-lg border border-border bg-card p-2.5">
          <form method="POST" action="?/saveRubrique" use:enhance class="flex items-center gap-1.5">
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="sort" value={r.sort} />
            <input type="hidden" name="kind" value={r.kind} />
            <input name="name" value={r.name} class={input} />
            <button type="submit" class="shrink-0 rounded-md border border-border px-2 py-1.5 text-xs hover:bg-muted" title="Renommer">OK</button>
          </form>
          <div class="mt-1.5 flex items-center justify-between px-0.5 text-xs text-muted-foreground">
            <span>{r.count} article{r.count > 1 ? 's' : ''} · <span class="font-mono">{r.slug}</span></span>
            {#if r.count === 0}
              <form method="POST" action="?/deleteRubrique" use:enhance>
                <input type="hidden" name="id" value={r.id} />
                <button type="submit" class="text-destructive hover:underline" title="Supprimer"><Trash size={13} /></button>
              </form>
            {/if}
          </div>
        </div>
      {/each}
    </div>

    <form method="POST" action="?/saveRubrique" use:enhance class="mt-3 rounded-lg border border-dashed border-border p-3">
      <p class="mb-2 text-xs font-medium text-muted-foreground">Nouvelle rubrique</p>
      <input name="name" placeholder="Nom de la rubrique" class="{input} mb-2" required />
      <input type="hidden" name="kind" value="blog" />
      <Button type="submit" variant="outline" size="sm" class="w-full"><Plus size={14} /> Ajouter</Button>
    </form>
  </aside>
</div>
