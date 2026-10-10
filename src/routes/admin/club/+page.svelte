<script lang="ts">
  /**
   * Le club : réglages (prix, remise sur le fonds, port offert), membres, et
   * adhésions enregistrées à la main (chèque sur un salon, adhésion offerte).
   * Les adhésions payées en ligne arrivent toutes seules (Stripe).
   */
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import { Button } from '$lib/components/ui/button';
  import SearchSelect from '$lib/components/SearchSelect.svelte';
  import { FloppyDisk, UserPlus, MagnifyingGlass, ArrowSquareOut } from 'phosphor-svelte';
  import { euros } from '$lib/labels';
  let { data, form } = $props();
  $effect(() => { if (form?.error) toast.error(form.error); });
  const c = $derived(data.club);
  let source = $state('manuel');
  let membre = $state<{ id: string; label: string } | null>(null);
  let q = $state(untrack(() => data.q));
  let timer: ReturnType<typeof setTimeout>;
  const nav = (p: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const m = { etat: data.etat === 'actives' ? undefined : data.etat, q: q || undefined, ...p };
    for (const [k, v] of Object.entries(m)) if (v) sp.set(k, v);
    goto(`/admin/club${sp.size ? `?${sp}` : ''}`, { keepFocus: true, replaceState: true, noScroll: true });
  };
  const dateFr = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const SOURCE: Record<string, string> = { stripe: 'en ligne', manuel: 'à la main', offert: 'offerte' };
  const label = 'mb-1 block text-sm font-medium';
  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const aujourdhui = new Date().toISOString().slice(0, 10);
</script>

<svelte:head><title>Le club · Admin Agone</title></svelte:head>

