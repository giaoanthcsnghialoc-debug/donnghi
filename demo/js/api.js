// Gọi API Apps Script. Gửi POST text/plain để tránh bước kiểm tra CORS.
import { API_URL } from './config.js';

const TOKEN_KEY = 'dn_token';
export const auth = {
  get token() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } },
  set token(v) { try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch (e) { /* bỏ qua */ } }
};

export class ApiError extends Error {
  constructor(code, message, data) { super(message); this.code = code; this.data = data; }
}

let onAuthLost = () => {};
let onMustChange = () => {};
export function setAuthHandlers(lost, mustChange) { onAuthLost = lost; onMustChange = mustChange; }

function rid() {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Gọi một thao tác. opts.write=true thêm requestId để máy chủ chống xử lý lặp khi mạng chập chờn.
 */
export async function api(action, payload = {}, opts = {}) {
  if (!API_URL) throw new ApiError('CONFIG', 'Chưa cấu hình địa chỉ máy chủ (js/config.js).');
  const body = { action, token: auth.token, payload };
  if (opts.write) body.requestId = opts.requestId || rid();
  let res;
  const tries = opts.write ? 2 : 3;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' });
      res = await r.json();
      break;
    } catch (e) {
      if (i === tries - 1) throw new ApiError('NETWORK', 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
      await new Promise((ok) => setTimeout(ok, 800 * (i + 1)));
    }
  }
  if (!res.ok) {
    const err = res.error || {};
    if (err.code === 'AUTH') { auth.token = ''; onAuthLost(err.message); }
    if (err.code === 'MUST_CHANGE_PASSWORD') onMustChange();
    throw new ApiError(err.code || 'ERROR', err.message || 'Có lỗi xảy ra.', err.data);
  }
  return res.data;
}

function bytesToBase64(bytes) {
  let s = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) s += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
  return btoa(s);
}
export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export { bytesToBase64 };

/** Tải tệp lên theo từng phần 3 MB. Trả về {fileId, fileName, mimeType, size}. */
export async function uploadFile(fileOrBytes, fileName, purpose, onProgress) {
  const bytes = fileOrBytes instanceof Uint8Array ? fileOrBytes : new Uint8Array(await fileOrBytes.arrayBuffer());
  const CHUNK = 3 * 1024 * 1024;
  const total = Math.max(1, Math.ceil(bytes.length / CHUNK));
  if (bytes.length > 30 * 1024 * 1024) throw new ApiError('INVALID_FILE', 'Tệp vượt quá 30 MB.');
  let uploadId = '';
  let last;
  for (let i = 0; i < total; i++) {
    const part = bytes.subarray(i * CHUNK, Math.min(bytes.length, (i + 1) * CHUNK));
    last = await api('files.uploadChunk', { uploadId, index: i, total, fileName, purpose, dataBase64: bytesToBase64(part) });
    uploadId = last.uploadId;
    if (onProgress) onProgress((i + 1) / total);
  }
  return last;
}

/** Tải tệp về theo từng phần. Trả về {bytes, fileName, mimeType}. */
export async function downloadFile(action, payload, onProgress) {
  let offset = 0;
  const parts = [];
  let meta;
  for (let guard = 0; guard < 30; guard++) {
    meta = await api(action, { ...payload, offset });
    parts.push(base64ToBytes(meta.dataBase64));
    if (onProgress && meta.size) onProgress(Math.min(1, meta.next / meta.size));
    if (meta.done) break;
    offset = meta.next;
  }
  const size = parts.reduce((n, p) => n + p.length, 0);
  const bytes = new Uint8Array(size);
  let pos = 0;
  parts.forEach((p) => { bytes.set(p, pos); pos += p.length; });
  return { bytes, fileName: meta.fileName, mimeType: meta.mimeType };
}
