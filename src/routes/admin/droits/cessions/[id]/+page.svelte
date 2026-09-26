<script lang="ts">
  /** Fiche d'une cession : conditions du contrat et suivi des sommes. */
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { ArrowLeft, FloppyDisk, Trash, Plus, CheckCircle, Circle } from 'phosphor-svelte';

  let { data } = $props();
  const d = $derived(data.deal);
  const input = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const lbl = 'mb-1 block text-xs font-medium text-muted-foreground';
  const jour = (v?: string) => (v ? new Date(v).toISOString().slice(0, 10) : '');
  const jourFr = (v?: string) => (v ? new Date(v).toLocaleDateString('fr-FR') : '—');
  const eur = (n: number, c = 'EUR') =>
    `${(n ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c === 'EUR' ? '€' : c}`;
  const KIND_PAIEMENT: Record<string, string> = { advance: 'À-valoir', royalty: 'Redevances', other: 'Divers' };

  const regle = $derived(data.payments.filter((p: any) => p.settled_at).reduce((n: number, p: any) => n + (p.amount ?? 0), 0));
  const attente = $derived(data.payments.filter((p: any) => !p.settled_at).reduce((n: number, p: any) => n + (p.amount ?? 0), 0));
</script>

<svelte:head><title>Cession · {d.book_title} · Admin</title></svelte:head>

<a href="/admin/droits/cessions" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> Cessions de droits</a>
<h2 class="text-xl font-bold">{d.counterparty}</h2>
<p class="mb-6 text-sm text-muted-foreground">
  {d.direction === 'out' ? 'Droits vendus' : 'Droits acquis'} · <a href="/admin/catalogue/{d.book_slug}" class="text-link hover:underline">{d.book_title}</a>
</p>

