import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getAddress, verifyMessage } from "ethers";

export function randomLinkToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashLinkToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifySharedSecret(actual: string | undefined, expected: string | undefined): boolean {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isSafeExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" && !isPrivateHost(url.hostname)) || url.protocol === "https:" && url.hostname === "localhost";
  } catch {
    return false;
  }
}

function isPrivateHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized.endsWith(".local") || normalized === "::1") return true;
  if (/^(10\.|127\.|169\.254\.|192\.168\.)/.test(normalized)) return true;
  const m = normalized.match(/^172\.(\d+)\./);
  return Boolean(m && Number(m[1]) >= 16 && Number(m[1]) <= 31);
}

export function verifyWalletSignature(address: string, message: string, signature: string): boolean {
  try {
    return getAddress(verifyMessage(message, signature)) === getAddress(address);
  } catch {
    return false;
  }
}

const ALLOWED_UPLOADS = new Set([
  "application/pdf", "application/zip", "application/x-zip-compressed", "image/png",
  "image/jpeg", "image/webp", "video/mp4", "text/plain",
]);
export function isAllowedSubmissionUpload(mimeType: string, bytes: number): boolean {
  return ALLOWED_UPLOADS.has(mimeType.toLowerCase()) && bytes > 0 && bytes <= 50 * 1024 * 1024;
}
