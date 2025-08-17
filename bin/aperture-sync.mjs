#!/usr/bin/env node

/*
Local playlist sync CLI

Examples:
  # Update a site repo file with items and download thumbnails
  aperture-sync --playlist <URL_OR_ID> --tag "Gaming" \
    --target src/content/items.ts --outDir public/media/yt [--max 200] [--forceUpdate]

  # (Theme repo demo) Update src/lib/config.ts in-place
  aperture-sync --playlist <URL_OR_ID> --tag "Demo" --outDir public/media/yt
*/

import path from 'node:path';
import process from 'node:process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ytpl from 'ytpl';
import { Project, SyntaxKind } from 'ts-morph';
import YAML from 'yaml';

function bar(current, total, width = 28) {
  const pct = total ? Math.min(1, Math.max(0, current / total)) : 1;
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const pctTxt = String(Math.round(pct * 100)).padStart(3, ' ');
  return `[${'#'.repeat(filled)}${'-'.repeat(empty)}] ${pctTxt}%`;
}

function logStep(prefix, current, total, suffix = '') {
  process.stdout.write(`\r${prefix} ${bar(current, total)} ${suffix}`);
}

function escapeJsString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function stringArrayToInitializerText(values) {
  const unique = Array.from(new Set(values));
  return `[${unique.map((v) => `\'${escapeJsString(v)}\'`).join(', ')}]`;
}

function parseArgs(argv) {
  const out = { playlist: undefined, tag: undefined, max: undefined, outDir: undefined, target: 'src/content/items.ts', force: false, forceUpdate: false, all: false, config: 'aperture.config.yml', debug: false, ytApiKey: process.env.YT_API_KEY || undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--playlist' || a === '-p') out.playlist = argv[++i];
    else if (a === '--tag' || a === '-t') out.tag = argv[++i];
    else if (a === '--max' || a === '-m') out.max = Number(argv[++i]);
    else if (a === '--outDir' || a === '-o') out.outDir = argv[++i];
    else if (a === '--target') out.target = argv[++i];
    else if (a === '--force' || a === '-f') out.force = true;
    else if (a === '--forceUpdate') out.forceUpdate = true;
    else if (a === '--all') out.all = true;
    else if (a === '--config') out.config = argv[++i];
    else if (a === '--debug' || a === '-d') out.debug = true;
    else if (a === '--ytApiKey') out.ytApiKey = argv[++i];
  }
  return out;
}

function fail(msg) {
  console.error(`[aperture-sync] ${msg}`);
  process.exit(1);
}

async function fetchPlaylistItemsViaApiV3(playlistIdOrUrl, maxItems, apiKey, debug) {
  if (!apiKey) return undefined;
  try {
    // Resolve playlist ID
    let playlistId = '';
    try {
      if (typeof ytpl.getPlaylistID === 'function') {
        playlistId = await ytpl.getPlaylistID(playlistIdOrUrl);
      }
    } catch (_) {}
    if (!playlistId) {
      try {
        const u = new URL(String(playlistIdOrUrl));
        const listId = u.searchParams.get('list');
        if (listId) playlistId = listId;
      } catch (_) {
        playlistId = String(playlistIdOrUrl);
      }
    }
    if (!playlistId) throw new Error('Could not resolve playlist ID for API v3 fallback');
    if (debug) console.log(`[aperture-sync][debug] API v3 fallback for playlistId=${playlistId}`);

    const maxResultsPerPage = 50;
    const wanted = Number.isFinite(maxItems) && maxItems > 0 ? maxItems : Infinity;
    const collected = [];
    let pageToken = '';
    while (collected.length < wanted) {
      const base = 'https://www.googleapis.com/youtube/v3/playlistItems';
      const params = new URLSearchParams({
        part: 'snippet',
        maxResults: String(Math.min(maxResultsPerPage, isFinite(wanted) ? wanted - collected.length : maxResultsPerPage)),
        playlistId,
        key: apiKey,
      });
      if (pageToken) params.set('pageToken', pageToken);
      const url = `${base}?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`YouTube API v3 error ${res.status}: ${txt.slice(0, 300)}`);
      }
      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      for (const it of items) {
        const snippet = it && it.snippet;
        const videoId = snippet && snippet.resourceId && snippet.resourceId.videoId;
        if (!videoId) continue;
        const title = (snippet && snippet.title) || '';
        const thumbs = (snippet && snippet.thumbnails) || {};
        const thumbUrl = (thumbs.maxres && thumbs.maxres.url) || (thumbs.standard && thumbs.standard.url) || (thumbs.high && thumbs.high.url) || (thumbs.medium && thumbs.medium.url) || (thumbs.default && thumbs.default.url) || '';
        collected.push({ ytId: videoId, title, url: `https://www.youtube.com/watch?v=${videoId}`, thumbnail: thumbUrl });
      }
      if (!data.nextPageToken || !items.length) break;
      pageToken = data.nextPageToken;
    }
    if (debug) console.log(`[aperture-sync][debug] API v3 fetched ${collected.length} items`);
    return collected;
  } catch (e) {
    if (debug) console.log(`[aperture-sync][debug] API v3 fallback failed: ${e && e.message ? e.message : String(e)}`);
    return undefined;
  }
}

