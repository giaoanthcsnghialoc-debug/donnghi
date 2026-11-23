// Thông báo của Ban Giám hiệu: tạo (gửi ngay hoặc định kỳ), xem danh sách, xem chi tiết và số người đã đọc.
import { api } from '../api.js';
import { h, clear, icon, busy, toast, viDateTime, confirmSheet } from '../ui.js';
import { state, layout, go, has } from '../app.js';

const isBgh = () => has('PRINCIPAL') || has('VICE');
const WEEKDAYS = [[1, 'Thứ Hai'], [2, 'Thứ Ba'], [3, 'Thứ Tư'], [4, 'Thứ Năm'], [5, 'Thứ Sáu'], [6, 'Thứ Bảy'], [7, 'Chủ nhật']];
const ROLE_OPTS = [['TEACHER', 'Giáo viên'], ['STAFF', 'Nhân viên'], ['LEADER', 'Tổ trưởng'], ['VICE', 'Phó Hiệu trưởng']];

export async function renderList() {
  const page = layout('Thông báo của BGH', { back: '#/' });
  if (!isBgh()) { page.append(h('div.alert.info', 'Chỉ Hiệu trưởng và Phó Hiệu trưởng gửi thông báo.')); return; }
  page.append(h('a.btn.primary.block', { href: '#/announcements/new' }, icon('plus'), 'Tạo thông báo'));
  const body = h('div', h('div.splash', h('div.spinner')));
  page.append(body);
  const rows = await api('ann.list');
  clear(body, rows.length ? h('div.list', { style: { marginTop: '12px' } }, rows.map((a) => h('a.list-item', { href: '#/announcement/' + a.id },
    h('div.grow',
      h('div.row.between', h('span.title', (a.isUrgent ? '⚠ ' : '') + a.title),
        h('span.status.' + (a.status === 'ACTIVE' ? 'st-PENDING' : a.status === 'STOPPED' ? 'st-CANCELLED' : 'st-APPROVED'), a.status === 'ACTIVE' ? 'Định kỳ' : a.status === 'STOPPED' ? 'Đã dừng' : 'Đã gửi')),
      h('div.sub', a.ruleText + ' · ' + a.scopeLabel),
      h('div.tiny', viDateTime(a.createdAt) + ' · ' + a.sender + (a.recipients ? ' · đã đọc ' + a.read + '/' + a.recipients : '') + (a.status === 'ACTIVE' && a.nextRunAt ? ' · lần tới ' + viDateTime(a.nextRunAt) : ''))),
    h('span.chev', icon('chev'))))) : h('div.empty', 'Chưa có thông báo nào.'));
}

