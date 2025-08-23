<script lang="ts">
    import gsap from "gsap";
    import type { GalleryItem } from "../types";
    import { getLabelText } from "../utils/media";

    const { item, config, index, onOpen } = $props<{
        item?: GalleryItem;
        config: any;
        index: number;
        onOpen: (id: string) => void;
    }>();

    let cardEl: HTMLButtonElement;
    let labelIsLong = $state(false);
    let labelIsVeryLong = $state(false);

    function updateMedia(next: GalleryItem) {
        const card = cardEl;
        if (!card) return;
        card.dataset.itemId = next.id;
        const front = card.querySelector<HTMLElement>(".face.front");
        const imgFront =
            front?.querySelector<HTMLImageElement>("img.media-img");
        const vidFront =
            front?.querySelector<HTMLVideoElement>("video.media-video");
        if (next.kind === "image" || next.kind === "yt-video") {
            if (vidFront) {
                vidFront.pause?.();
                vidFront.removeAttribute("src");
                (vidFront as any).load?.();
                (vidFront as HTMLElement).style.display = "none";
            }
            if (imgFront) {
                (imgFront as any).decoding = "async";
                imgFront.loading = "lazy";
                imgFront.src = next.src;
                imgFront.alt = next.alt || "";
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
                (vidFront as any).playsInline = true;
                vidFront.src = next.src;
                (vidFront as HTMLElement).style.display = "block";
            }
        }
        const label = card.querySelector<HTMLElement>(".floor-label__text");
        if (label) {
            label.textContent = getLabelText(next);
            const len = (label.textContent || "").length;
            labelIsLong = len > 28 && len <= 55;
            labelIsVeryLong = len > 55;
        }
    }

    $effect(() => {
        if (item) updateMedia(item);
    });
</script>

<button
    class="card"
    bind:this={cardEl}
    style={`--i:${index}`}
    type="button"
    onclick={(e) => {
        const id = (e.currentTarget as HTMLElement)?.dataset?.itemId || "";
        onOpen?.(String(id));
    }}
>
    <div
        class="slab"
        style={`--t:${config.thickness ?? 12}px; --ea:${config.edgeAmplify ?? 1.4}; --db:${config.depthBlur ?? 0}px;${config.fixedCardWidth ? ` --w:${config.fixedCardWidth}px; --max-w:none;` : ""}${config.fixedCardHeight ? ` --h:${config.fixedCardHeight}px; --max-h:none;` : ""}`}
    >
        <div class="face front">
            <img class="media-img" alt="" loading="lazy" />
            <video class="media-video" muted playsinline preload="metadata"
            ></video>
        </div>
        <div class="floor-label" aria-hidden="true">
            <span
                class="floor-label__text"
                class:is-long={labelIsLong}
                class:is-very-long={labelIsVeryLong}
            ></span>
        </div>
    </div>
</button>

<style>
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
        transition:
            transform 0.25s ease,
            filter 0.25s ease;
        will-change: transform, box-shadow;
        position: relative;
        transform-style: preserve-3d;
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
        box-shadow:
            inset 0 0 0.5px rgba(255, 255, 255, 0.18),
            inset 0 -10px 22px rgba(0, 0, 0, 0.28);
    }
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
        text-align: left;
        text-transform: uppercase;
        opacity: 0.45;
        text-shadow:
            0 1px 0 rgba(200, 200, 200, 0.55),
            0 4px 10px rgba(160, 160, 160, 0.25);
        white-space: normal;
        width: 600px;
        line-height: 1;
    }
    .floor-label__text.is-long {
        font-size: clamp(18px, 2.6vw, 36px);
        opacity: 0.42;
    }
    .floor-label__text.is-very-long {
        font-size: clamp(16px, 2.3vw, 30px);
        opacity: 0.4;
    }
    .slab .front img,
    .slab .front video {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
    }
    .slab .front::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: calc(var(--t) * 0.75);
        background: linear-gradient(
            to bottom,
            rgba(255, 255, 255, 0.06),
            rgba(0, 0, 0, 0)
        );
        pointer-events: none;
    }
    .slab .front::after {
        content: "";
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        width: calc(var(--t) * 0.75);
        background: linear-gradient(
            to right,
            rgba(0, 0, 0, 0.14),
            rgba(0, 0, 0, 0.34)
        );
        pointer-events: none;
    }
    .slab::after {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: calc(var(--t) * 0.9);
        background: linear-gradient(
            to bottom,
            rgba(0, 0, 0, 0.18),
            rgba(0, 0, 0, 0)
        );
        pointer-events: none;
        transform: translateZ(0);
    }
    .card:hover .slab,
    .card:focus-visible .slab {
        transform: translateZ(14px) translateX(120px);
    }
    @media (max-width: 640px) {
        .slab .floor-label {
            top: 90%;
            margin-left: calc(var(--w, min(76vw, var(--base, 520px))) * 0.08);
        }
        .floor-label__text {
            font-size: clamp(24px, 4.2vw, 28px);
        }
        .floor-label__text.is-long {
            font-size: clamp(22px, 3.8vw, 26px);
        }
        .floor-label__text.is-very-long {
            font-size: clamp(20px, 3.4vw, 24px);
        }
    }
</style>
