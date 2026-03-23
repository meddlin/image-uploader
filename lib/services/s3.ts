import {
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectAclCommand,
  PutObjectCommand,
  S3Client,
  type _Object
} from "@aws-sdk/client-s3";
import { fromIni } from "@aws-sdk/credential-providers";

import { assertAwsConfig, getEnv } from "@/lib/config/env";

let client: S3Client | null = null;

function shouldSetPublicAcl(requestedPublicAccess?: boolean) {
  const env = assertAwsConfig();
  return env.S3_VISIBILITY === "public-read-acl" || requestedPublicAccess === true;
}

function toPublicAclError(error: unknown) {
  if (!(error instanceof Error)) {
    return new Error("Unable to make the uploaded image public.");
  }

  if (error.name === "AccessControlListNotSupported") {
    return new Error(
      "This bucket has ACLs disabled. To use the public upload toggle, enable ACLs for the bucket or expose objects through a bucket policy or CDN."
    );
  }

  if (error.name === "AccessDenied") {
    return new Error(
      "AWS denied the request to make the image public. Check s3:PutObjectAcl permission and the bucket public access block settings."
    );
  }

  return error;
}

export function getS3Client() {
  if (!client) {
    const env = assertAwsConfig();

    client = new S3Client({
      region: env.AWS_REGION,
      credentials: env.AWS_PROFILE ? fromIni({ profile: env.AWS_PROFILE }) : undefined
    });
  }

  return client;
}

export async function uploadObject(input: {
  key: string;
  body: Buffer;
  contentType: string;
  makePublic?: boolean;
}) {
  const env = assertAwsConfig();
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: input.key,
    Body: input.body,
    ContentType: input.contentType,
    ACL: shouldSetPublicAcl(input.makePublic) ? "public-read" : undefined
  });

  try {
    await getS3Client().send(command);
  } catch (error) {
    if (shouldSetPublicAcl(input.makePublic)) {
      throw toPublicAclError(error);
    }

    throw error;
  }
}

export async function setObjectPublic(key: string) {
  const env = assertAwsConfig();

  try {
    await getS3Client().send(
      new PutObjectAclCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        ACL: "public-read"
      })
    );
  } catch (error) {
    throw toPublicAclError(error);
  }
}

export async function listObjects(prefix?: string) {
  const env = assertAwsConfig();
  const objects: _Object[] = [];
  let continuationToken: string | undefined;

  do {
    const page = await getS3Client().send(
      new ListObjectsV2Command({
        Bucket: env.S3_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken
      })
    );

    objects.push(...(page.Contents ?? []));
    continuationToken = page.NextContinuationToken;
  } while (continuationToken);

  return objects.filter((object) => object.Key);
}

export async function downloadObject(key: string) {
  const env = assertAwsConfig();
  const response = await getS3Client().send(
    new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key
    })
  );

  const body = response.Body;

  if (!body) {
    throw new Error(`S3 object ${key} returned no body.`);
  }

  const bytes = await body.transformToByteArray();

  return {
    buffer: Buffer.from(bytes),
    contentType: response.ContentType ?? "application/octet-stream",
    byteSize: response.ContentLength ?? bytes.length
  };
}

export async function headObject(key: string) {
  const env = assertAwsConfig();

  return getS3Client().send(
    new HeadObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key
    })
  );
}

export async function verifyS3Access() {
  const env = assertAwsConfig();

  await getS3Client().send(
    new HeadBucketCommand({
      Bucket: env.S3_BUCKET
    })
  );

  const credentials = getS3Client().config.credentials;

  if (typeof credentials === "function") {
    await credentials();
  }

  return {
    bucket: env.S3_BUCKET,
    region: env.AWS_REGION,
    profile: getEnv().AWS_PROFILE ?? "default"
  };
}

export function resetS3ClientForTests() {
  client = null;
}