async function fetchPlaylistItems(playlistIdOrUrl, maxItems, debug, apiKey) {
  try {
    // Prefer API v3 if key is provided
    if (apiKey) {
      const viaApiFirst = await fetchPlaylistItemsViaApiV3(playlistIdOrUrl, maxItems, apiKey, debug);
      if (viaApiFirst && viaApiFirst.length) return viaApiFirst;
    }
    if (debug) {
      try {
        const require = createRequire(import.meta.url);
        const ytplPkg = require('ytpl/package.json');
        console.log(`[aperture-sync][debug] Node: ${process.version}, ytpl: ${ytplPkg && ytplPkg.version ? ytplPkg.version : 'unknown'}`);
      } catch (_) {
        console.log(`[aperture-sync][debug] Node: ${process.version}, ytpl: unknown`);
      }
      try {
        const isValid = typeof ytpl.validateID === 'function' ? ytpl.validateID(playlistIdOrUrl) : 'n/a';
        console.log(`[aperture-sync][debug] validateID: ${isValid}`);
      } catch (e) {
        console.log(`[aperture-sync][debug] validateID check failed: ${e && e.message ? e.message : String(e)}`);
      }
      try {
        if (typeof ytpl.getPlaylistID === 'function') {
          const resolved = await ytpl.getPlaylistID(playlistIdOrUrl);
          console.log(`[aperture-sync][debug] getPlaylistID: ${resolved}`);
        }
      } catch (e) {
        console.log(`[aperture-sync][debug] getPlaylistID failed: ${e && e.message ? e.message : String(e)}`);
      }
    }
    const result = await ytpl(playlistIdOrUrl, {
      pages: Infinity,
      limit: maxItems && Number.isFinite(maxItems) ? maxItems : Infinity,
    });
    return result.items.map((it) => ({
      ytId: it.id,
      title: it.title || '',
      url: (it.url && typeof it.url === 'string' ? it.url : `https://www.youtube.com/watch?v=${it.id}`),
      thumbnail:
        (it.bestThumbnail && it.bestThumbnail.url) ||
        (Array.isArray(it.thumbnails) && it.thumbnails.length
          ? it.thumbnails[it.thumbnails.length - 1].url
          : ''),
    }));
  } catch (err) {
    if (debug) {
      console.error('[aperture-sync][debug] ytpl error:', err && err.stack ? err.stack : err);
    }
    // Fallback 1: Use YouTube Data API v3 if key is provided
    const viaApi = await fetchPlaylistItemsViaApiV3(playlistIdOrUrl, maxItems, apiKey, debug);
    if (viaApi && viaApi.length) return viaApi;
    // Fallback 2: Attempt a single-page fetch with ytpl to at least get first ~page
    try {
      if (debug) console.log('[aperture-sync][debug] trying ytpl single-page fallback');
      const firstPage = await ytpl(playlistIdOrUrl, {
        pages: 1,
        limit: maxItems && Number.isFinite(maxItems) ? maxItems : 100,
      });
      if (firstPage && Array.isArray(firstPage.items) && firstPage.items.length) {
        return firstPage.items.map((it) => ({
          ytId: it.id,
          title: it.title || '',
          url: (it.url && typeof it.url === 'string' ? it.url : `https://www.youtube.com/watch?v=${it.id}`),
          thumbnail:
            (it.bestThumbnail && it.bestThumbnail.url) ||
            (Array.isArray(it.thumbnails) && it.thumbnails.length
              ? it.thumbnails[it.thumbnails.length - 1].url
              : ''),
        }));
      }
    } catch (e2) {
      if (debug) console.log(`[aperture-sync][debug] ytpl single-page fallback failed: ${e2 && e2.message ? e2.message : String(e2)}`);
    }
    fail(`Failed to fetch playlist: ${(err && err.message) || err}`);
  }
}

