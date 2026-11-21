// Quản trị: tài khoản, nhập Excel, tổ chuyên môn, điểm trường, quỹ phép, cấu hình, nhật ký; ủy quyền (HT).
import { api, bytesToBase64, downloadFile } from '../api.js';
import { h, clear, icon, toast, busy, confirmSheet, sheet, viDateTime, openBytes, saveBytes } from '../ui.js';
import { state, layout, go, adminCan, has, refreshBoot } from '../app.js';
import { mountSignatureTool } from './signatureTool.js';
import { roleName } from './home.js';

const ROLES = ['TEACHER', 'STAFF', 'LEADER', 'VICE', 'PRINCIPAL', 'ADMIN'];
const ADMIN_PERMS = { users: 'Quản lý tài khoản', org: 'Tổ chuyên môn, điểm trường', balance: 'Quỹ phép', settings: 'Cấu hình, mẫu đơn, logo, con dấu', years: 'Năm học' };

function guard(page, ok) { if (!ok) { page.append(h('div.alert.warn', 'Bạn không có quyền vào mục này.')); return false; } return true; }
const link = (href, ic, title, sub) => h('a.list-item', { href }, icon(ic), h('div.grow', h('div.title', title), sub ? h('div.sub', sub) : null), h('span.chev', icon('chev')));

export function renderMenu() {
  const page = layout('Quản trị hệ thống', { back: '#/' });
  const u = state.boot.user;
  if (!guard(page, u.roles.includes('ADMIN'))) return;
  page.append(h('div.list',
    adminCan('users') ? link('#/admin/users', 'users', 'Tài khoản', 'Tạo, sửa, khóa, đặt lại mật khẩu, nhập từ Excel') : null,
    adminCan('org') ? link('#/admin/departments', 'school', 'Tổ chuyên môn') : null,
    adminCan('org') ? link('#/admin/campuses', 'home', 'Điểm trường') : null,
    adminCan('balance') ? link('#/admin/balances', 'cal', 'Quỹ phép năm', 'Nhập số ngày phép theo quy định cho từng người') : null,
    adminCan('settings') ? link('#/admin/settings', 'settings', 'Cấu hình', 'Tên trường, logo, con dấu, chế độ ký, mẫu đơn') : null,
    u.isPrimaryAdmin ? link('#/admin/audit', 'shield', 'Nhật ký hệ thống') : null),
  h('p.tiny', 'Quản trị viên không có quyền duyệt hoặc ký thay Hiệu trưởng, và không sửa được nội dung đơn đã duyệt.'));
}

/* ---------------- Tài khoản ---------------- */
export async function renderUsers() {
  const page = layout('Tài khoản', { back: '#/admin' });
  if (!guard(page, adminCan('users'))) return;
  const q = h('input.input', { type: 'search', placeholder: 'Tìm tên, tên đăng nhập, mã NV' });
  const list = h('div');
  page.append(h('div.btn-row', h('a.btn.primary', { href: '#/admin/user/new' }, icon('plus'), 'Thêm'), h('a.btn.outline', { href: '#/admin/import' }, 'Nhập từ Excel')), q, list);
  clear(list, h('div.splash', h('div.spinner')));
  const users = await api('users.list');
  const st = { ACTIVE: '', LOCKED: ' · Đang khóa', DISABLED: ' · Đã vô hiệu hóa' };
  const draw = () => {
    const k = q.value.trim().toLowerCase();
    const rows = users.filter((u) => !k || [u.fullName, u.username, u.staffCode].join(' ').toLowerCase().includes(k));
    clear(list, h('p.tiny', rows.length + ' tài khoản'), h('div.list', rows.map((u) => h('a.list-item', { href: '#/admin/user/' + u.id },
      h('div.grow', h('div.title', u.fullName + (st[u.status] || '')), h('div.sub', u.username + ' · ' + u.roles.map(roleName).join(', ') + (u.departmentName ? ' · ' + u.departmentName : ''))),
      h('span.chev', icon('chev'))))));
  };
  q.addEventListener('input', draw);
  draw();
}

