<script lang="ts">
    import gsap from "gsap";
    import type { GalleryItem } from "../types";
    import { transformStore } from "../stores/transform";
    import { get } from "svelte/store";
    const { items = [] as GalleryItem[] } = $props<{ items?: GalleryItem[] }>();

    // Controls (Svelte 5 runes)
    const init = get(transformStore);
    let rotateX = $state(init.rotateX ?? -2);
    let rotateY = $state(init.rotateY ?? -17);
    let rotateZ = $state(init.rotateZ ?? 6);
    let skewX = $state(init.skewX ?? 5);
    let scale = $state(init.scale ?? 0.77);
    let perspective = $state(init.perspective ?? 1230);
    let perspectiveOrigin = $state("50% 50%");
    let perspectiveNorm = $state(0);
    let parallelEdges = $state(init.parallelEdges ?? false);

    // Modes
    function setMode(mode: "normal" | "parallel" | "orthographic" | "yours") {
        switch (mode) {
            case "parallel":
                perspective = 2000;
                perspectiveOrigin = "50% 45%";
                break;
            case "orthographic":
                perspective = 0; // none
                perspectiveOrigin = "50% 50%";
                break;
            case "yours":
                rotateX = -2;
                rotateY = -17;
                rotateZ = 6;
                skewX = 5;
                scale = 0.77;
                perspective = 1230;
                perspectiveOrigin = "50% 45%";
                parallelEdges = false;
                break;
            case "normal":
            default:
                perspective = 1000;
                perspectiveOrigin = "50% 50%";
                rotateX = 15;
                rotateY = -25;
                rotateZ = 5;
                skewX = 0;
                scale = 1;
        }
    }

    let cardEl: HTMLDivElement;
    let overlayEl: HTMLDivElement | null = null;

    function openModal() {
        if (!cardEl) return;
        const rect = cardEl.getBoundingClientRect();
        const clone = cardEl.cloneNode(true) as HTMLDivElement;
        clone.style.position = "fixed";
        clone.style.left = rect.left + "px";
        clone.style.top = rect.top + "px";
        clone.style.margin = "0";
        clone.style.zIndex = "1001";
        clone.style.transform = cardEl.style.transform;
        clone.style.width = rect.width + "px";
        clone.style.height = rect.height + "px";

        overlayEl = document.createElement("div");
        overlayEl.className = "tuner-overlay";
        document.body.appendChild(overlayEl);
        document.body.appendChild(clone);

        const targetW = Math.min(window.innerWidth * 0.9, 1200);
        const targetH = targetW * (rect.height / rect.width);
        const targetX = (window.innerWidth - targetW) / 2;
        const targetY = (window.innerHeight - targetH) / 2;

        gsap.to(overlayEl, { opacity: 1, duration: 0.25, ease: "power2.out" });
        gsap.to(clone, {
            left: targetX,
            top: targetY,
            width: targetW,
            height: targetH,
            transform:
                "rotateX(0deg) rotateY(0deg) rotateZ(0deg) skewX(0deg) scale(1)",
            duration: 0.45,
            ease: "power3.out",
        });

        const close = () => {
            gsap.to(overlayEl!, {
                opacity: 0,
                duration: 0.2,
                ease: "power2.in",
            });
            gsap.to(clone, {
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
                transform: cardEl.style.transform,
                duration: 0.35,
                ease: "power3.in",
                onComplete: () => {
                    clone.remove();
                    overlayEl?.remove();
                    overlayEl = null;
                },
            });
        };

        overlayEl.addEventListener("click", close, { once: true });
    }

    $effect(() => {
        // Keep inline transform up to date for the card element
        if (!cardEl) return;
        const effectiveYaw = parallelEdges ? 0 : rotateY;
        const effectiveRoll = parallelEdges ? rotateZ + rotateY : rotateZ;
        const parts = [
            perspective ? `perspective(${perspective}px)` : "",
            `rotateX(${rotateX}deg)`,
            `rotateY(${effectiveYaw}deg)`,
            `rotateZ(${effectiveRoll}deg)`,
            ...(skewX ? [`skewX(${skewX}deg)`] : []),
            `scale(${scale})`,
        ].filter(Boolean);
        cardEl.style.transform = parts.join(" ");
        (cardEl.style as any).transformOrigin = "50% 50%";
        // broadcast to gallery
        transformStore.set({
            rotateX,
            rotateY,
            rotateZ,
            skewX,
            scale,
            perspective: perspective || 0,
            parallelEdges,
        });
        perspectiveNorm = Number(((perspective || 0) / 2000).toFixed(2));
    });
</script>

