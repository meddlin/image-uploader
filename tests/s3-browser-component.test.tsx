// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { S3Browser } from "@/components/s3-browser";
import type { S3BrowseResult } from "@/lib/services/s3-browser";

const object = (name: string, overrides: Partial<S3BrowseResult["objects"][number]> = {}) => ({
  key: `posts/${name}`,
  name,
  size: 2048,
  lastModified: Date.UTC(2025, 0, 2),
  publicUrl: `https://cdn.example.com/posts/${name}`,
  isImage: true,
  assetId: null,
  ...overrides
});

const initial: S3BrowseResult = {
  bucket: "my-bucket",
  prefix: "posts/",
  folders: ["posts/2025/"],
  nextToken: null,
  objects: [object("new.png"), object("known.png", { assetId: 4 }), object("notes.txt", { isImage: false })]
};

describe("S3Browser", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  test("renders folders, breadcrumb, and per-object status", () => {
    render(<S3Browser error={null} initial={initial} />);

    expect(screen.getByRole("link", { name: "2025/" })).toHaveAttribute("href", "/s3?prefix=posts%2F2025%2F");
    expect(screen.getByRole("link", { name: "bucket root" })).toHaveAttribute("href", "/s3?prefix=");
    expect(screen.getByText("posts")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeInTheDocument();
    expect(screen.getByText("In catalog")).toBeInTheDocument();
    expect(screen.getByText("Not an image")).toBeInTheDocument();
    expect(screen.getAllByText("2.0 KB · 2025-01-02")).toHaveLength(3);
  });

  test("imports an object and marks it as in the catalog", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(Response.json({ assetId: 9, imported: true }));
    render(<S3Browser error={null} initial={initial} />);

    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/s3/import",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ key: "posts/new.png" }) })
    );
    expect(await screen.findAllByText("In catalog")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Import" })).not.toBeInTheDocument();
  });

  test("shows an import failure on the row and keeps the button", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(Response.json({ error: "Unable to determine image dimensions." }, { status: 400 }));
    render(<S3Browser error={null} initial={initial} />);

    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText("Unable to determine image dimensions.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeEnabled();
  });

  test("loads the next page and appends it", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      Response.json({ ...initial, folders: [], objects: [object("page-two.png")], nextToken: null })
    );
    render(<S3Browser error={null} initial={{ ...initial, nextToken: "tok" }} />);

    await user.click(screen.getByRole("button", { name: "Load more" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/s3/objects?prefix=posts%2F&token=tok");
    expect(await screen.findByText("page-two.png")).toBeInTheDocument();
    expect(screen.getByText("new.png")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  test("peeks on hover and opens a modal that steps through image objects only", async () => {
    const user = userEvent.setup();
    render(<S3Browser error={null} initial={initial} />);

    // The non-image object has no preview button.
    expect(screen.queryByRole("button", { name: "Preview notes.txt" })).not.toBeInTheDocument();

    const thumb = screen.getByRole("button", { name: "Preview new.png" });
    await user.hover(thumb);
    expect(await screen.findByTestId("thumb-peek")).toBeInTheDocument();
    await user.unhover(thumb);
    expect(screen.queryByTestId("thumb-peek")).not.toBeInTheDocument();

    await user.click(thumb);
    const dialog = screen.getByRole("dialog", { name: "Preview of new.png" });
    expect(dialog).toHaveTextContent("2.0 KB · 1 of 2");

    // jsdom has no showModal(), so focus never enters the dialog; send the key to it directly.
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(screen.getByRole("dialog", { name: "Preview of known.png" })).toHaveTextContent("2 of 2");
  });

  test("shows a listing error and an empty-prefix message", () => {
    const { unmount } = render(<S3Browser error="Access Denied" initial={null} />);
    expect(screen.getByText("Access Denied")).toBeInTheDocument();
    unmount();

    render(<S3Browser error={null} initial={{ ...initial, folders: [], objects: [] }} />);
    expect(screen.getByText("Nothing under this prefix.")).toBeInTheDocument();
  });
});