function showTempPassword(name, username, pw) {
  sheet('Mật khẩu tạm', h('div.stack',
    h('p', 'Gửi cho ', h('b', name), ' thông tin đăng nhập:'),
    h('div.card.tight', h('div', 'Tên đăng nhập: ', h('b', username)), h('div', 'Mật khẩu tạm: ', h('b', { style: { fontSize: '1.2rem', letterSpacing: '.05em' } }, pw))),
    h('p.tiny', 'Người dùng phải đổi mật khẩu ở lần đăng nhập đầu tiên. Mật khẩu này chỉ hiện một lần.'),
    navigator.clipboard ? h('button.btn.outline.block', { onclick: () => navigator.clipboard.writeText(`Tên đăng nhập: ${username}\nMật khẩu tạm: ${pw}`).then(() => toast('Đã sao chép.')) }, 'Sao chép') : null));
}

export async function renderUserForm(id) {
  const isNew = id === 'new';
  const page = layout(isNew ? 'Thêm tài khoản' : 'Sửa tài khoản', { back: '#/admin/users' });
  if (!guard(page, adminCan('users'))) return;
  const b = state.boot;
  let u = { fullName: '', username: '', staffCode: '', email: '', phone: '', zaloPhone: '', positionTitle: '', departmentId: '', campusIds: [], roles: ['TEACHER'], adminPerms: [], status: 'ACTIVE' };
  if (!isNew) {
    page.append(h('div.splash', h('div.spinner')));
    const all = await api('users.list');
    u = all.find((x) => x.id === id);
    page.replaceChildren();
    if (!u) { page.append(h('div.alert.bad', 'Không tìm thấy tài khoản.')); return; }
  }
  const inp = (key, label, type = 'text', hint) => { const el = h('input.input', { type, value: u[key] || '', oninput: (e) => { u[key] = e.target.value; } }); return h('div.field', h('label', label), el, hint ? h('div.hint', hint) : null); };
  const dep = h('select.input', { onchange: (e) => { u.departmentId = e.target.value; } }, h('option', { value: '' }, '— Không thuộc tổ —'), b.departments.map((d) => h('option', { value: d.id, selected: u.departmentId === d.id }, d.name)));
  const box = (arr, value, label) => h('label.check', h('input', { type: 'checkbox', checked: u[arr].includes(value), onchange: (e) => { u[arr] = e.target.checked ? [...new Set([...u[arr], value])] : u[arr].filter((x) => x !== value); permBox.hidden = !u.roles.includes('ADMIN'); } }), label);
  const permBox = h('div.card.tight', { hidden: !u.roles.includes('ADMIN') }, h('div.label', 'Quyền của quản trị viên phụ'), Object.entries(ADMIN_PERMS).map(([k, l]) => box('adminPerms', k, l)));
  page.append(h('section.card.stack',
    inp('fullName', 'Họ và tên'), inp('username', 'Tên đăng nhập', 'text', 'Chữ không dấu, số, dấu chấm. Ví dụ: nguyenvana'),
    inp('staffCode', 'Mã nhân viên'), inp('email', 'Email cá nhân', 'email', 'Dùng để tự khôi phục mật khẩu.'),
    inp('phone', 'Số điện thoại', 'tel'), inp('zaloPhone', 'Số Zalo (nếu có)', 'tel'), inp('positionTitle', 'Chức vụ'),
    h('div.field', h('label', 'Tổ chuyên môn'), dep)),
  h('section.card', h('h2', 'Điểm trường công tác'), b.campuses.map((c) => box('campusIds', c.id, c.name))),
  h('section.card', h('h2', 'Vai trò'), ROLES.map((r) => box('roles', r, roleName(r))), permBox));
  page.append(h('button.btn.primary.block', {
    onclick: async () => {
      const res = await busy('Đang lưu…', () => api(isNew ? 'users.create' : 'users.update', u, { write: true }));
      toast('Đã lưu tài khoản.', 'ok');
      if (isNew) { go('#/admin/users'); showTempPassword(res.user.fullName, res.user.username, res.tempPassword); } else { go('#/admin/users'); }
    }
  }, 'Lưu'));
  if (!isNew && !u.isPrimaryAdmin) {
    const act = async (label, action, payload, msg) => { if (!(await confirmSheet(label, msg, label, 'danger'))) return null; return busy('Đang xử lý…', () => api(action, { id: u.id, ...payload }, { write: true })); };
    page.append(h('section.card.stack', h('h2', 'Thao tác'),
      h('button.btn.outline.block', { onclick: async () => { const r = await act('Đặt lại mật khẩu', 'users.resetPassword', {}, 'Tạo mật khẩu tạm mới và đăng xuất mọi thiết bị của ' + u.fullName + '?'); if (r) showTempPassword(u.fullName, u.username, r.tempPassword); } }, 'Đặt lại mật khẩu'),
      h('button.btn.outline.block', { onclick: async () => { if (await act('Đăng xuất mọi thiết bị', 'users.revokeAll', {}, 'Đăng xuất ' + u.fullName + ' khỏi mọi thiết bị?')) toast('Đã đăng xuất.'); } }, 'Đăng xuất mọi thiết bị'),
      u.status === 'ACTIVE' ? h('button.btn.outline.block', { onclick: async () => { if (await act('Khóa tài khoản', 'users.setStatus', { status: 'LOCKED' }, 'Tạm khóa ' + u.fullName + '? Người này không đăng nhập được cho tới khi mở khóa.')) renderUserForm(id); } }, 'Khóa tài khoản')
        : h('button.btn.outline.block', { onclick: async () => { if (await act('Mở khóa', 'users.setStatus', { status: 'ACTIVE' }, 'Mở khóa cho ' + u.fullName + '?')) renderUserForm(id); } }, 'Mở khóa / kích hoạt lại'),
      u.status !== 'DISABLED' ? h('button.btn.danger.block', { onclick: async () => { if (await act('Vô hiệu hóa', 'users.setStatus', { status: 'DISABLED' }, 'Dùng khi nghỉ hưu hoặc chuyển trường. Tài khoản không đăng nhập được; đơn và hồ sơ cũ được giữ nguyên.')) renderUserForm(id); } }, 'Vô hiệu hóa (nghỉ hưu, chuyển trường)') : null));
  }
}