<div class="tuner">
    <div class="panel">
        <div class="hdr">Card Transition Tuner</div>
        <div class="controls">
            <div class="slider-row">
                <div class="lab">Rotate X</div>
                <input
                    type="range"
                    min="-60"
                    max="60"
                    bind:value={rotateX}
                    title={String(rotateX)}
                />
                <div class="val">{rotateX}°</div>
            </div>
            <div class="slider-row">
                <div class="lab">Rotate Y</div>
                <input
                    type="range"
                    min="-60"
                    max="60"
                    bind:value={rotateY}
                    title={String(rotateY)}
                />
                <div class="val">{rotateY}°</div>
            </div>
            <div class="slider-row">
                <div class="lab">Rotate Z</div>
                <input
                    type="range"
                    min="-45"
                    max="45"
                    bind:value={rotateZ}
                    title={String(rotateZ)}
                />
                <div class="val">{rotateZ}°</div>
            </div>
            <div class="slider-row">
                <div class="lab">Skew X</div>
                <input
                    type="range"
                    min="-20"
                    max="20"
                    bind:value={skewX}
                    title={String(skewX)}
                />
                <div class="val">{skewX}°</div>
            </div>
            <div class="slider-row">
                <div class="lab">Scale</div>
                <input
                    type="range"
                    min="0.6"
                    step="0.01"
                    max="1.5"
                    bind:value={scale}
                    title={String(scale)}
                />
                <div class="val">{scale.toFixed(2)}</div>
            </div>
            <div class="slider-row">
                <div class="lab">Perspective</div>
                <input
                    type="range"
                    min="0"
                    max="3000"
                    step="10"
                    bind:value={perspective}
                    title={String(perspective)}
                />
                <div class="val">{perspective}px</div>
            </div>
        </div>
        <div class="row buttons">
            <button class="btn" onclick={() => setMode("normal")}>Normal</button
            >
            <button class="btn" onclick={() => setMode("parallel")}
                >Parallel</button
            >
            <button class="btn" onclick={() => setMode("orthographic")}
                >Ortho</button
            >
            <button class="btn" onclick={() => setMode("yours")}
                >Defaults (-2,-17,6)</button
            >
        </div>
        <div class="slider-row">
            <div class="lab">Parallel Edges</div>
            <input type="checkbox" bind:checked={parallelEdges} />
            <div class="val">{parallelEdges ? "On" : "Off"}</div>
        </div>
    </div>

    <div
        class="stage"
        style={`perspective: none; perspective-origin: ${perspectiveOrigin}`}
    >
        <div class="card" bind:this={cardEl}>
            <img
                src={items[0]?.src ||
                    "https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?q=80&w=1600&auto=format&fit=crop"}
                alt="preview"
            />
            <div class="actions">
                <button class="btn open" onclick={openModal}>Open modal</button>
            </div>
        </div>
    </div>
</div>

<style>
    .tuner {
        position: fixed;
        inset: auto 12px 12px auto;
        z-index: 60;
        display: grid;
        gap: 12px;
        align-items: start;
    }
    .panel {
        background: rgba(255, 255, 255, 0.92);
        backdrop-filter: blur(6px);
        padding: 12px;
        border-radius: 10px;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.15);
        width: 320px;
    }
    .hdr {
        font-weight: 650;
        margin-bottom: 10px;
    }
    .controls {
        display: grid;
        gap: 8px;
    }
    .slider-row {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .lab {
        width: 84px;
        font-size: 12px;
        color: #333;
        flex: 0 0 auto;
    }
    input[type="range"] {
        flex: 1 1 auto;
        min-width: 0;
    }
    .val {
        width: 90px;
        font-size: 11px;
        color: #666;
        text-align: right;
        flex: 0 0 auto;
    }
    .row.buttons {
        display: flex;
        gap: 6px;
        margin-top: 8px;
        flex-wrap: wrap;
    }
    .btn {
        border: none;
        background: #111;
        color: #fff;
        padding: 6px 10px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 12px;
    }
    .btn:hover {
        background: #000;
    }

    .stage {
        width: 380px;
        height: 260px;
        display: grid;
        place-items: center;
    }
    .card {
        width: 300px;
        height: 200px;
        background: #0e0e0e;
        border: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.3);
        transform-style: preserve-3d;
        position: relative;
        overflow: hidden;
    }
    .card img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
    }
    .actions {
        position: absolute;
        right: 8px;
        bottom: 8px;
    }
    .open {
        background: #764ba2;
    }

    :global(.tuner-overlay) {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        opacity: 0;
        z-index: 1000;
    }
</style>
