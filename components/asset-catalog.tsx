"use client";

import { useDeferredValue, useEffect, useRef, useState } from "react";

import type { AssetRecord, AssetSnippetResponse, UsageRecord } from "@/components/asset-types";
import { readJsonResponse } from "@/components/client-http";

const SLUG_STORAGE_KEY = "asset-catalog:last-post-slug";

const PEEK_MAX_WIDTH = 520;
const PEEK_DELAY_MS = 150;

type Peek = { assetId: number; top: number; left: number; width: number; height: number };

type Panel = { assetId: number; kind: "reuse" | "history" } | null;

type ReuseState = {
  assetId: number;
  snippet: string;
  message: string | null;
  error: string | null;
};

function ImagePreview({
  asset,
  index,
  total,
  onClose,
  onStep
}: {
  asset: AssetRecord;
  index: number;
  total: number;
  onClose: () => void;
  onStep: (delta: number) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  }, []);

  return (
    <dialog
      aria-label={`Preview of ${asset.originalFilename}`}
      className="preview-dialog"
      onClick={(event) => {
        // A click on the dialog element itself is a click on the backdrop.
        if (event.target === event.currentTarget) onClose();
      }}
      onClose={onClose}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") onStep(-1);
        if (event.key === "ArrowRight") onStep(1);
      }}
      ref={dialogRef}
    >
      <div className="preview-body">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={asset.originalFilename} className="preview-image" key={asset.id} src={asset.publicUrl} />
      </div>
      <div className="preview-bar">
        <div className="preview-caption">
          <strong>{asset.originalFilename}</strong>
          <span>
            {asset.width} × {asset.height} · {index + 1} of {total}
          </span>
        </div>
        <div className="actions">
          <button aria-label="Previous image" className="button-secondary" disabled={index === 0} type="button" onClick={() => onStep(-1)}>
            ←
          </button>
          <button aria-label="Next image" className="button-secondary" disabled={index === total - 1} type="button" onClick={() => onStep(1)}>
            →
          </button>
          <button className="button-secondary" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
}

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
  const [brokenThumbs, setBrokenThumbs] = useState<Set<number>>(new Set());
  const [listError, setListError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const deferredPostFilter = useDeferredValue(postFilter);
  const deferredTagFilter = useDeferredValue(tagFilter);
  const hasFilteredRef = useRef(false);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [peek, setPeek] = useState<Peek | null>(null);
  const peekTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SLUG_STORAGE_KEY);
      if (stored) setPostSlug(stored);
    } catch {
      // Storage unavailable; the slug just won't be remembered.
    }
  }, []);

  useEffect(() => {
    if (!peek) return;

    const hide = () => setPeek(null);
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [peek]);

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
  const previewIndex = previewId === null ? -1 : catalog.findIndex((item) => item.id === previewId);

  function showPeek(asset: AssetRecord, thumb: HTMLElement) {
    window.clearTimeout(peekTimerRef.current);
    peekTimerRef.current = window.setTimeout(() => {
      const rect = thumb.getBoundingClientRect();
      const maxHeight = Math.min(window.innerHeight * 0.6, PEEK_MAX_WIDTH);
      const scale = Math.min(PEEK_MAX_WIDTH / asset.width, maxHeight / asset.height, 1);
      const width = Math.round(asset.width * scale);
      const height = Math.round(asset.height * scale);
      const top = Math.min(Math.max(rect.top + rect.height / 2 - height / 2, 8), window.innerHeight - height - 8);

      setPeek({ assetId: asset.id, top, left: rect.right + 12, width, height });
    }, PEEK_DELAY_MS);
  }

  function hidePeek() {
    window.clearTimeout(peekTimerRef.current);
    setPeek(null);
  }

  function stepPreview(delta: number) {
    const next = catalog[previewIndex + delta];
    if (next) setPreviewId(next.id);
  }

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
                  {brokenThumbs.has(asset.id) ? (
                    <div aria-hidden className="asset-thumb asset-thumb-empty" />
                  ) : (
                    <button
                      aria-label={`Preview ${asset.originalFilename}`}
                      className="asset-thumb-button"
                      type="button"
                      onClick={() => {
                        hidePeek();
                        setPreviewId(asset.id);
                      }}
                      onMouseEnter={(event) => showPeek(asset, event.currentTarget)}
                      onMouseLeave={hidePeek}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        alt=""
                        className="asset-thumb"
                        loading="lazy"
                        onError={() => setBrokenThumbs((current) => new Set(current).add(asset.id))}
                        src={asset.publicUrl}
                      />
                    </button>
                  )}
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

      {peek && previewIndex < 0 ? (
        <div
          aria-hidden
          className="peek"
          data-testid="thumb-peek"
          style={{ top: peek.top, left: peek.left, width: peek.width, height: peek.height }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" src={catalog.find((item) => item.id === peek.assetId)?.publicUrl} />
        </div>
      ) : null}

      {previewIndex >= 0 ? (
        <ImagePreview
          asset={catalog[previewIndex]}
          index={previewIndex}
          total={catalog.length}
          onClose={() => setPreviewId(null)}
          onStep={stepPreview}
        />
      ) : null}
    </main>
  );
}
