// Trang chủ theo vai trò: giáo viên, người duyệt (HT/PHT được ủy quyền), quản lý (PHT, tổ trưởng, HT), quản trị.
import { api, apiSWR } from '../api.js';
import { h, icon, statusBadge, fmtDays, viDateTime, SESSION_VI } from '../ui.js';
import { state, layout, isManager, isAdmin, has, updateBadges } from '../app.js';

export function leaveRow(l, extra) {
  return h('a.list-item', { href: '#/leave/' + l.id },
    h('div.grow',
      h('div.row.between', h('span.title', l.fullName && extra !== 'mine' ? l.fullName : l.typeName || 'Đơn nháp'), statusBadge(l.status, l.statusLabel)),
      h('div.sub', (extra !== 'mine' ? l.typeName + ' · ' : '') + (l.period || 'Chưa chọn thời gian') + (l.days ? ' · ' + fmtDays(l.days) : '')),
      extra === 'mine' && l.code ? h('div.tiny', 'Mã đơn ' + l.code) : null,
      extra === 'done' && l.decidedAt ? h('div.tiny', 'Xử lý lúc ' + viDateTime(l.decidedAt) + (l.code ? ' · ' + l.code : '')) : null,
      extra === 'waiting' && l.waitingHours >= 0 ? h('div.tiny', 'Chờ ' + l.waitingHours + ' giờ' + (l.isRetroactive ? ' · Đơn nộp sau' : '')) : null,
      extra === 'today' ? h('div.tiny', 'Hôm nay nghỉ buổi: ' + l.todaySessions.map((s) => SESSION_VI[s].toLowerCase()).join(', ') + (l.campusNames.length ? ' · ' + l.campusNames.join(', ') : '')) : null),
    h('span.chev', icon('chev')));
}

export async function render() {
  const b = state.boot;
  const page = layout(b.settings.SCHOOL_NAME || 'Đơn xin nghỉ');
  page.append(h('div.splash', h('div.spinner')));
  await apiSWR('dash.home', {}, (d) => { if (page.isConnected) drawHome(page, b, d); });
}

