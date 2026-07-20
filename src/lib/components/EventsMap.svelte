<script lang="ts">
  import { onMount } from 'svelte';

  interface Pin { slug: string; title: string; lat: number; lng: number; city?: string; start?: string; end?: string }
  let { pins = [] }: { pins?: Pin[] } = $props();
  let el: HTMLDivElement;

  const esc = (s: string) =>
    s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

  // Date unique ou fourchette (« du 12 au 14 septembre 2026 »).
  function fmtDates(start?: string, end?: string): string {
    if (!start) return '';
    const s = new Date(start);
    const e = end ? new Date(end) : null;
    const full: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
    if (!e || s.toDateString() === e.toDateString()) return s.toLocaleDateString('fr-FR', full);
    return `du ${s.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} au ${e.toLocaleDateString('fr-FR', full)}`;
  }

  onMount(() => {
    let map: any;
    (async () => {
      const L = (await import('leaflet')).default;
      map = L.map(el, { scrollWheelZoom: false, attributionControl: true }).setView([46.6, 2.4], 5); // France
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19
      }).addTo(map);
      const icon = L.divIcon({
        className: '',
        html: '<div style="width:18px;height:18px;border-radius:50% 50% 50% 0;background:#d4211c;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.4)"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 18]
      });
      const markers = pins.map((p) => {
        const m = L.marker([p.lat, p.lng], { icon, title: p.title });
        const dates = fmtDates(p.start, p.end);
        m.bindPopup(
          `<a href="/rencontres/${p.slug}" style="font-weight:600;color:#141414;text-decoration:none">${esc(p.title)}</a>` +
            (dates ? `<br><span style="color:#141414;font-weight:500">${esc(dates)}</span>` : '') +
            (p.city ? `<br><span style="color:#6b6b6b">${esc(p.city)}</span>` : '')
        );
        return m;
      });
      if (markers.length) {
        const group = L.featureGroup(markers).addTo(map);
        map.fitBounds(group.getBounds().pad(0.25), { maxZoom: 10 });
      }
      // Le conteneur peut être étiré par la grille : on recadre après layout.
      setTimeout(() => map?.invalidateSize(), 0);
    })();
    return () => map?.remove();
  });
</script>

<div bind:this={el} class="ag-map-gray h-full min-h-[380px] w-full rounded-lg border border-border"></div>
