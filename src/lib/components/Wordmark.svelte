<script lang="ts">
  // Wordmark « AGONE » — A et E agrandis, A initial en italique.
  // La couleur est HÉRITÉE (définir text-* sur le parent) pour permettre
  // l'inversion : blanc sur noir (front) / noir sur blanc (back-office).
  let { class: klass = '' }: { class?: string } = $props();
</script>

<span class="font-serif text-xl font-bold uppercase leading-none tracking-tight {klass}">
  <span class="italic text-[1.4em]">A</span>GON<span class="text-[1.4em]">E</span>
</span>