function extFromUrl(url) {
  try {
    const u = new URL(url);
    const last = (u.pathname.split('/').pop() || '').toLowerCase();
    const dot = last.lastIndexOf('.');
    if (dot > -1) {
      const ext = last.slice(dot + 1).split(/[^a-z0-9]/i)[0];
      if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return ext;
    }
  } catch (_) {}
  const q = (url || '').toLowerCase();
  for (const e of ['jpg', 'jpeg', 'png', 'webp']) if (q.includes(`.${e}`)) return e;
  return 'jpg';
}

async function downloadIfNeeded(urls, filePath, force) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  if (!force && fs.existsSync(filePath) && fs.statSync(filePath).size > 0) return;
  const list = Array.isArray(urls) ? urls : [urls];
  let lastErr = null;
  for (const u of list) {
    try {
      const res = await fetch(u);
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status} ${res.statusText}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(filePath, buf);
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Failed all download attempts for ${list[0]}: ${lastErr && lastErr.message ? lastErr.message : String(lastErr)}`);
}

function buildPreferredThumbUrls(ytId) {
  return [
    `https://i.ytimg.com/vi_webp/${ytId}/maxresdefault.webp`,
    `https://i.ytimg.com/vi/${ytId}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
  ];
}

function writeTargetTs(targetPath, items, tag, relMount) {
  const lines = [];
  lines.push("import type { GalleryItem } from '@shashank-sharma/aperture-theme';");
  lines.push('');
  lines.push('export const items: GalleryItem[] = [');
  for (const it of items) {
    const safeTitle = escapeJsString(it.title || '');
    const src = escapeJsString(it.localSrc || it.thumbnail || '');
    const url = escapeJsString(it.url || `https://www.youtube.com/watch?v=${it.ytId}`);
    lines.push('  {');
    lines.push(`    id: 'yt:${it.ytId}',`);
    lines.push(`    kind: 'yt-video',`);
    lines.push(`    src: '${src}',`);
    lines.push(`    alt: '${safeTitle}',`);
    lines.push(`    caption: '${safeTitle}',`);
    lines.push(`    url: '${url}',`);
    if (tag) lines.push(`    tags: ['${escapeJsString(tag)}'],`);
    lines.push('  },');
  }
  lines.push('];');
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, lines.join('\n'));
}

function ensureImportGalleryItem(sourceFile) {
  const hasImport = sourceFile.getImportDeclarations().some((d) => {
    return d.getModuleSpecifierValue() === '@shashank-sharma/aperture-theme' &&
      d.getNamedImports().some((ni) => ni.getName() === 'GalleryItem');
  });
  if (!hasImport) {
    sourceFile.addImportDeclaration({
      moduleSpecifier: '@shashank-sharma/aperture-theme',
      isTypeOnly: true,
      namedImports: [{ name: 'GalleryItem' }],
    });
  }
}

function getOrCreateItemsArray(sourceFile) {
  let decl = sourceFile.getVariableDeclaration('items');
  if (!decl) {
    sourceFile.addStatements([
      '',
      'export const items: GalleryItem[] = [];',
    ]);
    decl = sourceFile.getVariableDeclaration('items');
  }
  const arr = decl.getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);
  return arr;
}

function appendToTargetTs(targetPath, desired, tag) {
  const project = new Project({ tsConfigFilePath: path.join(process.cwd(), 'tsconfig.json'), skipAddingFilesFromTsConfig: true });
  const sourceFile = project.addSourceFileAtPathIfExists(targetPath) || project.createSourceFile(targetPath, "", { overwrite: true });
  ensureImportGalleryItem(sourceFile);
  const arr = getOrCreateItemsArray(sourceFile);
  // Build existing ids set
  const existingIds = new Set(
    arr.getElements()
      .map((el) => {
        if (!el || el.getKind() !== SyntaxKind.ObjectLiteralExpression) return undefined;
        const idNode = el.getProperty('id')?.getFirstChildByKind(SyntaxKind.StringLiteral) || el.getProperty('id')?.getInitializer();
        const id = getStringLiteralValue(idNode);
        return id;
      })
      .filter(Boolean)
  );
  // Append new entries if not present
  let addCount = 0;
  for (const it of desired) {
    const newId = `yt:${it.ytId}`;
    if (existingIds.has(newId)) continue; // keep existing; don't remove or update
    const text = toObjectLiteralText({ ...it, tag });
    arr.addElement(text);
    addCount += 1;
  }
  sourceFile.saveSync();
  project.saveSync();
  console.log(`[aperture-sync] Appended ${addCount} new items to ${targetPath}`);
}

