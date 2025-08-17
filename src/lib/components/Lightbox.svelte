<script lang="ts">
    import { onMount } from "svelte";
    import type { GalleryItem } from "../types";

    export let items: GalleryItem[] = [];
    export let index: number;
    export let open: boolean;

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
            {:else if items[index].kind === "yt-video" && items[index].url}
                <div class="yt-embed">
                    <iframe
                        src={`https://www.youtube.com/embed/${items[index].id.split(":")[1]}?autoplay=1&rel=0`}
                        title={items[index].alt}
                        frameborder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowfullscreen
                    ></iframe>
                </div>
            {/if}
            {#if items[index].caption}
                <div class="caption">{items[index].caption}</div>
            {/if}
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
        background: color-mix(in hsl, black 85%, transparent);
        z-index: 1000;
    }
    .stage {
        position: relative;
        width: min(96vw, 1200px);
        justify-self: center;
        align-self: center;
    }
    .media {
        width: 100%;
        height: auto;
        display: block;
        border-radius: 12px;
        box-shadow: 0 50px 120px rgba(0, 0, 0, 0.8);
        background: #111;
    }
    .caption {
        margin-top: 0.75rem;
        color: #e8e8e8;
        text-align: center;
        font-size: 1.8rem;
    }
    .yt-embed {
        margin-top: 12px;
        aspect-ratio: 16 / 9;
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
</style>
