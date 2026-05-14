import { Sha256 } from "@aws-crypto/sha256-browser";

const HASH_CHUNK_SIZE_BYTES = 4 * 1024 * 1024;

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashFileSha256(file: File) {
  const hash = new Sha256();

  for (let offset = 0; offset < file.size; offset += HASH_CHUNK_SIZE_BYTES) {
    const chunk = file.slice(offset, Math.min(offset + HASH_CHUNK_SIZE_BYTES, file.size));
    hash.update(new Uint8Array(await chunk.arrayBuffer()));
  }

  return bytesToHex(await hash.digest());
}
