# Aperture Theme (Svelte)

Reusable Svelte gallery/lightbox theme. Use as a site or consume as a package.

## Develop and run the example (local)

The repo now treats the package in the root and the demo/visual app in `examples/`.

```bash
# Node 22
nvm use 22

# Install and run (root scripts target examples/)
npm ci
npm run dev

# Build the example
npm run build

# Preview the example build
npm run preview
```

- Example source lives in `examples/src`.
- Media lives in `examples/public` (no root `public/`).
- Example items are in `examples/src/content/items.ts`.
- The app uses `mountApertureTheme({ target, items, siteConfigRaw })`.

## Site configuration (aperture.config.yml)

You can control site meta, loading overlay, favicon, and socials via YAML. See `examples/aperture.config.yml`.

Example:

```yaml
site:
  title: "Aperture – Visual Gallery"
  description: "Image/Video Gallery"
  logo:
    src: "/aperture.svg"
    darkInvert: true
  loading:
    portalSrc: "/aperture.svg"           # image shown in initial loading overlay
    overlayHideDelayMs: 1200              # wait this long before fading the overlay (default 0)
    overlayFadeDurationMs: 500            # fade-out duration in ms (default 420)
  favicon:
    src: "/favicon.ico"                  # injected as <link rel="icon">
    appleTouchSrc: "/apple-touch-icon.png" # <link rel="apple-touch-icon">
    maskSrc: "/safari-pinned-tab.svg"    # <link rel="mask-icon">
    maskColor: "#5bbad5"                 # color attribute for mask icon
  siteName: "Aperture"
  locale: "en_US"
  robots: "index,follow"
  socials:
    github: "https://github.com/shashank-sharma/aperture-theme"
    twitter: "https://twitter.com/shashank_py"
    # youtube: "https://youtube.com/@youtube"
    links:
      - { label: "Website", href: "https://shashanksharma.xyz" }
```

How it’s used:

- Loading overlay: `portalSrc` defines the center graphic; `overlayHideDelayMs` and `overlayFadeDurationMs` control timing in `src/App.svelte`.
- Favicon/app icons: `site.favicon.*` is read in `src/App.svelte` and injected into `<head>` with proper link tags.
- Title/description/OG/Twitter meta are populated from `site.*`.

## Use as a package (GitHub Packages)

1. Install

```bash
npm i @shashank-sharma/aperture-theme --registry=https://npm.pkg.github.com
```

2. Use (pick one)

- Components:
```ts
import { Gallery, Lightbox } from '@shashank-sharma/aperture-theme';

// Example in a Svelte component
<script lang="ts">
  import { Gallery } from '@shashank-sharma/aperture-theme';
  import type { GalleryItem } from '@shashank-sharma/aperture-theme';
  const items: GalleryItem[] = [
    { id: '1', kind: 'image', src: '/img/one.jpg', alt: 'One', tags: ['cat'] },
  ];
</script>

<Gallery {items} config={{ perspective: 1200, cardBaseSize: 640, gap: 80, parallaxStrength: 0.4, hoverLift: 16, hoverScale: 1.02, inertia: 0.12 }} />
```

- One-call mount helper:
```ts
import { mountApertureTheme } from '@shashank-sharma/aperture-theme';
import type { GalleryItem } from '@shashank-sharma/aperture-theme';

const items: GalleryItem[] = [ /* your media */ ];
mountApertureTheme({
  target: document.getElementById('app')!,
  items,
  // siteConfigRaw: 'site:\n  title: My Site', // optional (you can pass your YAML as a string)
  // Optional config overrides (e.g., filters)
  // config: { filters: ['All', 'Gaming', 'Bosses'] },
});
```

3. Global styles

- If you use the one-call mount (App), base styles are included automatically.
- If you use components directly and want the theme defaults (colors, layout helpers), optionally import:
```ts
import '@shashank-sharma/aperture-theme/src/app.css';
```

4. Add registry auth (once per machine)

- In your user `~/.npmrc`, set a token for GitHub Packages:
```
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```
- Or use per-project `.npmrc` with:
```
@shashank-sharma:registry=https://npm.pkg.github.com
```

5. Types and Svelte version

