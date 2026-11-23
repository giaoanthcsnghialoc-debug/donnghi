// Xem trước đơn theo mẫu của trường (đã chèn sẵn chữ ký người làm đơn) để rà soát trước khi gửi duyệt.
import { api, base64ToBytes, bytesToBase64 } from '../api.js';
import { h, sheet, busy, toast, icon, saveBytes } from '../ui.js';
import { pdfJs } from '../pdftools.js';
import { state, refreshBoot } from '../app.js';
import { mountSignatureTool } from './signatureTool.js';

/**
 * Bảo đảm người dùng đã có ảnh chữ ký. Chưa có (hoặc force = muốn đổi) thì mở ngay khung tạo chữ ký,
 * lưu xong quay lại đúng chỗ đang làm, không phải rời trang đơn.
 */
export async function ensureSignature(force = false) {
  if (!force && state.boot && state.boot.user.hasSignature) return true;
  if (!force) {
    // có thể đã tạo chữ ký trên máy khác: hỏi lại máy chủ trước khi bắt tạo mới
    try { await busy('Đang kiểm tra chữ ký…', () => refreshBoot()); } catch (e) { /* bỏ qua */ }
    if (state.boot && state.boot.user.hasSignature) return true;
  }
  return new Promise((resolve) => {
    let done = false;
    sheet(force ? 'Đổi chữ ký' : 'Tạo chữ ký của bạn', (box, close) => {
      if (!force) box.append(h('div.alert.info', 'Bạn chưa có ảnh chữ ký. Tạo một lần, các đơn sau hệ thống tự chèn.'));
      const card = h('div.stack');
      box.append(card);
      mountSignatureTool(card, async (png) => {
        try {
          await busy('Đang lưu chữ ký…', () => api('me.signature.upload', { pngBase64: bytesToBase64(png) }, { write: true }));
        } catch (e) { return; }
        if (state.boot) state.boot.user.hasSignature = true;
        toast('Đã lưu chữ ký.', 'ok');
        done = true; close(); resolve(true);
      });
    }, { full: true, onClose: () => { if (!done) resolve(false); } });
  });
}

/**
 * params: tham số cho leave.preview (thường là { id }).
 * Trả về true nếu người dùng bấm nút gửi, false nếu bấm Sửa lại / đóng.
 */
export async function previewLeave(params, { sendText = '', note = '', viewOnly = false } = {}) {
  let r;
  try {
    r = await busy('Đang tạo đơn để xem trước…', () => api('leave.preview', params));
  } catch (e) { return false; }
  const bytes = base64ToBytes(r.dataBase64);
  const lib = await pdfJs();
  let doc;
  try { doc = await lib.getDocument({ data: bytes.slice() }).promise; } catch (e) { toast('Không hiển thị được đơn: ' + e.message, 'bad'); return false; }

  if (!sendText) sendText = 'Gửi duyệt';
  return new Promise((resolve) => {
    let answered = false;
    sheet('Xem trước đơn', (box, close) => {
      const pages = h('div.preview-pages');
      box.append(
        r.hasSignature ? h('div.alert.info', note || (viewOnly ? 'Đơn sẽ trông như thế này khi gửi (đã chèn chữ ký của bạn).' : 'Đã chèn chữ ký của bạn. Rà soát kỹ nội dung: đúng thì bấm Gửi duyệt, sai thì bấm Sửa lại.'))
          : h('div.alert.warn', viewOnly ? 'Bạn chưa có ảnh chữ ký nên ô chữ ký đang trống. Vào Cá nhân → Ảnh chữ ký để tạo.' : 'Bạn chưa có ảnh chữ ký nên ô chữ ký đang trống. Bấm ' + sendText + ', tạo chữ ký xong hệ thống đưa bạn quay lại đơn để ký và gửi.'),
        pages,
        h('div.tiny.muted', { style: { textAlign: 'center', marginBottom: '8px' } }, 'Chạm vào trang đơn để phóng to, chạm lần nữa để thu nhỏ.'),
        viewOnly ? h('div.btn-row.preview-actions', h('button.btn.outline', { onclick: () => { answered = true; close(); resolve(false); } }, 'Đóng')) :
        h('div.btn-row.preview-actions',
          h('button.btn.outline', { onclick: () => { answered = true; close(); resolve(false); } }, 'Sửa lại'),
          h('button.btn.primary', { onclick: () => { answered = true; close(); resolve(true); } }, icon('send'), sendText)));
      (async () => {
        await new Promise((ok) => requestAnimationFrame(() => ok()));
        const width = Math.min((pages.clientWidth || 380) - 20, 800);
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        for (let i = 1; i <= doc.numPages; i++) {
          const pg = await doc.getPage(i);
          const vp0 = pg.getViewport({ scale: 1 });
          const vp = pg.getViewport({ scale: (width / vp0.width) * Math.min(dpr * 2, 4) });
          const c = h('canvas.preview-page');
          c.width = vp.width; c.height = vp.height;
          c.style.width = width + 'px';
          let big = false;
          c.title = 'Chạm để phóng to / thu nhỏ';
          c.onclick = () => { big = !big; c.style.width = (big ? width * 2 : width) + 'px'; pages.style.alignItems = big ? 'flex-start' : 'center'; };
          pages.append(c);
          await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        }
      })().catch((e) => toast('Lỗi hiển thị trang: ' + e.message, 'bad'));
    }, { full: true, onClose: () => { if (!answered) resolve(false); } });
  });
}

/** Xem một PDF ngay trong ứng dụng (không mở cửa sổ mới, tránh bị trình duyệt chặn). */
export async function viewPdf(bytes, title, fileName, extra) {
  const lib = await pdfJs();
  let doc;
  try { doc = await lib.getDocument({ data: bytes.slice() }).promise; } catch (e) { toast('Không hiển thị được PDF: ' + e.message, 'bad'); return; }
  sheet(title || 'Xem đơn', (box, close) => {
    const pages = h('div.preview-pages');
    box.append(pages,
      h('div.tiny.muted', { style: { textAlign: 'center', marginBottom: '8px' } }, 'Chạm vào trang để phóng to, chạm lần nữa để thu nhỏ.'),
      extra ? h('div.preview-actions', { style: { marginBottom: '8px', display: 'grid' } }, extra) : null,
      h('div.btn-row.preview-actions',
        h('button.btn.outline', { onclick: () => saveBytes(bytes, 'application/pdf', fileName || 'don.pdf') }, icon('download'), 'Tải về máy'),
        h('button.btn.primary', { onclick: () => close() }, 'Đóng')));
    (async () => {
      await new Promise((ok) => requestAnimationFrame(() => ok()));
      const width = Math.min((pages.clientWidth || 380) - 20, 800);
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      for (let i = 1; i <= doc.numPages; i++) {
        const pg = await doc.getPage(i);
        const vp0 = pg.getViewport({ scale: 1 });
        const vp = pg.getViewport({ scale: (width / vp0.width) * Math.min(dpr * 2, 4) });
        const c = h('canvas.preview-page');
        c.width = vp.width; c.height = vp.height; c.style.width = width + 'px';
        let big = false;
        c.onclick = () => { big = !big; c.style.width = (big ? width * 2 : width) + 'px'; pages.style.alignItems = big ? 'flex-start' : 'center'; };
        pages.append(c);
        await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      }
    })().catch((e) => toast('Lỗi hiển thị trang: ' + e.message, 'bad'));
  }, { full: true });
}
