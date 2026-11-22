// Danh sách: đơn của tôi (danh sách + lịch tháng), hàng chờ duyệt, đơn toàn trường, thông báo.
import { api } from '../api.js';
import { h, clear, icon, viDateTime, todayStr, busy, toast, confirmSheet } from '../ui.js';
import { signAsSender } from './leaveDetail.js';
import { state, layout, go, has, updateBadges } from '../app.js';
import { leaveRow } from './home.js';

const STATUS_FILTERS = [['', 'Tất cả'], ['PENDING', 'Chờ duyệt'], ['NEED_CHANGES', 'Cần bổ sung'], ['WAIT_SIGN', 'Chờ ký'], ['DRAFT', 'Nháp'], ['APPROVED', 'Đã duyệt'], ['REJECTED', 'Từ chối'], ['WITHDRAWN', 'Thu hồi'], ['CANCELLED', 'Đã hủy']];

export async function renderMine() {
  const page = layout('Đơn của tôi');
  let status = '', view = 'list', month = todayStr().slice(0, 7);
  const filters = h('div.chips');
  const viewSeg = h('div.seg');
  const body = h('div');
  page.append(viewSeg, filters, body, h('a.btn.primary.block', { href: '#/new' }, icon('plus'), 'Tạo đơn mới'));
  body.append(h('div.splash', h('div.spinner')));
  let all = await api('leave.listMine', {});
  const reload = async () => { all = await api('leave.listMine', {}); draw(); };
  // Đơn chưa gửi: có nút thao tác ngay trên danh sách.
  const mineRow = (l) => {
    const acts = [];
    if (l.status === 'DRAFT') {
      acts.push(h('button.btn.sm.outline', { type: 'button', onclick: async () => {
        if (!await confirmSheet('Xóa bản nháp', 'Xóa bản nháp "' + (l.typeName || 'Đơn nháp') + ' – ' + (l.period || '') + '"? Không khôi phục được.', 'Xóa', 'danger')) return;
        try { await busy('Đang xóa…', () => api('leave.deleteDraft', { id: l.id }, { write: true })); toast('Đã xóa bản nháp.', 'ok'); await reload(); } catch (e) { /* đã báo lỗi */ }
      } }, icon('trash'), 'Xóa'));
      acts.push(h('button.btn.sm.primary', { type: 'button', onclick: async () => {
        try { const S = await busy('Đang gửi…', () => api('leave.submit', { id: l.id }, { write: true })); await signAsSender(S); } catch (e) { /* đã báo lỗi */ }
      } }, icon('send'), 'Gửi duyệt'));
    } else if (l.status === 'WAIT_SIGN') {
      acts.push(h('button.btn.sm.primary', { type: 'button', onclick: () => signAsSender(l) }, icon('pen'), 'Chèn chữ ký'));
    }
    const row = leaveRow(l, 'mine');
    if (!acts.length) return row;
    return h('div.row-with-actions', row, h('div.row-actions', acts));
  };
  const draw = () => {
    clear(viewSeg, [['list', 'Danh sách'], ['cal', 'Lịch nghỉ']].map(([v, l]) => h('button' + (view === v ? '.on' : ''), { type: 'button', onclick: () => { view = v; draw(); } }, l)));
    filters.hidden = view !== 'list';
    clear(filters, STATUS_FILTERS.map(([v, l]) => {
      const n = v ? all.filter((x) => x.status === v).length : all.length;
      if (v && !n) return null;
      return h('button.chip' + (status === v ? '.on' : ''), { type: 'button', onclick: () => { status = v; draw(); } }, l + ' (' + n + ')');
    }));
    if (view === 'list') {
      const rows = status ? all.filter((x) => x.status === status) : all;
      clear(body, rows.length ? h('div.list', rows.map(mineRow)) : h('div.empty', 'Chưa có đơn nào.'));
    } else {
      clear(body, calendar(all, month, (m) => { month = m; draw(); }));
    }
  };
  draw();
}