<div class="mb-5 flex flex-wrap items-end justify-between gap-3">
  <div>
    <h2 class="text-xl font-bold">{c.nom}</h2>
    <p class="text-sm text-muted-foreground">
      {c.active ? 'Ouvert' : 'Fermé (page publique masquée)'} · {euros(c.prix_ttc)} TTC pour {c.duree_mois} mois · −{c.remise} % sur le fonds (parus depuis plus de {c.fond_ans} an{c.fond_ans > 1 ? 's' : ''})
      {#if c.active} · <a href="/club" target="_blank" class="inline-flex items-center gap-1 text-link underline-offset-4 hover:underline">page publique <ArrowSquareOut size={12} /></a>{/if}
    </p>
  </div>
</div>

<div class="mb-5 grid gap-3 sm:grid-cols-3">
  <div class="rounded-lg border border-border bg-card p-4"><div class="text-xs uppercase tracking-wide text-muted-foreground">Membres actifs</div><div class="mt-1 font-display text-2xl font-bold">{data.stats.actifs}</div></div>
  <div class="rounded-lg border border-border bg-card p-4"><div class="text-xs uppercase tracking-wide text-muted-foreground">Adhésions sur 12 mois</div><div class="mt-1 font-display text-2xl font-bold">{data.stats.adhesions_12_mois}</div></div>
  <div class="rounded-lg border border-border bg-card p-4"><div class="text-xs uppercase tracking-wide text-muted-foreground">Encaissé sur 12 mois</div><div class="mt-1 font-display text-2xl font-bold">{euros(data.stats.encaisse_12_mois)}</div></div>
</div>

<div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
  <div class="space-y-5">
    <!-- Membres -->
    <section class="rounded-lg border border-border bg-card">
      <div class="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div class="flex overflow-hidden rounded-md border border-border text-sm">
          {#each [['actives', 'Actives'], ['expirees', 'Expirées'], ['toutes', 'Toutes']] as [k, v] (k)}
            <button type="button" onclick={() => nav({ etat: k === 'actives' ? undefined : k })} class="px-3 py-1.5 {data.etat === k ? 'bg-foreground text-background' : 'hover:bg-muted'}">{v}</button>
          {/each}
        </div>
        <div class="relative min-w-[200px] flex-1">
          <MagnifyingGlass size={14} class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input bind:value={q} oninput={() => { clearTimeout(timer); timer = setTimeout(() => nav({}), 220); }} placeholder="Nom ou e-mail…" class="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm outline-none focus:border-primary" />
        </div>
      </div>
      <table class="w-full text-sm">
        <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
          <tr><th class="px-3 py-2 font-medium">Membre</th><th class="px-3 py-2 font-medium">Période</th><th class="px-3 py-2 font-medium">Adhésion</th><th class="px-3 py-2 font-medium">Facture</th><th class="px-3 py-2"></th></tr>
        </thead>
        <tbody class="divide-y divide-border">
          {#each data.adhesions as a (a.id)}
            <tr class={a.status === 'cancelled' ? 'text-muted-foreground line-through' : ''}>
              <td class="px-3 py-2"><a href="/admin/utilisateurs/{a.user_id}" class="font-medium hover:text-link">{a.nom}</a>{#if a.email}<div class="text-xs text-muted-foreground">{a.email}</div>{/if}</td>
              <td class="whitespace-nowrap px-3 py-2">{dateFr(a.starts_at)} → {dateFr(a.ends_at)}{#if a.active}<span class="ml-1.5 rounded bg-success/15 px-1.5 py-0.5 text-[11px] font-medium text-success">active</span>{/if}</td>
              <td class="whitespace-nowrap px-3 py-2 text-muted-foreground">{SOURCE[a.source] ?? a.source}{#if a.amount} · {euros(a.amount)}{/if}{#if a.stripe_subscription}<span class="ml-1.5 rounded px-1.5 py-0.5 text-[11px] font-medium {a.auto_renew ? 'bg-success/15 text-success' : 'bg-secondary text-muted-foreground'}" title="Abonnement Stripe {a.stripe_subscription}">{a.auto_renew ? 'renouvellement auto' : 'renouvellement arrêté'}</span>{/if}{#if a.note}<div class="text-xs">{a.note}</div>{/if}</td>
              <td class="px-3 py-2">{#if a.invoice_id}<a href="/admin/factures/{a.invoice_id}" class="text-link hover:underline">{a.invoice_ref}</a>{:else}<span class="text-muted-foreground">—</span>{/if}</td>
              <td class="px-3 py-2 text-right">
                {#if a.status === 'active'}
                  <form method="POST" action="?/annuler" use:enhance class="inline" onsubmit={(e) => { if (!confirm(`Annuler l'adhésion de ${a.nom} ?`)) e.preventDefault(); }}>
                    <input type="hidden" name="id" value={a.id} /><button type="submit" class="text-xs text-muted-foreground hover:text-destructive">Annuler</button>
                  </form>
                {/if}
              </td>
            </tr>
          {/each}
          {#if data.adhesions.length === 0}<tr><td colspan="5" class="px-3 py-8 text-center text-muted-foreground">Aucune adhésion.</td></tr>{/if}
        </tbody>
      </table>
    </section>

    <!-- Adhésion à la main -->
    <form method="POST" action="?/ajouter" use:enhance class="rounded-lg border border-border bg-card p-5">
      <h3 class="eyebrow mb-1">Enregistrer une adhésion</h3>
      <p class="mb-4 text-xs text-muted-foreground">Payée hors du site (chèque, espèces sur un salon…) ou offerte. Un membre déjà actif est prolongé à partir de la fin de son adhésion.</p>
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="sm:col-span-2"><span class={label}>Client</span><SearchSelect searchUrl="/api/customers/search" bind:value={membre} placeholder="Nom ou e-mail d'un compte client…" /><input type="hidden" name="userId" value={membre?.id ?? ''} /></div>
        <label class={label}>Adhésion
          <select name="source" bind:value={source} class={input}><option value="manuel">Payée</option><option value="offert">Offerte</option></select>
        </label>
        {#if source === 'manuel'}
          <label class={label}>Règlement
            <select name="methode" class={input}><option value="cheque">Chèque</option><option value="especes">Espèces</option><option value="sumup">SumUp</option><option value="virement">Virement</option></select>
          </label>
          <label class={label}>Montant TTC (€) <input name="montant" type="number" step="0.01" min="0" value={c.prix_ttc} class={input} /></label>
        {/if}
        <label class={label}>Début <input name="debut" type="date" placeholder={aujourdhui} class={input} /></label>
        <label class="{label} sm:col-span-2">Note <input name="note" placeholder="ex. Fête de l'Huma 2026" class={input} /></label>
        {#if source === 'manuel'}<label class="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="facturer" checked class="size-4 accent-foreground" /> Émettre la facture (réglée)</label>{/if}
      </div>
      <Button type="submit" class="mt-4" disabled={!membre}><UserPlus size={16} /> Enregistrer</Button>
    </form>
  </div>

  <!-- Réglages -->
  <form method="POST" action="?/reglages" use:enhance class="rounded-lg border border-border bg-card p-5">
    <h3 class="eyebrow mb-3">Réglages</h3>
    <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="active" checked={c.active} class="size-4 accent-foreground" /> Club ouvert (page publique, adhésion en ligne, remise)</label>
    <div class="mt-4 space-y-3">
      <label class={label}>Nom <input name="nom" value={c.nom} class={input} /></label>
      <div class="grid grid-cols-2 gap-3">
        <label class={label}>Prix TTC (€) <input name="prix_ttc" type="number" step="0.01" min="0" value={c.prix_ttc} class={input} /></label>
        <label class={label}>TVA (%) <input name="tva" type="number" step="0.1" min="0" value={c.tva} class={input} /></label>
        <label class={label}>Remise (%) <input name="remise" type="number" step="0.5" min="0" max="100" value={c.remise} class={input} /></label>
        <label class={label}>Fonds : plus de (ans) <input name="fond_ans" type="number" step="1" min="0" value={c.fond_ans} class={input} /></label>
        <label class={label}>Durée (mois) <input name="duree_mois" type="number" step="1" min="1" value={c.duree_mois} class={input} /></label>
      </div>
      <label class={label}>Port offert aux membres
        <select name="franco" value={c.franco} class={input}>
          <option value="non">Non</option>
          <option value="nouveautes">Si la commande contient une nouveauté</option>
          <option value="toujours">Toujours</option>
        </select>
      </label>
      <label class={label}>Présentation (page publique)<textarea name="texte" rows="4" class="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary">{c.texte}</textarea></label>
    </div>
    <Button type="submit" class="mt-4 w-full"><FloppyDisk size={16} /> Enregistrer</Button>
  </form>
</div>
