"use client";

import { useDeferredValue, useEffect, useState } from "react";

type AssetRecord = {
  id: number;
  originalFilename: string;
  publicUrl: string;
  s3Key: string;
  width: number;
  height: number;
  tags: string[];
  usageCount: number;
  lastUsedPostSlug: string | null;
  createdAt: number;
};

type UploadResponse = {
  asset: AssetRecord;
  snippet: string;
  deduped: boolean;
};

const emptyResponse = {
  asset: null as AssetRecord | null,
  snippet: "",
  deduped: false
};

export function ImagePublisher({
  initialAssets,
  defaultMakePublic
}: {
  initialAssets: AssetRecord[];
  defaultMakePublic: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [postSlug, setPostSlug] = useState("");
  const [altText, setAltText] = useState("");
  const [caption, setCaption] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [makePublic, setMakePublic] = useState(defaultMakePublic);
  const [query, setQuery] = useState("");
  const [postFilter, setPostFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [catalog, setCatalog] = useState<AssetRecord[]>(initialAssets);
  const [result, setResult] = useState<typeof emptyResponse>(emptyResponse);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const deferredPostFilter = useDeferredValue(postFilter);
  const deferredTagFilter = useDeferredValue(tagFilter);
  const tags = tagsInput
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

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
        if (!response.ok) {
          const payload = await response.json();
          throw new Error(payload.error ?? "Failed to load catalog.");
        }

        return response.json();
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

  const selectedFileSummary = file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB` : "No file selected yet";

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setStatusMessage(`${label} copied to the clipboard.`);
      setErrorMessage(null);
    } catch {
      setErrorMessage(`Unable to copy ${label.toLowerCase()} from the browser.`);
    }
  }

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setErrorMessage("Choose an image file before uploading.");
      return;
    }

    if (!postSlug.trim()) {
      setErrorMessage("Enter a post slug before uploading.");
      return;
    }

    const formData = new FormData();
    formData.set("file", file);
    formData.set("postSlug", postSlug.trim());
    formData.set("altText", altText.trim());
    formData.set("caption", caption.trim());
    formData.set("tags", JSON.stringify(tags));
    formData.set("makePublic", String(makePublic));

    setErrorMessage(null);
    setStatusMessage("Uploading image and generating snippet…");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/assets", {
        method: "POST",
        body: formData
      });

      const payload = await response.json();

      if (!response.ok) {
        setErrorMessage(payload.error ?? "Upload failed.");
        setStatusMessage(null);
        return;
      }

      setResult(payload);
      setCatalog((current) => [payload.asset, ...current.filter((item) => item.id !== payload.asset.id)]);
      setStatusMessage(
        payload.deduped
          ? makePublic
            ? "Existing asset reused. Public access requested."
            : "Existing asset reused. New usage created."
          : makePublic
            ? "Upload complete. Public access requested."
            : "Upload complete."
      );
      setFile(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Upload failed.");
      setStatusMessage(null);
    } finally {
      setIsSubmitting(false);
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

      const payload = await response.json();

      if (!response.ok) {
        setErrorMessage(payload.error ?? "Unable to reuse asset.");
        setStatusMessage(null);
        return;
      }

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
      <header className="hero">
        <p className="eyebrow">Local-only workflow</p>
        <h1>Upload once. Paste clean MDX.</h1>
        <p>
          Handles S3 upload, dimensions, cataloging, dedupe, and snippet generation so your article workflow stays
          focused on writing. The web UI covers the common path; the CLI handles audits, backfills, and bulk maintenance.
        </p>
      </header>

      <div className="grid">
        {/* ── Left: upload panel ── */}
        <section className="panel stack">
          <div className="panel-header">
            <div>
              <h2>Publish a new image</h2>
              <p className="subtle">Choose a file, enter the post slug, and get back a copy-ready MDX component.</p>
            </div>
          </div>

          <form className="form-grid" onSubmit={handleUpload}>
            <label className="label">
              <span>Image file</span>
              <div className="dropzone">
                <strong>{file ? file.name : "Drop an image here or click to browse"}</strong>
                <p>{selectedFileSummary}</p>
                <input
                  accept="image/*"
                  type="file"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
              </div>
            </label>

            <div className="form-row">
              <label className="label">
                <span>Post slug</span>
                <input
                  className="input"
                  placeholder="blog/how-i-built-this-tool"
                  value={postSlug}
                  onChange={(event) => setPostSlug(event.target.value)}
                />
              </label>

              <label className="label">
                <span>Tags</span>
                <input
                  className="input"
                  placeholder="hero, screenshot, workflow"
                  value={tagsInput}
                  onChange={(event) => setTagsInput(event.target.value)}
                />
              </label>
            </div>

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
              <textarea
                className="textarea"
                placeholder="Optional caption for your MDX component"
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
              />
            </label>

            <div className="toggle-row">
              <input
                checked={makePublic}
                id="make-public"
                type="checkbox"
                onChange={(event) => setMakePublic(event.target.checked)}
              />
              <label htmlFor="make-public">
                <strong>Make this upload publicly accessible</strong>
                <p className="subtle">
                  Requests a{" "}<code style={{ fontSize: "0.85em", background: "rgba(0,0,0,0.06)", padding: "1px 5px", borderRadius: 4 }}>public-read</code>{" "}
                  object ACL. Requires <code style={{ fontSize: "0.85em", background: "rgba(0,0,0,0.06)", padding: "1px 5px", borderRadius: 4 }}>s3:PutObjectAcl</code>{" "}
                  and a bucket that allows public ACLs.
                </p>
              </label>
            </div>

            {tags.length > 0 ? (
              <div className="pill-row">
                {tags.map((tag) => (
                  <span className="pill" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="actions">
              <button className="button" disabled={isSubmitting} type="submit">
                {isSubmitting ? "Working…" : "Upload and generate snippet"}
              </button>
              {result.asset ? (
                <>
                  <button className="button-secondary" type="button" onClick={() => copyText(result.snippet, "Snippet")}>
                    Copy snippet
                  </button>
                  <button
                    className="button-secondary"
                    type="button"
                    onClick={() => copyText(result.asset?.publicUrl ?? "", "Public URL")}
                  >
                    Copy URL
                  </button>
                </>
              ) : null}
            </div>
          </form>

          {statusMessage ? <p className="status">{statusMessage}</p> : null}
          {errorMessage ? <p className="error">{errorMessage}</p> : null}

          {result.asset ? (
            <div className="result">
              <p className="result-heading">Result</p>

              <div className="meta-grid">
                <div className="meta-cell">
                  <small>Public URL</small>
                  <strong>{result.asset.publicUrl}</strong>
                </div>
                <div className="meta-cell">
                  <small>Dimensions</small>
                  <strong>
                    {result.asset.width} × {result.asset.height}
                  </strong>
                </div>
                <div className="meta-cell">
                  <small>S3 key</small>
                  <strong>{result.asset.s3Key}</strong>
                </div>
                <div className="meta-cell">
                  <small>Catalog state</small>
                  <strong>{result.deduped ? "Existing asset reused" : "Fresh asset uploaded"}</strong>
                </div>
              </div>

              <div>
                <div className="snippet-header">
                  <p className="result-heading">Generated snippet</p>
                  <button className="button-ghost" type="button" onClick={() => copyText(result.snippet, "Snippet")}>
                    Copy
                  </button>
                </div>
                <div className="code-block">{result.snippet}</div>
              </div>
            </div>
          ) : null}
        </section>

        {/* ── Right: catalog panel ── */}
        <section className="panel stack">
          <div className="panel-header">
            <div>
              <h2>Catalogued assets</h2>
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
                  <span>{asset.usageCount} {asset.usageCount === 1 ? "usage" : "usages"}</span>
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
      </div>

      {/* ── CLI reference strip ── */}
      <div className="tool-strip">
        <div className="tool-item">
          <h3>CLI listing</h3>
          <p>Search the local catalog without opening the UI.</p>
          <code>pnpm imgctl list --post blog/my-post</code>
        </div>
        <div className="tool-item">
          <h3>Snippet regeneration</h3>
          <p>Create another usage record from an existing asset ID.</p>
          <code>{'pnpm imgctl snippet 12 --post blog/reuse --alt "Alt text"'}</code>
        </div>
        <div className="tool-item">
          <h3>S3 maintenance</h3>
          <p>Backfill or verify the bucket outside the browser flow.</p>
          <code>pnpm imgctl import-s3 --prefix legacy/posts</code>
        </div>
      </div>
    </main>
  );
}
