<script lang="ts">
  import { onMount } from 'svelte';

  let { lat, lng, name = '' }: { lat: number; lng: number; name?: string } = $props();
  let el: HTMLDivElement;

  onMount(() => {
    let map: any;
    (async () => {
      const L = (await import('leaflet')).default;
      map = L.map(el, { scrollWheelZoom: false, attributionControl: true }).setView([lat, lng], 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19
      }).addTo(map);
      const icon = L.divIcon({
        className: '',
        html: '<div style="width:20px;height:20px;border-radius:50% 50% 50% 0;background:#d4211c;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.4)"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 20]
      });
      L.marker([lat, lng], { icon, title: name }).addTo(map);
    })();
    return () => map?.remove();
  });
</script>

<div bind:this={el} class="ag-map-gray h-64 w-full rounded-lg border border-border"></div>