export function renderImport() {
  const page = layout('Nhập từ Excel', { back: '#/admin/users' });
  if (!guard(page, adminCan('users'))) return;
  let file = null;
  const out = h('div');
  const pick = h('input', { type: 'file', accept: '.xlsx,.xls,.csv', hidden: true, onchange: (e) => { file = e.target.files[0]; name.textContent = file ? file.name : ''; run(true); } });
  const name = h('span.small');
  const run = async (dryRun) => {
    if (!file) return;
    const b64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
    const rows = await busy(dryRun ? 'Đang kiểm tra…' : 'Đang tạo tài khoản…', () => api('users.import', { fileBase64: b64, fileName: file.name, dryRun }));
    const okN = rows.filter((r) => r.ok).length;
    clear(out, h('section.card.stack',
      h('h2', dryRun ? 'Kết quả kiểm tra' : 'Đã tạo ' + okN + ' tài khoản'),
      h('table.simple', h('tr', h('th', 'Dòng'), h('th', 'Họ tên'), h('th', dryRun ? 'Kết quả' : 'Mật khẩu tạm')),
        rows.map((r) => h('tr', h('td', String(r.line)), h('td', r.fullName + ' (' + r.username + ')'), h('td', { style: { color: r.ok ? 'var(--ok)' : 'var(--bad)' } }, r.ok ? (r.tempPassword || 'Hợp lệ') : r.error)))),
      dryRun && okN ? h('button.btn.primary.block', { onclick: () => run(false) }, 'Tạo ' + okN + ' tài khoản hợp lệ') : null,
      !dryRun && okN ? h('button.btn.outline.block', {
        onclick: () => {
          const csv = '﻿Họ tên,Tên đăng nhập,Mật khẩu tạm\n' + rows.filter((r) => r.ok).map((r) => [r.fullName, r.username, r.tempPassword].join(',')).join('\n');
          saveBytes(new TextEncoder().encode(csv), 'text/csv', 'mat_khau_tam.csv');
        }
      }, 'Tải danh sách mật khẩu tạm (CSV)') : null));
  };
  page.append(h('section.card.stack',
    h('p.small', 'Tệp Excel (.xlsx) hoặc CSV, dòng đầu là tiêu đề, các cột theo thứ tự:'),
    h('div.card.tight.small', 'Mã NV | Họ và tên | Tên đăng nhập | Email | Số điện thoại | Số Zalo | Chức vụ | Tổ chuyên môn | Điểm trường | Vai trò'),
    h('p.tiny', 'Nhiều điểm trường hoặc vai trò thì ngăn bằng dấu chấm phẩy, ví dụ "Phân hiệu 1; Phân hiệu 2". Vai trò: Giáo viên, Nhân viên, Tổ trưởng, PHT. Hiệu trưởng và quản trị viên tạo riêng.'),
    h('div.row', h('button.btn.outline', { onclick: () => pick.click() }, icon('file'), 'Chọn tệp'), name), pick), out);
}

