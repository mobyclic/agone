import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    // SvelteKit 3 : la configuration (ex-svelte.config.js) passe au plugin.
    sveltekit({
      preprocess: vitePreprocess(),
      adapter: adapter({ out: 'build' }),
      // `$lib` n'est plus fourni par défaut (remplacé par `#lib`) : on le garde, tout le code s'en sert.
      alias: { $lib: 'src/lib' }
    })
  ],
  // svelte-sonner embarque sa propre version de `runed` qui timeout en SSR module loading.
  // On force Vite à pré-bundler côté client + à inliner en SSR pour résoudre la dep imbriquée.
  optimizeDeps: {
    include: ['svelte-sonner', 'runed']
  },
  ssr: {
    noExternal: ['svelte-sonner']
  }
});
