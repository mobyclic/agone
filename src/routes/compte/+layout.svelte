<script lang="ts">
  import DashboardShell from '$lib/components/DashboardShell.svelte';
  import { ACCOUNT_NAV } from '$lib/nav';
  let { data, children } = $props();
</script>

<DashboardShell items={ACCOUNT_NAV} user={data.user} title="Mon compte">
  {#if data.club}
    <p class="mb-5 border-l-2 border-link bg-muted/40 px-3 py-2 text-sm">
      {#if data.club.ends_at}
        Membre du {data.club.nom} jusqu'au {new Date(data.club.ends_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}{data.club.auto_renew ? ' (renouvellement automatique)' : ''} : −{data.club.remise} % sur le fonds, appliqué au panier. <a href="/club" class="text-link underline-offset-4 hover:underline">{data.club.auto_renew ? 'Gérer' : 'Renouveler'}</a>
      {:else}
        <a href="/club" class="text-link underline-offset-4 hover:underline">{data.club.nom}</a> : −{data.club.remise} % sur le fonds toute l'année.
      {/if}
    </p>
  {/if}
  {@render children?.()}
</DashboardShell>
