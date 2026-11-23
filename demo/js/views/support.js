// Trung tâm hỗ trợ: câu hỏi thường gặp, gửi yêu cầu cho quản trị viên, xem trả lời; quản trị viên trả lời.
import { api } from '../api.js';
import { h, clear, icon, busy, toast, viDateTime } from '../ui.js';
import { layout, go, isAdmin } from '../app.js';

const CATS = [['HOWTO', 'Hỏi cách dùng'], ['BUG', 'Báo lỗi'], ['ACCOUNT', 'Tài khoản, mật khẩu'], ['DATA', 'Sai dữ liệu'], ['IDEA', 'Góp ý']];
const STATUS_CLASS = { OPEN: 'st-PENDING', ANSWERED: 'st-APPROVED', CLOSED: 'st-CANCELLED' };

const FAQ = [
  ['Làm sao tạo đơn xin nghỉ?', 'Bấm Tạo đơn ở thanh dưới. Chọn loại nghỉ, thời gian, điểm trường liên quan, nhập lý do rồi bấm Xem đơn và gửi. Kiểm tra tờ đơn hiện ra, đúng thì bấm Gửi duyệt.'],
  ['Tôi chưa có chữ ký thì sao?', 'Vào Cá nhân → Ảnh chữ ký. Có thể ký thẳng lên màn hình hoặc chụp chữ ký trên giấy trắng; hệ thống tự xóa nền. Bấm Lưu ảnh.'],
  ['Đơn của tôi đang ở đâu?', 'Vào Đơn của tôi. Mỗi đơn có trạng thái: Bản nháp, Chờ ký, Chờ duyệt, Yêu cầu bổ sung, Đã duyệt, Từ chối, Đã thu hồi, Đã hủy. Có kết quả, bạn nhận thông báo ở mục Thông báo.'],
  ['Muốn sửa đơn đã gửi?', 'Đơn đang chờ duyệt: bấm Thu hồi rồi tạo đơn mới, hoặc chờ Hiệu trưởng yêu cầu bổ sung. Đơn đã duyệt cần thay đổi: báo Hiệu trưởng hủy đơn, sau đó gửi đơn mới.'],
  ['Quên mật khẩu?', 'Ở màn hình đăng nhập bấm Quên mật khẩu (cần đã khai báo email trong Cá nhân). Không có email thì gửi yêu cầu ở đây hoặc nhờ quản trị viên đặt lại.'],
  ['Cài ứng dụng lên điện thoại?', 'Vào Cá nhân → Cài ứng dụng lên điện thoại và làm theo hướng dẫn. Android (Chrome): bấm Cài. iPhone (Safari): nút Chia sẻ → Thêm vào MH chính. Nếu đang mở trong Zalo: bấm ⋯ → Mở bằng trình duyệt trước.']
];

export async function renderSupport() {
  const page = layout('Hỗ trợ', { back: '#/profile' });
  page.append(h('section.card.stack', h('h2', 'Câu hỏi thường gặp'),
    FAQ.map(([q, a]) => h('details', h('summary', h('b', q)), h('p.small', { style: { margin: '6px 0 4px' } }, a)))));
  const f = { category: 'HOWTO', title: '', body: '' };
  const cat = h('select.input', { onchange: (e) => { f.category = e.target.value; } }, CATS.map(([v, l]) => h('option', { value: v }, l)));
  const title = h('input.input', { maxlength: 150, placeholder: 'Tóm tắt vấn đề', oninput: (e) => { f.title = e.target.value; } });
  const body = h('textarea.input', { rows: 4, maxlength: 3000, placeholder: 'Mô tả chi tiết: bạn đang làm gì, thấy thông báo gì…', oninput: (e) => { f.body = e.target.value; } });
  page.append(h('section.card.stack', h('h2', 'Gửi yêu cầu cho quản trị viên'), cat, title, body,
    h('button.btn.primary.block', {
      onclick: async () => {
        if (!f.title.trim() || !f.body.trim()) { toast('Nhập tiêu đề và nội dung.', 'bad'); return; }
        try { await busy('Đang gửi…', () => api('support.create', f, { write: true })); toast('Đã gửi. Bạn sẽ nhận thông báo khi có trả lời.', 'ok'); renderSupport(); } catch (e) { /* đã báo lỗi */ }
      }
    }, icon('send'), 'Gửi yêu cầu')));
  const mine = h('div');
  page.append(h('section.card', h('h2', 'Yêu cầu của tôi'), mine));
  const rows = await api('support.mine');
  if (!page.isConnected) return;
  clear(mine, rows.length ? h('div.list', rows.map(ticketRow)) : h('div.tiny', 'Chưa gửi yêu cầu nào.'));
}