- Types are bundled. Peer dependency: `svelte >= 5`.

6. Media paths

- Provide absolute or site-relative `src` for images/videos. For GitHub Pages project sites, ensure your app’s base path is set appropriately in your host app’s bundler.
```

## Release

- Push a tag like `v0.1.0` to trigger publish.
- Publishes to GitHub Packages under `@shashank-sharma`.
- GitHub Pages deploys the example app built from `examples/` on pushes to `main`.

## Sync YouTube playlists locally (recommended)

Use the CLI to fetch a playlist and update either your site’s items file (for consumers) or the demo config (in this repo). Commit before building/deploying.

```bash
# Node 22 recommended

# In a consumer site: thumbnails to public/media/yt and items to src/content/items.ts (default)
npm run sync -- --playlist https://www.youtube.com/playlist?list=XXXX --tag "Gaming" \
  --outDir public/media/yt

# Optional flags:
#   --max 100        # limit items
#   --force          # redownload if file missing
#   --forceUpdate    # redownload even if file exists (refresh thumbnails)

# Or run via the binary directly (after installing the package)
npx aperture-sync --playlist https://www.youtube.com/playlist?list=XXXX --tag "Gaming" \
  --outDir public/media/yt

# In this theme repo (example app):
# - run from the examples/ directory
# - thumbnails under examples/public/media/yt
# - items written to examples/src/content/items.ts
(cd examples && \
  npm run sync -- --playlist https://www.youtube.com/playlist?list=XXXX --tag "Demo" \
  --outDir public/media/yt --target src/content/items.ts)
```

Note: generated item src paths are relative (e.g., `media/yt/abc.webp`) to work under GitHub Pages base paths.

Then review changes in your target file (`src/content/items.ts` for consumers or `examples/src/content/items.ts` in this repo), adjust as needed, commit, and run `npm run build`.


### CLI flags

- `--playlist, -p`: YouTube playlist URL or ID (required)
- `--tag, -t`: Tag to apply to generated items (required)
- `--outDir, -o`: Thumbnails output dir (default: `public/media/yt`)
- `--target`: Items file to write/append (default: `src/content/items.ts`)
- `--max, -m`: Limit number of items fetched
- `--force`: Download file if missing (skip re-download when exists)
- `--forceUpdate`: Always re-download thumbnails
- `--all`: Read multiple entries from a YAML config
- `--config`: Config file path (default: `aperture.config.yml`)
- `--debug, -d`: Verbose logging for troubleshooting

### Large playlists and API fallback

YouTube sometimes breaks `ytpl` pagination for large playlists, resulting in errors like “Cannot read properties of undefined (reading 'token')”. The CLI supports an API fallback using YouTube Data API v3.

Use one of the following:

```bash
# Via environment variable
export YT_API_KEY=YOUR_API_KEY
npx aperture-sync -p <PLAYLIST> -t <TAG> --debug

# Or via a flag
npx aperture-sync -p <PLAYLIST> -t <TAG> --debug --ytApiKey YOUR_API_KEY
```

How to get an API key (short):
1. Open Google Cloud Console → create/select a project.
2. APIs & Services → Library → enable “YouTube Data API v3”.
3. APIs & Services → Credentials → Create credentials → API key.
4. (Optional) Restrict the key to the YouTube Data API v3.

Notes:
- Quota defaults to ~10k units/day. `playlistItems.list` is 1 unit per request (50 items/page).
- Without a key, the CLI still tries to fetch, but large playlists may fail depending on YouTube changes.

### Sync multiple playlists via config

Create an `aperture.config.yml` in your project (see `examples/aperture.config.yml`):

```yaml
playlists:
  - tag: "Gaming"
    playlist: "https://www.youtube.com/playlist?list=XXXX"
    outDir: "public/media/yt"
    forceUpdate: false
```

Run:

```bash
npx aperture-sync --all --config aperture.config.yml --target src/content/items.ts
```

### Troubleshooting

- Ensure Node 22+.
- Try updating the `ytpl` dependency in your host app:
  ```bash
  npm i ytpl@latest
  ```
- If you still hit pagination errors, use the API fallback with `YT_API_KEY` or `--ytApiKey`.

