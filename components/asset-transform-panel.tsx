"use client";

import { useState } from "react";

import type { AssetRecord, AssetTransformResponse } from "@/components/asset-types";
import { readJsonResponse } from "@/components/client-http";
import { formatBytes } from "@/components/format";
import { FORMAT_LABELS, MAX_TRANSFORM_DIMENSION, TRANSFORM_FORMATS, type TransformFormat } from "@/lib/utils/image-formats";

type FormatChoice = "keep" | TransformFormat;

function scaleDimension(value: string, ratio: number) {
  const parsed = Number(value);

  return value && Number.isFinite(parsed) && parsed > 0 ? String(Math.max(1, Math.round(parsed * ratio))) : "";
}

export function AssetTransformPanel({
  asset,
  onCreated
}: {
  asset: AssetRecord;
  onCreated: (asset: AssetRecord) => void;
}) {
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [keepAspectRatio, setKeepAspectRatio] = useState(true);
  const [format, setFormat] = useState<FormatChoice>("keep");
  const [makePublic, setMakePublic] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function changeWidth(value: string) {
    setWidth(value);

    if (keepAspectRatio) {
      setHeight(scaleDimension(value, asset.height / asset.width));
    }
  }

  function changeHeight(value: string) {
    setHeight(value);

    if (keepAspectRatio) {
      setWidth(scaleDimension(value, asset.width / asset.height));
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!width && !height && format === "keep") {
      setMessage(null);
      setError("Enter a width, a height, or choose a format to convert to.");
      return;
    }

    setMessage("Creating…");
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/assets/${asset.id}/transform`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          width: width ? Number(width) : undefined,
          height: height ? Number(height) : undefined,
          keepAspectRatio,
          format: format === "keep" ? undefined : format,
          makePublic
        })
      });
      const payload = await readJsonResponse<AssetTransformResponse>(response, "Unable to resize or convert the image.");

      onCreated(payload.asset);
      setMessage(
        `${payload.deduped ? "Already exists" : "Created"}: ${payload.asset.originalFilename} — ${payload.asset.width} × ${payload.asset.height}, ${formatBytes(payload.asset.byteSize)}.`
      );
    } catch (caught) {
      setMessage(null);
      setError(caught instanceof Error ? caught.message : "Unable to resize or convert the image.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="row-panel" onSubmit={(event) => void handleSubmit(event)}>
      <p className="subtle">
        Creates a new asset from this image. The original stays at {asset.width} × {asset.height}.
      </p>

      <div className="transform-fields">
        <label className="label">
          <span>Width (px)</span>
          <input
            autoFocus
            className="input"
            inputMode="numeric"
            max={MAX_TRANSFORM_DIMENSION}
            min={1}
            placeholder={String(asset.width)}
            step={1}
            type="number"
            value={width}
            onChange={(event) => changeWidth(event.target.value)}
          />
        </label>
        <label className="label">
          <span>Height (px)</span>
          <input
            className="input"
            inputMode="numeric"
            max={MAX_TRANSFORM_DIMENSION}
            min={1}
            placeholder={String(asset.height)}
            step={1}
            type="number"
            value={height}
            onChange={(event) => changeHeight(event.target.value)}
          />
        </label>
        <label className="label">
          <span>Format</span>
          <select className="input" value={format} onChange={(event) => setFormat(event.target.value as FormatChoice)}>
            <option value="keep">Keep original</option>
            {TRANSFORM_FORMATS.map((option) => (
              <option key={option} value={option}>
                {FORMAT_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="toggle-row">
        <input
          checked={keepAspectRatio}
          id={`keep-ratio-${asset.id}`}
          type="checkbox"
          onChange={(event) => setKeepAspectRatio(event.target.checked)}
        />
        <label htmlFor={`keep-ratio-${asset.id}`}>
          <strong>Keep aspect ratio</strong>
          <p className="subtle">Turn off to stretch the image to exactly the width and height above.</p>
        </label>
      </div>

      <div className="toggle-row">
        <input
          checked={makePublic}
          id={`transform-public-${asset.id}`}
          type="checkbox"
          onChange={(event) => setMakePublic(event.target.checked)}
        />
        <label htmlFor={`transform-public-${asset.id}`}>
          <strong>Make the new image publicly accessible</strong>
          <p className="subtle">Requests a public-read ACL, like the upload form. Not needed when a bucket policy or CDN serves the images.</p>
        </label>
      </div>

      <div className="actions">
        <button className="button" disabled={isSubmitting} type="submit">
          Create new image
        </button>
        {message ? <span className="status">{message}</span> : null}
        {error ? <span className="error">{error}</span> : null}
      </div>
    </form>
  );
}