/* ---------------- Tổ, điểm trường ---------------- */
export async function renderDepartments() {
  const page = layout('Tổ chuyên môn', { back: '#/admin' });
  if (!guard(page, adminCan('org'))) return;
  page.append(h('div.splash', h('div.spinner')));
  const [deps, users] = await Promise.all([api('org.departments.list'), api('users.options', {})]);
  const edit = (d) => sheet(d ? 'Sửa tổ' : 'Thêm tổ', (box, close) => {
    const name = h('input.input', { value: d ? d.name : '' });
    const leader = h('select.input', h('option', { value: '' }, '— Chưa có tổ trưởng —'), users.map((u) => h('option', { value: u.id, selected: d && d.leaderUserId === u.id }, u.fullName)));
    box.append(h('div.stack', h('div.field', h('label', 'Tên tổ'), name), h('div.field', h('label', 'Tổ trưởng'), leader),
      h('button.btn.primary.block', { onclick: async () => { await busy('Đang lưu…', () => api('org.departments.save', { id: d && d.id, name: name.value, leaderUserId: leader.value })); close(); await refreshBoot(); renderDepartments(); } }, 'Lưu'),
      d ? h('button.btn.danger.block', { onclick: async () => { if (!(await confirmSheet('Xóa tổ', 'Chỉ xóa được khi tổ không còn thành viên.', 'Xóa', 'danger'))) return; await busy('Đang xóa…', () => api('org.departments.delete', { id: d.id })); close(); await refreshBoot(); renderDepartments(); } }, 'Xóa tổ') : null));
  });
  page.replaceChildren(h('button.btn.primary.block', { onclick: () => edit(null) }, icon('plus'), 'Thêm tổ'),
    deps.length ? h('div.list', deps.map((d) => h('div.list-item', { onclick: () => edit(d) }, h('div.grow', h('div.title', d.name), h('div.sub', (d.leaderName ? 'Tổ trưởng: ' + d.leaderName + ' · ' : '') + d.memberCount + ' thành viên')), h('span.chev', icon('chev'))))) : h('div.empty', 'Chưa có tổ.'),
    h('p.tiny', 'Chuyển giáo viên sang tổ khác: vào Tài khoản → chọn người → đổi Tổ chuyên môn. Lịch sử công tác được ghi lại.'));
}