<div class="grid gap-6 lg:grid-cols-[1fr_360px]">
  <form method="POST" action="?/save" use:enhance class="space-y-5 rounded-lg border border-border bg-card p-5">
    <input type="hidden" name="bookId" value={String(d.book).replace('book:', '')} />

    <div class="grid gap-3 sm:grid-cols-3">
      <label class={lbl}>Sens
        <select name="direction" class={input}>
          <option value="out" selected={d.direction === 'out'}>Droits vendus (Agone encaisse)</option>
          <option value="in" selected={d.direction === 'in'}>Droits acquis (Agone paie)</option>
        </select>
      </label>
      <label class={lbl}>Contrepartie <input name="counterparty" value={d.counterparty} class={input} /></label>
      <label class={lbl}>Objet
        <select name="kind" class={input}>
          {#each [['translation', 'Traduction'], ['pocket', 'Poche'], ['club', 'Club'], ['audio', 'Audio'], ['film', 'Audiovisuel'], ['digital', 'Numérique'], ['other', 'Autre']] as [v, l] (v)}
            <option value={v} selected={d.kind === v}>{l}</option>
          {/each}
        </select>
      </label>
    </div>

    <div class="grid gap-3 sm:grid-cols-3">
      <label class={lbl}>Langue <input name="language" value={d.language ?? ''} class={input} /></label>
      <label class={lbl}>Pays <input name="country" value={d.country ?? ''} class={input} /></label>
      <label class={lbl}>Territoire <input name="territory" value={d.territory ?? ''} placeholder="monde entier" class={input} /></label>
    </div>

    <div class="grid gap-3 sm:grid-cols-4">
      <label class={lbl}>Signature <input name="signed_at" type="date" value={jour(d.signed_at)} class={input} /></label>
      <label class={lbl}>Durée (ans) <input name="term_years" type="number" min="0" value={d.term_years ?? ''} class={input} /></label>
      <label class={lbl}>Échéance <input name="expires_at" type="date" value={jour(d.expires_at)} class={input} /></label>
      <label class={lbl} title="Délai imposé à l’éditeur pour publier, faute de quoi les droits reviennent">
        Publier avant le <input name="publish_deadline" type="date" value={jour(d.publish_deadline)} class={input} />
      </label>
    </div>

    <div class="grid gap-3 sm:grid-cols-4">
      <label class={lbl}>À-valoir <input name="advance" type="number" step="0.01" value={d.advance ?? 0} class={input} /></label>
      <label class={lbl}>Devise <input name="currency" value={d.currency ?? 'EUR'} class={input} /></label>
      <label class={lbl}>Taux papier (%) <input name="rate_paper" type="number" step="0.5" value={d.rate_paper ?? ''} class={input} /></label>
      <label class={lbl}>Assiette papier
        <select name="rate_paper_base" class={input}>
          <option value="retail" selected={d.rate_paper_base !== 'net'}>Prix public</option>
          <option value="net" selected={d.rate_paper_base === 'net'}>Net encaissé</option>
        </select>
      </label>
    </div>

    <div class="grid gap-3 sm:grid-cols-4">
      <label class={lbl}>Taux numérique (%) <input name="rate_ebook" type="number" step="0.5" value={d.rate_ebook ?? ''} class={input} /></label>
      <label class={lbl}>Assiette numérique
        <select name="rate_ebook_base" class={input}>
          <option value="net" selected={d.rate_ebook_base !== 'retail'}>Net encaissé</option>
          <option value="retail" selected={d.rate_ebook_base === 'retail'}>Prix public</option>
        </select>
      </label>
      <label class={lbl} title="Part des sommes encaissées qui revient aux auteurs du livre">
        Part des auteurs (%) <input name="author_share" type="number" step="1" min="0" max="100" value={d.author_share ?? 50} class={input} />
      </label>
      <label class={lbl}>Statut
        <select name="status" class={input}>
          {#each [['active', 'En cours'], ['draft', 'Brouillon'], ['expired', 'Échue'], ['terminated', 'Résiliée']] as [v, l] (v)}
            <option value={v} selected={d.status === v}>{l}</option>
          {/each}
        </select>
      </label>
    </div>

    <label class={lbl}>Notes <input name="notes" value={d.notes ?? ''} class={input} /></label>

    {#if d.direction === 'out'}
      <p class="text-xs text-muted-foreground">
        La part des auteurs s’applique aux sommes <strong>réglées</strong> de la période et se répartit entre eux comme
        le barème du contrat d’édition. Le contrat Agone renvoyant cette part à un avenant, elle se fixe cession par
        cession — l’usage étant la moitié.
      </p>
    {:else}
      <p class="text-xs text-muted-foreground">
        Droits acquis : ces sommes sont dues par Agone. Elles ne figurent pas dans la reddition des auteurs maison.
      </p>
    {/if}

    <div class="flex items-center gap-4">
      <Button type="submit" size="sm"><FloppyDisk size={15} /> Enregistrer</Button>
      <button type="submit" formaction="?/delete" class="inline-flex items-center gap-1 text-xs text-destructive hover:underline"
        onclick={(e: Event) => { if (!confirm('Supprimer cette cession et ses échéances ?')) e.preventDefault(); }}>
        <Trash size={13} /> Supprimer la cession
      </button>
    </div>
  </form>

  <div class="space-y-4">
    <div class="rounded-lg border border-border bg-card p-5">
      <h3 class="eyebrow mb-3">Échéances</h3>
      <ul class="mb-3 space-y-2 text-sm">
        {#each data.payments as p (p.id)}
          <li class="flex items-start gap-2 border-b border-border pb-2 last:border-0">
            <form method="POST" action="?/settle" use:enhance class="shrink-0 pt-0.5">
              <input type="hidden" name="paymentId" value={p.id} />
              <input type="hidden" name="settled" value={p.settled_at ? 'false' : 'true'} />
              <button type="submit" aria-label={p.settled_at ? 'Dépointer' : 'Pointer comme réglée'} title={p.settled_at ? `Réglée le ${jourFr(p.settled_at)}` : 'Pointer comme réglée'}>
                {#if p.settled_at}<CheckCircle size={18} weight="fill" class="text-success" />{:else}<Circle size={18} class="text-muted-foreground" />{/if}
              </button>
            </form>
            <div class="min-w-0 flex-1">
              <span class="font-medium">{eur(p.amount, p.currency)}</span>
              <span class="ml-1 text-xs text-muted-foreground">{KIND_PAIEMENT[p.kind] ?? p.kind}</span>
              <p class="text-xs text-muted-foreground">
                {p.settled_at ? `réglée le ${jourFr(p.settled_at)}` : p.due_on ? `attendue le ${jourFr(p.due_on)}` : 'sans date'}
                {#if p.period_start}· exercice {new Date(p.period_start).getUTCFullYear()}{/if}
              </p>
              {#if p.notes}<p class="text-xs text-muted-foreground">{p.notes}</p>{/if}
            </div>
            <form method="POST" action="?/deletePayment" use:enhance class="shrink-0">
              <input type="hidden" name="paymentId" value={p.id} />
              <button type="submit" class="text-muted-foreground hover:text-destructive" aria-label="Supprimer"><Trash size={14} /></button>
            </form>
          </li>
        {/each}
        {#if data.payments.length === 0}<li class="text-muted-foreground">Aucune échéance.</li>{/if}
      </ul>
      <p class="text-sm">
        <span class="text-muted-foreground">Réglé</span> <strong>{eur(regle, d.currency)}</strong>
        {#if attente}<span class="ml-2 text-muted-foreground">en attente</span> <strong class="text-warning">{eur(attente, d.currency)}</strong>{/if}
      </p>
    </div>

    <form method="POST" action="?/payment" use:enhance class="space-y-3 rounded-lg border border-border bg-card p-5">
      <h3 class="eyebrow">Ajouter une échéance</h3>
      <div class="grid grid-cols-2 gap-3">
        <label class={lbl}>Nature
          <select name="kind" class={input}>
            <option value="royalty">Redevances</option>
            <option value="advance">À-valoir</option>
            <option value="other">Divers</option>
          </select>
        </label>
        <label class={lbl}>Montant <input name="amount" type="number" step="0.01" required class={input} /></label>
        <label class={lbl}>Attendue le <input name="due_on" type="date" class={input} /></label>
        <label class={lbl}>Réglée le <input name="settled_at" type="date" class={input} /></label>
        <label class={lbl}>Exercice du <input name="period_start" type="date" class={input} /></label>
        <label class={lbl}>au <input name="period_end" type="date" class={input} /></label>
      </div>
      <label class={lbl}>Note <input name="notes" class={input} /></label>
      <Button type="submit" variant="outline" size="sm" class="w-full"><Plus size={15} /> Ajouter</Button>
    </form>
  </div>
</div>
