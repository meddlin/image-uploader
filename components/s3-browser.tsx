"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { readJsonResponse } from "@/components/client-http";
import { PreviewLayer, PreviewThumb, usePreviewGallery, type PreviewItem } from "@/components/image-preview";
import type { S3BrowseResult, S3ObjectEntry } from "@/lib/services/s3-browser";

type ImportState = { status: "importing" } | { status: "done"; assetId: number } | { status: "error"; message: string };

function toPreviewItem(object: S3ObjectEntry): PreviewItem {
  return { id: object.key, name: object.name, url: object.publicUrl, detail: formatSize(object.size) };
}

function folderHref(prefix: string) {
  return `/s3?prefix=${encodeURIComponent(prefix)}`;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(timestamp: number | null) {
  // ISO date keeps server and client renders identical regardless of locale or time zone.
  return timestamp ? new Date(timestamp).toISOString().slice(0, 10) : "—";
}

function Breadcrumb({ prefix }: { prefix: string }) {
  const segments = prefix.split("/").filter(Boolean);

  return (
    <nav aria-label="Bucket path" className="s3-breadcrumb">
      <Link href={folderHref("")}>bucket root</Link>
      {segments.map((segment, index) => {
        const path = `${segments.slice(0, index + 1).join("/")}/`;

        return (
          <span key={path}>
            <span aria-hidden className="s3-sep">
              /
            </span>
            {index === segments.length - 1 ? <strong>{segment}</strong> : <Link href={folderHref(path)}>{segment}</Link>}
          </span>
        );
      })}
    </nav>
  );
}

export function S3Browser({ initial, error }: { initial: S3BrowseResult | null; error: string | null }) {
  const [objects, setObjects] = useState<S3ObjectEntry[]>(initial?.objects ?? []);
  const [nextToken, setNextToken] = useState<string | null>(initial?.nextToken ?? null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [imports, setImports] = useState<Record<string, ImportState>>({});
  const gallery = usePreviewGallery(useMemo(() => objects.filter((object) => object.isImage).map(toPreviewItem), [objects]));

  async function loadMore() {
    if (!initial || !nextToken) return;

    setLoadingMore(true);
    setMoreError(null);

    try {
      const params = new URLSearchParams({ prefix: initial.prefix, token: nextToken });
      const response = await fetch(`/api/s3/objects?${params.toString()}`);
      const page = await readJsonResponse<S3BrowseResult>(response, "Unable to load more objects.");

      setObjects((current) => [...current, ...page.objects]);
      setNextToken(page.nextToken);
    } catch (caught) {
      setMoreError(caught instanceof Error ? caught.message : "Unable to load more objects.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function importObject(key: string) {
    setImports((current) => ({ ...current, [key]: { status: "importing" } }));

    try {
      const response = await fetch("/api/s3/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key })
      });
      const payload = await readJsonResponse<{ assetId: number; imported: boolean }>(response, "Unable to import the object.");

      setImports((current) => ({ ...current, [key]: { status: "done", assetId: payload.assetId } }));
    } catch (caught) {
      setImports((current) => ({
        ...current,
        [key]: { status: "error", message: caught instanceof Error ? caught.message : "Unable to import the object." }
      }));
    }
  }

  return (
    <main className="shell">
      <header className="page-header">
        <h1>S3</h1>
        <p>{initial ? `Browse ${initial.bucket}. Listing is read-only; importing only writes to the local catalog.` : "Browse the bucket."}</p>
      </header>

      <section className="panel stack asset-catalog-page">
        {error ? <p className="error">{error}</p> : null}

        {initial ? (
          <>
            <Breadcrumb prefix={initial.prefix} />

            <div className="catalog-list">
              {initial.folders.map((folder) => (
                <div className="asset-row s3-folder" key={folder}>
                  <Link href={folderHref(folder)}>{folder.slice(initial.prefix.length)}</Link>
                </div>
              ))}

              {objects.map((object) => {
                const state = imports[object.key];
                const catalogId = state?.status === "done" ? state.assetId : object.assetId;

                return (
                  <article className="asset-row" key={object.key}>
                    <div className="asset-row-header">
                      {object.isImage ? (
                        <PreviewThumb gallery={gallery} item={toPreviewItem(object)} />
                      ) : (
                        <div aria-hidden className="asset-thumb asset-thumb-empty" />
                      )}
                      <div className="asset-row-meta">
                        <strong>{object.name}</strong>
                        <p>
                          {formatSize(object.size)} · {formatDate(object.lastModified)}
                        </p>
                      </div>
                      <div className="asset-row-actions">
                        {catalogId !== null ? (
                          <span className="s3-status">In catalog</span>
                        ) : !object.isImage ? (
                          <span className="s3-status s3-status-muted">Not an image</span>
                        ) : (
                          <button
                            className="button-secondary"
                            disabled={state?.status === "importing"}
                            type="button"
                            onClick={() => void importObject(object.key)}
                          >
                            {state?.status === "importing" ? "Importing…" : "Import"}
                          </button>
                        )}
                      </div>
                    </div>
                    {state?.status === "error" ? <p className="error">{state.message}</p> : null}
                  </article>
                );
              })}

              {!initial.folders.length && !objects.length ? <p className="subtle">Nothing under this prefix.</p> : null}
            </div>

            {moreError ? <p className="error">{moreError}</p> : null}
            {nextToken ? (
              <div className="actions">
                <button className="button-secondary" disabled={loadingMore} type="button" onClick={() => void loadMore()}>
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      <PreviewLayer gallery={gallery} />
    </main>
  );
}