export function renderCampuses() {
  const page = layout('Điểm trường', { back: '#/admin' });
  if (!guard(page, adminCan('org'))) return;
  state.boot.campuses.forEach((c) => {
    const name = h('input.input', { value: c.name }), short = h('input.input', { value: c.shortName || '' });
    page.append(h('section.card.stack', h('div.field', h('label', 'Tên điểm trường'), name), h('div.field', h('label', 'Tên viết tắt'), short),
      h('button.btn.outline.block', { onclick: async () => { await busy('Đang lưu…', () => api('org.campuses.update', { id: c.id, name: name.value, shortName: short.value })); await refreshBoot(); toast('Đã lưu.', 'ok'); } }, 'Lưu')));
  });
}

/* ---------------- Quỹ phép ---------------- */
export async function renderBalances() {
  const page = layout('Quỹ phép năm', { back: '#/admin' });
  if (!guard(page, adminCan('balance') || has('PRINCIPAL'))) return;
  page.append(h('div.splash', h('div.spinner')));
  const rows = await api('balance.list', {});
  const all = h('input.input', { type: 'number', min: '0', max: '60', step: '0.5', placeholder: 'Số ngày' });
  page.replaceChildren(
    h('p.small.muted', 'Năm học ' + (state.boot.year ? state.boot.year.name : '') + '. Nhập số ngày phép được cấp theo quy định. Hệ thống tự trừ khi đơn Nghỉ phép năm được duyệt.'),
    h('section.card.stack', h('div.label', 'Đặt nhanh cho những người chưa có'), h('div.row', h('div.grow', all), h('button.btn.outline', {
      onclick: async () => {
        const v = Number(all.value); if (!(v >= 0)) return;
        const todo = rows.filter((r) => !r.set);
        await busy('Đang lưu…', async (say) => { for (let i = 0; i < todo.length; i++) { say('Đang lưu ' + (i + 1) + '/' + todo.length); await api('balance.set', { userId: todo[i].userId, granted: v }); } });
        renderBalances();
      }
    }, 'Áp dụng'))),
    h('div.list', rows.map((r) => {
      const input = h('input.input', { type: 'number', min: '0', max: '60', step: '0.5', value: r.set ? String(r.granted) : '', style: { width: '90px', minHeight: '40px' } });
      return h('div.list-item', h('div.grow', h('div.title', r.fullName), h('div.sub', r.set ? 'Đã dùng ' + r.used + ' · còn ' + r.remaining : 'Chưa nhập')),
        input, h('button.btn.sm.outline', { onclick: async () => { await busy('Đang lưu…', () => api('balance.set', { userId: r.userId, granted: Number(input.value) })); toast('Đã lưu ' + r.fullName, 'ok'); } }, 'Lưu'));
    })));
}

