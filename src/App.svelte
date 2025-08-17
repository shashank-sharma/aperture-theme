<script lang="ts">
    import "./app.css";
    import { onMount } from "svelte";
    import Gallery from "./lib/components/Gallery.svelte";
    import Lightbox from "./lib/components/Lightbox.svelte";
    import TransformTuner from "./lib/components/TransformTuner.svelte";
    import { defaultConfig as baseConfig } from "./lib/config";
    import type { GalleryItem } from "./lib/types";
    import YAML from "yaml";

    const {
        items = [],
        siteConfigRaw,
        config,
    }: {
        items?: GalleryItem[];
        siteConfigRaw?: string;
        config?: Partial<typeof baseConfig>;
    } = $props();
    const THEME_KEY = "aperture:theme";
    // Determine initial theme BEFORE first effect runs
    let __darkInit = false;
    if (typeof window !== "undefined") {
        try {
            const stored = localStorage.getItem(THEME_KEY);
            if (stored === "dark") __darkInit = true;
            else if (stored === "light") __darkInit = false;
            else {
                const prefersDark =
                    window.matchMedia &&
                    window.matchMedia("(prefers-color-scheme: dark)").matches;
                __darkInit = prefersDark;
            }
            if (typeof document !== "undefined") {
                document.documentElement.classList.toggle("dark", __darkInit);
            }
        } catch {}
    }
    let dark = $state(__darkInit);
    $effect(() => {
        if (typeof document !== "undefined") {
            document.documentElement.classList.toggle("dark", dark);
        }
        try {
            localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
        } catch {}
    });
    let lightboxIndex = $state(0);
    let lightboxOpen = $state(false);
    const openLightbox = (i: number) => {
        lightboxIndex = i;
        lightboxOpen = true;
    };

    let isLoaded = $state(false);
    let progress = $state(0);
    let showOverlay = $state(true);
    let overlayFading = $state(false);
    const parsed = (() => {
        try {
            const raw = siteConfigRaw ?? "";
            return YAML.parse(raw) || {};
        } catch (_) {
            return {};
        }
    })();
    const site = parsed.site || {};
    const socials = site.socials || {};
    const __base = (import.meta as any).env?.BASE_URL || "/";
    const resolvePath = (p: string) =>
        /^(?:[a-z]+:)?\/\//i.test(p || "")
            ? p
            : __base.replace(/\/$/, "/") + String(p || "").replace(/^\//, "");
    const defaultPortalSvg =
        "data:image/svg+xml;utf8," +
        encodeURIComponent(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="220" height="220" aria-hidden="true">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#999"/>
      <stop offset="100%" stop-color="#333"/>
    </linearGradient>
  </defs>
  <g fill="none" stroke="url(#g)" stroke-width="10" stroke-linecap="round">
    <circle cx="50" cy="50" r="40" opacity="0.2"/>
    <path d="M50 10 A40 40 0 0 1 90 50"/>
  </g>
</svg>`);
    const portalSvg = site.loading?.portalSrc
        ? resolvePath(site.loading.portalSrc)
        : defaultPortalSvg;
    const logoSrc = site.logo?.src
        ? resolvePath(site.logo.src)
        : resolvePath("logo.svg");

    $effect(() => {
        try {
            if (site && site.title) {
                document.title = site.title;
            }
            if (site && site.description) {
                let m = document.querySelector('meta[name="description"]');
                if (!m) {
                    m = document.createElement("meta");
                    m.setAttribute("name", "description");
                    document.head.appendChild(m);
                }
                m.setAttribute("content", site.description);
            }
            // Basic robots
            if (site && site.robots) {
                let r = document.querySelector('meta[name="robots"]');
                if (!r) {
                    r = document.createElement("meta");
                    r.setAttribute("name", "robots");
                    document.head.appendChild(r);
                }
                r.setAttribute("content", site.robots);
            }
            // OpenGraph
            const og = (prop, content) => {
                if (!content) return;
                let t = document.querySelector(`meta[property="og:${prop}"]`);
                if (!t) {
                    t = document.createElement("meta");
                    t.setAttribute("property", `og:${prop}`);
                    document.head.appendChild(t);
                }
                t.setAttribute("content", content);
            };
            const base = site.baseUrl || "";
            og("title", site.title);
            og("description", site.description);
            og("site_name", site.siteName || site.title);
            og("type", "website");
            if (base) og("url", base);
            og("image", site.socialImage || site.logo?.src || "/logo.svg");
            if (site.locale) og("locale", site.locale);
            // Twitter Card
            const tw = (name, content) => {
                if (!content) return;
                let t = document.querySelector(`meta[name="${name}"]`);
                if (!t) {
                    t = document.createElement("meta");
                    t.setAttribute("name", name);
                    document.head.appendChild(t);
                }
                t.setAttribute("content", content);
            };
            tw("twitter:card", "summary_large_image");
            if (site.twitter) tw("twitter:creator", site.twitter);
            if (site.title) tw("twitter:title", site.title);
            if (site.description) tw("twitter:description", site.description);
            tw(
                "twitter:image",
                site.socialImage || site.logo?.src || "/logo.svg",
            );
        } catch {}
    });

    const preloadMedia = async (media: GalleryItem[]) => {
        const threshold = baseConfig.progressiveThreshold ?? 20;
        const eagerCount = baseConfig.eagerCount ?? 12;
        const concurrency = Math.max(1, baseConfig.preloadConcurrency ?? 4);

        const total = media.length || 1;
        let completed = 0;
        const update = () => (progress = Math.round((completed / total) * 100));

        const loadItem = (m: GalleryItem) =>
            new Promise<void>((resolve) => {
                const finish = () => {
                    completed += 1;
                    update();
                    resolve();
                };
                if (m.kind === "image" || m.kind === "yt-video") {
                    const img = new Image();
                    img.decoding = "async" as any;
                    img.loading = "eager" as any;
                    img.addEventListener("load", finish, { once: true } as any);
                    img.addEventListener("error", finish, {
                        once: true,
                    } as any);
                    img.src = m.src;
                } else {
                    const vid = document.createElement("video");
                    vid.preload = "auto";
                    vid.muted = true;
                    const onDone = () => finish();
                    vid.addEventListener("loadeddata", onDone, { once: true });
                    vid.addEventListener("error", onDone, { once: true });
                    vid.src = m.src;
                }
            });

        // Always preload a small eager set first (or all if under threshold)
        const eagerItems = media.slice(0, Math.max(eagerCount, threshold));
        await Promise.all(eagerItems.map(loadItem));

        // Reveal UI once eager set is ready
        isLoaded = true;
        overlayFading = true;
        setTimeout(() => (showOverlay = false), 1000);

        // Background load the rest with limited concurrency
        const rest = media.slice(eagerItems.length);
        let i = 0;
        const runNext = async (): Promise<void> => {
            if (i >= rest.length) return;
            const current = rest[i++];
            await loadItem(current);
            return runNext();
        };
        await Promise.all(Array.from({ length: concurrency }, runNext));
        progress = 100;
    };

    onMount(() => {
        // listeners only (initialization done above)
        // cross-tab updates
        window.addEventListener("storage", (e) => {
            if (e.key === THEME_KEY) {
                dark = e.newValue === "dark";
            }
        });
        // same-tab updates from components
        window.addEventListener("aperture:theme-change", (e) => {
            try {
                const mode = (e && e.detail) || "";
                if (mode === "dark" || mode === "light") dark = mode === "dark";
            } catch {}
        });
        preloadMedia(items);
    });
</script>

{#if showOverlay}
    <div
        class={`loading-overlay ${overlayFading ? "fade-out" : ""}`}
        aria-live="polite"
        aria-busy="true"
    >
        <img class="portal-full" src={portalSvg} alt="Loading" />
    </div>
{/if}

<main class="app-shell">
    {#if logoSrc}
        <a class="site-logo" href="/" aria-label="Home">
            <img src={logoSrc} alt="Logo" />
        </a>
    {/if}
    <Gallery
        {items}
        config={{ ...baseConfig, ...(config || {}) }}
        {openLightbox}
        showFilters={!lightboxOpen}
        {socials}
    />
    <Lightbox {items} bind:index={lightboxIndex} bind:open={lightboxOpen} />
    {#if baseConfig.debug}
        <TransformTuner {items} />
    {/if}

    <footer class="footer">
        © {new Date().getFullYear()} – Provide `items` to the app to display media.
    </footer>
</main>

<style>
    .site-logo {
        position: fixed;
        top: 12px;
        left: 12px;
        z-index: 1000002;
        display: inline-block;
        padding: 6px;
        border-radius: 10px;
    }
    .site-logo img {
        width: 80px;
        height: 80px;
        display: block;
        filter: none;
    }
    .site-logo img {
        filter: invert(0);
        transition: filter 0.3s ease;
    }
    :global(.dark) .site-logo img {
        filter: invert(1);
    }
    .loading-overlay {
        position: fixed;
        inset: 0;
        background: radial-gradient(
                1200px 800px at 50% 40%,
                rgba(0, 0, 0, 0.06),
                transparent
            ),
            var(--bg);
        display: grid;
        place-items: center;
        z-index: 1000005;
        opacity: 1;
        transition: opacity 420ms ease;
    }
    .loading-overlay.fade-out {
        opacity: 0;
        pointer-events: none;
    }
    .portal-full {
        width: 220px;
        height: 220px;
        animation: spin 6s linear infinite;
        display: block;
    }

    @keyframes spin {
        from {
            transform: rotate(0deg);
        }
        to {
            transform: rotate(360deg);
        }
    }
</style>
