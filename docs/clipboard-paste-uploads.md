# Clipboard Paste Uploads

The web UI supports image paste by turning clipboard image bytes into the same browser `File` object that a normal file picker selection creates. After that, the existing upload flow does not need to know whether the image came from browse, drag and drop, or paste.

## Browser APIs involved

Paste starts as a `ClipboardEvent` on the upload form. The event includes `clipboardData`, which is a `DataTransfer` object. Its `items` collection describes every thing the source application placed on the clipboard.

Each entry in `clipboardData.items` is a `DataTransferItem`. For this feature, the useful items are file items whose MIME type starts with `image/`, such as `image/png`, `image/jpeg`, or `image/webp`.

When the UI finds an image item, it calls `getAsFile()`. That returns a browser `File`, which includes the image bytes, MIME type, size, last modified time, and sometimes a file name.

## Implementation flow

The paste handler lives in `components/image-publisher.tsx` on the upload form:

1. A paste event bubbles through the form.
2. The handler scans `event.clipboardData.items` for the first file item with an image MIME type.
3. If there is no image item, the handler returns without calling `preventDefault()`. This keeps normal text paste working in fields like post slug, tags, alt text, and caption.
4. If an image item exists, the handler calls `getAsFile()`.
5. If the clipboard file already has a name, the UI uses it.
6. If the clipboard file has no name, the UI wraps it in a new `File` with a generated name like `pasted-image-20260606-143015.png`.
7. The resulting `File` is stored in React state with `setFile`.
8. When the user submits the form, the existing upload code places that `File` into `FormData` as `file`.
9. `/api/assets` receives the same shape it already handled before this feature: a multipart form with a `File`.

Because the pasted image becomes a normal `File`, the server-side upload path stays unchanged. The API route still reads `formData.get("file")`, converts the file to a `Buffer`, and passes it to `uploadAsset`. The existing service validation still rejects non-image MIME types.

## Why generated names matter

Some clipboard sources provide a real filename. Others provide unnamed image bytes. The upload service uses the original filename when building the S3 object key, so unnamed pasted images need a stable fallback.

The generated filename includes:

- `pasted-image` so the source is recognizable in the catalog.
- A date and time stamp to make repeated pasted images less likely to collide.
- An extension derived from the image MIME type when known.

## Limitations

This feature supports clipboard image bytes only. It does not fetch pasted image URLs and it does not parse HTML-only clipboard content.

Browser and source application behavior can vary. A screenshot tool usually places image bytes on the clipboard. A browser's "copy image" command often does too. Copying a web page selection, image address, or markdown snippet may place only text, a URL, or HTML on the clipboard.

## Troubleshooting

If paste appears to do nothing, the clipboard probably did not contain an image file item. Try using the source application's "Copy Image" command instead of copying the image URL or selected page content.

If the pasted image receives a generated filename, the clipboard source did not provide a filename. This is expected for screenshots and many browser clipboard flows.

If upload still fails after paste, the failure is in the normal upload path. Check the status message from `/api/assets`, S3 credentials, bucket permissions, and the local SQLite configuration.
