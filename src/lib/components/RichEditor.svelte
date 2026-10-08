<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Editor, Node, Extension, mergeAttributes } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import {
    TextB, TextItalic, TextUnderline, ListBullets, ListNumbers, Quotes,
    LinkSimple, ArrowUUpLeft, ArrowUUpRight, Trash, Image as ImageIcon
  } from 'phosphor-svelte';
  import { toast } from 'svelte-sonner';
  import { ImageAgone, ALIGNEMENTS_IMAGE, TAILLES_IMAGE } from '$lib/editeurImage';

  let { name, value = '', minHeight = '12rem', stickyTop = '4rem', dossierImages = 'media/editeur', onchange }: {
    name: string; value?: string; minHeight?: string;
    /** Hauteur de la barre haute sous laquelle la barre d'outils reste collée (4rem back-office, 5rem front). */
    stickyTop?: string;
    /** Dossier R2 où ranger les images insérées (sous `media/`, visible dans l'explorateur de médias). */
    dossierImages?: string;
    onchange?: () => void;
  } = $props();

  /**
   * L'éditeur n'accepte que H2/H3 : sans ce recalage, un H1 hérité de WordPress
   * retomberait en paragraphe et un H4+ perdrait aussi son statut de titre.
   */
  function normalizeHeadings(html: string): string {
    return (html ?? '')
      .replace(/<(\/?)h1(\s[^>]*)?>/gi, '<$1h2$2>')
      .replace(/<(\/?)h[456](\s[^>]*)?>/gi, '<$1h3$2>');
  }

  /**
   * Appel de note de bas de page : nœud atomique en ligne qui PORTE le texte de
   * sa note (`<sup data-fn="…">`). Le numéro n'est pas stocké : un compteur CSS
   * l'affiche dans l'éditeur, et le rendu public (notesDeBasDePage) numérote dans
   * l'ordre du texte — déplacer un paragraphe renumérote tout seul.
   */
  const NoteDeBasDePage = Node.create({
    name: 'footnote',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    addAttributes() {
      return {
        note: {
          default: '',
          parseHTML: (el) => el.getAttribute('data-fn') ?? '',
          renderHTML: (attrs) => ({ 'data-fn': attrs.note ?? '' })
        }
      };
    },
    parseHTML() { return [{ tag: 'sup[data-fn]' }]; },
    renderHTML({ HTMLAttributes }) { return ['sup', mergeAttributes(HTMLAttributes, { class: 'fn-mark' })]; }
  });

  let element = $state<HTMLDivElement>();
  let notesEl = $state<HTMLOListElement>();
  /** Notes présentes dans le document, dans l'ordre du texte. */
  let notes = $state<{ pos: number; note: string }[]>([]);
  function relireNotes() {
    const liste: { pos: number; note: string }[] = [];
    editor?.state.doc.descendants((n, pos) => {
      if (n.type.name === 'footnote') liste.push({ pos, note: n.attrs.note ?? '' });
    });
    notes = liste;
  }
  function focusNote(i: number) {
    requestAnimationFrame(() => {
      const ta = notesEl?.querySelectorAll('textarea')[i] as HTMLTextAreaElement | undefined;
      ta?.focus();
      ta?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }
  function ajouterNote() {
    if (!editor) return;
    const { to } = editor.state.selection;
    editor.chain().focus().setTextSelection(to).insertContent({ type: 'footnote', attrs: { note: '' } }).run();
    relireNotes();
    const i = notes.findIndex((n) => n.pos >= to);
    focusNote(i === -1 ? notes.length - 1 : i);
  }
  function ecrireNote(pos: number, note: string) {
    if (!editor) return;
    const tr = editor.state.tr.setNodeMarkup(pos, undefined, { note });
    editor.view.dispatch(tr);
  }
  function supprimerNote(pos: number) {
    if (!editor) return;
    editor.view.dispatch(editor.state.tr.delete(pos, pos + 1));
  }
  let editor: Editor | null = null;
  let html = $state('');
  let ready = $state(false);
  let tick = $state(0); // force la réévaluation des états actifs de la barre d'outils

  /** Espace insécable : bouton de la barre, ou Ctrl/⌘ + Maj + Espace comme dans un traitement de texte. */
  const EspaceInsecable = Extension.create({
    name: 'espaceInsecable',
    addKeyboardShortcuts() {
      return { 'Mod-Shift-Space': () => this.editor.chain().focus().insertContent('\u00a0').run() };
    }
  });
  const insererInsecable = () => editor?.chain().focus().insertContent('\u00a0').run();

  // ── Images : envoi sur R2 (via /api/upload) puis insertion ; bouton, glisser-déposer ou collage.
  let fileInput = $state<HTMLInputElement>();
  let envoiEnCours = $state(false);
  async function televerser(file: File): Promise<string | null> {
    if (!file.type.startsWith('image/')) { toast.error(`« ${file.name} » n'est pas une image.`); return null; }
    if (file.size > 15 * 1024 * 1024) { toast.error(`« ${file.name} » dépasse 15 Mo.`); return null; }
    envoiEnCours = true;
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', dossierImages);
      fd.append('kind', 'image');
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d?.message ?? "Envoi de l'image impossible.");
        return null;
      }
      return String((await res.json()).url);
    } catch {
      toast.error("Envoi de l'image impossible.");
      return null;
    } finally {
      envoiEnCours = false;
    }
  }
  async function insererImages(files: File[], pos?: number) {
    if (!editor) return;
    for (const f of files) {
      const url = await televerser(f);
      if (!url) continue;
      const alt = f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
      // Insérée APRÈS la sélection (jamais à sa place : une image déjà sélectionnée ne doit pas être remplacée).
      const noeud = { type: 'image', attrs: { src: url, alt } };
      editor.chain().focus().insertContentAt(pos ?? editor.state.selection.to, noeud).run();
    }
  }
  const imagesDe = (dt: DataTransfer | null) => Array.from(dt?.files ?? []).filter((f) => f.type.startsWith('image/'));
  const attrImage = (k: string) => (void tick, editor?.getAttributes('image')?.[k]);
  /** Modifie l'image sélectionnée sans voler le focus (on peut être en train de taper le texte alternatif). */
  const majImage = (attrs: Record<string, unknown>) => editor?.chain().updateAttributes('image', attrs).run();

  onMount(() => {
    if (!element) return;
    editor = new Editor({
      element,
      extensions: [
        StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, HTMLAttributes: { rel: 'noopener' } } }),
        NoteDeBasDePage,
        EspaceInsecable,
        ImageAgone.configure({ inline: false, allowBase64: false })
      ],
      editorProps: {
        // Images déposées ou collées : envoyées puis insérées à l'endroit du dépôt / du curseur.
        handleDrop: (view, event, _slice, moved) => {
          const files = moved ? [] : imagesDe(event.dataTransfer);
          if (!files.length) return false;
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
          insererImages(files, pos);
          return true;
        },
        handlePaste: (_view, event) => {
          const files = imagesDe(event.clipboardData);
          if (!files.length) return false;
          insererImages(files);
          return true;
        },
        // Clic sur un appel de note → on saute à son texte dans le panneau des notes.
        handleClickOn: (_view, _pos, node, nodePos) => {
          if (node.type.name !== 'footnote') return false;
          const i = notes.findIndex((n) => n.pos === nodePos);
          if (i !== -1) focusNote(i);
          return true;
        }
      },
      content: normalizeHeadings(value) || '',
      onUpdate: ({ editor }) => { html = editor.isEmpty ? '' : editor.getHTML(); relireNotes(); onchange?.(); },
      onSelectionUpdate: () => (tick++),
      onTransaction: () => (tick++)
    });
    html = editor.isEmpty ? '' : editor.getHTML(); // valeur initiale (contenu = value)
    relireNotes();
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

