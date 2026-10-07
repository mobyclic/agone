<script lang="ts">
  /**
   * Import des anciennes factures MEG : on dépose les PDF (un dossier entier :
   * les sous-dossiers « ANNULE » marquent les factures annulées, les devis sont
   * écartés), on relit ce qui a été compris, on importe ce qu'on retient.
   */
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { ArrowLeft, FileArrowUp, Spinner, CheckCircle, Warning } from 'phosphor-svelte';
  import { euros } from '$lib/labels';

  let { data, form } = $props();
  let lecture = $state(false);
  let importation = $state(false);
  const apercu = $derived((form as any)?.apercu as any[] | undefined);
  const resultats = $derived((form as any)?.resultats as any[] | undefined);
  const erreurs = $derived(((form as any)?.erreurs ?? []) as string[]);
  const importables = $derived((apercu ?? []).filter((a) => a.facture && !a.deja && !a.devis));
  const dateFr = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR') : '—');
  /** Les chemins relatifs (dépôt d'un dossier) partent avec les fichiers, pour repérer « ANNULE ». */
  function preparer(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const form = input.form!;
    form.querySelectorAll('input[name=paths]').forEach((n) => n.remove());
    for (const f of input.files ?? []) {
      const h = document.createElement('input'); h.type = 'hidden'; h.name = 'paths'; h.value = (f as any).webkitRelativePath || f.name; form.appendChild(h);
    }
  }
</script>

<svelte:head><title>Import des factures MEG · Admin</title></svelte:head>

