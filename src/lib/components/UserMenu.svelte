<script lang="ts">
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { isStaff } from '$lib/roles';
  import { CaretDown, User, SignOut, SquaresFour, BookOpen, Receipt } from 'phosphor-svelte';

  let { user }: { user: NonNullable<App.Locals['user']> } = $props();

  const initials = $derived(
    ((user.first_name?.[0] ?? '') + (user.last_name?.[0] ?? '')).toUpperCase() ||
      (user.email?.[0] ?? '?').toUpperCase()
  );
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger
    class="inline-flex items-center gap-2 rounded-full border border-border py-1 pl-1 pr-2.5 hover:bg-muted transition-colors"
  >
    <span
      class="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground text-xs font-bold"
    >
      {#if user.avatar_url}
        <img src={user.avatar_url} alt="" class="size-7 rounded-full object-cover" />
      {:else}{initials}{/if}
    </span>
    <CaretDown size={14} class="text-muted-foreground" />
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end" class="w-56">
    <div class="px-2 py-1.5">
      <div class="truncate text-sm font-medium">{user.full_name || user.email}</div>
      <div class="truncate text-xs text-muted-foreground">{user.email}</div>
    </div>
    <DropdownMenu.Separator />
    <DropdownMenu.Item>
      {#snippet child({ props })}
        <a href="/compte/bibliotheque" {...props}><BookOpen size={16} /> Ma bibliothèque</a>
      {/snippet}
    </DropdownMenu.Item>
    <DropdownMenu.Item>
      {#snippet child({ props })}
        <a href="/compte/commandes" {...props}><Receipt size={16} /> Mes commandes</a>
      {/snippet}
    </DropdownMenu.Item>
    <DropdownMenu.Item>
      {#snippet child({ props })}
        <a href="/compte/profil" {...props}><User size={16} /> Mon profil</a>
      {/snippet}
    </DropdownMenu.Item>
    {#if isStaff(user.role)}
      <DropdownMenu.Separator />
      <DropdownMenu.Item>
        {#snippet child({ props })}
          <a href="/admin" {...props}><SquaresFour size={16} /> Back-office</a>
        {/snippet}
      </DropdownMenu.Item>
    {/if}
    <DropdownMenu.Separator />
    <DropdownMenu.Item>
      {#snippet child({ props })}
        <a href="/deconnexion" data-sveltekit-reload {...props} class="{props.class} text-destructive">
          <SignOut size={16} /> Se déconnecter
        </a>
      {/snippet}
    </DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu.Root>
