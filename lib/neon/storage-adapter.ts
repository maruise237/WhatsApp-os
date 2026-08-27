import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
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

function safeKey(key: string): string {
  if (!key || key.startsWith("/") || key.includes("..") || key.includes("\\") || /[\u0000-\u001f]/.test(key)) {
    throw new Error("forbidden_storage_key");
  }
  return key;
}

function storageError(error: unknown) {
  return {
    name: error instanceof Error ? error.name : "StorageError",
    message: error instanceof Error ? error.message : "Storage operation failed",
  };
}

function bytesToBlob(bytes: Uint8Array, contentType?: string): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], contentType ? { type: contentType } : undefined);
}

function bodyToBytes(body: unknown): Uint8Array {
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  throw new Error("unsupported_storage_body");
}

export function createSeaweedStorage() {
  return {
    from(bucket: string) {
      if (!bucket || bucket.includes("/") || bucket.includes("..")) throw new Error("forbidden_storage_bucket");
      return {
        async upload(path: string, body: unknown, options?: { contentType?: string; cacheControl?: string; upsert?: boolean }) {
          const key = safeKey(path);
          try {
            if (options?.upsert === false) {
              try {
                await getClient().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
                return { data: null, error: { name: "DuplicateObject", message: "The object already exists" } };
              } catch (error) {
                const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
                if (status !== 404) throw error;
              }
            }
            await getClient().send(new PutObjectCommand({
              Bucket: bucket,
              Key: key,
              Body: bodyToBytes(body),
              ContentType: options?.contentType,
              CacheControl: options?.cacheControl,
            }));
            return { data: { path: key }, error: null };
          } catch (error) {
            return { data: null, error: storageError(error) };
          }
        },
        async download(path: string) {
          const key = safeKey(path);
          try {
            const output = await getClient().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
            const bytes = output.Body ? await output.Body.transformToByteArray() : new Uint8Array();
            return { data: bytesToBlob(bytes, output.ContentType), error: null };
          } catch (error) {
            return { data: null, error: storageError(error) };
          }
        },
        async remove(paths: string[]) {
          try {
            for (const path of paths) {
              await getClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: safeKey(path) }));
            }
            return { data: paths.map((path) => ({ name: path })), error: null };
          } catch (error) {
            return { data: null, error: storageError(error) };
          }
        },
        async createSignedUrl(path: string, expiresIn = 300) {
          try {
            const key = safeKey(path);
            const signedUrl = await getSignedUrl(
              getClient(),
              new GetObjectCommand({ Bucket: bucket, Key: key }),
              { expiresIn: Math.min(Math.max(expiresIn, 30), 3600) },
            );
            return { data: { signedUrl, path: key }, error: null };
          } catch (error) {
            return { data: null, error: storageError(error) };
          }
        },
        getPublicUrl(path: string) {
          const key = safeKey(path);
          const endpoint = env.SEAWEEDFS_S3_ENDPOINT.replace(/\/$/, "");
          return { data: { publicUrl: `${endpoint}/${bucket}/${key}` } };
        },
      };
    },
  };
}
