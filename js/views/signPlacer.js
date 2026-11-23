// Chọn vị trí chữ ký (và con dấu) trên đơn tải lên: hiện trang PDF, kéo ảnh tới chỗ cần ký, chỉnh cỡ.
import { h, clear, sheet, toast } from '../ui.js';
import { pdfJs } from '../pdftools.js';

function pngSize(bytes) {
  // đọc kích thước từ phần IHDR của PNG
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { w: v.getUint32(16), h: v.getUint32(20) };
}

/**
 * items: [{key, label, png (Uint8Array), defaultPos: {x, y, w}}]
 * Trả về [{key, page, x, y, w, h}] (tỉ lệ 0..1 theo trang, gốc trên-trái) hoặc null nếu hủy.
 */
export function placeSignature(pdfBytes, items, title) {
  return new Promise(async (resolve) => {
    let finished = false;
    const lib = await pdfJs();
    let doc;
    try { doc = await lib.getDocument({ data: pdfBytes.slice() }).promise; } catch (e) { toast('Không đọc được tệp PDF: ' + e.message, 'bad'); resolve(null); return; }
    const total = doc.numPages;
    let pageNo = total;            // chữ ký thường ở trang cuối
    const state = items.map((it) => {
      const s = pngSize(it.png);
      return { ...it, ratio: s.h / s.w, x: it.defaultPos.x, y: it.defaultPos.y, w: it.defaultPos.w, url: URL.createObjectURL(new Blob([it.png], { type: 'image/png' })) };
    });
    let selected = state[0];

    sheet(title, (box, close) => {
      const stage = h('div.placer-stage');
      const canvas = h('canvas');
      const layer = h('div', { style: { position: 'absolute', left: '0', top: '0', pointerEvents: 'none' } });
      stage.append(canvas, layer);
      const pageLabel = h('span.small.muted');
      const size = h('input', { type: 'range', min: '8', max: '60', value: String(Math.round(selected.w * 100)) });
      const nodes = {};
      let pageW = 0, pageH = 0;

      const place = () => {
        layer.style.left = canvas.offsetLeft + 'px';
        layer.style.width = pageW + 'px';
        layer.style.height = pageH + 'px';
        state.forEach((s) => {
          const el = nodes[s.key];
          const wpx = s.w * pageW, hpx = wpx * s.ratio;
          s.h = hpx / pageH;
          s.x = Math.max(0, Math.min(1 - s.w, s.x));
          s.y = Math.max(0, Math.min(1 - s.h, s.y));
          Object.assign(el.style, { left: s.x * pageW + 'px', top: s.y * pageH + 'px', width: wpx + 'px', height: hpx + 'px', outline: s === selected ? '3px solid rgba(29,78,216,.35)' : 'none' });
        });
      };

      const renderPage = async () => {
        const page = await doc.getPage(pageNo);
        const avail = Math.min(stage.clientWidth - 8, 900);
        const vp1 = page.getViewport({ scale: 1 });
        const scale = avail / vp1.width;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const vp = page.getViewport({ scale: scale * dpr });
        canvas.width = vp.width; canvas.height = vp.height;
        pageW = vp.width / dpr; pageH = vp.height / dpr;
        canvas.style.width = pageW + 'px'; canvas.style.height = pageH + 'px';
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        pageLabel.textContent = 'Trang ' + pageNo + '/' + total;
        place();
      };

      state.forEach((s) => {
        const el = h('div.placer-item', h('img', { src: s.url, alt: s.label }), h('span.tag', s.label));
        nodes[s.key] = el;
        layer.append(el);
        let start = null;
        el.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          selected = s; size.value = String(Math.round(s.w * 100));
          el.setPointerCapture(e.pointerId);
          start = { px: e.clientX, py: e.clientY, x: s.x, y: s.y };
          place();
        });
        el.addEventListener('pointermove', (e) => {
          if (!start) return;
          s.x = start.x + (e.clientX - start.px) / pageW;
          s.y = start.y + (e.clientY - start.py) / pageH;
          place();
        });
        const end = () => { start = null; };
        el.addEventListener('pointerup', end);
        el.addEventListener('pointercancel', end);
      });
      // chạm vào trang để đưa ảnh đang chọn tới đó
      canvas.addEventListener('click', (e) => {
        const r = canvas.getBoundingClientRect();
        selected.x = (e.clientX - r.left) / pageW - selected.w / 2;
        selected.y = (e.clientY - r.top) / pageH - (selected.h || 0.05) / 2;
        place();
      });
      size.addEventListener('input', () => { selected.w = Number(size.value) / 100; place(); });

      const chooser = state.length > 1 ? h('div.seg', state.map((s) => h('button' + (s === selected ? '.on' : ''), {
        type: 'button', onclick: (e) => { selected = s; size.value = String(Math.round(s.w * 100)); [...e.target.parentNode.children].forEach((b) => b.classList.toggle('on', b === e.target)); place(); }
      }, s.label))) : null;

      const cleanup = () => state.forEach((s) => URL.revokeObjectURL(s.url));
      box.append(
        h('p.small.muted', { style: { margin: '0 0 8px' } }, 'Chạm vào chỗ cần ký hoặc kéo ảnh chữ ký tới đúng vị trí, chỉnh cỡ bằng thanh trượt.'),
        stage,
        h('div.stack', { style: { marginTop: '10px' } },
          chooser,
          h('div.row', h('span.small', 'Cỡ'), h('div.grow', size)),
          h('div.row.between',
            h('button.btn.sm.outline', { type: 'button', disabled: total < 2, onclick: () => { if (pageNo > 1) { pageNo--; renderPage(); } } }, '‹ Trang trước'),
            pageLabel,
            h('button.btn.sm.outline', { type: 'button', disabled: total < 2, onclick: () => { if (pageNo < total) { pageNo++; renderPage(); } } }, 'Trang sau ›')),
          h('div.btn-row',
            h('button.btn.outline', { type: 'button', onclick: () => close() }, 'Hủy'),
            h('button.btn.primary', {
              type: 'button', onclick: () => {
                finished = true;
                const out = state.map((s) => ({ key: s.key, page: pageNo, x: s.x, y: s.y, w: s.w, h: s.h }));
                cleanup(); close(); resolve(out);
              }
            }, 'Chèn vào đơn'))));
      requestAnimationFrame(renderPage);
      window.addEventListener('resize', renderPage, { once: true });
      box._cleanup = cleanup;
    }, { full: true, onClose: () => { if (!finished) { resolve(null); } } });
  });
}
