// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ImagePublisher } from "@/components/image-publisher";

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

function getFileInput() {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');

  if (!input) {
    throw new Error("File input was not rendered.");
  }

  return input;
}

describe("ImagePublisher", () => {
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

  test("validates the required file and post slug", async () => {
    const user = userEvent.setup();
    render(<ImagePublisher defaultMakePublic={false} />);

    await user.click(screen.getByRole("button", { name: "Upload and generate snippet" }));
    expect(screen.getByText("Choose an image file before uploading.")).toBeInTheDocument();

    await user.upload(getFileInput(), new File(["png"], "hero.png", { type: "image/png" }));
    await user.click(screen.getByRole("button", { name: "Upload and generate snippet" }));
    expect(screen.getByText("Enter a post slug before uploading.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("submits normalized metadata, shows loading, and renders a fresh result", async () => {
    const user = userEvent.setup();
    let resolveResponse!: (response: Response) => void;
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      })
    );
    render(<ImagePublisher defaultMakePublic={false} />);

    await user.upload(getFileInput(), new File(["png"], "hero.png", { type: "image/png" }));
    await user.type(screen.getByPlaceholderText("blog/how-i-built-this-tool"), "  blog/launch  ");
    await user.type(screen.getByPlaceholderText("hero, screenshot, workflow"), " hero, feature ");
    await user.type(screen.getByPlaceholderText("Optional for now"), " Hero image ");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Upload and generate snippet" }));

    expect(screen.getByRole("button", { name: "Working…" })).toBeDisabled();
    const [, request] = fetchMock.mock.calls[0] as [string, { method: string; body: FormData }];
    expect(request.method).toBe("POST");
    expect(request.body.get("postSlug")).toBe("blog/launch");
    expect(request.body.get("altText")).toBe("Hero image");
    expect(request.body.get("tags")).toBe(JSON.stringify(["hero", "feature"]));
    expect(request.body.get("makePublic")).toBe("true");

    resolveResponse(Response.json({ asset, snippet: "<BlogImage />", deduped: false }));

    expect(await screen.findByText("Upload complete. Public access requested.")).toBeInTheDocument();
    expect(screen.getByText("Fresh asset uploaded")).toBeInTheDocument();
    expect(screen.getByText("<BlogImage />")).toBeInTheDocument();
  });

  test("renders dedupe status and copies returned values", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    fetchMock.mockResolvedValue(Response.json({ asset, snippet: "<BlogImage />", deduped: true }));
    render(<ImagePublisher defaultMakePublic={false} />);

    await user.upload(getFileInput(), new File(["png"], "hero.png", { type: "image/png" }));
    await user.type(screen.getByPlaceholderText("blog/how-i-built-this-tool"), "blog/reuse");
    await user.click(screen.getByRole("button", { name: "Upload and generate snippet" }));

    expect(await screen.findByText("Existing asset reused. New usage created.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy snippet" }));
    expect(writeText).toHaveBeenCalledWith("<BlogImage />");
    expect(screen.getByText("Snippet copied to the clipboard.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Copy URL" }));
    expect(writeText).toHaveBeenCalledWith(asset.publicUrl);
  });

  test("shows API errors without leaving the loading state active", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(Response.json({ error: "S3 unavailable" }, { status: 400 }));
    render(<ImagePublisher defaultMakePublic={false} />);

    await user.upload(getFileInput(), new File(["png"], "hero.png", { type: "image/png" }));
    await user.type(screen.getByPlaceholderText("blog/how-i-built-this-tool"), "blog/failure");
    await user.click(screen.getByRole("button", { name: "Upload and generate snippet" }));

    expect(await screen.findByText("S3 unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload and generate snippet" })).toBeEnabled();
  });

  test("accepts an unnamed image pasted into the form", async () => {
    render(<ImagePublisher defaultMakePublic={false} />);
    const unnamedImage = new File(["png"], "", { type: "image/png" });
    const form = screen.getByRole("button", { name: "Upload and generate snippet" }).closest("form");

    fireEvent.paste(form as HTMLFormElement, {
      clipboardData: {
        items: [
          {
            kind: "file",
            type: "image/png",
            getAsFile: () => unnamedImage
          }
        ]
      }
    });

    await waitFor(() => {
      expect(screen.getByText(/pasted-image-\d{8}-\d{6}\.png pasted and ready to upload\./)).toBeInTheDocument();
    });
  });
});
