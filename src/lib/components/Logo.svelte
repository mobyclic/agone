<script lang="ts">
  // Logo Agone : monogramme « A » rouge dans un carré encre + wordmark.
  // variant: 'full' (marque + texte) | 'mark' (marque seule)
  // tone: 'color' (encre + rouge) | 'light' (blanc, pour fonds foncés)
  let {
    variant = 'full',
    tone = 'color',
    size = 30,
    class: klass = ''
  }: { variant?: 'full' | 'mark'; tone?: 'color' | 'light'; size?: number; class?: string } = $props();

  const ink = $derived(tone === 'light' ? '#ffffff' : '#141414');
  const red = '#d4211c';
</script>

<span class="inline-flex items-center gap-2.5 {klass}">
  <svg
    width={size}
    height={size}
    viewBox="0 0 40 40"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <rect x="1.5" y="1.5" width="37" height="37" rx="6" stroke={ink} stroke-width="2.4" />
    <path
      d="M20 8 L31 32 H26.4 L24.2 26.6 H15.8 L13.6 32 H9 Z M20 15.6 L17.1 22.8 H22.9 Z"
      fill={red}
    />
  </svg>
  {#if variant === 'full'}
    <span
      class="font-display font-extrabold uppercase leading-none tracking-[0.14em]"
      style="font-size:{size * 0.62}px;color:{ink}"
    >
      Agone
    </span>
  {/if}
</span>
