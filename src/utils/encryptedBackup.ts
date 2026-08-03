const BACKUP_FORMAT = "SessionDockEncryptedBackup";
const ITERATIONS = 250_000;

interface EncryptedBackup {
  format: typeof BACKUP_FORMAT;
  version: 1;
  algorithm: "AES-GCM";
  iterations: number;
  salt: string;
  iv: string;
  data: string;
}

export async function encryptBackup(plaintext: string, password: string): Promise<string> {
  if (!password) throw new Error("A backup password is required");

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITERATIONS, ["encrypt"]);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );

  const backup: EncryptedBackup = {
    format: BACKUP_FORMAT,
    version: 1,
    algorithm: "AES-GCM",
    iterations: ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(encrypted)),
  };
  return JSON.stringify(backup, null, 2);
}

export async function decryptBackup(content: string, password: string): Promise<string> {
  if (!password) throw new Error("A backup password is required");

  const backup = JSON.parse(content) as Partial<EncryptedBackup>;
  if (
    backup.format !== BACKUP_FORMAT
    || backup.version !== 1
    || backup.algorithm !== "AES-GCM"
    || !backup.iterations
    || !backup.salt
    || !backup.iv
    || !backup.data
  ) {
    throw new Error("This is not a valid SessionDock encrypted backup");
  }

  try {
    const salt = fromBase64(backup.salt);
    const iv = fromBase64(backup.iv);
    const key = await deriveKey(password, salt, backup.iterations, ["decrypt"]);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      fromBase64(backup.data),
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new Error("The backup password is incorrect or the file is damaged");
  }
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
