<script lang="ts">
  import StaticPage from '$lib/components/StaticPage.svelte';
  let { data } = $props();
</script>

<svelte:head><title>{data.page.title} · Agone</title></svelte:head>

<StaticPage title={data.page.title} html={data.page.body_html} />
