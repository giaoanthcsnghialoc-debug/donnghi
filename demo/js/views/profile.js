// Cá nhân: thông tin, giao diện sáng/tối, ảnh chữ ký, thiết bị đang đăng nhập, phép năm, đăng xuất.
import { api, auth, bytesToBase64 } from '../api.js';
import { h, clear, icon, toast, busy, viDateTime, fmtDays } from '../ui.js';
import { state, layout, go, applyTheme, refreshBoot, route, isAdmin, has } from '../app.js';
import { mountSignatureTool } from './signatureTool.js';
import { roleName } from './home.js';

export async function render() {
  const b = state.boot;
  const u = b.user;
  const page = layout('Cá nhân');
  const campus = b.campuses.filter((c) => u.campusIds.includes(c.id)).map((c) => c.name).join(', ');
  page.append(h('section.card',
    h('h2', u.fullName),
    h('div.muted.small', u.roles.map(roleName).join(' · ')),
    h('dl.kv', { style: { marginTop: '10px' } },
      h('dt', 'Tên đăng nhập'), h('dd', u.username),
      u.staffCode ? [h('dt', 'Mã nhân viên'), h('dd', u.staffCode)] : null,
      u.positionTitle ? [h('dt', 'Chức vụ'), h('dd', u.positionTitle)] : null,
      u.departmentName ? [h('dt', 'Tổ'), h('dd', u.departmentName)] : null,
      campus ? [h('dt', 'Điểm trường'), h('dd', campus)] : null)));

  // Liên hệ
  const email = h('input.input', { type: 'email', value: u.email || '', autocomplete: 'email' });
  const phone = h('input.input', { type: 'tel', value: u.phone || '' });
  const zalo = h('input.input', { type: 'tel', value: u.zaloPhone || '' });
  const emailApproved = h('input', { type: 'checkbox', checked: u.emailOnApproved });
  page.append(h('section.card.stack',
    h('h2', 'Liên hệ'),
    h('div.field', h('label', 'Email cá nhân'), email, h('div.hint', 'Dùng để khôi phục mật khẩu và nhận thông báo kết quả đơn.')),
    h('div.field', h('label', 'Số điện thoại'), phone),
    h('div.field', h('label', 'Số Zalo (nếu có)'), zalo, h('div.hint', 'Gửi thông báo qua Zalo hiện chưa bật (cần dịch vụ có phí).')),
    has('VICE') || has('LEADER') ? h('label.check', emailApproved, 'Nhận cả email khi có đơn được duyệt') : null,
    h('button.btn.primary.block', {
      onclick: async () => {
        await busy('Đang lưu…', () => api('me.update', { email: email.value.trim(), phone: phone.value.trim(), zaloPhone: zalo.value.trim(), emailOnApproved: emailApproved.checked }, { write: true }));
        await refreshBoot(); toast('Đã lưu.', 'ok');
      }
    }, 'Lưu thông tin')));

  // Giao diện
  const themeSeg = h('div.seg', [['light', 'Sáng'], ['dark', 'Tối'], ['auto', 'Theo máy']].map(([v, l]) => h('button' + (u.themePref === v ? '.on' : ''), {
    type: 'button', onclick: async (e) => {
      [...e.target.parentNode.children].forEach((x) => x.classList.toggle('on', x === e.target));
      u.themePref = v; applyTheme(v);
      api('me.update', { themePref: v }).catch(() => {});
    }
  }, l)));
  page.append(h('section.card.stack', h('h2', 'Giao diện'), themeSeg));

  const link = (href, ic, title, sub) => h('a.list-item', { href }, icon(ic), h('div.grow', h('div.title', title), sub ? h('div.sub', sub) : null), h('span.chev', icon('chev')));
  page.append(h('div.list',
    link('#/signature', 'pen', 'Ảnh chữ ký', u.hasSignature ? 'Đã có ảnh chữ ký' : 'Chưa có – cần để ký đơn'),
    b.canSubmit ? link('#/balance', 'cal', 'Phép năm', b.balance ? 'Còn ' + fmtDays(b.balance.remaining) : '') : null,
    link('#/sessions', 'shield', 'Thiết bị đang đăng nhập'),
    link('#/password', 'settings', 'Đổi mật khẩu'),
    has('PRINCIPAL') ? link('#/delegation', 'users', 'Ủy quyền duyệt đơn') : null,
    has('PRINCIPAL') || has('VICE') || has('LEADER') ? link('#/reports', 'list', 'Báo cáo & sổ nghỉ', 'Thống kê ngày nghỉ, tải Excel để xếp loại thi đua') : null,
    has('PRINCIPAL') || has('VICE') ? link('#/announcements', 'bell', 'Thông báo của BGH', 'Gửi thông báo tới giáo viên, nhân viên; thông báo định kỳ') : null,
    link('#/support', 'shield', 'Hỗ trợ', 'Câu hỏi thường gặp, gửi yêu cầu cho quản trị viên'),
    isAdmin() ? link('#/admin', 'settings', 'Quản trị hệ thống') : null));

  page.append(h('button.btn.outline.block', {
    onclick: () => {
      // Thoát ngay trên máy; báo máy chủ hủy phiên ở nền, không bắt người dùng chờ.
      const t = auth.token;
      auth.token = ''; state.boot = null;
      if (t) api('auth.logout', {}, { token: t }).catch(() => {});
      location.hash = '#/'; route();
    }
  }, icon('logout'), 'Đăng xuất'));
  page.append(h('p.tiny', { style: { textAlign: 'center' } }, 'Phiên bản ' + b.version + (b.env === 'DEMO' ? ' · DEMO' : '')));
}

