<script lang="ts">
    import { onMount, tick } from "svelte";
    import { fade } from "svelte/transition";
    // Social links are provided by parent (App) to avoid bundling a local config file in packages
    export let socials: Record<string, string> = {};
    import gsap from "gsap";
    (gsap as any).config({ skewType: "simple", force3D: true });
    import type { GalleryConfig, GalleryItem } from "../types";
    import { transformStore } from "../stores/transform";
    import Filters from "./Filters.svelte";
    import Card from "./Card.svelte";
    import {
        buildAllFilters,
        belongsToFilter as utilBelongsToFilter,
        findFilterForPath as utilFindFilterForPath,
        navigateToFilter,
    } from "../utils/filters";
    import {
        preloadItems as preloadItemsUtil,
        getLabelText,
    } from "../utils/media";
    import { CARD_POOL_SIZE_DEFAULT, SCROLL_IDLE_EPSILON } from "../constants";

    export let items: GalleryItem[] = [];
    export let config: GalleryConfig;
    // Control visibility of filter UI from parent (e.g., hide when lightbox is open)
    export let showFilters: boolean = true;
    // Tag filtering
    let activeFilter: string = "All";
    const allFilters = () => buildAllFilters(items, config.filters);
    // Centralized filter change logic (used by chips and mobile dropdown)
    const changeFilter = async (f: string) => {
        if (activeFilter === f) return;
        const seq = ++filterLoadSeq;
        isCategoryLoading = true;
        categoryProgress = 0;
        navigateToFilter(f);
        activeFilter = f;
        await preloadItemsUtil(
            items.filter((it) => utilBelongsToFilter(it, f, allFilters())),
            poolSize,
            Math.max(1, config.preloadConcurrency ?? 4),
            (completed, total) => {
                categoryProgress = Math.round(
                    (completed / Math.max(1, total)) * 100,
                );
            },
        );
        // small UX delay
        await new Promise((r) => setTimeout(r, 1000));
        if (seq !== filterLoadSeq) return; // ignore stale
        const cleanup = (container as any)?._cleanupBookshelf;
        if (cleanup) cleanup();
        await tick();
        applyBookshelfLayout();
        isCategoryLoading = false;
    };
    $: filtered = items.filter((it) =>
        utilBelongsToFilter(it, activeFilter, allFilters()),
    );
    // Local loading state when switching categories
    let isCategoryLoading = false;
    let categoryProgress = 0;
    let filterLoadSeq = 0;

    // preload handled by utils in changeFilter
    // Debug: log filtering results and repetition (guarded by config.debug)
    $: if (config.debug) {
        console.debug("[Gallery] activeFilter=", activeFilter, {
            filteredCount: filtered.length,
            filteredIds: filtered.map((i) => i.id),
        });
    }

    export const activeIndex = 0;
    export let openLightbox: (i: number) => void;

    let container: HTMLElement;
    let track: HTMLElement;
    let rafId: number | null = null;
    let progress = 0; // animated scroll distance in px along diagonal
    let targetProgress = 0; // immediate scroll distance in px
    // Track last filter for which we randomized the start offset
    let lastRandomizedKey: string | null = null;

    // Virtualization: render a small pool of cards and recycle their content as you scroll
    let poolSize = config?.virtualPoolSize ?? CARD_POOL_SIZE_DEFAULT;
    let pool = Array.from({ length: poolSize }, (_, i) => ({
        key: `pool_${i}`,
    }));

    // label text handled via util getLabelText

    // Fixed aspect ratio (no dynamic override to keep size consistent)

    // Uniform down-left layout with identical rotation and even spacing
    const applyBookshelfLayout = () => {
        const cards = track.querySelectorAll<HTMLElement>(".card");

        let yaw = -30; // initial
        let pitch = 0;
        let roll = 0;
        let localPerspective = config.perspective;
        let localSkewX = 0;
        let localScale = 1;
        let parallelEdges = true;
        // ensure a single active subscription
        let unsubscribeTransform = transformStore.subscribe((t) => {
            pitch = t.rotateX;
            yaw = t.rotateY;
            roll = t.rotateZ;
            localPerspective = t.perspective || config.perspective;
            localSkewX = t.skewX || 0;
            localScale = t.scale || 1;
            parallelEdges = t.parallelEdges ?? true;
        });

        // Use equal step to place all cards on a straight 45° diagonal (tighter spacing)
        const viewportWidth =
            typeof window !== "undefined" ? window.innerWidth : 1920;
        const isMobile = viewportWidth <= 640;
        const step = isMobile
            ? Math.max(68, config.cardBaseSize * 0.085)
            : Math.max(120, config.cardBaseSize * 0.15);
        const gapX = step; // horizontal spacing
        const gapY = step; // vertical spacing
        const gapZ = config.gap * (isMobile ? 0.22 : 0.3); // slightly tighter in depth on mobile

        // Initialize pool cards with base transforms
        cards.forEach((card) => {
            const useYaw = parallelEdges ? 0 : yaw;
            gsap.set(card, {
                xPercent: -50,
                yPercent: -50,
                x: 0,
                y: 0,
                z: 0,
                transformPerspective: localPerspective,
                transformOrigin: "50% 50%",
                rotateX: pitch,
                rotateY: useYaw,
                rotateZ: roll + (parallelEdges ? yaw : 0),
                skewX: localSkewX,
                scale: localScale,
                opacity: 0,
            });
        });

        // Intro animation
        gsap.set(cards, { opacity: 1, y: "+=4" });

        // Infinite internal scrolling: move along diagonal and wrap seamlessly
        const vw = typeof window !== "undefined" ? window.innerWidth : 1920;
        const vh = typeof window !== "undefined" ? window.innerHeight : 1080;
        const originalCount = filtered.length || 1;
        const cycle = step * originalCount; // distance after which sequence repeats
        const startX = vw * 0.15; // constant offset for framing
        const startY = vh * 0.1;
        const recycleAheadX = vw * 0.9;
        const recycleAheadY = vh * 0.9;

        // Randomize initial start for each filter/length combo so every view starts at a different point
        const randomKey = `${activeFilter}:${originalCount}`;
        if (lastRandomizedKey !== randomKey) {
            const randomStart = Math.random() * cycle;
            progress = randomStart;
            targetProgress = randomStart;
            lastRandomizedKey = randomKey;
        }

        const updateCardMedia = (card: HTMLElement, item: GalleryItem) => {
            if (!item) return;
            const currentId = card.dataset.itemId;
            if (currentId === item.id) return;
            card.dataset.itemId = item.id;
            // Front face
            const front = card.querySelector<HTMLElement>(".face.front");
            const imgFront =
                front?.querySelector<HTMLImageElement>("img.media-img");
            const vidFront =
                front?.querySelector<HTMLVideoElement>("video.media-video");
            if (item.kind === "image" || item.kind === "yt-video") {
                if (vidFront) {
                    vidFront.pause?.();
                    vidFront.removeAttribute("src");
                    (vidFront as any).load?.();
                    (vidFront as HTMLElement).style.display = "none";
                }
                if (imgFront) {
                    imgFront.decoding = "async" as any;
                    imgFront.loading = "lazy";
                    imgFront.src = item.src;
                    imgFront.alt = item.alt || "";
                    (imgFront as HTMLElement).style.display = "block";
                }
            } else {
                if (imgFront) {
                    imgFront.removeAttribute("src");
                    (imgFront as HTMLElement).style.display = "none";
                }
                if (vidFront) {
                    vidFront.preload = "metadata";
                    vidFront.muted = true;
                    vidFront.playsInline = true as any;
                    vidFront.src = item.src;
                    (vidFront as HTMLElement).style.display = "block";
                }
            }
            // Edges removed for testing; no right/top face updates
            // Label
            const label = card.querySelector<HTMLElement>(".floor-label__text");
            if (label) {
                label.textContent = getLabelText(item);
                const len = (label.textContent || "").length;
                const isLong = len > 28 && len <= 55;
                const isVeryLong = len > 55;
                label.classList.toggle("is-long", isLong);
                label.classList.toggle("is-very-long", isVeryLong);
                if (!isLong && !isVeryLong) {
                    label.classList.remove("is-long");
                    label.classList.remove("is-very-long");
                }
            }
        };

        const IDLE_EPSILON = SCROLL_IDLE_EPSILON;
        const ensureRaf = () => {
            if (rafId == null) rafId = requestAnimationFrame(update);
        };
        const update = () => {
            // Smooth follow – lower factor = smoother/slower
            const follow = Math.min(0.045, config.inertia);
            progress += (targetProgress - progress) * follow;
            // Compute global index window for current pool
            const baseIndex =
                Math.floor(progress / step) - Math.floor(cards.length / 2);
            cards.forEach((card, i) => {
                const globalIndex = baseIndex + i;
                // Use integer pixel positions to reduce sub-pixel jitter
                const xBase = Math.round(globalIndex * gapX);
                const yBase = Math.round(-globalIndex * gapY);
                const xPos = Math.round(xBase - startX - progress);
                const yPos = Math.round(yBase + startY + progress);
                const depthIndex = globalIndex;
                const useYaw2 = parallelEdges ? 0 : yaw;
                gsap.set(card, {
                    x: xPos,
                    y: yPos,
                    z: 0,
                    zIndex: 100000 - depthIndex,
                    rotateX: pitch,
                    rotateY: useYaw2,
                    rotateZ: roll + (parallelEdges ? yaw : 0),
                    skewX: localSkewX,
                    scale: localScale,
                    transformPerspective: localPerspective,
                    transformOrigin: "50% 50%",
                    opacity: 1,
                });

                // Update the media content for this virtual position
                const wrappedIndex =
                    ((globalIndex % originalCount) + originalCount) %
                    originalCount;
                const item = filtered[wrappedIndex];
                // Keep a consistent aspect ratio; no dynamic overrides
                updateCardMedia(card, item);

                // Keep label screen-facing (billboard)
                const label = card.querySelector<HTMLElement>(".floor-label");
                if (label) {
                    gsap.set(label, {
                        rotateX: -pitch,
                        rotateY: 0,
                        rotateZ: 0,
                        z: 16,
                        transformPerspective: localPerspective,
                        transformOrigin: "top left",
                    });
                }
            });
            if (Math.abs(targetProgress - progress) < IDLE_EPSILON) {
                // Snap to target and go idle to save CPU when not animating
                progress = targetProgress;
                rafId = null;
            } else {
                rafId = requestAnimationFrame(update);
            }
        };
        if (rafId == null) rafId = requestAnimationFrame(update);

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const delta =
                Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : -e.deltaX; // allow shift/trackpads
            // Slow down wheel sensitivity
            targetProgress = targetProgress + delta * (step * 0.016);
            ensureRaf();
        };
        container.addEventListener("wheel", onWheel, { passive: false });
        // Arrow/Page keys
        const onKeyDown = (e: KeyboardEvent) => {
            if (
                e.key === "ArrowDown" ||
                e.key === "PageDown" ||
                e.key === "ArrowRight"
            ) {
                targetProgress = targetProgress + step * 0.3;
                ensureRaf();
            }
            if (
                e.key === "ArrowUp" ||
                e.key === "PageUp" ||
                e.key === "ArrowLeft"
            ) {
                targetProgress = targetProgress - step * 0.3;
                ensureRaf();
            }
        };
        container.addEventListener("keydown", onKeyDown);
        // Touch drag
        let lastY = 0;
        let dragging = false;
        let lastX = 0;
        const onPointerDown = (e: PointerEvent) => {
            dragging = true;
            lastY = e.clientY;
            lastX = e.clientX;
            (e.target as Element).setPointerCapture?.((e as any).pointerId);
        };
        const onPointerUp = (e: PointerEvent) => {
            dragging = false;
            (e.target as Element).releasePointerCapture?.((e as any).pointerId);
        };
        const onPointerCancel = () => {
            dragging = false;
        };
        const onPointerMove = (e: PointerEvent) => {
            if (!dragging) return;
            const dy = lastY - e.clientY;
            const dx = e.clientX - lastX;
            lastY = e.clientY;
            lastX = e.clientX;
            // Use lower sensitivity on touch screens for more natural scrolling
            const isTouch = (e as any).pointerType === "touch";
            const factor = isTouch ? step * 0.012 : step * 0.05;
            targetProgress = targetProgress + (dy + dx) * factor;
            ensureRaf();
        };
        container.addEventListener("pointerdown", onPointerDown);
        container.addEventListener("pointerup", onPointerUp);
        container.addEventListener("pointercancel", onPointerCancel);
        container.addEventListener("pointermove", onPointerMove);
        // Attach cleanup
        (container as any)._cleanupBookshelf = () => {
            container.removeEventListener("wheel", onWheel as any);
            container.removeEventListener("keydown", onKeyDown as any);
            container.removeEventListener("pointerdown", onPointerDown as any);
            container.removeEventListener("pointerup", onPointerUp as any);
            container.removeEventListener(
                "pointercancel",
                onPointerCancel as any,
            );
            container.removeEventListener("pointermove", onPointerMove as any);
            if (rafId != null) cancelAnimationFrame(rafId);
            rafId = null;
            try {
                unsubscribeTransform?.();
            } catch {}
        };
    };

    onMount(() => {
        // Setup mobile breakpoint listener for conditional UI
        // mobile detection moved into Filters.svelte
        try {
        } catch {}
        // sync filter from URL on load, then wait a tick so cards render before layout
        try {
            activeFilter = utilFindFilterForPath(
                location.pathname,
                allFilters(),
            );
        } catch {}
        tick().then(() => {
            applyBookshelfLayout();
        });
        const onPop = () => {
            const next = utilFindFilterForPath(location.pathname, allFilters());
            if (next !== activeFilter) {
                activeFilter = next;
                const cleanup = (container as any)?._cleanupBookshelf;
                if (cleanup) cleanup();
                applyBookshelfLayout();
            }
        };
        window.addEventListener("popstate", onPop);

        // Cleanup on teardown
        const onResize = () => {
            const fn = (container as any)._cleanupBookshelf;
            if (fn) fn();
            applyBookshelfLayout();
        };
        if (typeof window !== "undefined") {
            window.addEventListener("resize", onResize, { passive: true });
            window.addEventListener("orientationchange", onResize, {
                passive: true,
            } as any);
        }

        return () => {
            const fn = (container as any)._cleanupBookshelf;
            if (fn) fn();
            if (typeof window !== "undefined") {
                window.removeEventListener("resize", onResize as any);
                window.removeEventListener(
                    "orientationchange",
                    onResize as any,
                );
                window.removeEventListener("popstate", onPop as any);
            }
        };
    });
