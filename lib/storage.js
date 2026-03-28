import fs from "fs/promises";
import path from "path";
import Jimp from "jimp";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { slugify } from "./library.js";

function getDriver() {
  return process.env.STORAGE_DRIVER === "s3" ? "s3" : "local";
}

function contentTypeFromExtension(ext) {
  const value = ext.toLowerCase();
  if (value === ".png") return "image/png";
  if (value === ".jpg" || value === ".jpeg") return "image/jpeg";
  if (value === ".webp") return "image/webp";
  if (value === ".gif") return "image/gif";
  if (value === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function extensionFromMime(mime) {
  if (mime === Jimp.MIME_PNG) return ".png";
  if (mime === Jimp.MIME_JPEG) return ".jpg";
  if (mime === Jimp.MIME_BMP) return ".bmp";
  return ".jpg";
}

function getOptimizationTargets(kind) {
  if (kind === "cover") return { maxWidth: 960, thumbWidth: 360, quality: 82 };
  if (kind === "banner") return { maxWidth: 1600, thumbWidth: 720, quality: 80 };
  if (kind === "page") return { maxWidth: 1440, thumbWidth: 540, quality: 82 };
  return { maxWidth: 1280, thumbWidth: 480, quality: 82 };
}

function createS3Client() {
  return new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.S3_ACCESS_KEY_ID,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
        }
      : undefined,
  });
}

async function optimizeRaster(buffer, kind) {
  const image = await Jimp.read(buffer);
  const { maxWidth, thumbWidth, quality } = getOptimizationTargets(kind);
  const main = image.clone();
  if (main.getWidth() > maxWidth) {
    main.resize(maxWidth, Jimp.AUTO);
  }
  const thumb = main.clone();
  if (thumb.getWidth() > thumbWidth) {
    thumb.resize(thumbWidth, Jimp.AUTO);
  }

  const mime = image.getMIME() || Jimp.MIME_JPEG;
  const outputMime = mime === Jimp.MIME_PNG ? Jimp.MIME_PNG : Jimp.MIME_JPEG;
  if (outputMime === Jimp.MIME_JPEG) {
    main.quality(quality);
    thumb.quality(Math.min(quality, 75));
  }

  return {
    optimizedBuffer: await main.getBufferAsync(outputMime),
    thumbBuffer: await thumb.getBufferAsync(outputMime),
    ext: extensionFromMime(outputMime),
    width: main.getWidth(),
    height: main.getHeight(),
    mime: outputMime,
  };
}

function resolvePublicUrl(key, bucket) {
  const publicBase = (process.env.S3_PUBLIC_BASE_URL || "").replace(/\/$/, "");
  if (publicBase) return `${publicBase}/${key}`;
  const endpoint = (process.env.S3_ENDPOINT || "").replace(/\/$/, "");
  if (endpoint) return `${endpoint}/${bucket}/${key}`;
  return `https://${bucket}.s3.amazonaws.com/${key}`;
}

export async function uploadBuffer({ buffer, originalname, relativeDir, rootDir = process.cwd(), kind = "asset" }) {
  const originalExt = path.extname(originalname || "") || ".png";
  const baseName = slugify(path.basename(originalname || "upload", originalExt)) || "upload";
  const originalContentType = contentTypeFromExtension(originalExt);
  const isRaster = ![".svg", ".gif"].includes(originalExt.toLowerCase());

  let mainBuffer = buffer;
  let thumbBuffer = null;
  let ext = originalExt;
  let contentType = originalContentType;
  let width = null;
  let height = null;

  if (isRaster) {
    try {
      const optimized = await optimizeRaster(buffer, kind);
      mainBuffer = optimized.optimizedBuffer;
      thumbBuffer = optimized.thumbBuffer;
      ext = optimized.ext;
      contentType = optimized.mime;
      width = optimized.width;
      height = optimized.height;
    } catch {
      mainBuffer = buffer;
    }
  }

  const filename = `${Date.now()}-${baseName}${ext}`;
  const thumbFilename = thumbBuffer ? `${Date.now()}-${baseName}-thumb${ext}` : null;
  const key = `${relativeDir}/${filename}`.replace(/^\/+/, "");
  const thumbKey = thumbFilename ? `${relativeDir}/${thumbFilename}`.replace(/^\/+/, "") : null;

  if (getDriver() === "s3") {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw new Error("S3_BUCKET is required when STORAGE_DRIVER=s3.");
    const client = createS3Client();
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: mainBuffer, ContentType: contentType }));
    if (thumbKey && thumbBuffer) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: thumbKey, Body: thumbBuffer, ContentType: contentType }));
    }
    return {
      url: resolvePublicUrl(key, bucket),
      thumbnailUrl: thumbKey ? resolvePublicUrl(thumbKey, bucket) : resolvePublicUrl(key, bucket),
      width,
      height,
    };
  }

  const absoluteDir = path.join(rootDir, "public", "uploads", relativeDir);
  await fs.mkdir(absoluteDir, { recursive: true });
  await fs.writeFile(path.join(absoluteDir, filename), mainBuffer);
  if (thumbFilename && thumbBuffer) {
    await fs.writeFile(path.join(absoluteDir, thumbFilename), thumbBuffer);
  }

  return {
    url: `/uploads/${key}`,
    thumbnailUrl: thumbKey ? `/uploads/${thumbKey}` : `/uploads/${key}`,
    width,
    height,
  };
}

export function getStorageSummary() {
  if (getDriver() === "s3") {
    return {
      driver: "s3",
      label: "S3 / R2 object storage",
      bucket: process.env.S3_BUCKET || "not-set",
      endpoint: process.env.S3_ENDPOINT || "aws-default",
    };
  }

  return {
    driver: "local",
    label: "Local disk storage",
    bucket: "public/uploads",
    endpoint: "same server",
  };
}
