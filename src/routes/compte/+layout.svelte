<script lang="ts">
  import DashboardShell from '$lib/components/DashboardShell.svelte';
  import { ACCOUNT_NAV } from '$lib/nav';
  let { data, children } = $props();
</script>

<DashboardShell items={ACCOUNT_NAV} user={data.user} title="Mon compte">
  {@render children?.()}
</DashboardShell>
