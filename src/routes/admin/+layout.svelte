<script lang="ts">
  import DashboardShell from '$lib/components/DashboardShell.svelte';
  import { ADMIN_NAV } from '$lib/nav';
  import { isAdmin } from '$lib/roles';
  import { page } from '$app/state';
  import { toast } from '$lib/toasts';

  let { data, children } = $props();

  // Les erreurs renvoyées par une action (fail(400, { error })) s'affichent en
  // notification, pas en bandeau dans la page : une seule mécanique pour tout le back-office.
  $effect(() => {
    const e = page.form?.error;
    if (typeof e === 'string' && e) toast.error(e);
  });

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
