<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Editor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import {
    TextB, TextItalic, TextUnderline, ListBullets, ListNumbers, Quotes,
    LinkSimple, ArrowUUpLeft, ArrowUUpRight
  } from 'phosphor-svelte';

  let { name, value = '', minHeight = '12rem', onchange }: { name: string; value?: string; minHeight?: string; onchange?: () => void } = $props();

  let element = $state<HTMLDivElement>();
  let editor: Editor | null = null;
  let html = $state('');
  let ready = $state(false);
  let tick = $state(0); // force la réévaluation des états actifs de la barre d'outils

  onMount(() => {
    if (!element) return;
    editor = new Editor({
      element,
      extensions: [StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, HTMLAttributes: { rel: 'noopener' } } })],
      content: value || '',
      onUpdate: ({ editor }) => { html = editor.isEmpty ? '' : editor.getHTML(); onchange?.(); },
      onSelectionUpdate: () => (tick++),
      onTransaction: () => (tick++)
    });
    html = editor.isEmpty ? '' : editor.getHTML(); // valeur initiale (contenu = value)
    ready = true;
  });
  onDestroy(() => editor?.destroy());

  const active = (n: string, a?: Record<string, unknown>) => (void tick, editor?.isActive(n, a) ?? false);
  const run = (fn: (c: any) => any) => { if (editor) fn(editor.chain().focus()).run(); };
  function toggleLink() {
    if (!editor) return;
    const prev = editor.getAttributes('link').href ?? '';
    const url = window.prompt('URL du lien :', prev);
    if (url === null) return;
    if (url === '') run((c) => c.extendMarkRange('link').unsetLink());
    else run((c) => c.extendMarkRange('link').setLink({ href: url }));
  }
</script>

{#snippet tb(Icon: any, onclick: () => void, on = false)}
  <button type="button" {onclick} tabindex="-1"
    class="grid size-8 place-items-center rounded transition-colors hover:bg-muted {on ? 'bg-foreground text-background hover:bg-foreground' : 'text-muted-foreground'}">
    <Icon size={16} />
  </button>
{/snippet}
{#snippet txt(label: string, onclick: () => void, on = false)}
  <button type="button" {onclick} tabindex="-1"
    class="grid h-8 min-w-8 place-items-center rounded px-1.5 font-display text-xs font-bold transition-colors hover:bg-muted {on ? 'bg-foreground text-background hover:bg-foreground' : 'text-muted-foreground'}">
    {label}
  </button>
{/snippet}

<div class="overflow-hidden border border-border bg-background">
  <div class="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/40 p-1">
    {@render tb(TextB, () => run((c) => c.toggleBold()), active('bold'))}
    {@render tb(TextItalic, () => run((c) => c.toggleItalic()), active('italic'))}
    {@render tb(TextUnderline, () => run((c) => c.toggleUnderline()), active('underline'))}
    <span class="mx-0.5 h-5 w-px bg-border"></span>
    {@render txt('H2', () => run((c) => c.toggleHeading({ level: 2 })), active('heading', { level: 2 }))}
    {@render txt('H3', () => run((c) => c.toggleHeading({ level: 3 })), active('heading', { level: 3 }))}
    {@render tb(ListBullets, () => run((c) => c.toggleBulletList()), active('bulletList'))}
    {@render tb(ListNumbers, () => run((c) => c.toggleOrderedList()), active('orderedList'))}
    {@render tb(Quotes, () => run((c) => c.toggleBlockquote()), active('blockquote'))}
    {@render tb(LinkSimple, toggleLink, active('link'))}
    <span class="mx-0.5 h-5 w-px bg-border"></span>
    {@render tb(ArrowUUpLeft, () => run((c) => c.undo()))}
    {@render tb(ArrowUUpRight, () => run((c) => c.redo()))}
  </div>

  <div bind:this={element} class="rich-content" style="--min:{minHeight}"></div>
  {#if !ready}
    <div class="px-3 py-3 text-sm text-muted-foreground" style="min-height:{minHeight}">Chargement de l'éditeur…</div>
  {/if}
  <input type="hidden" {name} value={html} />
</div>

<style>
  :global(.rich-content .ProseMirror) { min-height: var(--min, 12rem); padding: 0.85rem; outline: none; font-size: 0.9rem; line-height: 1.65; }
  :global(.rich-content .ProseMirror > *) { margin: 0 0 0.9rem; }
  :global(.rich-content .ProseMirror > *:last-child) { margin-bottom: 0; }
  :global(.rich-content .ProseMirror h2) { font-size: 1.25rem; font-weight: 700; margin-top: 1.2rem; }
  :global(.rich-content .ProseMirror h3) { font-size: 1.05rem; font-weight: 700; margin-top: 1rem; }
  :global(.rich-content .ProseMirror ul) { list-style: disc; padding-left: 1.25rem; }
  :global(.rich-content .ProseMirror ol) { list-style: decimal; padding-left: 1.25rem; }
  :global(.rich-content .ProseMirror li) { margin-bottom: 0.25rem; }
  :global(.rich-content .ProseMirror blockquote) { border-left: 3px solid var(--border); padding-left: 0.75rem; color: var(--muted-foreground); font-style: italic; }
  :global(.rich-content .ProseMirror a) { color: var(--link); text-decoration: underline; }
  :global(.rich-content .ProseMirror:focus) { outline: none; }
  :global(.rich-content .ProseMirror p.is-editor-empty:first-child::before) { content: attr(data-placeholder); color: var(--muted-foreground); float: left; height: 0; pointer-events: none; }
</style>
