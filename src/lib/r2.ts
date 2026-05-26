import { S3Client } from "@aws-sdk/client-s3";

const accountId = process.env.R2_ACCOUNT_ID || "";
const accessKeyId = process.env.R2_ACCESS_KEY_ID || "";
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || "";
const endpoint =
  process.env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");

const isConfigured = Boolean(accessKeyId && secretAccessKey && endpoint);

export const r2Client = isConfigured
  ? new S3Client({
      region: process.env.R2_REGION || "auto",
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    })
  : null;

export const r2Bucket = process.env.R2_BUCKET || "";

export function isR2Configured() {
  return Boolean(r2Client && r2Bucket);
}