function getStringLiteralValue(node) {
  if (!node) return undefined;
  if (node.getKind() === SyntaxKind.StringLiteral) return node.getLiteralText();
  const text = node.getText();
  try {
    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith('\'') && text.endsWith('\''))) {
      return JSON.parse(text.replace(/'/g, '"'));
    }
  } catch (_) {}
  return text;
}

function getArrayStringLiterals(arrayNode) {
  if (!arrayNode || arrayNode.getKind() !== SyntaxKind.ArrayLiteralExpression) return [];
  return arrayNode
    .getElements()
    .map((el) => getStringLiteralValue(el))
    .filter((v) => typeof v === 'string');
}

function ensureFiltersContain(defaultConfigDecl, tag) {
  const obj = defaultConfigDecl.getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
  let filtersProp = obj.getProperty('filters');
  if (!filtersProp) {
    filtersProp = obj.addPropertyAssignment({ name: 'filters', initializer: '[\'All\']' });
  }
  const filtersInit = filtersProp.getFirstChildByKind(SyntaxKind.ArrayLiteralExpression) || filtersProp.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);
  if (!filtersInit) {
    filtersProp.setInitializer('[\'All\']');
  }
  const arr = filtersProp.getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);
  const values = getArrayStringLiterals(arr);
  const want = new Set(values);
  want.add('All');
  if (tag) want.add(tag);
  const ordered = Array.from(want);
  filtersProp.setInitializer(stringArrayToInitializerText(ordered));
}

function objectLiteralToItem(objLit) {
  const getPropInit = (name) => objLit.getProperty(name)?.getFirstChildByKind(SyntaxKind.StringLiteral) || objLit.getProperty(name)?.getInitializer();
  const id = getStringLiteralValue(getPropInit('id')) || '';
  const kind = getStringLiteralValue(getPropInit('kind')) || 'image';
  const src = getStringLiteralValue(getPropInit('src')) || '';
  const alt = getStringLiteralValue(getPropInit('alt')) || '';
  const caption = getStringLiteralValue(getPropInit('caption'));
  const tagsNode = objLit.getProperty('tags')?.getFirstChildByKind(SyntaxKind.ArrayLiteralExpression) || objLit.getProperty('tags')?.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);
  const tags = getArrayStringLiterals(tagsNode);
  return { id, kind, src, alt, caption, tags, objLit };
}

