import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  // svelte-sonner embarque sa propre version de `runed` qui timeout en SSR module loading.
  // On force Vite à pré-bundler côté client + à inliner en SSR pour résoudre la dep imbriquée.
  optimizeDeps: {
    include: ['svelte-sonner', 'runed']
  },
  ssr: {
    noExternal: ['svelte-sonner']
  }
});
