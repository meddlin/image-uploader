"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import type { AssetRecord, AssetSnippetResponse, UsageRecord } from "@/components/asset-types";
import { readJsonResponse } from "@/components/client-http";
import { PreviewLayer, PreviewThumb, usePreviewGallery, type PreviewItem } from "@/components/image-preview";

function toPreviewItem(asset: AssetRecord): PreviewItem {
  return { id: asset.id, name: asset.originalFilename, url: asset.publicUrl, detail: `${asset.width} × ${asset.height}` };
}

const SLUG_STORAGE_KEY = "asset-catalog:last-post-slug";

type Panel = { assetId: number; kind: "reuse" | "history" } | null;

type ReuseState = {
  assetId: number;
  snippet: string;
  message: string | null;
  error: string | null;
};

function ClearableInput({
  label,
  onChange,
  placeholder,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <div className="clearable">
      <input className="search-input" placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
      {value ? (
        <button aria-label={`Clear ${label}`} className="clear-button" type="button" onClick={() => onChange("")}>
          ×
        </button>
      ) : null}
    </div>
  );
}

export function AssetCatalog({ initialAssets }: { initialAssets: AssetRecord[] }) {
  const [query, setQuery] = useState("");
  const [postFilter, setPostFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [postSlug, setPostSlug] = useState("");
  const [altText, setAltText] = useState("");
  const [caption, setCaption] = useState("");
  const [catalog, setCatalog] = useState<AssetRecord[]>(initialAssets);
  const [panel, setPanel] = useState<Panel>(null);
  const [reuse, setReuse] = useState<ReuseState | null>(null);
  const [history, setHistory] = useState<{ assetId: number; usages: UsageRecord[] | null; error: string | null } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const deferredPostFilter = useDeferredValue(postFilter);
  const deferredTagFilter = useDeferredValue(tagFilter);
  const hasFilteredRef = useRef(false);
  const gallery = usePreviewGallery(useMemo(() => catalog.map(toPreviewItem), [catalog]));

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SLUG_STORAGE_KEY);
      if (stored) setPostSlug(stored);
    } catch {
      // Storage unavailable; the slug just won't be remembered.
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();

    if (deferredQuery) {
      params.set("query", deferredQuery);
    }

    if (deferredPostFilter) {
      params.set("postSlug", deferredPostFilter);
    }

    if (deferredTagFilter) {
      params.set("tag", deferredTagFilter);
    }

    // The server already rendered the unfiltered catalog, so skip the fetch until a filter has been used.
    if (params.size > 0) {
      hasFilteredRef.current = true;
    } else if (!hasFilteredRef.current) {
      return;
    }

    let cancelled = false;
    fetch(`/api/catalog?${params.toString()}`, { method: "GET" })
      .then(async (response) => {
        return readJsonResponse<{ assets: AssetRecord[] }>(response, "Failed to load catalog.");
      })
      .then((payload) => {
        if (!cancelled) {
          setCatalog(payload.assets);
          setListError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setListError(error instanceof Error ? error.message : "Failed to load catalog.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [deferredPostFilter, deferredQuery, deferredTagFilter]);

  async function copyText(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1500);
    } catch {
      // Clipboard access can be refused; the button label below reports it without shifting the layout.
      setCopiedKey(`failed:${key}`);
      window.setTimeout(() => setCopiedKey((current) => (current === `failed:${key}` ? null : current)), 1500);
    }
  }

  const hasFilters = Boolean(query || postFilter || tagFilter);
  function clearFilters() {
    setQuery("");
    setPostFilter("");
    setTagFilter("");
  }

  function togglePanel(assetId: number, kind: "reuse" | "history") {
    if (panel?.assetId === assetId && panel.kind === kind) {
      setPanel(null);
      return;
    }

    setPanel({ assetId, kind });

    if (kind === "history") {
      setHistory({ assetId, usages: null, error: null });
      fetch(`/api/assets/${assetId}/usages`)
        .then((response) => readJsonResponse<{ usages: UsageRecord[] }>(response, "Unable to load usages."))
        .then((payload) => setHistory({ assetId, usages: payload.usages, error: null }))
        .catch((error: unknown) =>
          setHistory({ assetId, usages: null, error: error instanceof Error ? error.message : "Unable to load usages." })
        );
    }
  }

  async function handleReuse(assetId: number) {
    const slug = postSlug.trim();

    if (!slug) {
      setReuse({ assetId, snippet: "", message: null, error: "Enter a post slug first." });
      return;
    }

    setReuse({ assetId, snippet: "", message: "Generating…", error: null });
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/assets/${assetId}/snippet`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          postSlug: slug,
          altText: altText.trim(),
          caption: caption.trim()
        })
      });

      const payload = await readJsonResponse<AssetSnippetResponse>(response, "Unable to reuse asset.");

      try {
        window.localStorage.setItem(SLUG_STORAGE_KEY, slug);
      } catch {
        // Ignore storage failures.
      }

      setReuse({ assetId, snippet: payload.snippet, message: null, error: null });
      setCatalog((current) => current.map((item) => (item.id === payload.asset.id ? payload.asset : item)));
      void copyText(payload.snippet, `snippet-${assetId}`);
    } catch (error) {
      setReuse({
        assetId,
        snippet: "",
        message: null,
        error: error instanceof Error ? error.message : "Unable to reuse asset."
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="shell">
      <header className="page-header">
        <h1>Assets</h1>
        <p>Search published images. Reusing an asset creates a new usage row.</p>
      </header>

      <section className="panel stack asset-catalog-page">
        <div className="form-grid">
          <ClearableInput label="search" onChange={setQuery} placeholder="Search filename, URL, or key" value={query} />
          <div className="form-row">
            <ClearableInput label="post filter" onChange={setPostFilter} placeholder="Filter by post slug" value={postFilter} />
            <ClearableInput label="tag filter" onChange={setTagFilter} placeholder="Filter by tag" value={tagFilter} />
          </div>
        </div>

        {listError ? <p className="error">{listError}</p> : null}

        <div className="catalog-list">
          {catalog.map((asset) => {
            const isReuseOpen = panel?.assetId === asset.id && panel.kind === "reuse";
            const isHistoryOpen = panel?.assetId === asset.id && panel.kind === "history";
            const rowReuse = reuse?.assetId === asset.id ? reuse : null;
            const rowHistory = history?.assetId === asset.id ? history : null;

            return (
              <article className="asset-row" key={asset.id}>
                <div className="asset-row-header">
                  <PreviewThumb gallery={gallery} item={toPreviewItem(asset)} />
                  <div className="asset-row-meta">
                    <strong>{asset.originalFilename}</strong>
                    <p>{asset.publicUrl}</p>
                  </div>
                  <div className="asset-row-actions">
                    <button
                      className="button-secondary"
                      type="button"
                      onClick={() => void copyText(asset.publicUrl, `url-${asset.id}`)}
                    >
                      {copiedKey === `url-${asset.id}` ? "Copied" : copiedKey === `failed:url-${asset.id}` ? "Copy failed" : "Copy URL"}
                    </button>
                    <button
                      aria-expanded={isReuseOpen}
                      className="button-secondary"
                      type="button"
                      onClick={() => togglePanel(asset.id, "reuse")}
                    >
                      Use in post
                    </button>
                  </div>
                </div>

                <div className="asset-stats">
                  <span>
                    {asset.width} × {asset.height}
                  </span>
                  {asset.usageCount > 0 ? (
                    <button
                      aria-expanded={isHistoryOpen}
                      className="link-button"
                      type="button"
                      onClick={() => togglePanel(asset.id, "history")}
                    >
                      {asset.usageCount} {asset.usageCount === 1 ? "usage" : "usages"}
                    </button>
                  ) : (
                    <span>No usages</span>
                  )}
                  {asset.lastUsedPostSlug ? (
                    <button className="link-button" title="Filter by this post" type="button" onClick={() => setPostFilter(asset.lastUsedPostSlug ?? "")}>
                      {asset.lastUsedPostSlug}
                    </button>
                  ) : null}
                </div>

                {asset.tags.length ? (
                  <div className="pill-row">
                    {asset.tags.map((tag) => (
                      <button
                        className="pill pill-button"
                        key={`${asset.id}-${tag}`}
                        title="Filter by this tag"
                        type="button"
                        onClick={() => setTagFilter(tag)}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                ) : null}

                {isReuseOpen ? (
                  <form
                    className="row-panel"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleReuse(asset.id);
                    }}
                  >
                    <label className="label">
                      <span>Post slug</span>
                      <input
                        autoFocus
                        className="input"
                        placeholder="blog/how-i-built-this-tool"
                        value={postSlug}
                        onChange={(event) => setPostSlug(event.target.value)}
                      />
                    </label>
                    <label className="label">
                      <span>Alt text</span>
                      <input
                        className="input"
                        placeholder="Optional"
                        value={altText}
                        onChange={(event) => setAltText(event.target.value)}
                      />
                    </label>
                    <label className="label">
                      <span>Caption</span>
                      <input
                        className="input"
                        placeholder="Optional"
                        value={caption}
                        onChange={(event) => setCaption(event.target.value)}
                      />
                    </label>
                    <div className="actions">
                      <button className="button" disabled={isSubmitting} type="submit">
                        Generate snippet
                      </button>
                      {rowReuse?.message ? <span className="status">{rowReuse.message}</span> : null}
                      {rowReuse?.error ? <span className="error">{rowReuse.error}</span> : null}
                    </div>

                    {rowReuse?.snippet ? (
                      <div>
                        <div className="snippet-header">
                          <p className="result-heading">
                            Snippet{copiedKey === `snippet-${asset.id}` ? " — copied to clipboard" : ""}
                          </p>
                          <button
                            className="button-ghost"
                            type="button"
                            onClick={() => void copyText(rowReuse.snippet, `snippet-${asset.id}`)}
                          >
                            {copiedKey === `failed:snippet-${asset.id}` ? "Copy failed" : "Copy"}
                          </button>
                        </div>
                        <div className="code-block">{rowReuse.snippet}</div>
                      </div>
                    ) : null}
                  </form>
                ) : null}

                {isHistoryOpen ? (
                  <div className="row-panel">
                    {rowHistory?.error ? <p className="error">{rowHistory.error}</p> : null}
                    {rowHistory && !rowHistory.usages && !rowHistory.error ? <p className="subtle">Loading…</p> : null}
                    {rowHistory?.usages ? (
                      <ul className="usage-list">
                        {rowHistory.usages.map((usage) => (
                          <li key={usage.id}>
                            <button className="link-button" type="button" onClick={() => setPostFilter(usage.postSlug)}>
                              {usage.postSlug}
                            </button>
                            <span className="subtle">{new Date(usage.createdAt).toLocaleDateString()}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}

          {!catalog.length && !listError ? (
            <p className="subtle">
              No assets match{hasFilters ? " these filters" : ""}.{" "}
              {hasFilters ? (
                <button className="link-button" type="button" onClick={clearFilters}>
                  Clear filters
                </button>
              ) : null}
            </p>
          ) : null}
        </div>
      </section>

      <PreviewLayer gallery={gallery} />
    </main>
  );
}