export async function renderSignature() {
  const page = layout('Ảnh chữ ký', { back: '#/profile' });
  const current = h('div.checker', { style: { padding: '10px', minHeight: '90px', display: 'grid', placeItems: 'center' } }, h('div.spinner.sm'));
  page.append(h('section.card.stack', h('h2', 'Chữ ký hiện tại'), current,
    h('div.tiny', 'Ảnh chữ ký chỉ chèn vào đơn khi bạn bấm "Chèn chữ ký". Đây là xác nhận nội bộ, không phải chữ ký số.')));
  api('me.signature.get').then((r) => clear(current, r.pngBase64 ? h('img.sig-preview', { src: 'data:image/png;base64,' + r.pngBase64, alt: 'Chữ ký' }) : h('span.tiny', 'Chưa có ảnh chữ ký.')));
  const toolCard = h('section.card.stack', h('h2', state.boot.user.hasSignature ? 'Đổi ảnh chữ ký' : 'Tạo ảnh chữ ký'));
  page.append(toolCard);
  mountSignatureTool(toolCard, async (png) => {
    await busy('Đang lưu chữ ký…', () => api('me.signature.upload', { pngBase64: bytesToBase64(png) }, { write: true }));
    await refreshBoot();
    toast('Đã lưu ảnh chữ ký.', 'ok');
    let back = '';
    try { back = sessionStorage.getItem('dn_after_sig') || ''; sessionStorage.removeItem('dn_after_sig'); } catch (x) { /* bỏ qua */ }
    go(back || '#/profile');
  });
}

export async function renderSessions() {
  const showBalance = location.hash === '#/balance';
  const page = layout(showBalance ? 'Phép năm' : 'Thiết bị đang đăng nhập', { back: '#/profile' });
  page.append(h('div.splash', h('div.spinner')));
  if (showBalance) {
    const b = state.boot.balance || {};
    const hist = await api('balance.history', {});
    page.replaceChildren(h('section.card', h('div.stats',
      h('div.stat', h('b', String(b.granted || 0)), h('span', 'Được cấp')), h('div.stat', h('b', String(b.used || 0)), h('span', 'Đã nghỉ')), h('div.stat', h('b', String(b.remaining || 0)), h('span', 'Còn lại')))),
    h('section.card', h('h2', 'Lịch sử thay đổi'), hist.length ? h('table.simple', h('tr', h('th', 'Thời gian'), h('th', 'Nội dung'), h('th', 'Ngày')),
      hist.slice().reverse().map((x) => h('tr', h('td', viDateTime(x.at)), h('td', x.note), h('td', (x.type === 'DEDUCT' ? '−' : x.type === 'REVERSE' ? '+' : '') + String(x.days).replace('.', ','))))) : h('div.tiny', 'Chưa có.')));
    return;
  }
  const rows = await api('auth.sessions');
  page.replaceChildren(h('p.small.muted', 'Bạn có thể đăng nhập trên nhiều thiết bị. Thiết bị không dùng quá ' + (state.boot.settings.SESSION_IDLE_DAYS || 7) + ' ngày sẽ tự đăng xuất.'),
    h('div.list', rows.map((s) => h('div.list-item', h('div.grow',
      h('div.title', (s.deviceLabel || 'Thiết bị') + (s.current ? ' (máy này)' : '')),
      h('div.tiny', 'Đăng nhập ' + viDateTime(s.createdAt) + ' · dùng gần nhất ' + viDateTime(s.lastSeenAt))),
    s.current ? null : h('button.btn.sm.outline', { onclick: async () => { await busy('Đang đăng xuất…', () => api('auth.revokeSession', { sessionId: s.id })); renderSessions(); } }, 'Đăng xuất')))));
}
