<script lang="ts">
  /**
   * Fiche d'un document émis : aperçu, rappel des éléments, et les outils —
   * envoyer par e-mail, enregistrer un règlement, émettre une pro forma,
   * annuler, faire un avoir — avec l'historique de ce qui lui est arrivé.
   */
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { ArrowLeft, Download, Eye, Receipt, Trash, Plus, PaperPlaneTilt, X, Stamp, ArrowCounterClockwise, Prohibit, ClockCounterClockwise } from 'phosphor-svelte';
  import { euros, PAYMENT_LABEL } from '$lib/labels';

  let { data } = $props();
  const f = $derived(data.invoice);
  const isCredit = $derived(f.kind === 'credit_note');
  const isProforma = $derived(f.status === 'proforma');
  const isCancelled = $derived(f.status === 'cancelled');
  const dateFr = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—');
  const dateCourte = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR') : '');
  const quand = (s?: string) => (s ? new Date(s).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  const eur = (n?: number) => euros(n) ?? '—';
  const sign = $derived(isCredit ? '−' : '');
  const reste = $derived(Math.max(0, Math.round(((f.total_ttc ?? 0) - (f.paid_total ?? 0)) * 100) / 100));
  const STATUT: Record<string, { texte: string; cls: string }> = {
    proforma: { texte: 'Pro forma', cls: 'bg-accent text-accent-foreground' },
    unpaid: { texte: 'À encaisser', cls: 'bg-warning/15 text-warning' }, partial: { texte: 'Partiellement réglée', cls: 'bg-warning/15 text-warning' },
    paid: { texte: 'Réglée', cls: 'bg-success/15 text-success' }, cancelled: { texte: 'Annulée', cls: 'bg-muted text-muted-foreground' }
  };
  /** Un avoir ne s'encaisse pas : il s'impute sur une facture, ou se rembourse. */
  const STATUT_AVOIR: Record<string, { texte: string; cls: string }> = {
    unpaid: { texte: 'À imputer ou rembourser', cls: 'bg-warning/15 text-warning' }, partial: { texte: 'Partiellement imputé', cls: 'bg-warning/15 text-warning' },
    paid: { texte: 'Soldé', cls: 'bg-success/15 text-success' }, cancelled: { texte: 'Annulé', cls: 'bg-muted text-muted-foreground' }
  };
  const ACTION: Record<string, string> = {
    'facture.brouillon': 'Brouillon enregistré', 'facture.creee': 'Créée', 'facture.emise': 'Émise', 'facture.proforma': 'Passée en pro forma',
    'facture.envoyee': 'Envoyée au client', 'facture.reglement': 'Règlement enregistré', 'facture.reglement_retire': 'Règlement retiré',
    'facture.annulee': 'Annulée', 'proforma.convertie': 'Émise depuis la pro forma', 'avoir.impute': 'Avoir imputé sur une facture'
  };
  let imputation = $state<string>('');
  const st = $derived((isCredit ? STATUT_AVOIR[f.status] : STATUT[f.status]) ?? STATUT.unpaid);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  let envoi = $state(false);
  /** Le PDF (l'original pour une facture importée) s'ouvre dans un onglet : lecture, impression. */
  const pdfUrl = $derived(`/admin/factures/${f.id}/${f.document_key ? 'original' : 'pdf'}`);
</script>

<svelte:head><title>{f.ref} · Facturation · Admin</title></svelte:head>

<a href="/admin/factures" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> Facturation</a>

<div class="mb-5 flex flex-wrap items-start justify-between gap-3">
  <div>
    <div class="flex flex-wrap items-center gap-2">
      <h2 class="text-xl font-bold">{isCredit ? 'Avoir' : isProforma ? 'Pro forma' : 'Facture'} n° {f.ref}</h2>
      {#if isCredit && !isCancelled}<span class="rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">Avoir</span>{/if}
      <span class="rounded px-2 py-0.5 text-xs {st.cls}">
        {#if isProforma}{f.validated_at ? 'Pro forma validée' : f.sent_at ? 'Pro forma envoyée, en attente de validation' : 'Pro forma, non envoyée'}
        {:else}{st.texte}{#if f.status === 'partial'} · reste {eur(reste)}{/if}{/if}
      </span>
    </div>
    <p class="text-sm text-muted-foreground">
      Émis le {dateFr(f.issued_at)}
      {#if f.order_number}· <a href="/admin/commandes/{f.order_number}" class="text-link hover:underline">Commande #{f.order_number}</a>{/if}
      {#if f.client_id}· <a href="/admin/clients/pro/{f.client_id}" class="text-link hover:underline">{f.client_name}</a>{:else if f.customer_id}· <a href="/admin/utilisateurs/{f.customer_id}" class="text-link hover:underline">compte client</a>{/if}
      {#if f.price_mode === 'ht'}· prix HT{/if}{#if f.imported_from === 'meg'}· importée de MEG{/if}{#if f.external_ref}· réf. {f.external_ref}{/if}
      {#if f.proforma_ref && !isProforma}· issue de la pro forma {f.proforma_ref}{/if}
      {#if f.sent_at}· envoyée le {dateCourte(f.sent_at)} à {f.sent_to}{/if}{#if f.validated_at}· validée par le client le {dateCourte(f.validated_at)}{/if}
    </p>
  </div>
  <div class="flex flex-wrap gap-2">
    {#if !isCancelled}
      <Button type="button" variant="outline" onclick={() => (envoi = true)}><PaperPlaneTilt size={16} /> {f.sent_at ? 'Renvoyer' : 'Envoyer'} par e-mail</Button>
    {/if}
    <Button href={pdfUrl} target="_blank" rel="noopener" variant="outline"><Eye size={16} /> Aperçu PDF</Button>
    <Button href="{pdfUrl}?dl=1" variant="brand"><Download size={16} /> Télécharger{#if f.document_key} l’original{/if}</Button>
  </div>
</div>

<div class="grid gap-5 lg:grid-cols-[1fr_300px]">
  <div class="space-y-5">
    <!-- Rappel des éléments -->
    <div class="overflow-x-auto rounded-lg border border-border bg-card">
      <table class="w-full text-sm">
        <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
          <tr><th class="px-3 py-2 font-medium">Désignation</th><th class="px-3 py-2 text-center font-medium">Qté</th><th class="px-3 py-2 text-right font-medium">P.U. {f.price_mode === 'ht' ? 'HT' : 'TTC'}</th><th class="px-3 py-2 text-center font-medium">TVA</th><th class="px-3 py-2 text-right font-medium">{f.price_mode === 'ht' ? 'Montant HT' : 'Total TTC'}</th></tr>
        </thead>
        <tbody class="divide-y divide-border">
          {#each f.lines ?? [] as l, i (i)}
            <tr>
              <td class="px-3 py-2">{l.description}</td>
              <td class="px-3 py-2 text-center">{l.qty}</td>
              <td class="px-3 py-2 text-right tabular-nums">{eur(f.price_mode === 'ht' ? (l.unit_price_ht ?? l.unit_price_ttc / (1 + (l.vat_rate ?? f.vat_rate) / 100)) : l.unit_price_ttc)}</td>
              <td class="px-3 py-2 text-center text-muted-foreground">{String(l.vat_rate ?? f.vat_rate).replace('.', ',')} %</td>
              <td class="px-3 py-2 text-right tabular-nums">{eur(f.price_mode === 'ht' ? Math.round(l.qty * (l.unit_price_ht ?? l.unit_price_ttc / (1 + (l.vat_rate ?? f.vat_rate) / 100)) * 100) / 100 : l.line_total_ttc)}</td>
            </tr>
          {/each}
        </tbody>
        <tfoot class="border-t border-border">
          {#if f.shipping_ht}<tr><td colspan="4" class="px-3 py-1.5 text-right text-muted-foreground">Frais de port HT</td><td class="px-3 py-1.5 text-right tabular-nums">{sign}{eur(f.shipping_ht)}</td></tr>{/if}
          <tr><td colspan="4" class="px-3 py-1.5 text-right text-muted-foreground">Total HT</td><td class="px-3 py-1.5 text-right tabular-nums">{sign}{eur(f.subtotal_ht)}</td></tr>
          {#each f.vat_breakdown ?? [] as b (b.rate)}
            <tr><td colspan="4" class="px-3 py-1.5 text-right text-muted-foreground">TVA {String(b.rate).replace('.', ',')} %</td><td class="px-3 py-1.5 text-right tabular-nums">{sign}{eur(b.tax)}</td></tr>
          {/each}
          <tr class="font-bold"><td colspan="4" class="px-3 py-2 text-right">Total TTC</td><td class="px-3 py-2 text-right tabular-nums">{sign}{eur(f.total_ttc)}</td></tr>
        </tfoot>
      </table>
    </div>
    {#if f.intro}<p class="rounded-md bg-muted/40 px-3 py-2 text-sm">{f.intro}</p>{/if}
    {#if f.notes}<p class="whitespace-pre-line rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{f.notes}</p>{/if}

    <!-- Historique -->
    <div class="rounded-lg border border-border bg-card p-4">
      <h3 class="eyebrow mb-2 inline-flex items-center gap-1.5"><ClockCounterClockwise size={14} /> Historique</h3>
      {#if data.historique.length}
        <ul class="divide-y divide-border text-sm">
          {#each data.historique as h, i (i)}
            <li class="flex flex-wrap gap-x-3 py-1.5">
              <span class="w-36 shrink-0 text-xs text-muted-foreground">{quand(h.created_at)}</span>
              <span class="font-medium">{ACTION[h.action] ?? h.action}</span>
              {#if h.details?.montant}<span class="text-muted-foreground">{eur(h.details.montant)}{h.details.mode ? ` · ${PAYMENT_LABEL[h.details.mode] ?? h.details.mode}` : ''}</span>{/if}
              {#if h.details?.a}<span class="text-muted-foreground">→ {h.details.a}</span>{/if}
              {#if h.actor_name}<span class="ml-auto text-xs text-muted-foreground">{h.actor_name}</span>{/if}
            </li>
          {/each}
        </ul>
      {:else}<p class="text-sm text-muted-foreground">Rien encore.</p>{/if}
    </div>
  </div>

  <div class="space-y-5">
    <!-- Outils selon l'état -->
    <div class="rounded-lg border border-border bg-card p-4">
      <h3 class="eyebrow mb-2">Outils</h3>
      <div class="flex flex-col gap-2">
        {#if isProforma}
          <form method="POST" action="?/emettre" use:enhance><Button type="submit" size="sm" variant="brand" class="w-full" onclick={(e: Event) => { if (!confirm('Émettre la facture définitive maintenant ? Le numéro est attribué.')) e.preventDefault(); }}><Stamp size={14} /> Émettre la facture</Button></form>
          {#if !f.validated_at}
            <form method="POST" action="?/retour_brouillon" use:enhance><Button type="submit" size="sm" variant="outline" class="w-full"><ArrowCounterClockwise size={14} /> Revenir en brouillon</Button></form>
          {/if}
        {/if}
        {#if !isCredit && !isCancelled && !isProforma}
          <form method="POST" action="?/credit_note" use:enhance><Button type="submit" size="sm" variant="outline" class="w-full" onclick={(e: Event) => { if (!confirm('Préparer un avoir reprenant cette facture ?')) e.preventDefault(); }}><Receipt size={14} /> Faire un avoir</Button></form>
        {/if}
        {#if !isCancelled && (f.paid_total ?? 0) === 0}
          <form method="POST" action="?/annuler" use:enhance><Button type="submit" size="sm" variant="outline" class="w-full text-destructive" onclick={(e: Event) => { if (!confirm('Annuler ce document ? Son numéro reste attribué.')) e.preventDefault(); }}><Prohibit size={14} /> Annuler</Button></form>
        {/if}
      </div>
    </div>

    {#if isCredit && !isCancelled}
      <!-- Solde de l'avoir : imputé sur des factures du client, ou remboursé -->
      <div class="rounded-lg border border-border bg-card p-4">
        <h3 class="eyebrow mb-2">Solde de l’avoir</h3>
        {#if data.payments.length}
          <ul class="mb-3 divide-y divide-border text-sm">
            {#each data.payments as p (p.id)}
              <li class="flex items-start gap-2 py-1.5">
                <div class="min-w-0 flex-1">
                  <span class="tabular-nums font-medium">{eur(p.amount)}</span>
                  <span class="text-muted-foreground"> · {p.applied_to_id ? 'imputé' : `remboursé · ${PAYMENT_LABEL[p.method] ?? p.method}`} · {dateCourte(p.paid_at)}</span>
                  {#if p.applied_to_id}<a href="/admin/factures/{p.applied_to_id}" class="block text-xs text-link hover:underline">sur la facture n° {p.applied_to_ref}</a>
                  {:else if p.reference || p.note}<span class="block truncate text-xs text-muted-foreground">{[p.reference, p.note].filter(Boolean).join(' — ')}</span>{/if}
                </div>
                <form method="POST" action="?/payment_delete" use:enhance onsubmit={(e: Event) => { if (!confirm(p.applied_to_id ? 'Retirer cette imputation (des deux côtés) ?' : 'Retirer ce remboursement ?')) e.preventDefault(); }}>
                  <input type="hidden" name="paymentId" value={p.id} />
                  <button type="submit" class="text-muted-foreground hover:text-destructive" aria-label="Retirer"><Trash size={13} /></button>
                </form>
              </li>
            {/each}
          </ul>
          <p class="mb-3 text-sm">Soldé <span class="tabular-nums font-medium">{eur(f.paid_total ?? 0)}</span> sur {eur(f.total_ttc)}{#if reste > 0} · reste <span class="tabular-nums font-medium">{eur(reste)}</span>{/if}</p>
        {:else}
          <p class="mb-3 text-sm text-muted-foreground">{eur(f.total_ttc)} à imputer sur une facture du client, ou à lui rembourser.</p>
        {/if}
        {#if f.status !== 'paid'}
          {#if data.imputables.length}
            <form method="POST" action="?/imputer" use:enhance class="space-y-2 border-t border-border pt-3">
              <span class="block text-xs font-medium text-muted-foreground">Imputer sur une facture du client</span>
              <select name="factureId" bind:value={imputation} required class="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
                <option value="">— choisir —</option>
                {#each data.imputables as i (i.id)}<option value={i.id}>{i.ref} · {dateCourte(i.issued_at)} · reste {eur(i.reste)}</option>{/each}
              </select>
              <div class="flex gap-2">
                <input name="amount" type="number" step="0.01" min="0.01" placeholder="montant (vide = le maximum)" class="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm" />
                <Button type="submit" size="sm" variant="outline" disabled={!imputation}>Imputer</Button>
              </div>
            </form>
          {:else}
            <p class="border-t border-border pt-3 text-xs text-muted-foreground">Aucune facture ouverte chez ce client : l’avoir se rembourse.</p>
          {/if}
          <form method="POST" action="?/payment_add" use:enhance class="mt-3 space-y-2 border-t border-border pt-3">
            <span class="block text-xs font-medium text-muted-foreground">Ou rembourser le client</span>
            <div class="grid grid-cols-2 gap-2">
              <label class="text-xs text-muted-foreground">Montant (€)<input name="amount" type="number" step="0.01" min="0.01" value={reste || ''} required class="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm" /></label>
              <label class="text-xs text-muted-foreground">Date<input name="paid_at" type="date" value={aujourdhui} class="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm" /></label>
            </div>
            <label class="block text-xs text-muted-foreground">Mode
              <select name="method" class="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
                {#each data.methods.filter((m) => m !== 'stripe') as m (m)}<option value={m}>{PAYMENT_LABEL[m] ?? m}</option>{/each}
              </select>
            </label>
            <input name="reference" placeholder="référence du remboursement" class="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" />
            <Button type="submit" size="sm" variant="outline" class="w-full"><Plus size={14} /> Enregistrer le remboursement</Button>
          </form>
        {/if}
      </div>
    {/if}

    {#if !isCredit && !isProforma && !isCancelled}
      <!-- Règlements -->
      <div class="rounded-lg border border-border bg-card p-4">
        <h3 class="eyebrow mb-2">Règlements</h3>
        {#if data.payments.length}
          <ul class="mb-3 divide-y divide-border text-sm">
            {#each data.payments as p (p.id)}
              <li class="flex items-start gap-2 py-1.5">
                <div class="min-w-0 flex-1">
                  <span class="tabular-nums font-medium">{eur(p.amount)}</span>
                  <span class="text-muted-foreground"> · {PAYMENT_LABEL[p.method] ?? p.method} · {dateCourte(p.paid_at)}</span>
                  {#if p.credit_note_id}<a href="/admin/factures/{p.credit_note_id}" class="block text-xs text-link hover:underline">Avoir n° {p.credit_note_ref}</a>
                  {:else if p.reference || p.note}<span class="block truncate text-xs text-muted-foreground">{[p.reference, p.note].filter(Boolean).join(' — ')}</span>{/if}
                </div>
                <form method="POST" action="?/payment_delete" use:enhance onsubmit={(e: Event) => { if (!confirm('Retirer ce règlement ?')) e.preventDefault(); }}>
                  <input type="hidden" name="paymentId" value={p.id} />
                  <button type="submit" class="text-muted-foreground hover:text-destructive" aria-label="Retirer"><Trash size={13} /></button>
                </form>
              </li>
            {/each}
          </ul>
          <p class="mb-3 text-sm">Réglé <span class="tabular-nums font-medium">{eur(f.paid_total ?? 0)}</span> sur {eur(f.total_ttc)}{#if reste > 0} · reste <span class="tabular-nums font-medium">{eur(reste)}</span>{/if}</p>
        {:else}
          <p class="mb-3 text-sm text-muted-foreground">Aucun règlement — {eur(f.total_ttc)} à encaisser.</p>
        {/if}
        {#if f.status !== 'paid'}
          <form method="POST" action="?/payment_add" use:enhance class="space-y-2 border-t border-border pt-3">
            <div class="grid grid-cols-2 gap-2">
              <label class="text-xs text-muted-foreground">Montant (€)<input name="amount" type="number" step="0.01" min="0.01" value={reste || ''} required class="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm" /></label>
              <label class="text-xs text-muted-foreground">Date<input name="paid_at" type="date" value={aujourdhui} class="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm" /></label>
            </div>
            <label class="block text-xs text-muted-foreground">Mode
              <select name="method" class="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
                {#each data.methods.filter((m) => m !== 'stripe') as m (m)}<option value={m}>{PAYMENT_LABEL[m] ?? m}</option>{/each}
              </select>
            </label>
            <input name="reference" placeholder="référence (n° de chèque, virement…)" class="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" />
            <Button type="submit" size="sm" variant="outline" class="w-full"><Plus size={14} /> Enregistrer le règlement</Button>
          </form>
        {/if}
      </div>
    {/if}

    <!-- Client -->
    <div class="rounded-lg border border-border bg-card p-4">
      <h3 class="eyebrow mb-2">Facturé à</h3>
      <p class="text-sm font-medium">{f.bill_to?.name ?? 'Client'}</p>
      <div class="mt-1 space-y-0.5 text-sm text-muted-foreground">
        {#if f.bill_to?.contact_name}<div>À l’attention de {f.bill_to.contact_name}</div>{/if}
        {#if f.bill_to?.address_1}<div>{f.bill_to.address_1}</div>{/if}
        {#if f.bill_to?.postcode || f.bill_to?.city}<div>{[f.bill_to?.postcode, f.bill_to?.city].filter(Boolean).join(' ')}</div>{/if}
        {#if f.bill_to?.country}<div>{f.bill_to.country}</div>{/if}
        {#if f.bill_to?.email}<div>{f.bill_to.email}</div>{/if}
        {#if f.bill_to?.vat_number}<div>TVA {f.bill_to.vat_number}</div>{/if}
      </div>
    </div>
  </div>
</div>

<!-- Envoi par e-mail : destinataire, mot d'accompagnement, PDF joint. -->
{#if envoi}
  <div class="fixed inset-0 z-[60] grid place-items-center p-4">
    <button type="button" class="absolute inset-0 cursor-default bg-black/50" aria-label="Fermer" onclick={() => (envoi = false)}></button>
    <form method="POST" action="?/envoyer" use:enhance class="relative z-10 w-full max-w-md space-y-3 rounded-lg border border-border bg-background p-6 shadow-2xl">
      <button type="button" onclick={() => (envoi = false)} class="absolute right-3 top-3 grid size-8 place-items-center text-muted-foreground hover:text-foreground" aria-label="Fermer"><X size={18} /></button>
      <h3 class="text-lg font-bold">Envoyer {isProforma ? 'la pro forma' : isCredit ? 'l’avoir' : 'la facture'} {f.ref}</h3>
      <p class="text-xs text-muted-foreground">Le PDF part en pièce jointe{isProforma ? ', avec un bouton « Valider la facture » : la facture définitive sera émise et envoyée dès que le client aura cliqué' : ''}.</p>
      <label class="block text-sm font-medium">Destinataire <input name="to" type="email" required value={f.sent_to ?? f.bill_to?.email ?? ''} class="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary" /></label>
      <label class="block text-sm font-medium">Message <span class="font-normal text-muted-foreground">(facultatif)</span>
        <textarea name="message" rows="3" class="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"></textarea>
      </label>
      <div class="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onclick={() => (envoi = false)}>Annuler</Button>
        <Button type="submit" variant="brand"><PaperPlaneTilt size={16} /> Envoyer</Button>
      </div>
    </form>
  </div>
{/if}