/* ---------------- Cấu hình ---------------- */
export async function renderSettings() {
  const page = layout('Cấu hình', { back: '#/admin' });
  if (!guard(page, adminCan('settings'))) return;
  page.append(h('div.splash', h('div.spinner')));
  const s = await api('settings.get');
  const primary = state.boot.user.isPrimaryAdmin;
  const vals = { ...s };
  const inp = (k, label, hint, type = 'text') => h('div.field', h('label', label), h('input.input', { type, value: s[k] || '', oninput: (e) => { vals[k] = e.target.value; } }), hint ? h('div.hint', hint) : null);
  const mode = h('select.input', { disabled: !primary, onchange: (e) => { vals.SIGN_MODE = e.target.value; } },
    [['NONE', 'Chưa bật (không ai ký được)'], ['IMAGE', 'Ảnh chữ ký – xác nhận nội bộ'], ['SMARTCA', 'SmartCA (cần tài khoản tích hợp VNPT)']].map(([v, l]) => h('option', { value: v, selected: s.SIGN_MODE === v }, l)));
  page.replaceChildren(
    s.env === 'DEMO' ? h('div.alert.warn', 'Đang cấu hình môi trường DEMO.') : null,
    h('section.card.stack', h('h2', 'Thông tin trường'),
      inp('SCHOOL_PARENT', 'Cơ quan chủ quản', 'Ví dụ: UBND xã …'), inp('SCHOOL_NAME', 'Tên trường'), inp('SCHOOL_PLACE', 'Địa danh ghi trên đơn', 'Ví dụ: Nghĩa Lộc')),
    h('section.card.stack', h('h2', 'Chế độ ký'), mode,
      h('div.hint', 'Đặc tả: SmartCA là phương án ưu tiên. Chỉ chuyển sang ảnh chữ ký khi đã xác định SmartCA không khả thi. PDF luôn ghi rõ "xác nhận nội bộ bằng ảnh chữ ký – không phải chữ ký số".'),
      !primary ? h('div.tiny', 'Chỉ quản trị viên chính đổi được chế độ ký.') : null),
    h('section.card.stack', h('h2', 'Hệ thống'),
      inp('FRONTEND_URL', 'Địa chỉ giao diện (GitHub Pages)', 'Dùng trong liên kết email, ví dụ https://tentaikhoan.github.io/donnghi/'),
      inp('SESSION_IDLE_DAYS', 'Tự đăng xuất sau (ngày không dùng)', '', 'number'),
      inp('LOGIN_MAX_FAIL', 'Số lần nhập sai tối đa', '', 'number'), inp('LOGIN_LOCK_MINUTES', 'Khóa tạm (phút)', '', 'number'),
      inp('REMIND_HOURS', 'Nhắc HT khi đơn chờ quá (giờ)', 'Ngăn bởi dấu phẩy, ví dụ 4,12,24,48'),
      s.env === 'DEMO' ? inp('EMAIL_TEST_WHITELIST', 'Email nhận thử (DEMO)', 'Môi trường DEMO chỉ gửi email tới các địa chỉ này, ngăn bởi dấu phẩy.') : null),
    h('button.btn.primary.block', {
      onclick: async () => {
        await busy('Đang lưu…', () => api('settings.update', vals, { write: true }));
        await refreshBoot(); toast('Đã lưu cấu hình.', 'ok');
      }
    }, 'Lưu cấu hình'));
  // Logo, con dấu, mẫu đơn
  const logoPick = h('input', { type: 'file', accept: 'image/png,image/jpeg', hidden: true, onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    await busy('Đang tải logo…', async () => api('settings.uploadImage', { kind: 'logo', dataBase64: bytesToBase64(new Uint8Array(await f.arrayBuffer())) }));
    toast('Đã cập nhật logo.', 'ok');
  } });
  const stampCard = h('section.card.stack', h('h2', 'Con dấu ' + (s.hasStamp ? '(đã có)' : '(chưa có)')),
    h('p.tiny', 'Ảnh con dấu chỉ là hình ảnh hiển thị trên PDF, không phải con dấu điện tử.'));
  mountSignatureTool(stampCard, async (png) => {
    await busy('Đang lưu con dấu…', () => api('settings.uploadImage', { kind: 'stamp', dataBase64: bytesToBase64(png) }));
    toast('Đã lưu ảnh con dấu.', 'ok');
  }, { forStamp: true });
  page.append(
    h('section.card.stack', h('h2', 'Logo trường ' + (s.hasLogo ? '(đã có)' : '(chưa có)')), h('button.btn.outline.block', { onclick: () => logoPick.click() }, 'Chọn ảnh logo'), logoPick),
    stampCard,
    h('section.card.stack', h('h2', 'Mẫu đơn'), h('p.tiny', 'Xem thử mẫu đơn với dữ liệu giả, chữ ký và con dấu hiện tại.'),
      h('button.btn.outline.block', { onclick: async () => { const r = await busy('Đang tạo PDF…', () => api('templates.preview')); const bin = atob(r.dataBase64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); openBytes(bytes, 'application/pdf', r.fileName); } }, icon('eye'), 'Xem thử mẫu đơn')));
}

