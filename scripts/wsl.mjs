import { execFileSync } from 'node:child_process';

/** wsl.exe emits UTF-16LE without a BOM; strip the padding nulls. */
export function decodeWslOutput(buffer) {
  return Buffer.from(buffer).toString('utf16le').replaceAll('\0', '');
}

/** Registered WSL distro names, or [] when WSL is unavailable. */
export function wslDistros() {
  try {
    const output = execFileSync('wsl.exe', ['-l', '-q'], { timeout: 20000, windowsHide: true });
    return decodeWslOutput(output).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function toWslPath(windowsPath) {
  return '/mnt/' + windowsPath[0].toLowerCase() + windowsPath.slice(2).replaceAll('\\', '/');
}