<div class="border border-border bg-background">
  <!-- Barre d'outils COLLANTE : elle suit le défilement sous la barre haute (stickyTop :
       4rem au back-office, 5rem sur le front). Pas d'overflow-hidden sur le conteneur :
       il casserait le sticky. -->
  <div class="sticky z-10 border-b border-border bg-muted" style="top:{stickyTop}">
  <div class="flex flex-wrap items-center gap-0.5 p-1">
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
    <button type="button" onclick={() => fileInput?.click()} tabindex="-1" disabled={envoiEnCours}
      title="Insérer une image (ou glisser-déposer / coller une image dans le texte)"
      class="grid size-8 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50 {active('image') ? 'bg-foreground text-background hover:bg-foreground' : ''}">
      <ImageIcon size={16} />
    </button>
    <input bind:this={fileInput} type="file" accept="image/*" multiple class="hidden"
      onchange={(e) => { const files = Array.from(e.currentTarget.files ?? []); e.currentTarget.value = ''; insererImages(files); }} />
    <span class="mx-0.5 h-5 w-px bg-border"></span>
    <button type="button" onclick={ajouterNote} tabindex="-1" title="Insérer une note de bas de page à la position du curseur"
      class="inline-flex h-8 items-center gap-1 rounded px-2 font-display text-xs font-bold text-muted-foreground transition-colors hover:bg-background hover:text-foreground">
      <span class="text-[0.7rem] leading-none"><sup>1</sup></span> Note
    </button>
    <button type="button" onclick={insererInsecable} tabindex="-1" title="Insérer une espace insécable (Ctrl + Maj + Espace) — avant un « : », « ; », « ? », « ! » ou entre un nombre et son unité"
      class="inline-flex h-8 items-center gap-1 rounded px-2 font-display text-xs font-bold text-muted-foreground transition-colors hover:bg-background hover:text-foreground">
      <span class="font-mono text-sm leading-none">⎵</span> Insécable
    </button>
    <span class="mx-0.5 h-5 w-px bg-border"></span>
    {@render tb(ArrowUUpLeft, () => run((c) => c.undo()))}
    {@render tb(ArrowUUpRight, () => run((c) => c.redo()))}
    {#if envoiEnCours}<span class="ml-2 text-xs text-muted-foreground">Envoi de l'image…</span>{/if}
  </div>
  <!-- Réglages de l'image sélectionnée : texte alternatif, taille, alignement, bordure. -->
  {#if ready && active('image')}
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border bg-background px-2 py-1.5 text-xs">
      <span class="font-display text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Image</span>
      <label class="flex items-center gap-1.5">
        <span class="text-muted-foreground">Texte alternatif</span>
        <input value={attrImage('alt') ?? ''} oninput={(e) => majImage({ alt: e.currentTarget.value })} placeholder="Description de l'image"
          class="h-7 w-52 rounded border border-border bg-background px-2 outline-none focus:border-primary" />
      </label>
      <label class="flex items-center gap-1.5">
        <span class="text-muted-foreground">Taille</span>
        <select value={attrImage('taille') ?? ''} onchange={(e) => majImage({ taille: e.currentTarget.value ? Number(e.currentTarget.value) : null })}
          class="h-7 rounded border border-border bg-background px-1.5 outline-none focus:border-primary">
          <option value="">Naturelle</option>
          {#each TAILLES_IMAGE as t (t)}<option value={t}>{t} %</option>{/each}
        </select>
      </label>
      <span class="flex items-center gap-0.5" role="group" aria-label="Alignement">
        {#each ALIGNEMENTS_IMAGE as a (a.v)}
          <button type="button" onclick={() => majImage({ align: a.v })} title={a.titre} tabindex="-1"
            class="h-7 rounded px-2 font-medium transition-colors hover:bg-muted {(attrImage('align') ?? 'none') === a.v ? 'bg-foreground text-background hover:bg-foreground' : 'text-muted-foreground'}">{a.label}</button>
        {/each}
      </span>
      <label class="flex items-center gap-1.5">
        <input type="checkbox" checked={!!attrImage('border')} onchange={(e) => majImage({ border: e.currentTarget.checked })} class="accent-foreground" />
        <span>Bordure</span>
      </label>
      <button type="button" onclick={() => run((c) => c.deleteSelection())} tabindex="-1"
        class="ml-auto inline-flex h-7 items-center gap-1 rounded px-2 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive">
        <Trash size={14} /> Retirer
      </button>
    </div>
  {/if}
  </div>

  <div bind:this={element} class="rich-content" style="--min:{minHeight}"></div>
  {#if !ready}
    <div class="px-3 py-3 text-sm text-muted-foreground" style="min-height:{minHeight}">Chargement de l'éditeur…</div>
  {/if}
  {#if notes.length}
    <div class="border-t border-border bg-muted/30 px-3 py-3">
      <p class="mb-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes de bas de page</p>
      <ol bind:this={notesEl} class="space-y-2">
        {#each notes as n, i (n.pos)}
          <li class="flex items-start gap-2">
            <span class="mt-1.5 w-5 shrink-0 text-right font-display text-sm font-bold text-link">{i + 1}</span>
            <textarea
              rows="2"
              value={n.note}
              oninput={(e) => ecrireNote(n.pos, e.currentTarget.value)}
              placeholder="Texte de la note…"
              class="min-h-[2.5rem] flex-1 resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
            ></textarea>
            <button type="button" onclick={() => supprimerNote(n.pos)} class="mt-1 grid size-7 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-destructive" aria-label="Supprimer la note {i + 1}" title="Supprimer la note">
              <Trash size={14} />
            </button>
          </li>
        {/each}
      </ol>
    </div>
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
  /* Images : l'alignement, la taille et la bordure sont stylés dans app.css (règles partagées avec le site). */
  :global(.rich-content .ProseMirror img) { cursor: pointer; }
  :global(.rich-content .ProseMirror img.ProseMirror-selectednode) { outline: 3px solid var(--link); outline-offset: 2px; }
  /* Appels de note : numérotés à l'affichage par un compteur (rien n'est stocké). */
  :global(.rich-content .ProseMirror) { counter-reset: fn; }
  :global(.rich-content .ProseMirror sup.fn-mark) { cursor: pointer; font-weight: 700; color: var(--link); padding: 0 0.15em; border-radius: 3px; }
  :global(.rich-content .ProseMirror sup.fn-mark::after) { counter-increment: fn; content: counter(fn); }
  :global(.rich-content .ProseMirror sup.fn-mark.ProseMirror-selectednode) { background: color-mix(in oklch, var(--link) 18%, transparent); }
  :global(.rich-content .ProseMirror p.is-editor-empty:first-child::before) { content: attr(data-placeholder); color: var(--muted-foreground); float: left; height: 0; pointer-events: none; }
</style>
