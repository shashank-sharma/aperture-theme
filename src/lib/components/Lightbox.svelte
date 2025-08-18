<script lang="ts">
    import { onMount } from "svelte";
    import type { GalleryItem } from "../types";

    export let items: GalleryItem[] = [];
    export let index: number;
    export let open: boolean;

    const getLabelText = (item: GalleryItem | undefined): string => {
        if (!item) return "";
        const fromCaption = (item as any)?.caption?.trim?.();
        const fromAlt = (item as any)?.alt?.trim?.();
        const fromSrc = (() => {
            try {
                const url = new URL(
                    (item as any).src,
                    typeof window !== "undefined"
                        ? window.location.href
                        : "http://local",
                );
                const name = url.pathname.split("/").pop() || "";
                return name || undefined;
            } catch (_) {
                const parts = String((item as any).src || "").split("/");
                return parts[parts.length - 1] || undefined;
            }
        })();
        return fromCaption || fromAlt || fromSrc || "";
    };

    const close = () => (open = false);
    const next = () => (index = (index + 1) % items.length);
    const prev = () => (index = (index - 1 + items.length) % items.length);

    onMount(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!open) return;
            if (e.key === "Escape") close();
            if (e.key === "ArrowRight") next();
            if (e.key === "ArrowLeft") prev();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    });
</script>

{#if open}
    <div
        class="overlay"
        role="dialog"
        tabindex="-1"
        aria-modal="true"
        aria-label={getLabelText(items[index]) || "Lightbox"}
        onclick={(e) => e.target === e.currentTarget && (open = false)}
        onkeydown={(e) => {
            if (e.key === "Escape") open = false;
            if (e.key === "ArrowRight") next();
            if (e.key === "ArrowLeft") prev();
        }}
    >
        <button
            class="nav left"
            aria-label="Previous"
            onclick={(e) => {
                e.stopPropagation();
                prev();
            }}>‹</button
        >
        <div class="stage">
            {#if items[index].kind === "image"}
                <img
                    class="media"
                    src={items[index].src}
                    alt={items[index].alt}
                />
            {:else if items[index].kind === "video"}
                <video
                    class="media"
                    src={items[index].src}
                    autoplay
                    controls
                    playsinline
                >
                    <track
                        kind="captions"
                        label="English"
                        srclang="en"
                        default
                        src={"data:text/vtt;charset=utf-8," +
                            encodeURIComponent(
                                "WEBVTT\n\n00:00.000 --> 99:59.000\n" +
                                    (items[index].caption ||
                                        items[index].alt ||
                                        "Video"),
                            )}
                    />
                </video>
            {:else if items[index].kind === "yt-video" && (items[index].url || items[index].id)}
                <div class="yt-embed">
                    {#key items[index].id}
                        <iframe
                            src={`https://www.youtube.com/embed/${(() => {
                                const item = items[index];
                                const fromId = (item.id || "").includes(":")
                                    ? item.id.split(":")[1]
                                    : item.id;
                                if (fromId) return fromId;
                                try {
                                    const u = new URL(item.url || "");
                                    const idParam = u.searchParams.get("v");
                                    if (idParam) return idParam;
                                    const path = (u.pathname || "/").split("/");
                                    return path[path.length - 1] || "";
                                } catch (_) {
                                    return "";
                                }
                            })()}?autoplay=1&rel=0`}
                            title={items[index].alt}
                            frameborder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowfullscreen
                        ></iframe>
                    {/key}
                </div>
            {/if}
            <div class="meta" aria-live="polite">
                <div class="title">{getLabelText(items[index])}</div>
                {#if items[index].caption}
                    <div class="caption">{items[index].caption}</div>
                {/if}
            </div>
        </div>
        <button
            class="nav right"
            aria-label="Next"
            onclick={(e) => {
                e.stopPropagation();
                next();
            }}>›</button
        >
        <button
            class="close"
            aria-label="Close"
            onclick={(e) => {
                e.stopPropagation();
                close();
            }}>✕</button
        >
    </div>
{/if}

<style>
    .overlay {
        position: fixed;
        inset: 0;
        display: grid;
        grid-template-columns: 80px 1fr 80px;
        align-items: center;
        background: color-mix(in oklab, var(--bg) 15%, black 85%);
        z-index: 1000;
    }
    .stage {
        position: relative;
        width: min(92vw, 1100px);
        justify-self: center;
        align-self: center;
        max-height: 82vh;
    }
    .media {
        width: 100%;
        height: auto;
        max-height: 82vh;
        object-fit: contain;
        display: block;
        border-radius: 12px;
        box-shadow: 0 50px 120px rgba(0, 0, 0, 0.8);
        background: #111;
    }
    .meta {
        margin-top: 0.75rem;
        text-align: center;
        max-width: min(92vw, 1100px);
        justify-self: center;
        color: #fff;
    }
    .title {
        font-size: clamp(1rem, 2.6vw, 1.6rem);
        font-weight: 600;
        opacity: 0.92;
    }
    .caption {
        margin-top: 0.25rem;
        font-size: clamp(0.9rem, 2.2vw, 1.2rem);
        color: #fff;
    }
    .yt-embed {
        margin-top: 12px;
        aspect-ratio: 16 / 9;
        max-height: 82vh;
    }
    .yt-embed iframe {
        width: 100%;
        height: 100%;
        border: 0;
        border-radius: 12px;
    }
    .nav {
        width: 56px;
        height: 56px;
        border-radius: 999px;
        border: none;
        background: rgba(255, 255, 255, 0.12);
        color: white;
        font-size: 2rem;
        cursor: pointer;
        align-self: center;
        transition: background 0.2s ease;
    }
    .nav:hover {
        background: rgba(255, 255, 255, 0.2);
    }
    .left {
        justify-self: start;
        margin-left: 12px;
    }
    .right {
        justify-self: end;
        margin-right: 12px;
    }
    .close {
        position: fixed;
        top: 16px;
        right: 16px;
        width: 44px;
        height: 44px;
        border-radius: 999px;
        border: none;
        background: rgba(255, 255, 255, 0.15);
        color: white;
        font-size: 1.1rem;
        cursor: pointer;
    }
    .close:hover {
        background: rgba(255, 255, 255, 0.25);
    }
    @media (max-width: 640px) {
        .overlay {
            grid-template-columns: 1fr;
        }
        .nav {
            position: fixed;
            top: 50%;
            transform: translateY(-50%);
            width: 48px;
            height: 48px;
            z-index: 1001;
            background: rgba(255, 255, 255, 0.22);
            color: #000;
            box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35);
        }
        .left {
            left: 8px;
            margin-left: 0;
        }
        .right {
            right: 8px;
            margin-right: 0;
        }
        .stage {
            width: min(94vw, 1100px);
            max-height: 78vh;
        }
        .media {
            max-height: 78vh;
        }
        .meta {
            padding: 0 10px;
        }
    }
</style>
