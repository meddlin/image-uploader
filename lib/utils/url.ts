function encodeKey(key: string) {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function buildPublicUrl(input: {
  bucket: string;
  region: string;
  key: string;
  publicBaseUrl?: string;
}) {
  const encodedKey = encodeKey(input.key);

  if (input.publicBaseUrl) {
    return `${input.publicBaseUrl.replace(/\/+$/, "")}/${encodedKey}`;
  }

  return `https://${input.bucket}.s3.${input.region}.amazonaws.com/${encodedKey}`;
}