function toObjectLiteralText(item) {
  const lines = [];
  lines.push('{');
  lines.push(`  id: 'yt:${item.ytId}',`);
  lines.push(`  kind: 'yt-video',`);
  lines.push(`  src: '${(item.localSrc || item.thumbnail).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}',`);
  lines.push(`  alt: '${item.title.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}',`);
  lines.push(`  caption: '${item.title.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}',`);
  lines.push(`  url: '${(item.url || `https://www.youtube.com/watch?v=${item.ytId}`).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}',`);
  lines.push(`  tags: ['${item.tag.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'],`);
  lines.push('}');
  return lines.join('\n');
}

function normalizeToYtId(appId) {
  if (!appId) return '';
  if (appId.startsWith('yt:')) return appId.slice(3);
  return appId;
}

async function runSync({ playlist, tag, max, outDir, target, force, forceUpdate, debug, ytApiKey }) {
  if (!playlist) fail('Missing --playlist <urlOrId>');
  if (!tag) fail('Missing --tag <string>');

  const root = process.cwd();
  const mediaRoot = path.isAbsolute(outDir || '')
    ? (outDir || path.join(root, 'public', 'media', 'yt'))
    : path.join(root, outDir || 'public/media/yt');

  // For target mode, use a relative mount (no leading slash) so it works under any base
  const relPublicMount = path.posix.join('media', 'yt');
  // For theme-demo mode, keep leading slash (existing behavior)
  const absPublicMount = '/' + relPublicMount;

  console.log(`[aperture-sync] Starting sync`);
  console.log(`  playlist: ${playlist}`);
  console.log(`  tag:      ${tag}` + (max ? `  (max ${max})` : ''));
  if (debug) {
    console.log(`[aperture-sync][debug] options: ${JSON.stringify({ max, outDir, target, force, forceUpdate })}`);
    if (ytApiKey) console.log('[aperture-sync][debug] ytApiKey provided (length hidden)');
  }

  const fetched = await fetchPlaylistItems(playlist, max, debug, ytApiKey);
  if (!Array.isArray(fetched) || fetched.length === 0) {
    console.log('[aperture-sync] No items returned from the playlist. Exiting.');
    process.exit(0);
  }
  console.log(`[aperture-sync] Fetched ${fetched.length} items from playlist`);

  const desired = [];
  for (const it of fetched) {
    if (!it.ytId) continue;
    const candidates = buildPreferredThumbUrls(it.ytId);
    // Decide file name and absolute/relative paths
    let ext = extFromUrl(candidates[0]);
    let fileName = `${it.ytId}.${ext}`;
    let abs = path.join(mediaRoot, fileName);
    try {
      if (force || forceUpdate) {
        for (const e of ['jpg', 'jpeg', 'png', 'webp']) {
          const p = path.join(mediaRoot, `${it.ytId}.${e}`);
          if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch {} }
        }
      }
      // Reset ext after deletion
      ext = extFromUrl(candidates[0]);
      fileName = `${it.ytId}.${ext}`;
      abs = path.join(mediaRoot, fileName);
      await downloadIfNeeded(candidates, abs, force || forceUpdate);
    } catch (e) {
      console.warn(`[aperture-sync] Warning: using remote thumbnail due to download error for ${it.ytId}: ${e.message || e}`);
    }
    const localSrc = fs.existsSync(abs)
      ? (target ? `${relPublicMount}/${fileName}` : `${absPublicMount}/${fileName}`)
      : (candidates[0] || it.thumbnail);
    desired.push({ ...it, localSrc });
  }

  // Target mode: write/append to a TS module file in the user app
  if (target) {
    const targetPath = path.isAbsolute(target) ? target : path.join(root, target);
    if (fs.existsSync(targetPath)) {
      appendToTargetTs(targetPath, desired, tag);
    } else {
      writeTargetTs(targetPath, desired, tag, relPublicMount);
      console.log(`[aperture-sync] Wrote ${targetPath}`);
    }
    console.log(`[aperture-sync] Thumbnails under ${mediaRoot}`);
    return;
  }

  // Theme-demo mode: mutate src/lib/config.ts in-place
  const configPath = path.join(root, 'src', 'lib', 'config.ts');
  if (!fs.existsSync(configPath)) fail(`File not found: ${configPath}`);
  const project = new Project({ tsConfigFilePath: path.join(root, 'tsconfig.json') });
  const sourceFile = project.addSourceFileAtPath(configPath);

  const defaultConfigDecl = sourceFile.getVariableDeclaration('defaultConfig');
  if (defaultConfigDecl) ensureFiltersContain(defaultConfigDecl, tag);

  const decl = sourceFile.getVariableDeclaration('demoItems');
  if (!decl) fail('Could not find `demoItems` in src/lib/config.ts');
  const arr = decl.getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);
  const elements = arr.getElements();

  const existingManagedByYtId = new Map();
  const managedNodes = new Map();
  for (const el of elements) {
    if (!el || el.getKind() !== SyntaxKind.ObjectLiteralExpression) continue;
    const item = objectLiteralToItem(el);
    const hasTag = (item.tags || []).includes(tag);
    if (!hasTag) continue;
    const ytId = normalizeToYtId(item.id);
    if (ytId) {
      existingManagedByYtId.set(ytId, item);
      managedNodes.set(ytId, el);
    }
  }
  console.log(`[aperture-sync] Existing items with tag '${tag}': ${managedNodes.size}`);

  const desiredByYtId = new Map(desired.map((d) => [d.ytId, d]));

  let updIndex = 0;
  const updTotal = managedNodes.size;
  let removedCount = 0;
  for (const [ytId, objLit] of managedNodes.entries()) {
    const next = desiredByYtId.get(ytId);
    if (!next) {
      const tagsProp = objLit.getProperty('tags');
      const tagsArr = tagsProp?.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression) || tagsProp?.getFirstChildByKind(SyntaxKind.ArrayLiteralExpression);
      const current = new Set(getArrayStringLiterals(tagsArr));
      current.delete(tag);
      const remaining = Array.from(current);
      if (remaining.length === 0) {
        objLit.remove();
        removedCount += 1;
      } else if (tagsProp) {
        tagsProp.setInitializer(stringArrayToInitializerText(remaining));
      } else {
        objLit.addPropertyAssignment({ name: 'tags', initializer: stringArrayToInitializerText(remaining) });
      }
    } else {
      const safe = existingManagedByYtId.get(ytId);
      if (safe && safe.objLit) {
        // update existing literal in-place
        const setProp = (name, valueText) => {
          const prop = safe.objLit.getProperty(name);
          if (prop) prop.setInitializer(valueText);
          else safe.objLit.addPropertyAssignment({ name, initializer: valueText });
        };
        const nextSrc = (next.localSrc || next.thumbnail || '').replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        setProp('kind', `'yt-video'`);
        setProp('src', `'${nextSrc}'`);
        const safeTitle = next.title.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        setProp('alt', `'${safeTitle}'`);
        setProp('caption', `'${safeTitle}'`);
        const safeUrl = (next.url || `https://www.youtube.com/watch?v=${next.ytId}`).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        setProp('url', `'${safeUrl}'`);
      }
      desiredByYtId.delete(ytId);
    }
    updIndex += 1;
    logStep('[aperture-sync] Updating existing', updIndex, updTotal);
  }
  if (updTotal) process.stdout.write(`\n`);

  let addIndex = 0;
  const willAdd = fetched.filter((it) => desiredByYtId.has(it.ytId));
  for (const it of fetched) {
    if (!desiredByYtId.has(it.ytId)) continue;
    const mapped = desiredByYtId.get(it.ytId);
    const text = toObjectLiteralText({ ...mapped, tag });
    arr.addElement(text);
    desiredByYtId.delete(it.ytId);
    addIndex += 1;
    logStep('[aperture-sync] Adding new', addIndex, willAdd.length, `${(it.title || '').slice(0, 40)}`);
  }
  if (willAdd.length) process.stdout.write(`\n`);

  await sourceFile.save();
  await project.save();
  const addedCount = addIndex;
  console.log(`[aperture-sync] Done. Updated: ${updTotal - removedCount}, Removed tag: ${removedCount}, Added: ${addedCount}`);
  console.log('[aperture-sync] Wrote src/lib/config.ts');
}

