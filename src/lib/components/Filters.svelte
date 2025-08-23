<script lang="ts">
    import { fade } from "svelte/transition";
    import { slugify } from "../utils/string";

    export let filters: string[] = [];
    export let active: string = "All";
    export let isLoading: boolean = false;
    export let socials: Record<string, any> = {};
    export let onSelect: (f: string) => void;

    let isMobileUI = false;
    let catOpen = false;

    if (typeof window !== "undefined") {
        const mq = window.matchMedia?.("(max-width: 640px)");
        const apply = () => (isMobileUI = !!mq?.matches);
        apply();
        mq?.addEventListener?.("change", apply as any);
    }
</script>

{#if isLoading}
    <div
        class="cat-loading"
        aria-live="polite"
        aria-busy="true"
        transition:fade={{ duration: 220 }}
    >
        <div class="ring"></div>
    </div>
{/if}

<div class="filters" aria-label="Filters">
    {#if !isMobileUI}
        <div class="chips chips-collapsed">
            {#each filters.slice(0, 4) as f}
                <button
                    class={`filter ${active === f ? "is-active" : ""}`}
                    type="button"
                    onclick={(e) => {
                        onSelect?.(f);
                        (e.currentTarget as HTMLElement)?.blur?.();
                    }}>{f}</button
                >
            {/each}
            {#if filters.length > 4}
                <button
                    class="filter more-chip"
                    type="button"
                    title={`+${filters.length - 4} more`}
                >
                    +{filters.length - 4} more
                </button>
            {/if}
        </div>
        <div class="chips chips-full">
            {#each filters as f}
                <button
                    class={`filter ${active === f ? "is-active" : ""}`}
                    type="button"
                    onclick={(e) => {
                        onSelect?.(f);
                        (e.currentTarget as HTMLElement)?.blur?.();
                    }}>{f}</button
                >
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
                {active}<span class="caret" aria-hidden="true">▾</span>
            </button>
            {#if catOpen}
                <ul class="cat-menu" role="listbox">
                    {#each filters as f}
                        <li>
                            <button
                                role="option"
                                aria-selected={active === f}
                                class={`cat-item ${active === f ? "is-active" : ""}`}
                                type="button"
                                onclick={() => {
                                    catOpen = false;
                                    onSelect?.(f);
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
                >
                    <svg viewBox="0 0 24 24" aria-hidden="true"
                        ><path
                            fill="currentColor"
                            d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.83 1.23 1.83 1.23 1.07 1.83 2.8 1.3 3.49.99.11-.78.42-1.3.76-1.6-2.67-.31-5.48-1.34-5.48-5.95 0-1.31.47-2.38 1.23-3.22-.12-.3-.53-1.56.12-3.25 0 0 1.01-.32 3.3 1.23a11.4 11.4 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.69.24 2.95.12 3.25.77.84 1.23 1.91 1.23 3.22 0 4.62-2.82 5.64-5.5 5.94.43.38.81 1.12.81 2.26v3.35c0 .32.21.69.83.57A12 12 0 0 0 12 .5Z"
                        /></svg
                    >
                </a>
            {/if}
            {#if socials.twitter}
                <a
                    class="social btn"
                    href={socials.twitter}
                    target="_blank"
                    rel="noopener"
                    aria-label="Twitter"
                    title="Twitter"
                >
                    <svg viewBox="0 0 24 24" aria-hidden="true"
                        ><path
                            fill="currentColor"
                            d="M22.46 6c-.77.35-1.6.58-2.46.69.88-.53 1.56-1.37 1.88-2.37-.83.49-1.76.85-2.74 1.05A4.25 4.25 0 0 0 16.1 4c-2.36 0-4.28 1.92-4.28 4.28 0 .34.04.67.11.99-3.56-.18-6.72-1.88-8.84-4.47-.37.63-.58 1.37-.58 2.16 0 1.49.76 2.8 1.92 3.57-.71-.02-1.37-.22-1.95-.54v.05c0 2.08 1.47 3.82 3.42 4.21-.36.1-.74.15-1.13.15-.28 0-.55-.03-.82-.08.55 1.73 2.16 2.99 4.06 3.02A8.52 8.52 0 0 1 2 19.54 12.03 12.03 0 0 0 8.29 21c7.55 0 11.68-6.26 11.68-11.68 0-.18 0-.35-.01-.53.8-.58 1.5-1.31 2.06-2.14Z"
                        /></svg
                    >
                </a>
            {/if}
            {#if socials.youtube}
                <a
                    class="social btn"
                    href={socials.youtube}
                    target="_blank"
                    rel="noopener"
                    aria-label="YouTube"
                    title="YouTube"
                >
                    <svg viewBox="0 0 24 24" aria-hidden="true"
                        ><path
                            fill="currentColor"
                            d="M23.5 6.2s-.23-1.6-.9-2.3c-.86-.9-1.83-.9-2.27-1C16.86 2.5 12 2.5 12 2.5h-.01s-4.86 0-8.32.4c-.44.1-1.41.1-2.27 1-.67.7-.9 2.3-.9 2.3S0 8.1 0 10v1.9c0 1.9.5 3.8.5 3.8s.23 1.6.9 2.3c.86.9 1.98.9 2.48 1 1.8.2 7.62.4 8.12.4h.01s4.86 0 8.32-.4c.44-.1 1.41-.1 2.27-1 .67-.7.9-2.3.9-2.3s.5-1.9.5-3.8V10c0-1.9-.5-3.8-.5-3.8ZM9.75 13.88V7.88l6 3-6 3Z"
                        /></svg
                    >
                </a>
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
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true"
                            ><path
                                fill="currentColor"
                                d="M3.9 12a4.1 4.1 0 0 1 4.1-4.1h4v-2h-4A6.1 6.1 0 0 0 1.9 12a6.1 6.1 0 0 0 6.1 6.1h4v-2h-4A4.1 4.1 0 0 1 3.9 12Zm5-1h6.2v2H8.9v-2ZM14 5.9h4A6.1 6.1 0 0 1 24.1 12 6.1 6.1 0 0 1 18 18.1h-4v-2h4a4.1 4.1 0 0 0 4.1-4.1A4.1 4.1 0 0 0 18 7.9h-4v-2Z"
                            /></svg
                        >
                    </a>
                {/each}
            {/if}
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

<style>
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
    .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
    }
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
        .chips-collapsed {
            display: flex;
            flex-direction: column;
            align-items: stretch;
            gap: 8px;
        }
        .filters .filter {
            opacity: 0.28;
            transition: opacity 0.2s ease;
        }
        .filters:hover .filter,
        .filters:focus-within .filter {
            opacity: 1;
        }
        .filters .socials {
            opacity: 1;
        }
    }
    .more-chip {
        font-weight: 500;
    }
    .filters,
    .filters * {
        touch-action: auto;
    }
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
    @media (max-width: 640px) {
        .filters {
            top: calc(env(safe-area-inset-top) + 8px);
            right: calc(env(safe-area-inset-right) + 8px);
            left: auto;
            bottom: auto;
            flex-direction: row;
            align-items: center;
            gap: 8px;
            overflow: visible;
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
        .filter {
            display: none;
        }
    }
</style>
