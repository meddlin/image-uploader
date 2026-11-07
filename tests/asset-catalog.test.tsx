// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AssetCatalog } from "@/components/asset-catalog";

const asset = {
  id: 1,
  originalFilename: "hero.png",
  publicUrl: "https://cdn.example.com/posts/hero.png",
  s3Key: "posts/hero.png",
  mimeType: "image/png",
  byteSize: 84_000,
  width: 1200,
  height: 630,
  tags: ["hero"],
  usageCount: 1,
  lastUsedPostSlug: "blog/launch",
  createdAt: 1
};

describe("AssetCatalog", () => {
  const fetchMock = vi.fn();
  const writeText = vi.fn();

  // userEvent.setup() installs its own clipboard stub, so tests re-install the mock after calling it.
  function stubClipboard() {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  }

  beforeEach(() => {
    fetchMock.mockReset();
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    window.localStorage.clear();
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
  });

  test("renders initial assets and sends all catalog filters", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(Response.json({ assets: [asset] }));
    render(<AssetCatalog initialAssets={[asset]} />);

    expect(screen.getByText("hero.png")).toBeInTheDocument();
    expect(screen.getByText("1 usage")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("Search filename, URL, or key"), "hero");
    await user.type(screen.getByPlaceholderText("Filter by post slug"), "launch");
    await user.type(screen.getByPlaceholderText("Filter by tag"), "featured");

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("query=hero"))).toBe(true);
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("postSlug=launch"))).toBe(true);
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("tag=featured"))).toBe(true);
    });
  });

  test("requires a post slug before reusing an asset", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(Response.json({ assets: [asset] }));
    render(<AssetCatalog initialAssets={[asset]} />);

    await user.click(screen.getByRole("button", { name: "Use in post" }));
    await user.click(screen.getByRole("button", { name: "Generate snippet" }));

    expect(screen.getByText("Enter a post slug first.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  test("generates, displays, and copies a snippet inside the row while refreshing the asset", async () => {
    const user = userEvent.setup();
    stubClipboard();
    const updatedAsset = { ...asset, usageCount: 2, lastUsedPostSlug: "blog/reuse" };
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Response.json({ asset: updatedAsset, snippet: "<BlogImage />", deduped: true });
      }
      return Response.json({ assets: [asset] });
    });
    render(<AssetCatalog initialAssets={[asset]} />);

    await user.click(screen.getByRole("button", { name: "Use in post" }));
    await user.type(screen.getByLabelText("Post slug"), " blog/reuse ");
    await user.type(screen.getByLabelText("Alt text"), " Reused hero ");
    await user.type(screen.getByLabelText("Caption"), " Again ");
    await user.click(screen.getByRole("button", { name: "Generate snippet" }));

    expect(await screen.findByText("<BlogImage />")).toBeInTheDocument();
    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(postCall?.[0]).toBe("/api/assets/1/snippet");
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
      postSlug: "blog/reuse",
      altText: "Reused hero",
      caption: "Again"
    });
    expect(screen.getByText("2 usages")).toBeInTheDocument();
    expect(window.localStorage.getItem("asset-catalog:last-post-slug")).toBe("blog/reuse");
    expect(writeText).toHaveBeenCalledWith("<BlogImage />");

    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledTimes(2);
  });

  test("copies the public URL from a row", async () => {
    const user = userEvent.setup();
    stubClipboard();
    fetchMock.mockResolvedValue(Response.json({ assets: [asset] }));
    render(<AssetCatalog initialAssets={[asset]} />);

    await user.click(screen.getByRole("button", { name: "Copy URL" }));

    expect(writeText).toHaveBeenCalledWith(asset.publicUrl);
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  test("filters by clicking a tag or a post slug", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(Response.json({ assets: [asset] }));
    render(<AssetCatalog initialAssets={[asset]} />);

    await user.click(screen.getByRole("button", { name: "hero" }));
    await user.click(screen.getByRole("button", { name: "blog/launch" }));

    expect(screen.getByPlaceholderText("Filter by tag")).toHaveValue("hero");
    expect(screen.getByPlaceholderText("Filter by post slug")).toHaveValue("blog/launch");
  });

  test("loads usage history when the usage count is opened", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith("/usages")) {
        return Response.json({ usages: [{ id: 9, postSlug: "blog/older-post", createdAt: 1 }] });
      }
      return Response.json({ assets: [asset] });
    });
    render(<AssetCatalog initialAssets={[asset]} />);

    await user.click(screen.getByRole("button", { name: "1 usage" }));

    expect(await screen.findByRole("button", { name: "blog/older-post" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/assets/1/usages");
  });

  test("previews a thumbnail and steps through the list with the arrow keys", async () => {
    const user = userEvent.setup();
    const second = { ...asset, id: 2, originalFilename: "diagram.png", publicUrl: "https://cdn.example.com/posts/diagram.png" };
    render(<AssetCatalog initialAssets={[asset, second]} />);

    await user.click(screen.getByRole("button", { name: "Preview hero.png" }));
    const dialog = screen.getByRole("dialog", { name: "Preview of hero.png" });
    expect(dialog).toHaveTextContent("1 of 2");
    expect(screen.getByRole("button", { name: "Previous image" })).toBeDisabled();

    // jsdom has no showModal(), so focus never enters the dialog; send the key to it directly.
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(screen.getByRole("dialog", { name: "Preview of diagram.png" })).toHaveTextContent("2 of 2");
    expect(screen.getByRole("button", { name: "Next image" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("shows a larger peek while hovering a thumbnail and hides it on leave or click", async () => {
    const user = userEvent.setup();
    render(<AssetCatalog initialAssets={[asset]} />);
    const thumb = screen.getByRole("button", { name: "Preview hero.png" });

    await user.hover(thumb);
    expect(await screen.findByTestId("thumb-peek")).toBeInTheDocument();

    await user.unhover(thumb);
    expect(screen.queryByTestId("thumb-peek")).not.toBeInTheDocument();

    await user.hover(thumb);
    await screen.findByTestId("thumb-peek");
    await user.click(thumb);
    expect(screen.queryByTestId("thumb-peek")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Preview of hero.png" })).toBeInTheDocument();
  });

  test("does not refetch the catalog on mount", () => {
    fetchMock.mockResolvedValue(Response.json({ assets: [asset] }));
    render(<AssetCatalog initialAssets={[asset]} />);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("clears filters with the × buttons and refetches the full catalog", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(Response.json({ assets: [asset] }));
    render(<AssetCatalog initialAssets={[asset]} />);

    expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("Search filename, URL, or key"), "hero");
    await user.click(screen.getByRole("button", { name: "Clear search" }));

    expect(screen.getByPlaceholderText("Search filename, URL, or key")).toHaveValue("");
    await waitFor(() => {
      expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("/api/catalog?");
    });
  });

  test("shows an empty state with a way to clear the filters", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async () => Response.json({ assets: [] }));
    render(<AssetCatalog initialAssets={[asset]} />);

    await user.type(screen.getByPlaceholderText("Filter by tag"), "nothing");
    expect(await screen.findByText(/No assets match these filters/)).toBeInTheDocument();

    fetchMock.mockImplementation(async () => Response.json({ assets: [asset] }));
    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(screen.getByPlaceholderText("Filter by tag")).toHaveValue("");
    expect(await screen.findByText("hero.png")).toBeInTheDocument();
  });

  test("shows a request error instead of the empty state when the catalog fails to load", async () => {
    const user = userEvent.setup();
    // A fresh Response per call: typing triggers several fetches and a body can only be read once.
    fetchMock.mockImplementation(async () => Response.json({ error: "Database unavailable" }, { status: 400 }));
    render(<AssetCatalog initialAssets={[]} />);

    await user.type(screen.getByPlaceholderText("Search filename, URL, or key"), "hero");

    expect(await screen.findByText("Database unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/No assets match/)).not.toBeInTheDocument();
  });
});

describe("AssetCatalog resize and convert", () => {
  const fetchMock = vi.fn();
  const resized = {
    ...asset,
    id: 2,
    originalFilename: "hero-600x315.webp",
    publicUrl: "https://cdn.example.com/posts/hero-600x315.webp",
    s3Key: "posts/hero-600x315.webp",
    mimeType: "image/webp",
    byteSize: 12_000,
    width: 600,
    height: 315,
    usageCount: 0,
    lastUsedPostSlug: null
  };

  beforeEach(() => {
    fetchMock.mockReset();
    window.localStorage.clear();
    vi.stubGlobal("fetch", fetchMock);
  });

  test("shows the format and file size of each asset", () => {
    render(<AssetCatalog initialAssets={[asset]} />);

    expect(screen.getByText("PNG · 82 KB")).toBeInTheDocument();
  });

  test("fills in the other dimension from the aspect ratio while typing", async () => {
    const user = userEvent.setup();
    render(<AssetCatalog initialAssets={[asset]} />);

    await user.click(screen.getByRole("button", { name: "Resize / convert" }));
    await user.type(screen.getByLabelText("Width (px)"), "600");
    expect(screen.getByLabelText("Height (px)")).toHaveValue(315);

    await user.clear(screen.getByLabelText("Height (px)"));
    await user.type(screen.getByLabelText("Height (px)"), "63");
    expect(screen.getByLabelText("Width (px)")).toHaveValue(120);
  });

  test("leaves the other dimension alone when the aspect ratio is unlocked", async () => {
    const user = userEvent.setup();
    render(<AssetCatalog initialAssets={[asset]} />);

    await user.click(screen.getByRole("button", { name: "Resize / convert" }));
    await user.click(screen.getByLabelText(/Keep aspect ratio/));
    await user.type(screen.getByLabelText("Width (px)"), "600");

    expect(screen.getByLabelText("Height (px)")).toHaveValue(null);
  });

  test("asks for a size or a format before sending anything", async () => {
    const user = userEvent.setup();
    render(<AssetCatalog initialAssets={[asset]} />);

    await user.click(screen.getByRole("button", { name: "Resize / convert" }));
    await user.click(screen.getByRole("button", { name: "Create new image" }));

    expect(screen.getByText("Enter a width, a height, or choose a format to convert to.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("sends the options and lists the new image under its source", async () => {
    const user = userEvent.setup();
    const second = { ...asset, id: 5, originalFilename: "diagram.png", publicUrl: "https://cdn.example.com/diagram.png" };
    fetchMock.mockImplementation(async () => Response.json({ asset: resized, deduped: false }));
    render(<AssetCatalog initialAssets={[asset, second]} />);

    await user.click(screen.getAllByRole("button", { name: "Resize / convert" })[0]!);
    await user.type(screen.getByLabelText("Width (px)"), "600");
    await user.selectOptions(screen.getByLabelText("Format"), "webp");
    await user.click(screen.getByRole("button", { name: "Create new image" }));

    expect(await screen.findByText(/Created: hero-600x315.webp — 600 × 315, 12 KB\./)).toBeInTheDocument();
    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe("/api/assets/1/transform");
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      width: 600,
      height: 315,
      keepAspectRatio: true,
      format: "webp",
      makePublic: false
    });

    const names = screen.getAllByRole("article").map((row) => row.querySelector("strong")?.textContent);
    expect(names).toEqual(["hero.png", "hero-600x315.webp", "diagram.png"]);
  });

  test("shows the server error and does not add a row", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async () => Response.json({ error: "S3 unavailable" }, { status: 400 }));
    render(<AssetCatalog initialAssets={[asset]} />);

    await user.click(screen.getByRole("button", { name: "Resize / convert" }));
    await user.selectOptions(screen.getByLabelText("Format"), "jpeg");
    await user.click(screen.getByRole("button", { name: "Create new image" }));

    expect(await screen.findByText("S3 unavailable")).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(1);
  });
});
