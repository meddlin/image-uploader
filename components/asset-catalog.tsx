"use client";

import { useDeferredValue, useEffect, useState } from "react";

import type { AssetRecord, AssetSnippetResponse } from "@/components/asset-types";
import { readJsonResponse } from "@/components/client-http";
import { PageTabs } from "@/components/page-tabs";

const emptySnippet = {
  asset: null as AssetRecord | null,
  snippet: "",
  deduped: true
};

export function AssetCatalog({ initialAssets }: { initialAssets: AssetRecord[] }) {
  const [query, setQuery] = useState("");
  const [postFilter, setPostFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [postSlug, setPostSlug] = useState("");
  const [altText, setAltText] = useState("");
  const [caption, setCaption] = useState("");
  const [catalog, setCatalog] = useState<AssetRecord[]>(initialAssets);
  const [result, setResult] = useState<typeof emptySnippet>(emptySnippet);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const deferredPostFilter = useDeferredValue(postFilter);
  const deferredTagFilter = useDeferredValue(tagFilter);

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

    let cancelled = false;
    fetch(`/api/catalog?${params.toString()}`, { method: "GET" })
      .then(async (response) => {
        return readJsonResponse<{ assets: AssetRecord[] }>(response, "Failed to load catalog.");
      })
      .then((payload) => {
        if (!cancelled) {
          setCatalog(payload.assets);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load catalog.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [deferredPostFilter, deferredQuery, deferredTagFilter]);

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setStatusMessage(`${label} copied to the clipboard.`);
      setErrorMessage(null);
    } catch {
      setErrorMessage(`Unable to copy ${label.toLowerCase()} from the browser.`);
    }
  }

  async function handleReuse(assetId: number) {
    if (!postSlug.trim()) {
      setErrorMessage("Enter a post slug before generating a snippet.");
      return;
    }

    setErrorMessage(null);
    setStatusMessage("Generating a new usage snippet…");
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/assets/${assetId}/snippet`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          postSlug: postSlug.trim(),
          altText: altText.trim(),
          caption: caption.trim()
        })
      });

      const payload = await readJsonResponse<AssetSnippetResponse>(response, "Unable to reuse asset.");

      setResult({
        asset: payload.asset,
        snippet: payload.snippet,
        deduped: true
      });
      setStatusMessage("Snippet generated from an existing asset.");
      setCatalog((current) => current.map((item) => (item.id === payload.asset.id ? payload.asset : item)));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to reuse asset.");
      setStatusMessage(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="shell">
      <PageTabs />

      <header className="hero">
        <p className="eyebrow">Catalog</p>
        <h1>Catalogued assets</h1>
        <p>Search published images, inspect usage history, and generate fresh MDX snippets from existing assets.</p>
      </header>

      <section className="panel stack asset-catalog-page">
        <div className="panel-header">
          <div>
            <h2>Search assets</h2>
            <p className="subtle">Search by name, post slug, or tag. Reusing an asset creates a new usage row.</p>
          </div>
        </div>

        <div className="form-grid">
          <input
            className="search-input"
            placeholder="Search filename, URL, or key"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="form-row">
            <input
              className="search-input"
              placeholder="Filter by post slug"
              value={postFilter}
              onChange={(event) => setPostFilter(event.target.value)}
            />
            <input
              className="search-input"
              placeholder="Filter by tag"
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
            />
          </div>
        </div>

        <div className="reuse-fields">
          <label className="label">
            <span>Post slug for generated snippets</span>
            <input
              className="input"
              placeholder="blog/how-i-built-this-tool"
              value={postSlug}
              onChange={(event) => setPostSlug(event.target.value)}
            />
          </label>
          <div className="form-row">
            <label className="label">
              <span>Alt text</span>
              <input
                className="input"
                placeholder="Optional for now"
                value={altText}
                onChange={(event) => setAltText(event.target.value)}
              />
            </label>
            <label className="label">
              <span>Caption</span>
              <input
                className="input"
                placeholder="Optional caption"
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
              />
            </label>
          </div>
        </div>

        {statusMessage ? <p className="status">{statusMessage}</p> : null}
        {errorMessage ? <p className="error">{errorMessage}</p> : null}

        {result.asset ? (
          <div className="result">
            <div className="snippet-header">
              <p className="result-heading">Generated snippet</p>
              <button className="button-ghost" type="button" onClick={() => copyText(result.snippet, "Snippet")}>
                Copy
              </button>
            </div>
            <div className="code-block">{result.snippet}</div>
          </div>
        ) : null}

        <div className="catalog-list">
          {catalog.map((asset) => (
            <article className="asset-row" key={asset.id}>
              <div className="asset-row-header">
                <div className="asset-row-meta">
                  <strong>{asset.originalFilename}</strong>
                  <p>{asset.publicUrl}</p>
                </div>
                <button
                  className="button-secondary"
                  disabled={isSubmitting}
                  type="button"
                  onClick={() => handleReuse(asset.id)}
                >
                  Generate snippet
                </button>
              </div>
              <div className="asset-stats">
                <span>
                  {asset.width} × {asset.height}
                </span>
                <span>
                  {asset.usageCount} {asset.usageCount === 1 ? "usage" : "usages"}
                </span>
                <span>{asset.lastUsedPostSlug ?? "No usage history"}</span>
              </div>
              {asset.tags.length ? (
                <div className="pill-row">
                  {asset.tags.map((tag) => (
                    <span className="pill" key={`${asset.id}-${tag}`}>
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          ))}

          {!catalog.length ? <p className="subtle">No catalog matches this filter yet.</p> : null}
        </div>
      </section>
    </main>
  );
}

