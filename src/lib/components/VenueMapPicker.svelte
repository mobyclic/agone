<script lang="ts">
  import { onMount } from 'svelte';

  // Carte éditable : marqueur déplaçable + clic pour (re)positionner.
  // lat/lng sont des chaînes (liées aux champs du formulaire).
  let {
    lat = $bindable(''),
    lng = $bindable(''),
    onedit
  }: { lat?: string; lng?: string; onedit?: () => void } = $props();

  let el: HTMLDivElement;
  let map: any, marker: any, L: any;
  let internal = false; // changement provoqué par la carte → ne pas recadrer

  const PIN =
    '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#d4211c;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.45)"></div>';

  function commit(la: number, ln: number) {
    internal = true;
    lat = la.toFixed(6);
    lng = ln.toFixed(6);
    onedit?.();
  }

  function place(la: number, ln: number) {
    if (!marker) {
      const icon = L.divIcon({ className: '', html: PIN, iconSize: [22, 22], iconAnchor: [11, 22] });
      marker = L.marker([la, ln], { icon, draggable: true }).addTo(map);
      marker.on('dragend', () => {
        const p = marker.getLatLng();
        commit(p.lat, p.lng);
      });
    } else {
      marker.setLatLng([la, ln]);
    }
  }

  onMount(() => {
    (async () => {
      L = (await import('leaflet')).default;
      const la = Number(lat), ln = Number(lng);
      const has = String(lat) && String(lng) && !Number.isNaN(la) && !Number.isNaN(ln);
      map = L.map(el, { scrollWheelZoom: false }).setView(has ? [la, ln] : [46.6, 2.4], has ? 15 : 5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map);
      if (has) place(la, ln);
      map.on('click', (e: any) => {
        place(e.latlng.lat, e.latlng.lng);
        commit(e.latlng.lat, e.latlng.lng);
      });
      setTimeout(() => map?.invalidateSize(), 0);
    })();
    return () => map?.remove();
  });

  // Réagit aux changements EXTERNES (géocodage, changement de lieu) : recadre.
  $effect(() => {
    const la = Number(lat), ln = Number(lng);
    if (!map || !String(lat) || !String(lng) || Number.isNaN(la) || Number.isNaN(ln)) return;
    if (internal) { internal = false; return; }
    place(la, ln);
    map.setView([la, ln], Math.max(map.getZoom() ?? 0, 13));
  });
</script>

<div bind:this={el} class="h-72 w-full rounded-md border border-border"></div>
<p class="mt-1.5 text-xs text-muted-foreground">Glissez la pastille ou cliquez sur la carte pour affiner la position.</p>