<a href="/admin/parametres" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> Paramètres</a>
<h2 class="text-xl font-bold">Anciennes factures (MEG)</h2>
<p class="mb-6 max-w-3xl text-sm text-muted-foreground">
  Déposez les PDF exportés de MEG — tout le dossier d'une année d'un coup, sous-dossiers compris. Chaque facture ou avoir est lu
  (numéro, date, client, lignes, règlement) ; le client professionnel est retrouvé par son numéro MEG ou créé ; la facture est
  enregistrée sous son numéro d'origine, avec son PDF, et réglée si MEG le dit. Les devis sont écartés, les sous-dossiers « ANNULE » donnent des factures annulées.
  {#if data.dejaImportees}<strong>{data.dejaImportees} déjà importées</strong> : elles ne seront pas reprises.{/if}
</p>

<form method="POST" action="?/lire" enctype="multipart/form-data"
  use:enhance={() => { lecture = true; return async ({ update }) => { await update({ reset: false }); lecture = false; }; }}
  class="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-5">
  <input type="file" name="files" accept="application/pdf,.pdf" multiple webkitdirectory onchange={preparer}
    class="min-w-0 flex-1 text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted" />
  <Button type="submit" disabled={lecture}>{#if lecture}<Spinner size={16} class="animate-spin" /> Lecture…{:else}<FileArrowUp size={16} /> Lire le dossier{/if}</Button>
  <p class="basis-full text-xs text-muted-foreground">Le sélecteur prend un dossier ; pour quelques fichiers seuls, mettez-les dans un dossier.</p>
</form>

{#if resultats}
  <div class="mb-6 rounded-lg border border-border bg-card p-5">
    <h3 class="mb-2 inline-flex items-center gap-2 text-base font-semibold"><CheckCircle size={18} class="text-success" /> {resultats.length} document{resultats.length > 1 ? 's' : ''} importé{resultats.length > 1 ? 's' : ''}</h3>
    <p class="text-sm text-muted-foreground">{resultats.filter((r) => r.client === 'cree').length} client(s) professionnel(s) créé(s). <a href="/admin/factures" class="text-link hover:underline">Voir la facturation</a> · <a href="/admin/clients?type=pro" class="text-link hover:underline">les clients</a>.</p>
    {#if erreurs.length}<ul class="mt-2 text-sm text-destructive">{#each erreurs as e (e)}<li>{e}</li>{/each}</ul>{/if}
  </div>
{/if}

{#if apercu}
  <form method="POST" action="?/importer" use:enhance={() => { importation = true; return async ({ update }) => { await update({ reset: false }); importation = false; }; }}
    class="space-y-4 rounded-lg border border-border bg-card p-5">
    <input type="hidden" name="token" value={(form as any).token} />
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h3 class="text-base font-semibold">{apercu.length} fichier{apercu.length > 1 ? 's' : ''} lus · {importables.length} à importer</h3>
      <span class="text-xs text-muted-foreground">{apercu.filter((a) => a.deja).length} déjà importés · {apercu.filter((a) => a.devis).length} devis écartés · {apercu.filter((a) => a.erreur).length} illisibles</span>
    </div>
    <div class="overflow-x-auto rounded-md border border-border bg-background">
      <table class="w-full text-xs">
        <thead class="border-b border-border bg-muted/40 text-left uppercase text-muted-foreground">
          <tr><th class="px-2 py-2"></th><th class="px-2 py-2 font-medium">N°</th><th class="px-2 py-2 font-medium">Date</th><th class="px-2 py-2 font-medium">Client</th><th class="px-2 py-2 text-right font-medium">Lignes</th><th class="px-2 py-2 text-right font-medium">TTC</th><th class="px-2 py-2 font-medium">Règlement</th><th class="px-2 py-2 font-medium">Fichier</th></tr>
        </thead>
        <tbody class="divide-y divide-border">
          {#each apercu as a (a.i)}
            <tr class={a.deja || a.devis || a.erreur ? 'opacity-60' : ''}>
              <td class="px-2 py-1.5"><input type="checkbox" name="retenu" value={a.i} checked={!!a.facture && !a.deja && !a.devis} disabled={!a.facture || a.deja || a.devis} class="size-4" /></td>
              <td class="whitespace-nowrap px-2 py-1.5 font-mono">{a.facture?.ref ?? '—'}{#if a.facture?.type === 'avoir'}<span class="ml-1 rounded bg-warning/15 px-1 text-[10px] text-warning">avoir</span>{/if}{#if a.annulee}<span class="ml-1 rounded bg-muted px-1 text-[10px] text-muted-foreground">annulée</span>{/if}</td>
              <td class="whitespace-nowrap px-2 py-1.5">{dateFr(a.facture?.date)}</td>
              <td class="px-2 py-1.5">{a.facture?.client ?? ''}{#if a.facture?.numeroClient}<span class="ml-1 font-mono text-muted-foreground">{a.facture.numeroClient}</span>{/if}</td>
              <td class="px-2 py-1.5 text-right tabular-nums">{a.facture?.lignes ?? ''}</td>
              <td class="px-2 py-1.5 text-right tabular-nums">{a.facture ? euros(a.facture.total_ttc) : ''}</td>
              <td class="px-2 py-1.5">
                {#if a.facture?.regle}<span class="text-success">réglée</span>{:else if a.facture?.echeance}{a.facture.mode ?? ''} · échéance {dateFr(a.facture.echeance)}{:else}{a.facture?.mode ?? ''}{/if}
                {#if a.facture?.avertissements?.length}<span class="ml-1 inline-flex items-center gap-0.5 text-amber-700 dark:text-amber-500" title={a.facture.avertissements.join(' · ')}><Warning size={12} /></span>{/if}
              </td>
              <td class="max-w-[16rem] truncate px-2 py-1.5 text-muted-foreground" title={a.chemin}>
                {#if a.devis}devis, écarté{:else if a.deja}déjà importée{:else if a.erreur}<span class="text-destructive">{a.erreur}</span>{:else}{a.nom}{/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <Button type="submit" disabled={importation || !importables.length}>{#if importation}<Spinner size={16} class="animate-spin" /> Import en cours…{:else}<CheckCircle size={16} /> Importer les factures cochées{/if}</Button>
  </form>
{/if}
