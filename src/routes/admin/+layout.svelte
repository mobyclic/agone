<script lang="ts">
  import DashboardShell from '$lib/components/DashboardShell.svelte';
  import { ADMIN_NAV } from '$lib/nav';
  import { isAdmin } from '$lib/roles';

  let { data, children } = $props();

  // Les entrées réservées aux admins sont retirées plutôt qu'affichées en 403.
  // Filtre d'affichage seulement : les routes gardent leurs propres gardes serveur.
  const sections = $derived(
    ADMIN_NAV.map((s) => ({ ...s, items: s.items.filter((i) => !i.adminOnly || isAdmin(data.user?.role)) })).filter(
      (s) => s.items.length
    )
  );
</script>

<DashboardShell {sections} user={data.user} title="Back-office Agone">
  {@render children?.()}
</DashboardShell>