function drawHome(page, b, d) {
  b.unread = d.unread;
  if (d.decider) b.pendingCount = d.decider.pendingCount;
  updateBadges();
  page.replaceChildren();

  const hello = h('div.card.hero',
    h('div.tiny', 'Xin chào'),
    h('h1', { style: { margin: '2px 0 10px' } }, b.user.fullName),
    b.canSubmit && b.balance ? h('div.stats',
      h('div.stat', h('b', String(b.balance.granted).replace('.', ',')), h('span', 'Phép năm được cấp')),
      h('div.stat', h('b', String(b.balance.used).replace('.', ',')), h('span', 'Đã nghỉ phép')),
      h('div.stat', h('b', String(b.balance.remaining).replace('.', ',')), h('span', 'Còn lại'))) : h('div.muted.small', (b.user.roles.map(roleName).join(' · '))));
  page.append(hello);

  if (b.delegation && b.delegation.viceId === b.user.id) {
    page.append(h('div.alert.info', 'Bạn đang được Hiệu trưởng ủy quyền duyệt đơn đến ' + viDateTime(b.delegation.endAt) + '.'));
  }
  if (has('PRINCIPAL') && b.delegation) {
    page.append(h('a.alert.info', { href: '#/delegation', style: { display: 'block', textDecoration: 'none' } }, 'Đang ủy quyền cho ' + b.delegation.viceName + ' đến ' + viDateTime(b.delegation.endAt) + '.'));
  }
  if (b.user.roles.length && b.canSubmit && !b.user.hasSignature) {
    page.append(h('a.alert.warn', { href: '#/signature', style: { display: 'block', textDecoration: 'none' } }, 'Bạn chưa có ảnh chữ ký. Chạm vào đây để chụp hoặc vẽ chữ ký trước khi gửi đơn.'));
  }

  // Người duyệt
  if (d.decider) {
    const c = h('section.card',
      h('div.card-title', h('h2', 'Đơn chờ duyệt'), h('span.days-pill', String(d.decider.pendingCount))),
      d.decider.overdue ? h('div.alert.warn', d.decider.overdue + ' đơn đã chờ quá 24 giờ.') : null);
    if (d.decider.pending.length) c.append(h('div.list', { style: { marginTop: '10px' } }, d.decider.pending.map((l) => leaveRow(l, 'waiting'))));
    else c.append(h('div.empty', 'Không có đơn nào đang chờ.'));
    page.append(c);
  }

  // Giáo viên
  if (b.canSubmit) {
    page.append(h('a.btn.primary.block', { href: '#/new' }, icon('plus'), 'Tạo đơn xin nghỉ'));
    const m = d.mine;
    const todo = [];
    if (m.needChanges) todo.push(h('a.alert.purple', { href: '#/mine', style: { display: 'block', textDecoration: 'none' } }, m.needChanges + ' đơn cần bổ sung theo yêu cầu của Hiệu trưởng.'));
    if (m.waitSign) todo.push(h('a.alert.info', { href: '#/mine', style: { display: 'block', textDecoration: 'none' } }, m.waitSign + ' đơn chưa chèn chữ ký nên chưa được gửi đi.'));
    if (m.draft) todo.push(h('a.alert.info', { href: '#/mine', style: { display: 'block', textDecoration: 'none' } }, m.draft + ' bản nháp chưa gửi.'));
    todo.forEach((t) => page.append(t));
    page.append(h('section.card',
      h('h2', 'Đơn của tôi'),
      h('div.stats', h('div.stat', h('b', String(m.pending)), h('span', 'Chờ duyệt')), h('div.stat', h('b', String(m.approved)), h('span', 'Đã duyệt')), h('div.stat', h('b', String(m.rejected)), h('span', 'Từ chối'))),
      m.upcoming.length ? [h('h3', { style: { margin: '14px 0 8px' } }, 'Lịch nghỉ sắp tới'), h('div.list', m.upcoming.map((l) => leaveRow(l, 'mine')))] : null));
  }

  // Quản lý
  if (d.manager) {
    const mg = d.manager;
    page.append(h('section.card',
      h('div.card-title', h('h2', 'Nghỉ hôm nay'), h('span.days-pill', String(mg.absentToday.length) + ' người')),
      mg.byCampusToday.length ? h('div.chips', { style: { marginBottom: '10px' } }, mg.byCampusToday.map((c) => h('span.chip', c.name + ': ' + c.count))) : null,
      mg.absentToday.length ? h('div.list', mg.absentToday.map((l) => leaveRow(l, 'today'))) : h('div.empty', 'Hôm nay không có ai nghỉ.')));
    page.append(h('section.card',
      h('h2', '7 ngày tới'),
      mg.upcoming.length ? h('div.list', mg.upcoming.map((l) => leaveRow(l))) : h('div.empty', 'Chưa có lịch nghỉ.')));
  }

  if (isAdmin()) {
    page.append(h('a.list-item.card.tight', { href: '#/admin' }, icon('settings'), h('div.grow', h('div.title', 'Quản trị hệ thống'), h('div.sub', 'Tài khoản, tổ, điểm trường, quỹ phép, cấu hình')), h('span.chev', icon('chev'))));
  }
  if (has('PRINCIPAL')) {
    page.append(h('a.list-item.card.tight', { href: '#/delegation' }, icon('shield'), h('div.grow', h('div.title', 'Ủy quyền duyệt đơn'), h('div.sub', 'Ủy quyền tạm thời cho Phó Hiệu trưởng')), h('span.chev', icon('chev'))));
  }
  if (!b.canSubmit && !isManager() && !isAdmin()) page.append(h('div.empty', 'Tài khoản chưa được gán vai trò.'));
}

export function roleName(r) {
  return { PRINCIPAL: 'Hiệu trưởng', VICE: 'Phó Hiệu trưởng', LEADER: 'Tổ trưởng', TEACHER: 'Giáo viên', STAFF: 'Nhân viên', ADMIN: 'Quản trị viên' }[r] || r;
}