export function renderForm() {
  const page = layout('Tạo thông báo', { back: '#/announcements' });
  if (!isBgh()) { page.append(h('div.alert.info', 'Chỉ Hiệu trưởng và Phó Hiệu trưởng gửi thông báo.')); return; }
  const b = state.boot;
  const f = { title: '', body: '', scopeType: 'ALL', scopeIds: [], isUrgent: false, sendEmail: false, schedule: { type: 'NONE', weekday: 1, day: 1, hour: 7 }, sendNow: false };
  const title = h('input.input', { maxlength: 150, placeholder: 'Ví dụ: Họp hội đồng sư phạm tháng 12', oninput: (e) => { f.title = e.target.value; } });
  const body = h('textarea.input', { rows: 6, maxlength: 4000, placeholder: 'Nội dung thông báo', oninput: (e) => { f.body = e.target.value; } });
  const scopeBox = h('div.stack');
  const schedBox = h('div.stack');
  const seg = (opts, cur, onPick) => h('div.seg', opts.map(([v, l]) => h('button' + (cur === v ? '.on' : ''), { type: 'button', onclick: () => onPick(v) }, l)));
  const check = (label, on, onChange) => h('label.check', h('input', { type: 'checkbox', checked: on, onchange: (e) => onChange(e.target.checked) }), label);

  function drawScope() {
    const opts = f.scopeType === 'CAMPUS' ? b.campuses.map((c) => [c.id, c.name]) : f.scopeType === 'DEPARTMENT' ? b.departments.map((d) => [d.id, d.name]) : f.scopeType === 'ROLE' ? ROLE_OPTS : [];
    clear(scopeBox,
      seg([['ALL', 'Toàn trường'], ['CAMPUS', 'Điểm trường'], ['DEPARTMENT', 'Tổ'], ['ROLE', 'Chức vụ']], f.scopeType, (v) => { f.scopeType = v; f.scopeIds = []; drawScope(); }),
      opts.map(([id, name]) => check(name, f.scopeIds.includes(id), (on) => { f.scopeIds = on ? [...f.scopeIds, id] : f.scopeIds.filter((x) => x !== id); })));
  }
  function drawSched() {
    const s = f.schedule;
    const numSel = (key, items) => h('select.input', { onchange: (e) => { s[key] = Number(e.target.value); } }, items.map(([v, l]) => h('option', { value: v, selected: s[key] === v }, l)));
    clear(schedBox,
      seg([['NONE', 'Gửi ngay'], ['WEEKLY', 'Hằng tuần'], ['MONTHLY', 'Hằng tháng']], s.type, (v) => { s.type = v; drawSched(); }),
      s.type === 'NONE' ? null : h('div.grid2',
        s.type === 'WEEKLY' ? numSel('weekday', WEEKDAYS) : numSel('day', Array.from({ length: 28 }, (_, i) => [i + 1, 'Ngày ' + (i + 1)])),
        numSel('hour', Array.from({ length: 15 }, (_, i) => [i + 6, (i + 6) + ' giờ']))),
      s.type === 'NONE' ? null : check('Gửi luôn một lần ngay bây giờ', f.sendNow, (on) => { f.sendNow = on; }),
      s.type === 'NONE' ? null : h('div.tiny', 'Hệ thống kiểm tra mỗi giờ nên thông báo có thể đến trễ tối đa khoảng 1 giờ. Muốn dừng, mở thông báo và bấm Dừng định kỳ.'));
  }
  drawScope(); drawSched();
  page.append(
    h('section.card.stack', h('div.field', h('label', 'Tiêu đề'), title), h('div.field', h('label', 'Nội dung'), body),
      check('Thông báo khẩn (gắn nhãn [KHẨN])', false, (on) => { f.isUrgent = on; }),
      check('Gửi kèm email (chỉ người đã khai báo email; tối đa khoảng 100 email/ngày cho cả hệ thống)', false, (on) => { f.sendEmail = on; })),
    h('section.card.stack', h('h2', 'Người nhận'), scopeBox),
    h('section.card.stack', h('h2', 'Thời điểm gửi'), schedBox));
  page.classList.add('has-action');
  page.parentNode.insertBefore(h('div.action-bar',
    h('button.btn.primary', {
      onclick: async () => {
        if (!f.title.trim() || !f.body.trim()) { toast('Nhập tiêu đề và nội dung.', 'bad'); return; }
        if (f.scopeType !== 'ALL' && !f.scopeIds.length) { toast('Chọn người nhận.', 'bad'); return; }
        try {
          const r = await busy('Đang gửi…', () => api('ann.create', f, { write: true }));
          toast(r.sent ? 'Đã gửi tới ' + r.sent + ' người.' : 'Đã hẹn: ' + r.ruleText + '.', 'ok');
          go('#/announcement/' + r.id);
        } catch (e) { /* đã báo lỗi */ }
      }
    }, icon('send'), 'Gửi thông báo')), page.nextSibling);
}

export async function renderDetail(id) {
  const page = layout('Thông báo', { back: '#/notifications' });
  page.append(h('div.splash', h('div.spinner')));
  const a = await api('ann.get', { id });
  if (!page.isConnected) return;
  page.replaceChildren(...[
    h('section.card.stack',
      a.isUrgent ? h('div.alert.bad', 'THÔNG BÁO KHẨN') : null,
      h('h2', { style: { margin: 0 } }, a.title),
      h('div.tiny', a.sender + ' · ' + viDateTime(a.createdAt)),
      h('div', { style: { whiteSpace: 'pre-wrap', lineHeight: 1.55 } }, a.body)),
    a.recipients !== undefined ? h('section.card.stack',
      h('h2', 'Tình hình nhận'),
      h('dl.kv', h('dt', 'Phạm vi'), h('dd', a.scopeLabel), h('dt', 'Cách gửi'), h('dd', a.ruleText),
        h('dt', 'Số lần đã gửi'), h('dd', String(a.timesSent)), h('dt', 'Đã đọc'), h('dd', a.read + '/' + a.recipients),
        a.status === 'ACTIVE' && a.nextRunAt ? [h('dt', 'Lần gửi tới'), h('dd', viDateTime(a.nextRunAt))] : null),
      a.unreadNames && a.unreadNames.length ? h('details', h('summary.small', 'Chưa đọc (' + a.unreadNames.length + ')'), h('div.tiny', a.unreadNames.join(', '))) : null,
      a.canStop ? h('button.btn.danger.block', {
        onclick: async () => {
          if (!await confirmSheet('Dừng định kỳ', 'Dừng gửi thông báo "' + a.title + '"?', 'Dừng', 'danger')) return;
          await busy('Đang dừng…', () => api('ann.stop', { id: a.id }, { write: true }));
          toast('Đã dừng.', 'ok'); renderDetail(id);
        }
      }, 'Dừng định kỳ') : null) : null].filter(Boolean));
}
