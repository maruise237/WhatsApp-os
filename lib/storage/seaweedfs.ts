import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "@/lib/env";

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!env.SEAWEEDFS_S3_ENDPOINT || !env.SEAWEEDFS_S3_ACCESS_KEY || !env.SEAWEEDFS_S3_SECRET_KEY) {
    throw new Error("seaweedfs_not_configured");
  }
  client ??= new S3Client({
    endpoint: env.SEAWEEDFS_S3_ENDPOINT,
    region: env.SEAWEEDFS_S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.SEAWEEDFS_S3_ACCESS_KEY,
      secretAccessKey: env.SEAWEEDFS_S3_SECRET_KEY,
    },
  });
  return client;
}

export function assertTenantMediaKey(organizationId: string, key: string): string {
  if (
    !/^[a-f0-9-]{36}\/[a-zA-Z0-9._/-]+$/.test(key) ||
    !key.startsWith(`${organizationId}/`) ||
    key.split("/").includes("..")
  ) {
    throw new Error("forbidden_media_key");
  }
  return key;
}

export async function putPrivateMedia(input: {
  organizationId: string;
  key: string;
  body: Uint8Array;
  contentType: string;
  cacheControl?: string;
}): Promise<string> {
  const key = assertTenantMediaKey(input.organizationId, input.key);
  await getClient().send(
    new PutObjectCommand({
      Bucket: env.SEAWEEDFS_MEDIA_BUCKET,
      Key: key,
      Body: input.body,
      ContentType: input.contentType,
      CacheControl: input.cacheControl ?? "private, max-age=31536000, immutable",
      Metadata: { organization_id: input.organizationId },
    }),
  );
  return key;
}

export async function signedMediaUrl(input: { organizationId: string; key: string; expiresIn?: number }): Promise<string> {
  const key = assertTenantMediaKey(input.organizationId, input.key);
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: env.SEAWEEDFS_MEDIA_BUCKET, Key: key }),
    { expiresIn: Math.min(Math.max(input.expiresIn ?? 300, 30), 3600) },
  );
}

export async function deletePrivateMedia(input: { organizationId: string; key: string }): Promise<void> {
  const key = assertTenantMediaKey(input.organizationId, input.key);
  await getClient().send(new DeleteObjectCommand({ Bucket: env.SEAWEEDFS_MEDIA_BUCKET, Key: key }));
}