export async function renderAudit() {
  const page = layout('Nhật ký hệ thống', { back: '#/admin' });
  if (!guard(page, state.boot.user.isPrimaryAdmin)) return;
  const check = h('div');
  page.append(h('button.btn.outline.block', {
    onclick: async () => {
      const r = await busy('Đang kiểm tra…', () => api('audit.verify'));
      clear(check, r.problems.length ? h('div.alert.bad', 'Phát hiện ' + r.problems.length + ' dòng bất thường: ' + r.problems.slice(0, 5).map((p) => 'dòng ' + p.row + ' – ' + p.issue).join('; '))
        : h('div.alert.ok', 'Nhật ký nguyên vẹn (' + r.total + ' dòng).'));
    }
  }, icon('shield'), 'Kiểm tra toàn vẹn nhật ký'), check);
  const rows = await api('audit.list', { limit: 200 });
  page.append(h('div.list', rows.map((r) => h('div.list-item', h('div.grow', h('div.title', r.action), h('div.tiny', viDateTime(r.at) + ' · ' + r.actor + (r.entityId ? ' · ' + r.entityId : '')))))));
}

/* ---------------- Ủy quyền (Hiệu trưởng) ---------------- */
export async function renderDelegation() {
  const page = layout('Ủy quyền duyệt đơn', { back: '#/' });
  if (!guard(page, has('PRINCIPAL') || has('VICE'))) return;
  page.append(h('div.splash', h('div.spinner')));
  const list = await api('delegation.list');
  page.replaceChildren();
  if (has('PRINCIPAL')) {
    const vices = await api('users.options', { role: 'VICE' });
    const p = (n) => String(n).padStart(2, '0');
    const local = (d) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    const now = new Date();
    const vice = h('select.input', h('option', { value: '' }, '— Chọn Phó Hiệu trưởng —'), vices.map((v) => h('option', { value: v.id }, v.fullName)));
    const start = h('input.input', { type: 'datetime-local', value: local(now) });
    const end = h('input.input', { type: 'datetime-local', value: local(new Date(now.getTime() + 3 * 86400000)) });
    page.append(h('section.card.stack', h('h2', 'Ủy quyền mới'),
      h('div.field', h('label', 'Người được ủy quyền'), vice), h('div.field', h('label', 'Từ'), start), h('div.field', h('label', 'Đến'), end),
      h('p.tiny', 'Trong thời gian ủy quyền, PHT được duyệt, từ chối, yêu cầu bổ sung và ký duyệt bằng chữ ký của chính mình (ghi "KT. Hiệu trưởng"). PHT không tự duyệt đơn của mình và không hủy được đơn đã duyệt. Hiệu trưởng vẫn duyệt được bình thường.'),
      h('button.btn.primary.block', {
        onclick: async () => {
          if (!vice.value) { toast('Chọn Phó Hiệu trưởng.', 'bad'); return; }
          await busy('Đang lưu…', () => api('delegation.create', { viceId: vice.value, startAt: new Date(start.value).toISOString(), endAt: new Date(end.value).toISOString() }, { write: true }));
          await refreshBoot(); toast('Đã ủy quyền.', 'ok'); renderDelegation();
        }
      }, 'Ủy quyền')));
  }
  page.append(h('h2', 'Lịch sử ủy quyền'), list.length ? h('div.list', list.map((d) => h('div.list-item', h('div.grow',
    h('div.title', d.viceName + (d.effective ? ' · đang hiệu lực' : d.upcoming ? ' · sắp tới' : '')),
    h('div.tiny', viDateTime(d.startAt) + ' → ' + viDateTime(d.endAt) + (d.status === 'ENDED' ? ' · đã kết thúc sớm' : ''))),
  has('PRINCIPAL') && d.status === 'ACTIVE' && (d.effective || d.upcoming) ? h('button.btn.sm.outline', {
    onclick: async () => { if (!(await confirmSheet('Kết thúc ủy quyền', 'Kết thúc ủy quyền cho ' + d.viceName + ' ngay bây giờ?', 'Kết thúc', 'danger'))) return; await busy('Đang xử lý…', () => api('delegation.end', { id: d.id }, { write: true })); await refreshBoot(); renderDelegation(); }
  }, 'Kết thúc') : null))) : h('div.empty', 'Chưa có ủy quyền.'));
}
