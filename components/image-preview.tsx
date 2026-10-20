"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const PEEK_MAX_WIDTH = 520;
const PEEK_DELAY_MS = 150;

export type PreviewItem = {
  id: string | number;
  name: string;
  url: string;
  /** Short secondary text for the modal caption, such as dimensions or file size. */
  detail?: string;
};

type PeekState = { item: PreviewItem; left: number; anchorY: number };

/**
 * Shared state for a list of previewable thumbnails: a hover peek beside the thumbnail and a
 * click-to-open modal that steps through `items` with the arrow keys.
 */
export function usePreviewGallery(items: PreviewItem[]) {
  const [activeId, setActiveId] = useState<PreviewItem["id"] | null>(null);
  const [peek, setPeek] = useState<PeekState | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  const hidePeek = useCallback(() => {
    window.clearTimeout(timerRef.current);
    setPeek(null);
  }, []);

  const showPeek = useCallback((item: PreviewItem, thumb: HTMLElement) => {
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      const rect = thumb.getBoundingClientRect();
      setPeek({ item, left: rect.right + 12, anchorY: rect.top + rect.height / 2 });
    }, PEEK_DELAY_MS);
  }, []);

  useEffect(() => {
    if (!peek) return;

    window.addEventListener("scroll", hidePeek, true);
    return () => window.removeEventListener("scroll", hidePeek, true);
  }, [peek, hidePeek]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const activeIndex = activeId === null ? -1 : items.findIndex((item) => item.id === activeId);

  return {
    items,
    peek,
    showPeek,
    hidePeek,
    activeIndex,
    open(id: PreviewItem["id"]) {
      hidePeek();
      setActiveId(id);
    },
    close() {
      setActiveId(null);
    },
    step(delta: number) {
      const next = items[activeIndex + delta];
      if (next) setActiveId(next.id);
    }
  };
}

export type PreviewGallery = ReturnType<typeof usePreviewGallery>;

/** A thumbnail button: hover shows the peek, click opens the modal. Falls back to an empty box if the image fails. */
export function PreviewThumb({ item, gallery }: { item: PreviewItem; gallery: PreviewGallery }) {
  const [broken, setBroken] = useState(false);

  if (broken) {
    return <div aria-hidden className="asset-thumb asset-thumb-empty" />;
  }

  return (
    <button
      aria-label={`Preview ${item.name}`}
      className="asset-thumb-button"
      type="button"
      onClick={() => gallery.open(item.id)}
      onMouseEnter={(event) => gallery.showPeek(item, event.currentTarget)}
      onMouseLeave={gallery.hidePeek}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" className="asset-thumb" loading="lazy" onError={() => setBroken(true)} src={item.url} />
    </button>
  );
}

function ThumbPeek({ item, left, anchorY }: PeekState) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(anchorY);
  const [loaded, setLoaded] = useState(false);
  const maxWidth = Math.max(120, Math.min(PEEK_MAX_WIDTH, window.innerWidth - left - 12));
  const maxHeight = Math.min(window.innerHeight * 0.6, PEEK_MAX_WIDTH);

  // Centre on the thumbnail, then keep the card inside the viewport once its real height is known.
  const place = useCallback(() => {
    const height = ref.current?.offsetHeight ?? 0;
    setTop(Math.min(Math.max(anchorY - height / 2, 8), window.innerHeight - height - 8));
  }, [anchorY]);

  useLayoutEffect(place, [place]);

  return (
    <div
      aria-hidden
      className="peek"
      data-testid="thumb-peek"
      ref={ref}
      style={{ top, left, visibility: loaded ? "visible" : "hidden" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt=""
        onLoad={() => {
          setLoaded(true);
          place();
        }}
        src={item.url}
        style={{ maxWidth, maxHeight }}
      />
    </div>
  );
}

function ImageModal({ gallery }: { gallery: PreviewGallery }) {
  const { items, activeIndex: index } = gallery;
  const item = items[index];
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
      aria-label={`Preview of ${item.name}`}
      className="preview-dialog"
      onClick={(event) => {
        // A click on the dialog element itself is a click on the backdrop.
        if (event.target === event.currentTarget) gallery.close();
      }}
      onClose={gallery.close}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") gallery.step(-1);
        if (event.key === "ArrowRight") gallery.step(1);
      }}
      ref={dialogRef}
    >
      <div className="preview-body">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={item.name} className="preview-image" key={item.id} src={item.url} />
      </div>
      <div className="preview-bar">
        <div className="preview-caption">
          <strong>{item.name}</strong>
          <span>
            {item.detail ? `${item.detail} · ` : ""}
            {index + 1} of {items.length}
          </span>
        </div>
        <div className="actions">
          <button
            aria-label="Previous image"
            className="button-secondary"
            disabled={index === 0}
            type="button"
            onClick={() => gallery.step(-1)}
          >
            ←
          </button>
          <button
            aria-label="Next image"
            className="button-secondary"
            disabled={index === items.length - 1}
            type="button"
            onClick={() => gallery.step(1)}
          >
            →
          </button>
          <button className="button-secondary" type="button" onClick={gallery.close}>
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
}

/** Renders the hover peek and the modal for a gallery. Mount it once per page. */
export function PreviewLayer({ gallery }: { gallery: PreviewGallery }) {
  if (gallery.activeIndex >= 0) {
    return <ImageModal gallery={gallery} />;
  }

  return gallery.peek ? <ThumbPeek {...gallery.peek} /> : null;
}