/** Lịch tháng: chấm màu theo trạng thái đơn, chạm ngày để mở đơn. */
function calendar(leaves, month, onMonth) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const startDow = (first.getUTCDay() + 6) % 7;     // thứ Hai đầu tuần
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const p = (n) => String(n).padStart(2, '0');
  const today = todayStr();
  const byDay = {};
  leaves.filter((l) => l.startDate).forEach((l) => {
    for (let t = Date.parse(l.startDate + 'T00:00:00Z'); t <= Date.parse(l.endDate + 'T00:00:00Z'); t += 86400000) {
      const k = new Date(t).toISOString().slice(0, 10);
      (byDay[k] = byDay[k] || []).push(l);
    }
  });
  const cells = [];
  ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].forEach((d) => cells.push(h('div.dow', d)));
  for (let i = 0; i < startDow; i++) cells.push(h('div'));
  const detail = h('div');
  for (let d = 1; d <= days; d++) {
    const k = `${y}-${p(m)}-${p(d)}`;
    const items = byDay[k] || [];
    cells.push(h('div.day' + (k === today ? '.today' : ''), {
      onclick: () => clear(detail, items.length ? h('div.list', items.map((l) => leaveRow(l, 'mine'))) : h('div.empty.small', 'Không có đơn ngày ' + d + '/' + m + '.'))
    }, String(d), h('div.dots', items.slice(0, 3).map((l) => h('i.dot-' + l.status)))));
  }
  const shift = (n) => { const dt = new Date(Date.UTC(y, m - 1 + n, 1)); onMonth(dt.toISOString().slice(0, 7)); };
  return h('div.stack',
    h('section.card',
      h('div.row.between', { style: { marginBottom: '10px' } },
        h('button.btn.sm.outline', { onclick: () => shift(-1) }, '‹'), h('b', 'Tháng ' + m + '/' + y), h('button.btn.sm.outline', { onclick: () => shift(1) }, '›')),
      h('div.cal', cells),
      h('div.row.wrap.tiny', { style: { marginTop: '10px', gap: '12px' } },
        [['APPROVED', 'Đã duyệt'], ['PENDING', 'Chờ duyệt'], ['NEED_CHANGES', 'Cần bổ sung'], ['REJECTED', 'Từ chối'], ['CANCELLED', 'Thu hồi/Hủy']]
          .map(([s, l]) => h('span.row', { style: { gap: '4px' } }, h('i.dot-' + s, { style: { width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block' } }), l)))),
    detail);
}

export async function renderApprovals() {
  const page = layout('Duyệt đơn');
  if (!state.boot.canDecide) { page.append(h('div.alert.info', 'Bạn không có quyền duyệt đơn (chỉ Hiệu trưởng hoặc PHT đang được ủy quyền).')); return; }
  page.append(h('div.splash', h('div.spinner')));
  const rows = await api('leave.pending');
  state.boot.pendingCount = rows.length;
  updateBadges();
  page.replaceChildren(
    h('p.muted.small', rows.length ? rows.length + ' đơn đang chờ, cũ nhất ở trên.' : ''),
    rows.length ? h('div.list', rows.map((l) => leaveRow(l, 'waiting'))) : h('div.empty', 'Không có đơn nào đang chờ duyệt.'));
}

export async function renderSchool() {
  const b = state.boot;
  const page = layout('Đơn toàn trường');
  const f = { status: has('PRINCIPAL') ? '' : 'APPROVED', campusId: '', departmentId: '', leaveTypeId: '', from: '', to: '', q: '' };
  const sel = (key, options) => h('select.input', { onchange: (e) => { f[key] = e.target.value; load(); } }, options.map(([v, l]) => h('option', { value: v, selected: f[key] === v }, l)));
  const q = h('input.input', { type: 'search', placeholder: 'Tìm theo tên, mã nhân viên, mã đơn' });
  let t;
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { f.q = q.value; load(); }, 400); });
  const from = h('input.input', { type: 'date', onchange: (e) => { f.from = e.target.value; load(); } });
  const to = h('input.input', { type: 'date', onchange: (e) => { f.to = e.target.value; load(); } });
  const body = h('div');
  page.append(h('section.card.stack',
    q,
    has('PRINCIPAL') ? sel('status', STATUS_FILTERS.filter(([v]) => v !== 'DRAFT')) : h('div.tiny', 'Hiển thị các đơn đã duyệt của cả ba điểm trường.'),
    h('div.grid2', sel('campusId', [['', 'Mọi điểm trường'], ...b.campuses.map((c) => [c.id, c.name])]), sel('departmentId', [['', 'Mọi tổ'], ...b.departments.map((d) => [d.id, d.name])])),
    sel('leaveTypeId', [['', 'Mọi loại nghỉ'], ...b.leaveTypes.map((x) => [x.id, x.name])]),
    h('div.grid2', h('div.field', h('label.tiny', 'Từ ngày'), from), h('div.field', h('label.tiny', 'Đến ngày'), to))), body);
  async function load() {
    clear(body, h('div.splash', h('div.spinner')));
    const rows = await api('leave.listAll', f);
    const total = rows.reduce((n, r) => n + (r.status === 'APPROVED' ? r.days : 0), 0);
    clear(body,
      h('p.small.muted', rows.length + ' đơn' + (total ? ' · ' + String(total).replace('.', ',') + ' ngày nghỉ đã duyệt' : '')),
      rows.length ? h('div.list', rows.map((l) => leaveRow(l))) : h('div.empty', 'Không có đơn phù hợp.'));
  }
  load();
}

export async function renderNotifications() {
  const page = layout('Thông báo');
  page.append(h('div.splash', h('div.spinner')));
  const rows = await api('notify.list', { limit: 100 });
  const unread = rows.filter((r) => !r.read).length;
  page.replaceChildren(
    unread ? h('button.btn.sm.outline', {
      onclick: async () => { await api('notify.markRead', { all: true }); state.boot.unread = 0; renderNotifications(); }
    }, 'Đánh dấu đã đọc tất cả (' + unread + ')') : null,
    rows.length ? h('div.list', rows.map((n) => h('div.list-item' + (n.read ? '' : '.unread'), {
      onclick: async () => {
        if (!n.read) { api('notify.markRead', { ids: [n.id] }).catch(() => {}); state.boot.unread = Math.max(0, (state.boot.unread || 1) - 1); }
        if (n.link) go(n.link); else renderNotifications();
      }
    }, h('div.grow', h('div.title', n.title), h('div.sub', n.body), h('div.tiny', viDateTime(n.at) + (n.sender ? ' · ' + n.sender : ''))),
    n.link ? h('span.chev', icon('chev')) : null))) : h('div.empty', 'Chưa có thông báo.'));
}
