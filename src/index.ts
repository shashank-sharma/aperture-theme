export { default as Gallery } from './lib/components/Gallery.svelte';
export { default as Lightbox } from './lib/components/Lightbox.svelte';
export { default as TransformTuner } from './lib/components/TransformTuner.svelte';
export * from './lib/types';

// Minimal mount API for convenience
import App from './App.svelte';
import { mount } from 'svelte';

export type { GalleryItem } from './lib/types';

export function mountApertureTheme(options: {
  target: HTMLElement;
  items: import('./lib/types').GalleryItem[];
  siteConfigRaw?: string;
}) {
  return mount(App, {
    target: options.target,
    props: {
      items: options.items,
      siteConfigRaw: options.siteConfigRaw,
    },
  });
}


