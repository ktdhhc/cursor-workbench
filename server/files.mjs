import path from 'node:path';
import { constants } from 'node:fs';
import { lstat, realpath, readdir, open, mkdir, rename, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';

export const MAX_FILE_BYTES = 128 * 1024;
const locks = new Map();

export function fileError(message, status = 400) {
  return Object.assign(new Error(message), { status, statusCode: status });
}

export function contentHash(content) {
  return content === null ? null : createHash('sha256').update(content, 'utf8').digest('hex');
}

function protectedPart(part) {
  return /^(?:\.git|node_modules|\.ssh|\.aws|\.azure|\.kube|\.gnupg|\.gcloud)$/i.test(part)
    || /^\.env(?:\..*)?$/i.test(part)
    || /^(?:\.envrc|\.npmrc|\.netrc|_netrc|\.pypirc|\.git-credentials|\.gitcookies|\.pgpass|\.my\.cnf|\.s3cfg|\.boto|\.terraformrc)$/i.test(part)
    || /^\.?credentials?(?:$|(?:[-_.].*)?\.(?:json|ya?ml|toml|ini|txt|conf|properties|xml)$)/i.test(part)
    || /^\.?secrets?(?:$|(?:[-_.].*)?\.(?:json|ya?ml|toml|ini|txt|conf|properties|xml)$)/i.test(part)
    || /^(?:id_(?:rsa|dsa|ecdsa|ed25519)(?:\..*)?|service[-_]account(?:[-_.].*)?\.json)$/i.test(part)
    || /\.(?:pem|key|p12|pfx|keystore|tfstate)(?:\.backup)?$/i.test(part)
    || /^\.workbench-write-/i.test(part);
}

export function isProtectedPath(value) {
  const parts = String(value).replaceAll('\\', '/').split('/');
  return parts.some(protectedPart) || /(?:^|\/)(?:\.config\/(?:gcloud|gh|hub)|\.docker\/config\.json|\.cargo\/credentials(?:\.toml)?|\.m2\/settings\.xml|\.local\/share\/keyrings)(?:\/|$)/i.test(parts.join('/'));
}

function normalizedPath(value, allowRoot = false) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw fileError('A workspace-relative path is required.');
  const clean = value.replaceAll('\\', '/');
  if (path.posix.isAbsolute(clean) || path.win32.isAbsolute(value) || clean.includes(':')) throw fileError('Absolute paths and drive paths are not allowed.', 403);
  const parts = clean.split('/');
  if (parts.includes('..')) throw fileError('Path traversal is not allowed.', 403);
  // Windows strips trailing dots/spaces and interprets these names as devices.
  if (parts.some(p => p && p !== '.' && (/[. ]$/.test(p) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))) {
    throw fileError('Ambiguous or reserved file names are not allowed.', 403);
  }
  const normalized = path.posix.normalize(clean).replace(/\/$/, '');
  if (isProtectedPath(normalized)) throw fileError('Access to secret, credential, or excluded paths is not allowed.', 403);
  if ((normalized === '.' || !normalized) && !allowRoot) throw fileError('A file path is required.');
  return normalized || '.';
}

async function serial(key, work) {
  const previous = locks.get(key) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  locks.set(key, current);
  await previous;
  try { return await work(); } finally {
    release();
    if (locks.get(key) === current) locks.delete(key);
  }
}

function checkExpected(actual, expected) {
  if (expected === undefined || (expected !== null && !/^[a-f0-9]{64}$/i.test(expected))) {
    throw fileError('expectedHash is required: use the read_file hash, or null for a new file.');
  }
  if (actual !== expected) throw fileError('File changed since it was read. Read it again before editing.', 409);
}

export class WorkspaceFiles {
  #secrets;
  #secretSupplier;

  constructor({ workspace, secrets = [], secretSupplier } = {}) {
    if (!workspace) throw fileError('Workspace is required.');
    if (secretSupplier !== undefined && typeof secretSupplier !== 'function') throw fileError('secretSupplier must be a function.');
    this.workspace = path.resolve(workspace);
    this.root = null;
    this.#secrets = secrets.filter(value => typeof value === 'string' && value.length > 0);
    this.#secretSupplier = secretSupplier;
  }

