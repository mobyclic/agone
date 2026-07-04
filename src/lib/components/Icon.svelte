<script lang="ts" module>
  import {
    SquaresFour, BookOpen, Books, Users, User, Receipt, ShoppingBag, ShoppingCart,
    Package, Truck, Coins, Article, Newspaper, CalendarDots, GearSix, Info,
    Storefront, Tag, Star, MagnifyingGlass, EnvelopeSimple, MapPin, Gauge,
    ArrowRight, Check, Plus, PencilSimple, Trash, Warning, Globe, Download
  } from 'phosphor-svelte';

  // Registre nom → composant (icônes utilisées dans la navigation & les listes).
  const MAP: Record<string, any> = {
    SquaresFour, BookOpen, Books, Users, User, Receipt, ShoppingBag, ShoppingCart,
    Package, Truck, Coins, Article, Newspaper, CalendarDots, GearSix, Info,
    Storefront, Tag, Star, MagnifyingGlass, EnvelopeSimple, MapPin, Gauge,
    ArrowRight, Check, Plus, PencilSimple, Trash, Warning, Globe, Download
  };
</script>

<script lang="ts">
  let {
    name,
    size = 18,
    weight = 'regular',
    class: klass = ''
  }: { name?: string; size?: number; weight?: any; class?: string } = $props();
  const Cmp = $derived((name && MAP[name]) || BookOpen);
</script>

<Cmp {size} {weight} class={klass} />