</script>

<div
    class="gallery"
    bind:this={container}
    style={`--perspective: ${config.perspective}px; --base: ${config.cardBaseSize}px`}
    role="region"
    aria-label="Gallery"
    aria-busy={isCategoryLoading}
>
    {#if showFilters}
        <Filters
            filters={allFilters()}
            active={activeFilter}
            isLoading={isCategoryLoading}
            {socials}
            onSelect={(f) => changeFilter(f)}
        />
    {/if}
    {#if filtered.length === 0}
        <div class="empty-state" role="status" aria-live="polite">
            Nothing to see here
        </div>
    {:else}
        <div class="track" bind:this={track}>
            {#each pool as p, i (p.key)}
                <Card
                    index={i}
                    {config}
                    item={undefined}
                    onOpen={(id) => {
                        const baseId = String(id || "");
                        const idx = items.findIndex((it) => it.id === baseId);
                        if (idx >= 0) openLightbox(idx);
                    }}
                />
            {/each}
        </div>
    {/if}
</div>

<style>
    .gallery {
        height: 100vh;
        perspective: none; /* move perspective to each card to keep apparent orientation constant */
        overflow: hidden;
        position: relative;
        touch-action: none;
    }
    .track {
        position: relative;
        height: 100%;
        transform-style: preserve-3d;
        /* Allow only cards to receive pointer events to avoid invisible layers blocking hover */
        pointer-events: none;
    }
    .empty-state {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        color: var(--chip-fg);
        font-size: clamp(16px, 2.6vw, 22px);
        opacity: 0.8;
        pointer-events: none;
    }
    /* Corner fog overlays */
    .gallery::before,
    .gallery::after {
        content: "";
        position: absolute;
        pointer-events: none;
        z-index: 5;
    }
    /* Top-right fog */
    .gallery::before {
        top: 0;
        right: 0;
        width: 65vw;
        height: 55vh;
        background: radial-gradient(
            120% 100% at 100% 0%,
            var(--fog-strong),
            rgba(255, 255, 255, 0) 40%
        );
    }
    /* Bottom-left fog */
    .gallery::after {
        left: 0;
        bottom: 0;
        width: 70vw;
        height: 60vh;
        background: radial-gradient(
            120% 100% at 0% 100%,
            var(--fog-weak),
            rgba(255, 255, 255, 0) 40%
        );
    }
    /* Card visuals live in Card.svelte */
    /* Responsive tweak to keep label looking consistent on smaller screens */
    @media (max-width: 640px) {
        /* Mobile-only tweaks owned by Filters/Card */
    }
    /* Card hover/floor-label styles moved to Card.svelte */
</style>
