<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import Icon from '$lib/components/Icon.svelte';
  import { ADMIN_NAV } from '$lib/nav';

  let { data } = $props();
  const sections = ADMIN_NAV.filter((i) => i.href !== '/admin');
</script>

<svelte:head><title>Back-office · Agone</title></svelte:head>

<div class="mb-6">
  <p class="eyebrow">Tableau de bord</p>
  <h2 class="mt-1 text-xl font-bold">Bonjour {data.user.first_name || data.user.email} 👋</h2>
  <p class="mt-1 text-sm text-muted-foreground">
    Socle de la refonte Agone 2.0 en place. Les modules ci-dessous seront activés au fil des phases.
  </p>
</div>

<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
  {#each sections as s (s.href)}
    <a href={s.href} class="group block">
      <Card.Root class="h-full transition-colors group-hover:border-primary">
        <Card.Header>
          <div class="flex items-center gap-3">
            <span class="grid size-10 place-items-center rounded-lg bg-accent text-link">
              <Icon name={s.icon} size={20} />
            </span>
            <Card.Title class="text-base">{s.label}</Card.Title>
          </div>
        </Card.Header>
        <Card.Content class="text-sm text-muted-foreground">
          Module à venir.
        </Card.Content>
      </Card.Root>
    </a>
  {/each}
</div>