function loadPlaylistsConfig(configPath) {
  try {
    const abs = path.isAbsolute(configPath) ? configPath : path.join(process.cwd(), configPath);
    if (!fs.existsSync(abs)) fail(`Config not found: ${abs}`);
    const raw = fs.readFileSync(abs, 'utf8');
    const parsed = YAML.parse(raw) || {};
    const list = Array.isArray(parsed.playlists) ? parsed.playlists : [];
    return list.map((p) => ({
      tag: p && p.tag,
      playlist: p && p.playlist,
      outDir: p && p.outDir,
      max: p && p.max,
      forceUpdate: !!(p && p.forceUpdate),
    })).filter((e) => e && e.tag && e.playlist);
  } catch (e) {
    fail(`Failed to read playlists from config: ${e && e.message ? e.message : String(e)}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.all) {
    const entries = loadPlaylistsConfig(args.config);
    if (!entries.length) {
      fail('No playlists found in config. Ensure `playlists` is defined.');
    }
    console.log(`[aperture-sync] Syncing ${entries.length} playlists from ${args.config}`);
    for (const entry of entries) {
      const playlist = entry.playlist;
      const tag = entry.tag;
      const outDir = entry.outDir || args.outDir;
      const max = Number.isFinite(entry.max) ? entry.max : args.max;
      const forceUpdate = args.forceUpdate || !!entry.forceUpdate;
      await runSync({ playlist, tag, max, outDir, target: args.target, force: args.force, forceUpdate, debug: args.debug });
    }
    return;
  }
  await runSync(args);
}

main().catch((err) => fail(err && err.stack ? err.stack : String(err)));


