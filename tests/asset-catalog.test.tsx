// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AssetCatalog } from "@/components/asset-catalog";

vi.mock("@/components/page-tabs", () => ({ PageTabs: () => <nav>Navigation</nav> }));

const asset = {
  id: 1,
  originalFilename: "hero.png",
  publicUrl: "https://cdn.example.com/posts/hero.png",
  s3Key: "posts/hero.png",
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

  beforeEach(() => {
    fetchMock.mockReset();
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
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

    await user.click(screen.getByRole("button", { name: "Generate snippet" }));

    expect(screen.getByText("Enter a post slug before generating a snippet.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("generates, displays, and copies a snippet while refreshing the asset", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const updatedAsset = { ...asset, usageCount: 2, lastUsedPostSlug: "blog/reuse" };
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Response.json({ asset: updatedAsset, snippet: "<BlogImage />", deduped: true });
      }
      return Response.json({ assets: [asset] });
    });
    render(<AssetCatalog initialAssets={[asset]} />);

    await user.type(screen.getByPlaceholderText("blog/how-i-built-this-tool"), " blog/reuse ");
    await user.type(screen.getByPlaceholderText("Optional for now"), " Reused hero ");
    await user.type(screen.getByPlaceholderText("Optional caption"), " Again ");
    await user.click(screen.getByRole("button", { name: "Generate snippet" }));

    expect(await screen.findByText("Snippet generated from an existing asset.")).toBeInTheDocument();
    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(postCall?.[0]).toBe("/api/assets/1/snippet");
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
      postSlug: "blog/reuse",
      altText: "Reused hero",
      caption: "Again"
    });
    expect(screen.getByText("2 usages")).toBeInTheDocument();
    expect(screen.getByText("blog/reuse")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith("<BlogImage />");
  });

  test("renders empty and request-error states", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ assets: [] }));
    const { unmount } = render(<AssetCatalog initialAssets={[asset]} />);
    expect(await screen.findByText("No catalog matches this filter yet.")).toBeInTheDocument();
    unmount();

    fetchMock.mockResolvedValueOnce(Response.json({ error: "Database unavailable" }, { status: 400 }));
    render(<AssetCatalog initialAssets={[asset]} />);
    expect(await screen.findByText("Database unavailable")).toBeInTheDocument();
  });
});
