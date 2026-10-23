import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { AppError } from './errors.js';

/**
 * StorageProvider interface definition for abstracting cloud (S3) vs local disk storage.
 */
export class StorageProvider {
  /**
   * @param {string} storageKey
   * @param {Buffer} buffer
   * @param {string} mimeType
   * @returns {Promise<string>}
   */
  async put(storageKey, buffer, mimeType) {
    throw new Error('Not implemented');
  }

  /**
   * @param {string} storageKey
   * @returns {Promise<Buffer>}
   */
  async get(storageKey) {
    throw new Error('Not implemented');
  }

  /**
   * @param {string} storageKey
   * @returns {string}
   */
  publicUrl(storageKey) {
    throw new Error('Not implemented');
  }
}

/**
 * Local disk implementation of StorageProvider.
 */
export class LocalDiskStorage extends StorageProvider {
  constructor(rootDir = config.STORAGE_LOCAL_ROOT) {
    super();
    this.rootDir = path.resolve(rootDir);
    if (!fs.existsSync(this.rootDir)) {
      fs.mkdirSync(this.rootDir, { recursive: true });
    }
  }

  /**
   * Persists a file buffer to disk.
   *
   * @param {string} storageKey - Relative key path (e.g. 'documents/tenant/file.pdf')
   * @param {Buffer} buffer - File binary buffer
   * @param {string} mimeType - Declared MIME type
   * @returns {Promise<string>} Storage key
   */
  async put(storageKey, buffer, mimeType) {
    const fullPath = path.join(this.rootDir, storageKey);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    await fs.promises.writeFile(fullPath, buffer);
    return storageKey;
  }

  /**
   * Reads a file buffer from disk.
   *
   * @param {string} storageKey
   * @returns {Promise<Buffer>}
   */
  async get(storageKey) {
    const fullPath = path.join(this.rootDir, storageKey);
    if (!fs.existsSync(fullPath)) {
      throw new AppError('NOT_FOUND', `File not found in storage: ${storageKey}`, 404);
    }
    return await fs.promises.readFile(fullPath);
  }

  /**
   * Returns a publicly resolvable URL for the file.
   *
   * @param {string} storageKey
   * @returns {string}
   */
  publicUrl(storageKey) {
    return `${config.PUBLIC_FILE_BASE_URL}/${storageKey.replace(/^\/+/, '')}`;
  }
}

/**
 * Global storage instance.
 */
export const storage = new LocalDiskStorage();

/**
 * Validates binary file magic bytes to block disguised executables, scripts, or HTML.
 *
 * @param {Buffer} buffer - File buffer
 * @returns {void}
 * @throws {AppError} 422 if disguised or disallowed file type is detected
 */
export function validateMagicBytes(buffer) {
  if (!buffer || buffer.length === 0) {
    throw new AppError('VALIDATION_FAILED', 'Uploaded file cannot be empty (0 bytes).', 422);
  }

  // Sniff initial bytes
  const header = buffer.subarray(0, 8);
  const headerStr = header.toString('utf8');

  // DOS MZ executable header (Windows .exe, .dll)
  if (header[0] === 0x4D && header[1] === 0x5A) {
    throw new AppError('UNPROCESSABLE', 'Executable files (.exe, .dll) are strictly prohibited.', 422);
  }

  // ELF executable header (Linux binary)
  if (header[0] === 0x7F && header[1] === 0x45 && header[2] === 0x4C && header[3] === 0x46) {
    throw new AppError('UNPROCESSABLE', 'Linux binary executables are strictly prohibited.', 422);
  }

  // HTML or script signatures
  const lowerHeader = headerStr.toLowerCase();
  if (
    lowerHeader.includes('<html') ||
    lowerHeader.includes('<!doc') ||
    lowerHeader.includes('<script') ||
    lowerHeader.includes('<?php')
  ) {
    throw new AppError('UNPROCESSABLE', 'HTML, PHP, and JavaScript files are strictly prohibited.', 422);
  }
}