function ticketRow(t) {
  return h('a.list-item', { href: '#/support/' + t.id },
    h('div.grow', h('div.row.between', h('span.title', t.title), h('span.status.' + STATUS_CLASS[t.status], t.statusLabel)),
      h('div.sub', t.categoryLabel + (t.fullName ? ' · ' + t.fullName : '')), h('div.tiny', viDateTime(t.createdAt))),
    h('span.chev', icon('chev')));
}

export async function renderDetail(id) {
  const page = layout('Yêu cầu hỗ trợ', { back: isAdmin() ? '#/admin/support' : '#/support' });
  page.append(h('div.splash', h('div.spinner')));
  const t = await api('support.get', { id });
  if (!page.isConnected) return;
  page.replaceChildren(h('section.card.stack',
    h('div.row.between', h('h2', { style: { margin: 0 } }, t.title), h('span.status.' + STATUS_CLASS[t.status], t.statusLabel)),
    h('div.tiny', t.categoryLabel + ' · ' + t.fullName + ' · ' + viDateTime(t.createdAt)),
    h('div', { style: { whiteSpace: 'pre-wrap' } }, t.body)));
  if (t.adminNote) page.append(h('section.card.stack', h('h2', 'Trả lời của quản trị viên'), h('div', { style: { whiteSpace: 'pre-wrap' } }, t.adminNote),
    h('div.tiny', (t.answeredBy || '') + ' · ' + viDateTime(t.updatedAt))));
  if (t.canReply) {
    const note = h('textarea.input', { rows: 4, placeholder: 'Nội dung trả lời' });
    const send = async (status) => {
      try { await busy('Đang lưu…', () => api('support.reply', { id, adminNote: note.value.trim(), status }, { write: true })); toast('Đã lưu.', 'ok'); renderDetail(id); } catch (e) { /* đã báo lỗi */ }
    };
    page.append(h('section.card.stack', h('h2', 'Trả lời'), note,
      h('div.btn-row', h('button.btn.outline', { onclick: () => send('CLOSED') }, 'Đóng yêu cầu'), h('button.btn.primary', { onclick: () => send('ANSWERED') }, icon('send'), 'Gửi trả lời'))));
  }
}

export async function renderAdminList() {
  const page = layout('Yêu cầu hỗ trợ', { back: '#/admin' });
  if (!isAdmin()) { page.append(h('div.alert.warn', 'Bạn không có quyền vào mục này.')); return; }
  let status = 'OPEN';
  const chips = h('div.chips'), body = h('div');
  page.append(chips, body);
  async function load() {
    clear(chips, [['OPEN', 'Đang chờ'], ['ANSWERED', 'Đã trả lời'], ['CLOSED', 'Đã đóng'], ['', 'Tất cả']].map(([v, l]) =>
      h('button.chip' + (status === v ? '.on' : ''), { type: 'button', onclick: () => { status = v; load(); } }, l)));
    clear(body, h('div.splash', h('div.spinner')));
    const rows = await api('support.list', { status });
    clear(body, rows.length ? h('div.list', rows.map(ticketRow)) : h('div.empty', 'Không có yêu cầu.'));
  }
  load();
}
