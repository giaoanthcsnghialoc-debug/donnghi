// Tiện ích giao diện: tạo phần tử an toàn (không chèn HTML thô), thông báo nổi, bảng trượt, biểu tượng.

/** h('div.card#x', {onclick}, children) – nội dung chuỗi luôn là văn bản, không phải HTML. */
export function h(sel, props, ...children) {
  if (props == null || typeof props !== 'object' || props instanceof Node || Array.isArray(props)) { children.unshift(props); props = {}; }
  const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(sel) || [];
  const el = document.createElement(m[1] || 'div');
  (m[2] || '').replace(/([.#])([\w-]+)/g, (_, t, v) => { if (t === '.') el.classList.add(v); else el.id = v; });
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') String(v).split(/\s+/).filter(Boolean).forEach((c) => el.classList.add(c));
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'value') el.value = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  children.flat(Infinity).forEach((c) => {
    if (c == null || c === false) return;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  });
}

export function clear(el, ...children) { el.replaceChildren(); append(el, children); return el; }

// Biểu tượng SVG đơn giản (nét), tạo bằng DOM.
const ICONS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  plus: 'M12 5v14M5 12h14',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  check: 'M20 6L9 17l-5-5',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z',
  school: 'M2 10l10-5 10 5-10 5zM6 12v5c3 2 9 2 12 0v-5',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  back: 'M15 18l-6-6 6-6',
  chev: 'M9 18l6-6-6-6',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  pen: 'M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z',
  x: 'M18 6L6 18M6 6l12 12',
  cal: 'M3 4h18v18H3zM16 2v4M8 2v4M3 10h18',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2'
};
export function icon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', ICONS[name] || ICONS.file);
  svg.appendChild(p);
  return svg;
}

const overlay = () => document.getElementById('overlay-root');

export function toast(msg, kind = '') {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) { wrap = h('div.toast-wrap'); document.body.appendChild(wrap); }
  const t = h('div.toast' + (kind ? '.' + kind : ''), { role: 'status' }, msg);
  wrap.appendChild(t);
  setTimeout(() => t.remove(), kind === 'bad' ? 6000 : 3500);
}

/** Hiện vòng chờ trong lúc chạy fn; báo lỗi bằng toast. */
export async function busy(label, fn) {
  const el = h('div.busy', h('div.box', h('div.spinner.sm'), h('span', label || 'Đang xử lý…')));
  overlay().appendChild(el);
  try { return await fn((txt) => { el.querySelector('span').textContent = txt; }); }
  catch (e) { toast(e.message || String(e), 'bad'); throw e; }
  finally { el.remove(); }
}

/** Bảng trượt từ dưới lên. Trả về {el, close}. */
export function sheet(title, content, opts = {}) {
  const box = h('div.sheet' + (opts.full ? '.full' : ''), { role: 'dialog', 'aria-modal': 'true' });
  const back = h('div.sheet-backdrop', box);
  const close = () => { back.remove(); if (opts.onClose) opts.onClose(); };
  back.addEventListener('click', (e) => { if (e.target === back && !opts.full) close(); });
  const head = h('div.row.between', { style: { marginBottom: '10px' } }, h('h2', { style: { margin: 0 } }, title),
    h('button.icon-btn', { onclick: close, 'aria-label': 'Đóng' }, icon('x')));
  box.append(head);
  if (typeof content === 'function') content(box, close); else append(box, [content]);
  overlay().appendChild(back);
  return { el: box, close };
}

/** Hỏi nhập ghi chú (từ chối, yêu cầu bổ sung, hủy...). Trả về chuỗi hoặc null. */
export function askText(title, label, { required = true, okText = 'Xác nhận', okClass = 'primary', placeholder = '' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const s = sheet(title, (box, close) => {
      const ta = h('textarea.input', { placeholder, rows: 4 });
      const err = h('div.tiny', { style: { color: 'var(--bad)' } });
      box.append(h('div.field', h('label', label), ta), err,
        h('div.btn-row', { style: { marginTop: '14px' } },
          h('button.btn.outline', { onclick: () => close() }, 'Hủy'),
          h('button.btn.' + okClass, {
            onclick: () => {
              const v = ta.value.trim();
              if (required && !v) { err.textContent = 'Vui lòng nhập nội dung.'; return; }
              done = true; close(); resolve(v);
            }
          }, okText)));
      setTimeout(() => ta.focus(), 50);
    }, { onClose: () => { if (!done) resolve(null); } });
    return s;
  });
}

/** Xác nhận có/không bằng bảng trượt (không dùng hộp thoại của trình duyệt). */
export function confirmSheet(title, message, okText = 'Đồng ý', okClass = 'primary') {
  return new Promise((resolve) => {
    let done = false;
    sheet(title, (box, close) => {
      box.append(h('p.muted', message), h('div.btn-row', { style: { marginTop: '12px' } },
        h('button.btn.outline', { onclick: () => close() }, 'Không'),
        h('button.btn.' + okClass, { onclick: () => { done = true; close(); resolve(true); } }, okText)));
    }, { onClose: () => { if (!done) resolve(false); } });
  });
}

export const SESSION_VI = { AM: 'Sáng', PM: 'Chiều' };
export function viDate(s) { if (!s) return ''; const [y, m, d] = String(s).slice(0, 10).split('-'); return `${d}/${m}/${y}`; }
export function viDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}
export function fmtDays(n) { const x = Number(n) || 0; return String(x).replace('.', ',') + ' ngày'; }
export function statusBadge(status, label) { return h('span.status.st-' + status, label); }
export function fmtSize(n) { return n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
export function todayStr() { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }

/** Mở tệp (PDF/ảnh) trong tab mới hoặc trình xem của máy. */
export function openBytes(bytes, mime, fileName) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime || 'application/octet-stream' }));
  const a = h('a', { href: url, target: '_blank', rel: 'noopener' });
  if (!/^(application\/pdf|image\/)/.test(mime || '')) a.download = fileName || 'tep';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function saveBytes(bytes, mime, fileName) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime || 'application/octet-stream' }));
  const a = h('a', { href: url, download: fileName || 'tep' });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Tải thư viện JS cổ điển (pdf.js, pdf-lib) khi cần. */
const loaded = {};
export function loadScript(src) {
  if (!loaded[src]) loaded[src] = new Promise((ok, bad) => { const s = h('script', { src }); s.onload = ok; s.onerror = () => bad(new Error('Không tải được ' + src)); document.head.appendChild(s); });
  return loaded[src];
}
