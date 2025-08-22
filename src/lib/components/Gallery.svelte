<script lang="ts">
    import { onMount, tick } from "svelte";
    import { fade } from "svelte/transition";
    // Social links are provided by parent (App) to avoid bundling a local config file in packages
    export let socials: Record<string, string> = {};
    import gsap from "gsap";
    (gsap as any).config({ skewType: "simple", force3D: true });
    import type { GalleryConfig, GalleryItem } from "../types";
    import { transformStore } from "../stores/transform";

    export let items: GalleryItem[] = [];
    export let config: GalleryConfig;
    // Control visibility of filter UI from parent (e.g., hide when lightbox is open)
    export let showFilters: boolean = true;
    // Mobile UI flag for conditional rendering
    let isMobileUI = false;
    // Category dropdown open state (mobile)
    let catOpen = false;
    // Tag filtering
    let activeFilter: string = "All";
    const allFilters = () => {
        if (config.filters && config.filters.length) return config.filters;
        const set = new Set<string>();
        for (const it of items) {
            for (const t of it.tags || []) set.add(t);
        }
        const tags = Array.from(set);
        return ["All", ...tags];
    };
    const slugify = (s: string) =>
        s
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^[-]+|[-]+$/g, "");
    const findFilterForPath = (path: string) => {
        const seg = (path || "/").split("?")[0];
        if (seg === "/" || seg === "") return "All";
        const name = decodeURIComponent(seg.replace(/^\//, ""));
        const match = allFilters().find((f) => slugify(f) === slugify(name));
        return match || "All";
    };
    const navigateToFilter = (f: string) => {
        const isAll = f === "All";
        const target = isAll ? "/" : `/${slugify(f)}`;
        try {
            history.pushState({ tag: f }, "", target);
        } catch {}
    };
    // Centralized filter change logic (used by chips and mobile dropdown)
    const changeFilter = async (f: string) => {
        if (activeFilter === f) return;
        const seq = ++filterLoadSeq;
        isCategoryLoading = true;
        categoryProgress = 0;
        navigateToFilter(f);
        activeFilter = f;
        await preloadItems(items.filter((it) => belongsToFilter(it, f)));
        // small UX delay
        await new Promise((r) => setTimeout(r, 1000));
        if (seq !== filterLoadSeq) return; // ignore stale
        const cleanup = (container as any)?._cleanupBookshelf;
        if (cleanup) cleanup();
        await tick();
        applyBookshelfLayout();
        isCategoryLoading = false;
    };
    const normalize = (s: string) => s.trim().toLowerCase();
    const otherFilterSet = () =>
        new Set(
            allFilters()
                .map(normalize)
                .filter((f) => f !== "all" && f !== "others"),
        );
    const belongsToFilter = (it: GalleryItem, filter: string): boolean => {
        const nf = normalize(filter);
        if (nf === "all") return true;
        const tags = (it.tags || []).map(normalize);
        if (nf === "others") {
            const others = otherFilterSet();
            return tags.length === 0 || tags.every((t) => !others.has(t));
        }
        return tags.includes(nf);
    };
    $: filtered = items.filter((it) => belongsToFilter(it, activeFilter));
    // Local loading state when switching categories
    let isCategoryLoading = false;
    let categoryProgress = 0;
    let filterLoadSeq = 0;

    const preloadItems = async (list: GalleryItem[]) => {
        // Limit preloading to a small window around what will be visible to avoid heavy network usage
        const limited = list.slice(0, Math.min(list.length, poolSize * 2));
        const total = Math.max(1, limited.length);
        let completed = 0;
        const update = () =>
            (categoryProgress = Math.round((completed / total) * 100));
        const concurrency = Math.max(1, config.preloadConcurrency ?? 4);
        const loadOne = (m: GalleryItem) =>
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
        let i = 0;
        const runNext = async (): Promise<void> => {
            if (i >= limited.length) return;
            const current = limited[i++];
            await loadOne(current);
            return runNext();
        };
        await Promise.all(Array.from({ length: concurrency }, runNext));
    };
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

    const BASE_REPEAT = 1; // minimal buffer for smooth recycling
    const MIN_VISIBLE = 12; // ensure we start with at least this many cards rendered
    // Virtualization: render a small pool of cards and recycle their content as you scroll
    const FIXED_POOL = 14;
    let poolSize = FIXED_POOL; // hard-cap to 12 for testing
    let pool = Array.from({ length: poolSize }, (_, i) => ({
        key: `pool_${i}`,
    }));

    const getLabelText = (item: GalleryItem) => {
        const fromCaption = item.caption?.trim();
        const fromAlt = item.alt?.trim();
        const fromSrc = (() => {
            try {
                const url = new URL(
                    item.src,
                    typeof window !== "undefined"
                        ? window.location.href
                        : "http://local",
                );
                const name = url.pathname.split("/").pop() || "";
                return name || undefined;
            } catch (_) {
                const parts = (item.src || "").split("/");
                return parts[parts.length - 1] || undefined;
            }
        })();
        return fromCaption || fromAlt || fromSrc || "";
    };

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
            if (label) label.textContent = getLabelText(item);
        };

        const IDLE_EPSILON = 0.1;
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
        try {
            const mq =
                window.matchMedia && window.matchMedia("(max-width: 640px)");
            const apply = () => (isMobileUI = !!mq?.matches);
            apply();
            mq?.addEventListener?.("change", apply as any);
        } catch {}
        // sync filter from URL on load, then wait a tick so cards render before layout
        try {
            activeFilter = findFilterForPath(location.pathname);
        } catch {}
        tick().then(() => {
            applyBookshelfLayout();
        });
        const onPop = () => {
            const next = findFilterForPath(location.pathname);
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
    <!-- Dark mode toggle at top of category section -->
    {#if showFilters && isCategoryLoading}
        <div
            class="cat-loading"
            aria-live="polite"
            aria-busy="true"
            transition:fade={{ duration: 220 }}
        >
            <div class="ring"></div>
        </div>
    {/if}
    {#if showFilters}
        <div class="filters" aria-label="Filters">
            <!-- Dark mode moved to socials row (bottom-right) -->

            {#if !isMobileUI}
                <!-- Desktop: collapsed stack (first 4 + stack indicator) -->
                <div class="chips chips-collapsed">
                    {#each allFilters().slice(0, 4) as f}
                        <button
                            class={`filter ${activeFilter === f ? "is-active" : ""}`}
                            type="button"
                            onclick={(e) => {
                                changeFilter(f);
                                (e.currentTarget as HTMLElement)?.blur?.();
                            }}
                        >
                            {f}
                        </button>
                    {/each}
                    {#if allFilters().length > 4}
                        <button
                            class="filter more-chip"
                            type="button"
                            aria-haspopup="true"
                            aria-expanded="false"
                            title={`+${allFilters().length - 4} more`}
                        >
                            +{allFilters().length - 4} more
                        </button>
                    {/if}
                </div>
                <!-- Desktop: full list on hover/focus -->
                <div class="chips chips-full">
                    {#each allFilters() as f}
                        <button
                            class={`filter ${activeFilter === f ? "is-active" : ""}`}
                            type="button"
                            onclick={(e) => {
                                changeFilter(f);
                                (e.currentTarget as HTMLElement)?.blur?.();
                            }}
                        >
                            {f}
                        </button>
                    {/each}
                </div>
            {:else}
                <div class="cat-dropdown">
                    <button
                        class="cat-toggle"
                        type="button"
                        aria-haspopup="listbox"
                        aria-expanded={catOpen}
                        onclick={() => (catOpen = !catOpen)}
                    >
                        {activeFilter}
                        <span class="caret" aria-hidden="true">▾</span>
                    </button>
                    {#if catOpen}
                        <ul class="cat-menu" role="listbox">
                            {#each allFilters() as f}
                                <li>
                                    <button
                                        role="option"
                                        aria-selected={activeFilter === f}
                                        class={`cat-item ${activeFilter === f ? "is-active" : ""}`}
                                        type="button"
                                        onclick={() => {
                                            catOpen = false;
                                            changeFilter(f);
                                        }}
                                    >
                                        <span class="cat-row">{f}</span>
                                    </button>
                                </li>
                            {/each}
                        </ul>
                    {/if}
                </div>
            {/if}

            <!-- Socials pinned to bottom inside filters -->
            {#if socials}
                <div class="socials socials-bottom">
                    {#if socials.github}
                        <a
                            class="social btn"
                            href={socials.github}
                            target="_blank"
                            rel="noopener"
                            aria-label="GitHub"
                            title="GitHub"
                            ><svg viewBox="0 0 24 24" aria-hidden="true"
                                ><path
                                    fill="currentColor"
                                    d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.83 1.23 1.83 1.23 1.07 1.83 2.8 1.3 3.49.99.11-.78.42-1.3.76-1.6-2.67-.31-5.48-1.34-5.48-5.95 0-1.31.47-2.38 1.23-3.22-.12-.3-.53-1.56.12-3.25 0 0 1.01-.32 3.3 1.23a11.4 11.4 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.69.24 2.95.12 3.25.77.84 1.23 1.91 1.23 3.22 0 4.62-2.82 5.64-5.5 5.94.43.38.81 1.12.81 2.26v3.35c0 .32.21.69.83.57A12 12 0 0 0 12 .5Z"
                                /></svg
                            ></a
                        >
                    {/if}
                    {#if socials.twitter}
                        <a
                            class="social btn"
                            href={socials.twitter}
                            target="_blank"
                            rel="noopener"
                            aria-label="Twitter"
                            title="Twitter"
                            ><svg viewBox="0 0 24 24" aria-hidden="true"
                                ><path
                                    fill="currentColor"
                                    d="M22.46 6c-.77.35-1.6.58-2.46.69.88-.53 1.56-1.37 1.88-2.37-.83.49-1.76.85-2.74 1.05A4.25 4.25 0 0 0 16.1 4c-2.36 0-4.28 1.92-4.28 4.28 0 .34.04.67.11.99-3.56-.18-6.72-1.88-8.84-4.47-.37.63-.58 1.37-.58 2.16 0 1.49.76 2.8 1.92 3.57-.71-.02-1.37-.22-1.95-.54v.05c0 2.08 1.47 3.82 3.42 4.21-.36.1-.74.15-1.13.15-.28 0-.55-.03-.82-.08.55 1.73 2.16 2.99 4.06 3.02A8.52 8.52 0 0 1 2 19.54 12.03 12.03 0 0 0 8.29 21c7.55 0 11.68-6.26 11.68-11.68 0-.18 0-.35-.01-.53.8-.58 1.5-1.31 2.06-2.14Z"
                                /></svg
                            ></a
                        >
                    {/if}
                    {#if socials.youtube}
                        <a
                            class="social btn"
                            href={socials.youtube}
                            target="_blank"
                            rel="noopener"
                            aria-label="YouTube"
                            title="YouTube"
                            ><svg viewBox="0 0 24 24" aria-hidden="true"
                                ><path
                                    fill="currentColor"
                                    d="M23.5 6.2s-.23-1.6-.9-2.3c-.86-.9-1.83-.9-2.27-1C16.86 2.5 12 2.5 12 2.5h-.01s-4.86 0-8.32.4c-.44.1-1.41.1-2.27 1-.67.7-.9 2.3-.9 2.3S0 8.1 0 10v1.9c0 1.9.5 3.8.5 3.8s.23 1.6.9 2.3c.86.9 1.98.9 2.48 1 1.8.2 7.62.4 8.12.4h.01s4.86 0 8.32-.4c.44-.1 1.41-.1 2.27-1 .67-.7.9-2.3.9-2.3s.5-1.9.5-3.8V10c0-1.9-.5-3.8-.5-3.8ZM9.75 13.88V7.88l6 3-6 3Z"
                                /></svg
                            ></a
                        >
                    {/if}
                    {#if Array.isArray(socials.links)}
                        {#each socials.links as l}
                            <a
                                class="social btn"
                                href={l.href}
                                target="_blank"
                                rel="noopener"
                                aria-label={l.label || "Link"}
                                title={l.label || l.href}
                                ><svg viewBox="0 0 24 24" aria-hidden="true"
                                    ><path
                                        fill="currentColor"
                                        d="M3.9 12a4.1 4.1 0 0 1 4.1-4.1h4v-2h-4A6.1 6.1 0 0 0 1.9 12a6.1 6.1 0 0 0 6.1 6.1h4v-2h-4A4.1 4.1 0 0 1 3.9 12Zm5-1h6.2v2H8.9v-2ZM14 5.9h4A6.1 6.1 0 0 1 24.1 12 6.1 6.1 0 0 1 18 18.1h-4v-2h4a4.1 4.1 0 0 0 4.1-4.1A4.1 4.1 0 0 0 18 7.9h-4v-2Z"
                                    /></svg
                                ></a
                            >
                        {/each}
                    {/if}
                    <!-- Dark mode toggle at end of socials row -->
                    <button
                        class="dark-toggle"
                        type="button"
                        aria-label="Toggle dark mode"
                        onclick={() => {
                            const root = document?.documentElement;
                            if (!root) return;
                            const next = !root.classList.contains("dark");
                            root.classList.toggle("dark", next);
                            try {
                                localStorage.setItem(
                                    "aperture:theme",
                                    next ? "dark" : "light",
                                );
                                window.dispatchEvent(
                                    new CustomEvent("aperture:theme-change", {
                                        detail: next ? "dark" : "light",
                                    }),
                                );
                            } catch {}
                        }}
                    >
                        🌙
                    </button>
                </div>
            {/if}
        </div>
    {/if}
    {#if filtered.length === 0}
        <div class="empty-state" role="status" aria-live="polite">
            Nothing to see here
        </div>
    {:else}
        <div class="track" bind:this={track}>
            {#each pool as p, i (p.key)}
                <button
                    class="card"
                    style={`--i:${i}`}
                    type="button"
                    onclick={(e) => {
                        const id =
                            (e.currentTarget as HTMLElement)?.dataset?.itemId ||
                            "";
                        const baseId = String(id);
                        const idx = items.findIndex((it) => it.id === baseId);
                        if (idx >= 0) openLightbox(idx);
                    }}
                >
                    <div
                        class="slab"
                        style={`--t:${config.thickness ?? 12}px; --ea:${config.edgeAmplify ?? 1.4}; --db:${config.depthBlur ?? 0}px;${config.fixedCardWidth ? ` --w:${config.fixedCardWidth}px; --max-w:none;` : ""}${config.fixedCardHeight ? ` --h:${config.fixedCardHeight}px; --max-h:none;` : ""}`}
                    >
                        <div class="face front">
                            <img class="media-img" alt="" loading="lazy" />
                            <video
                                class="media-video"
                                muted
                                playsinline
                                preload="metadata"
                            ></video>
                        </div>
                        <div class="floor-label" aria-hidden="true">
                            <span class="floor-label__text"></span>
                        </div>
                    </div>
                </button>
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
    .cat-loading {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        z-index: 1000001;
        pointer-events: auto;
        background: var(--bg);
    }
    .ring {
        width: 42px;
        height: 42px;
        border-radius: 999px;
        border: 3px solid color-mix(in oklab, var(--fg) 12%, transparent);
        border-top-color: color-mix(in oklab, var(--fg) 60%, transparent);
        animation: spin 1s linear infinite;
    }
    @keyframes spin {
        from {
            transform: rotate(0deg);
        }
        to {
            transform: rotate(360deg);
        }
    }
    .filters {
        position: absolute;
        right: 16px;
        bottom: 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        z-index: 1000004;
        pointer-events: auto;
    }
    .dark-toggle {
        width: 36px;
        height: 36px;
        border-radius: 8px;
        border: 1px solid #cfcfcf;
        background: var(--chip-bg);
        color: #444;
        cursor: pointer;
        display: grid;
        place-items: center;
        transition:
            background-color 0.2s ease,
            border-color 0.2s ease;
    }
    .dark-toggle:hover {
        background: var(--chip-bg-hover);
        border-color: #a8a8a8;
    }
    .socials {
        display: flex;
        gap: 8px;
        margin-bottom: 6px;
        justify-content: flex-end;
    }
    .btn.social {
        width: 36px;
        height: 36px;
        display: grid;
        place-items: center;
        border-radius: 8px;
        border: 1px solid var(--chip-border);
        background: var(--chip-bg);
        color: var(--chip-fg-active);
        cursor: pointer;
        text-decoration: none;
    }
    .btn.social:hover {
        background: var(--chip-bg-hover);
        border-color: var(--chip-border-active);
    }
    .btn.social svg {
        width: 18px;
        height: 18px;
        display: block;
    }
    /* Desktop chips layout */
    .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
    }
    /* Collapsed vs full behavior on desktop */
    @media (min-width: 641px) {
        .chips-full {
            display: none;
        }
        .filters:hover .chips-full,
        .filters:focus-within .chips-full {
            display: flex;
            flex-direction: column;
            align-items: stretch;
            gap: 8px;
        }
        .filters:hover .chips-collapsed,
        .filters:focus-within .chips-collapsed {
            display: none;
        }
        /* Collapsed (first 4) should also be vertical */
        .chips-collapsed {
            display: flex;
            flex-direction: column;
            align-items: stretch;
            gap: 8px;
        }
    }
    /* +N more chip matches filter chip size */
    .more-chip {
        font-weight: 500;
    }
    /* Ensure native touch gestures are allowed inside filters/dropdown even though .gallery disables them */
    .filters,
    .filters * {
        touch-action: auto;
    }
    /* Mobile category dropdown styles */
    .cat-dropdown {
        position: relative;
    }
    .cat-toggle {
        background: var(--chip-bg);
        color: var(--chip-fg);
        border: 1px solid var(--chip-border);
        padding: 6px 12px;
        border-radius: 8px;
        font-size: 12px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 8px;
    }
    .cat-toggle .caret {
        opacity: 0.7;
    }
    .cat-menu {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        left: auto;
        width: min(92vw, 420px);
        max-height: min(60vh, 420px);
        overflow: auto;
        list-style: none;
        padding: 8px;
        margin: 0;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        background: var(--chip-bg);
        border: 1px solid var(--chip-border);
        border-radius: 12px;
        box-shadow:
            0 16px 50px rgba(0, 0, 0, 0.18),
            0 6px 20px rgba(0, 0, 0, 0.12);
        z-index: 1000006;
        -webkit-overflow-scrolling: touch;
        touch-action: pan-y;
        transform: translateZ(0);
    }
    .cat-item {
        width: 100%;
        background: transparent;
        border: 0;
        padding: 0;
        text-align: left;
        cursor: pointer;
    }
    .cat-row {
        position: relative;
        display: block;
        width: 100%;
        padding: 10px 12px;
        border-radius: 8px;
        background: var(--chip-bg);
        color: var(--chip-fg);
        border: 1px solid var(--chip-border);
    }
    .cat-item.is-active .cat-row {
        background: var(--chip-bg-active);
        color: var(--chip-fg-active);
        border-color: var(--chip-border-active);
    }
    .filter {
        background: var(--chip-bg);
        color: var(--chip-fg);
        border: 1px solid var(--chip-border);
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 12px;
        cursor: pointer;
        transition:
            border-color 0.2s ease,
            color 0.2s ease,
            background-color 0.2s ease;
    }
    .filter:hover {
        border-color: var(--chip-border-active);
        color: var(--chip-fg-active);
        background-color: var(--chip-bg-hover);
    }
    .filter.is-active {
        border-color: var(--chip-border-active);
        color: var(--chip-fg-active);
        background-color: var(--chip-bg-active);
    }
    /* Desktop: soften category controls until hover/focus; socials remain full strength */
    @media (min-width: 641px) {
        .filters .filter {
            opacity: 0.28;
            transition: opacity 0.2s ease;
        }
        .filters:hover .filter,
        .filters:focus-within .filter {
            opacity: 1;
        }
        /* Keep socials unchanged */
        .filters .socials {
            opacity: 1;
        }
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
    .card {
        position: absolute;
        top: 50%;
        left: 50%;
        transform-style: preserve-3d;
        cursor: zoom-in;
        will-change: transform;
        background: transparent;
        border: 0;
        padding: 0;
        z-index: calc(1000 - var(--i, 0));
        /* Re-enable pointer events on cards and their children */
        pointer-events: auto;
    }
    .slab {
        width: var(
            --w,
            min(76vw, var(--base, 520px), calc(85vh * var(--aspect, 4 / 3)))
        );
        height: var(--h, auto);
        max-width: var(--max-w, var(--base, 520px));
        max-height: var(--max-h, min(var(--base, 520px), 85vh));
        aspect-ratio: var(--aspect, 4 / 3);
        border-radius: 0;
        overflow: visible;
        background: transparent;
        box-shadow: none;
        transition: transform 0.25s ease;
        will-change: transform, box-shadow;
        position: relative;
        transform-style: preserve-3d;
        /* Center slab so thickness extrudes both directions */
        transform: translateZ(calc(var(--t) * -0.5));
    }
    .slab .face {
        position: absolute;
        inset: 0;
        overflow: hidden;
    }
    .slab .front {
        z-index: 2;
        background: #0e0e0e;
        transform: translateZ(calc(var(--t) * 0.5));
    }
    /* Edges removed for testing: right/top faces not rendered */
    /* Floor label: appears like writing on the ground to the right of the slab */
    .slab .floor-label {
        position: absolute;
        left: 100%;
        top: 85%;
        margin-left: calc(var(--w, min(76vw, var(--base, 520px))) * 0.12);
        transform-origin: top left;
        z-index: 0;
        pointer-events: none;
        filter: blur(0.1px);
        backface-visibility: hidden;
    }
    .floor-label__text {
        display: inline-block;
        font-size: clamp(20px, 3vw, 44px);
        color: #a6a6a6;
        text-transform: uppercase;
        opacity: 0.45;
        /* Chalk/paint glow on the floor */
        text-shadow:
            0 1px 0 rgba(200, 200, 200, 0.55),
            0 4px 10px rgba(160, 160, 160, 0.25);
        white-space: nowrap;
    }
    /* Responsive tweak to keep label looking consistent on smaller screens */
    @media (max-width: 640px) {
        /* Conservative dropdown anchored to top-right under the toggle */
        .cat-menu {
            position: absolute;
            top: calc(100% + 8px);
            right: 0;
            left: auto;
            width: min(80vw, 360px);
            max-height: min(60dvh, 420px);
        }
        /* Keep filters compact at top-right (no stretch across) */
        .filters {
            top: calc(env(safe-area-inset-top) + 8px);
            right: calc(env(safe-area-inset-right) + 8px);
            left: auto; /* don't stretch across; keep compact at top-right */
            bottom: auto;
            flex-direction: row;
            align-items: center;
            gap: 8px;
            overflow: visible; /* allow dropdown to render outside */
            padding: 4px 6px;
            border-radius: 10px;
            background: transparent;
            border: 0;
            -webkit-overflow-scrolling: touch;
        }
        .filters::-webkit-scrollbar {
            display: none;
        }
        .socials-bottom {
            display: none;
        }
        .dark-toggle {
            width: 32px;
            height: 32px;
            flex: 0 0 auto;
        }
        /* Hide chip list on mobile; use dropdown instead */
        .filter {
            display: none;
        }

        .slab .floor-label {
            top: 90%;
            margin-left: calc(var(--w, min(76vw, var(--base, 520px))) * 0.08);
        }
        .floor-label__text {
            font-size: clamp(24px, 4.2vw, 28px);
        }
    }
    .slab .front img,
    .slab .front video {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
    }
    .card:hover .slab,
    .card:focus-visible .slab {
        /* Slide out like a book to the right while lifting slightly */
        transform: translateZ(14px) translateX(120px);
    }

    @media (max-width: 900px) {
        .card-face {
            border-radius: 0;
        }
    }
</style>
