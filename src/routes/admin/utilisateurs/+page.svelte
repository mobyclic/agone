<script lang="ts">
  import { goto } from '$app/navigation';
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { UserPlus, X } from 'phosphor-svelte';

  let { data } = $props();
  let showNew = $state(false);
  let creating = $state(false);
  const inp = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  const lbl = 'mb-1 block text-sm font-medium';
  const dateFr = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
  const roleLabel: Record<string, string> = { admin: 'Admin', editor: 'Éditeur' };
  const roleTone: Record<string, string> = { admin: 'bg-foreground text-background', editor: 'bg-accent text-accent-foreground' };
</script>

<svelte:head><title>Utilisateurs · Admin Agone</title></svelte:head>

<div class="mb-5 flex flex-wrap items-end justify-between gap-3">
  <div>
    <h2 class="text-xl font-bold">Utilisateurs</h2>
    <p class="text-sm text-muted-foreground">Les comptes de la maison : {data.users.length} administrateur{data.users.length > 1 ? 's' : ''} et éditeur{data.users.length > 1 ? 's' : ''}. Les clients sont dans <a href="/admin/clients" class="underline hover:text-foreground">Clients</a>.</p>
  </div>
  <Button type="button" variant="brand" onclick={() => (showNew = true)}><UserPlus size={16} /> Nouveau compte</Button>
</div>

<div class="overflow-x-auto rounded-lg border border-border bg-card">
  <table class="w-full text-sm">
    <thead class="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
      <tr>
        <th class="px-3 py-2 font-medium">Nom</th>
        <th class="px-3 py-2 font-medium">E-mail</th>
        <th class="px-3 py-2 font-medium">Rôle</th>
        <th class="px-3 py-2 text-right font-medium">Créé le</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-border">
      {#each data.users as u (u.id)}
        <tr class="cursor-pointer hover:bg-muted/30 {u.is_active ? '' : 'opacity-60'}" onclick={(e) => { if (!(e.target as HTMLElement).closest('a,button')) goto(`/admin/utilisateurs/${u.id}`); }}>
          <td class="px-3 py-2"><a href="/admin/utilisateurs/{u.id}" class="font-medium hover:text-link">{u.full_name}</a>{#if !u.is_active}<span class="ml-1.5 text-[10px] uppercase text-muted-foreground">désactivé</span>{/if}</td>
          <td class="px-3 py-2 text-muted-foreground">{u.email}{#if u.email && !u.email_verified}<span class="ml-1 text-[10px] text-warning">non vérifié</span>{/if}</td>
          <td class="px-3 py-2"><span class="rounded px-2 py-0.5 text-xs font-medium {roleTone[u.role] ?? 'bg-secondary'}">{roleLabel[u.role] ?? u.role}</span></td>
          <td class="px-3 py-2 text-right text-muted-foreground">{dateFr(u.created_at)}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

{#if showNew}
  <div class="fixed inset-0 z-[60] grid place-items-center p-4">
    <button type="button" class="absolute inset-0 cursor-default bg-black/50" aria-label="Fermer" onclick={() => (showNew = false)}></button>
    <div class="relative z-10 w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-2xl">
      <button type="button" onclick={() => (showNew = false)} class="absolute right-3 top-3 grid size-8 place-items-center text-muted-foreground hover:text-foreground" aria-label="Fermer"><X size={18} /></button>
      <h3 class="text-lg font-bold">Nouveau compte de la maison</h3>
      <form method="POST" action="?/create" use:enhance={() => { creating = true; return async ({ update }) => { await update(); creating = false; }; }} class="mt-4 space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <label class={lbl}>Prénom <input name="first_name" class={inp} autocomplete="off" /></label>
          <label class={lbl}>Nom <input name="last_name" class={inp} autocomplete="off" /></label>
        </div>
        <label class={lbl}>E-mail <input name="email" type="email" required class={inp} autocomplete="off" /></label>
        <label class={lbl}>Rôle
          <select name="role" class={inp}><option value="editor">Éditeur</option><option value="admin">Admin</option></select>
        </label>
        <div class="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onclick={() => (showNew = false)}>Annuler</Button>
          <Button type="submit" variant="brand" disabled={creating}>{creating ? 'Création…' : 'Créer'}</Button>
        </div>
      </form>
    </div>
  </div>
{/if}
