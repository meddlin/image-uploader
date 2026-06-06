"use client";

import { useState } from "react";

import type { AssetRecord, AssetSnippetResponse } from "@/components/asset-types";
import { readJsonResponse } from "@/components/client-http";
import { PageTabs } from "@/components/page-tabs";

const emptyResponse = {
  asset: null as AssetRecord | null,
  snippet: "",
  deduped: false
};

const clipboardImageExtensions: Record<string, string> = {
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/tiff": "tiff",
  "image/webp": "webp"
};

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function buildPastedImageFilename(mimeType: string) {
  const now = new Date();
  const date = [
    now.getFullYear(),
    padDatePart(now.getMonth() + 1),
    padDatePart(now.getDate())
  ].join("");
  const time = [
    padDatePart(now.getHours()),
    padDatePart(now.getMinutes()),
    padDatePart(now.getSeconds())
  ].join("");
  const extension = clipboardImageExtensions[mimeType] ?? "png";

  return `pasted-image-${date}-${time}.${extension}`;
}

function normalizePastedImageFile(file: File) {
  if (file.name) {
    return file;
  }

  return new File([file], buildPastedImageFilename(file.type), {
    type: file.type,
    lastModified: file.lastModified
  });
}

export function ImagePublisher({
  defaultMakePublic
}: {
  defaultMakePublic: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [postSlug, setPostSlug] = useState("");
  const [altText, setAltText] = useState("");
  const [caption, setCaption] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [makePublic, setMakePublic] = useState(defaultMakePublic);
  const [result, setResult] = useState<typeof emptyResponse>(emptyResponse);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReference, setShowReference] = useState(false);
  const tags = tagsInput
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

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

  function handlePaste(event: React.ClipboardEvent<HTMLFormElement>) {
    const imageItem = Array.from(event.clipboardData.items).find(
      (item) => item.kind === "file" && item.type.startsWith("image/")
    );

    if (!imageItem) {
      return;
    }

    const pastedFile = imageItem.getAsFile();

    if (!pastedFile) {
      return;
    }

    const imageFile = normalizePastedImageFile(pastedFile);

    event.preventDefault();
    setFile(imageFile);
    setErrorMessage(null);
    setStatusMessage(`${imageFile.name} pasted and ready to upload.`);
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

      const payload = await readJsonResponse<AssetSnippetResponse>(response, "Upload failed.");

      setResult(payload);
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

  return (
    <main className="shell">
      <PageTabs />

      <header className="hero">
        <p className="eyebrow">Local-only workflow</p>
        <h1>Upload once. Paste clean MDX.</h1>
        <p>
          Handles S3 upload, dimensions, cataloging, dedupe, and snippet generation so your article workflow stays
          focused on writing. The web UI covers the common path; the CLI handles audits, backfills, and bulk maintenance.
        </p>
      </header>

      {/* ── CLI reference strip ── */}
      <section>
        <button
          className="reference-toggle"
          onClick={() => setShowReference(!showReference)}
          type="button"
        >
          <span>{showReference ? "Hide" : "Show"} CLI reference</span>
        </button>

        {showReference ? (
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
        ) : null}
      </section>
      
      <div className="publish-layout">
        <section className="panel stack">
          <div className="panel-header">
            <div>
              <h2>Publish a new image</h2>
              <p className="subtle">Choose a file, enter the post slug, and get back a copy-ready MDX component.</p>
            </div>
          </div>

          <form className="form-grid" onPaste={handlePaste} onSubmit={handleUpload}>
            <label className="label">
              <span>Image file</span>
              <div className="dropzone">
                <strong>{file ? file.name : "Drop, paste, or click to browse"}</strong>
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
      </div>
    </main>
  );
}
