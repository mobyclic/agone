<script lang="ts">
  import DashboardShell from '$lib/components/DashboardShell.svelte';
  import { ADMIN_NAV } from '$lib/nav';

  let { data, children } = $props();
</script>

<DashboardShell items={ADMIN_NAV} user={data.user} title="Back-office Agone">
  {@render children?.()}
</DashboardShell>
