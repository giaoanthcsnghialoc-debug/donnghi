// Xem trước đơn theo mẫu của trường (đã chèn sẵn chữ ký người làm đơn) để rà soát trước khi gửi duyệt.
import { api, base64ToBytes } from '../api.js';
import { h, sheet, busy, toast, icon } from '../ui.js';
import { pdfJs } from '../pdftools.js';

/**
 * params: tham số cho leave.preview (thường là { id }).
 * Trả về true nếu người dùng bấm nút gửi, false nếu bấm Sửa lại / đóng.
 */
export async function previewLeave(params, { sendText = 'Gửi duyệt', note = '', viewOnly = false } = {}) {
  let r;
  try {
    r = await busy('Đang tạo đơn để xem trước…', () => api('leave.preview', params));
  } catch (e) { return false; }
  const bytes = base64ToBytes(r.dataBase64);
  const lib = await pdfJs();
  let doc;
  try { doc = await lib.getDocument({ data: bytes.slice() }).promise; } catch (e) { toast('Không hiển thị được đơn: ' + e.message, 'bad'); return false; }

  return new Promise((resolve) => {
    let answered = false;
    sheet('Xem trước đơn', (box, close) => {
      const pages = h('div.preview-pages');
      box.append(
        r.hasSignature ? h('div.alert.info', note || (viewOnly ? 'Đơn sẽ trông như thế này khi gửi (đã chèn chữ ký của bạn).' : 'Đây là đơn sẽ gửi đi, đã chèn chữ ký của bạn. Rà soát kỹ, nếu sai bấm Sửa lại.'))
          : h('div.alert.warn', viewOnly ? 'Bạn chưa có ảnh chữ ký nên ô chữ ký đang trống. Vào Cá nhân → Ảnh chữ ký để tạo.' : 'Bạn chưa có ảnh chữ ký nên ô chữ ký đang trống. Bấm ' + sendText + ', hệ thống sẽ đưa bạn tới trang tạo chữ ký rồi quay lại.'),
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
