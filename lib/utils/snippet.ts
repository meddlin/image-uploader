function escapeAttribute(value: string) {
  return value.replace(/"/g, "&quot;");
}

export function generateSnippet(input: {
  componentName: string;
  src: string;
  width: number;
  height: number;
  altText?: string | null;
  caption?: string | null;
}) {
  const lines = [
    `<${input.componentName}`,
    `  src="${escapeAttribute(input.src)}"`,
    input.altText ? `  alt="${escapeAttribute(input.altText)}"` : null,
    `  width={${input.width}}`,
    `  height={${input.height}}`,
    input.caption ? `  caption="${escapeAttribute(input.caption)}"` : null,
    `/>`
  ].filter(Boolean);

  return lines.join("\n");
}