  #currentSecrets() {
    let supplied = [];
    try { supplied = this.#secretSupplier?.() ?? []; } catch { supplied = []; }
    if (!Array.isArray(supplied)) supplied = [];
    return [...new Set([...this.#secrets, ...supplied].filter(value => typeof value === 'string' && value.length > 0))];
  }

  #checkSecrets(content) {
    if (this.#currentSecrets().some(secret => content.includes(secret)) || /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(content)) {
      throw fileError('Credential content is not exposed or written by workspace tools.', 403);
    }
  }

  async init() {
    this.root = await realpath(this.workspace);
    if (!(await lstat(this.root)).isDirectory()) throw fileError('Workspace must be a directory.');
    return this;
  }

  async resolvePath(value, { allowRoot = false, allowMissing = false } = {}) {
    if (!this.root) throw fileError('Workspace files are not initialized.', 503);
    const relative = normalizedPath(value, allowRoot);
    let cursor = this.root;
    const parts = relative === '.' ? [] : relative.split('/');
    for (let i = 0; i < parts.length; i++) {
      cursor = path.join(cursor, parts[i]);
      let stat;
      try { stat = await lstat(cursor); } catch (error) {
        if (error.code === 'ENOENT' && allowMissing) break;
        if (error.code === 'ENOENT') throw fileError('File or directory not found.', 404);
        throw error;
      }
      if (stat.isSymbolicLink()) throw fileError('Symbolic links are not followed by workspace tools.', 403);
      if (i < parts.length - 1 && !stat.isDirectory()) throw fileError('Parent path is not a directory.');
    }
    const absolute = path.resolve(this.root, ...parts);
    if (absolute !== this.root && !absolute.startsWith(this.root + path.sep)) throw fileError('Path is outside the workspace.', 403);
    return { path: relative, absolute };
  }

  async readFile(value) {
    const target = await this.resolvePath(value);
    let handle;
    try {
      // O_NOFOLLOW also guards a final-component link swap on supported platforms.
      handle = await open(target.absolute, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
      const stat = await handle.stat();
      if (!stat.isFile()) throw fileError('Path is not a regular file.');
      if (stat.nlink > 1) throw fileError('Hard-linked files are not exposed by workspace tools.', 403);
      if (stat.size > MAX_FILE_BYTES) throw fileError('File exceeds the 128KB read limit.', 413);
      const buffer = Buffer.alloc(MAX_FILE_BYTES + 1);
      let count = 0;
      while (count < buffer.length) {
        const { bytesRead } = await handle.read(buffer, count, buffer.length - count, count);
        if (!bytesRead) break;
        count += bytesRead;
      }
      if (count > MAX_FILE_BYTES) throw fileError('File exceeds the 128KB read limit.', 413);
      const bytes = buffer.subarray(0, count);
      if (bytes.some(byte => byte < 32 && ![9, 10, 12, 13, 27].includes(byte))) throw fileError('Binary files cannot be read or edited.', 415);
      let content;
      try { content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); } catch {
        throw fileError('Only UTF-8 text files can be read or edited.', 415);
      }
      this.#checkSecrets(content);
      return { path: target.path, content, hash: contentHash(content), truncated: false };
    } catch (error) {
      if (error.code === 'ELOOP') throw fileError('Symbolic links are not followed by workspace tools.', 403);
      if (error.code === 'ENOENT') throw fileError('File not found.', 404);
      throw error;
    } finally { await handle?.close(); }
  }

  async listFiles({ path: value = '.', depth = 4, limit = 1000 } = {}) {
    const target = await this.resolvePath(value, { allowRoot: true });
    depth = Math.max(1, Math.min(12, Number(depth) || 4));
    limit = Math.max(1, Math.min(5000, Number(limit) || 1000));
    let count = 0;
    const walk = async (relative, level) => {
      const directory = await this.resolvePath(relative, { allowRoot: true });
      const entries = await readdir(directory.absolute, { withFileTypes: true });
      entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
      const result = [];
      for (const entry of entries) {
        if (count >= limit) break;
        const name = relative === '.' ? entry.name : `${relative}/${entry.name}`;
        if (isProtectedPath(name) || entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) continue;
        try { normalizedPath(name); } catch { continue; }
        count++;
        const item = { name: entry.name, path: name, type: entry.isDirectory() ? 'directory' : 'file' };
        if (entry.isDirectory() && level < depth) {
          try { item.children = await walk(name, level + 1); } catch (error) {
            if (![403, 404].includes(error.status) && !['EACCES', 'ENOTDIR'].includes(error.code)) throw error;
            item.children = [];
          }
        }
        result.push(item);
      }
      return result;
    };
    return walk(target.path, 1);
  }

  async searchFiles({ query, path: value = '.', limit = 100 } = {}) {
    if (typeof query !== 'string' || !query || query.length > 1024) throw fileError('Search requires a literal query of 1–1024 characters.');
    limit = Math.max(1, Math.min(200, Number(limit) || 100));
    const target = await this.resolvePath(value, { allowRoot: true });
    const matches = [];
    let scanned = 0;
    let bytes = 0;
    let truncated = false;
    const visit = async (relative, level) => {
      if (scanned >= 2000 || bytes >= 4 * 1024 * 1024 || matches.length >= limit || level > 24) { truncated = true; return; }
      const resolved = await this.resolvePath(relative, { allowRoot: true });
      const stat = await lstat(resolved.absolute);
      if (stat.isDirectory()) {
        const entries = await readdir(resolved.absolute, { withFileTypes: true });
        entries.sort((a, b) => a.name.localeCompare(b.name));
        for (const entry of entries) {
          const name = relative === '.' ? entry.name : `${relative}/${entry.name}`;
          if (isProtectedPath(name) || entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) continue;
          if (scanned >= 2000 || bytes >= 4 * 1024 * 1024 || matches.length >= limit) { truncated = true; break; }
          try { await visit(name, level + 1); } catch (error) {
            if (![400, 403, 404, 413, 415].includes(error.status) && !['EACCES', 'ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
          }
        }
      } else if (stat.isFile()) {
        scanned++;
        const file = await this.readFile(relative);
        bytes += Buffer.byteLength(file.content);
        const lines = file.content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const column = lines[i].indexOf(query);
          if (column === -1) continue;
          matches.push({ path: relative, line: i + 1, column: column + 1, text: lines[i].slice(Math.max(0, column - 160), column + query.length + 240) });
          if (matches.length >= limit) { truncated = true; break; }
        }
      }
    };
    await visit(target.path, 0);
    return { matches, scanned, truncated };
  }

  async findFiles({ pattern, path: value = '.', limit = 200 } = {}) {
    if (typeof pattern !== 'string' || !pattern.trim() || pattern.length > 512) throw fileError('File pattern must contain 1–512 characters.');
    limit = Math.max(1, Math.min(1000, Number(limit) || 200));
    const needle = pattern.trim().replaceAll('\\', '/').toLocaleLowerCase();
    const wildcard = /[*?]/.test(needle);
    const escaped = needle.replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*').replaceAll('?', '.');
    const matcher = wildcard ? new RegExp(`^${escaped}$`, 'i') : null;
    const target = await this.resolvePath(value, { allowRoot: true });
    const files = [];
    let scanned = 0;
    let truncated = false;
    const visit = async (relative, level) => {
      if (files.length >= limit || scanned >= 10000 || level > 32) { truncated = true; return; }
      const resolved = await this.resolvePath(relative, { allowRoot: true });
      const entries = await readdir(resolved.absolute, { withFileTypes: true });
      entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
      for (const entry of entries) {
        const name = relative === '.' ? entry.name : `${relative}/${entry.name}`;
        if (isProtectedPath(name) || entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) continue;
        scanned++;
        const normalized = name.toLocaleLowerCase();
        const basename = entry.name.toLocaleLowerCase();
        if (entry.isFile() && (matcher ? matcher.test(normalized) || matcher.test(basename) : normalized.includes(needle))) files.push({ path: name });
        if (files.length >= limit || scanned >= 10000) { truncated = true; break; }
        if (entry.isDirectory()) await visit(name, level + 1);
      }
    };
    await visit(target.path, 0);
    return { files, scanned, truncated };
  }

  async writeFile({ path: value, content, expectedHash, signal }) {
    return this.#edit(value, expectedHash, () => content, signal);
  }

  async replaceText({ path: value, oldText, newText, expectedHash, replaceAll = false, signal }) {
    if (typeof oldText !== 'string' || !oldText || typeof newText !== 'string') throw fileError('oldText must be nonempty and newText must be text.');
    return this.#edit(value, expectedHash, before => {
      if (before === null) throw fileError('File not found.', 404);
      const first = before.indexOf(oldText);
      if (first < 0) throw fileError('Text to replace was not found.', 409);
      if (!replaceAll && before.indexOf(oldText, first + oldText.length) >= 0) throw fileError('Text occurs more than once. Use a unique selection or replaceAll.', 409);
      return replaceAll ? before.split(oldText).join(newText) : before.slice(0, first) + newText + before.slice(first + oldText.length);
    }, signal);
  }

  async deleteFile({ path: value, expectedHash, signal }) {
    return this.#edit(value, expectedHash, before => {
      if (before === null) throw fileError('File not found.', 404);
      return null;
    }, signal, true);
  }

  // Used for conflict-aware undo, including undoing newly created files.
  async restoreFile({ path: value, content, expectedHash, signal }) {
    return this.#edit(value, expectedHash, () => content, signal, true);
  }

  async #edit(value, expectedHash, transform, signal, allowDelete = false) {
    const target = await this.resolvePath(value, { allowMissing: true });
    const key = process.platform === 'win32' ? target.absolute.toLowerCase() : target.absolute;
    return serial(key, async () => {
      signal?.throwIfAborted();
      await this.resolvePath(value, { allowMissing: true });
      let before;
      try { before = (await this.readFile(value)).content; } catch (error) {
        if (error.status !== 404) throw error;
        before = null;
      }
      checkExpected(contentHash(before), expectedHash);
      const after = transform(before);
      if (after !== null || !allowDelete) {
        if (typeof after !== 'string') throw fileError('File content must be text.');
        if (Buffer.byteLength(after, 'utf8') > MAX_FILE_BYTES) throw fileError('File exceeds the 128KB edit limit.', 413);
        if (/[\x00-\x08\x0b\x0e-\x1a\x1c-\x1f]/.test(after)) throw fileError('Binary files cannot be written.', 415);
        this.#checkSecrets(after);
      }
      if (before === after) return { path: target.path, before, after, hash: contentHash(after), changed: false };
      signal?.throwIfAborted();
      // Validate each new directory separately rather than following links with recursive mkdir.
      const parents = target.path.split('/').slice(0, -1);
      for (let i = 0; i < parents.length; i++) {
        const parent = parents.slice(0, i + 1).join('/');
        const resolved = await this.resolvePath(parent, { allowMissing: true });
        try { await mkdir(resolved.absolute); } catch (error) { if (error.code !== 'EEXIST') throw error; }
        await this.resolvePath(parent);
      }
      let temp;
      try {
        if (after !== null) {
          temp = path.join(path.dirname(target.absolute), `.workbench-write-${randomUUID()}`);
          let mode = 0o644;
          if (before !== null) mode = (await lstat(target.absolute)).mode & 0o777;
          const handle = await open(temp, 'wx', mode);
          try { await handle.writeFile(after, 'utf8'); await handle.sync(); } finally { await handle.close(); }
        }
        // Recheck just before committing, including external editor changes while preparing a write.
        await this.resolvePath(value, { allowMissing: true });
        let current = null;
        try { current = (await this.readFile(value)).content; } catch (error) { if (error.status !== 404) throw error; }
        checkExpected(contentHash(current), expectedHash);
        signal?.throwIfAborted();
        if (after === null) await unlink(target.absolute);
        else await rename(temp, target.absolute);
        temp = null;
        return { path: target.path, before, after, hash: contentHash(after), changed: true };
      } finally { if (temp) await unlink(temp).catch(() => {}); }
    });
  }
}
