// Khung ứng dụng: trạng thái, định tuyến theo #hash, thanh điều hướng dưới theo vai trò, giao diện sáng/tối.
import { api, auth, setAuthHandlers } from './api.js';
import { h, clear, icon, toast } from './ui.js';
import { ENV, API_URL } from './config.js';
import * as Auth from './views/auth.js';
import * as Home from './views/home.js';
import * as LeaveForm from './views/leaveForm.js';
import * as LeaveDetail from './views/leaveDetail.js';
import * as Lists from './views/lists.js';
import * as Profile from './views/profile.js';
import * as Admin from './views/admin.js';

export const state = { boot: null };
const app = () => document.getElementById('app');

export function has(role) { return !!(state.boot && state.boot.user.roles.includes(role)); }
export const isManager = () => has('PRINCIPAL') || has('VICE') || has('LEADER');
export const isAdmin = () => has('ADMIN');
export function adminCan(perm) { const u = state.boot && state.boot.user; return !!u && u.roles.includes('ADMIN') && (u.isPrimaryAdmin || u.adminPerms.includes(perm)); }

/* ---------------- Giao diện sáng/tối ---------------- */
export function applyTheme(pref) {
  const p = pref || (state.boot && state.boot.user.themePref) || localStorage.getItem('dn_theme') || 'auto';
  try { localStorage.setItem('dn_theme', p); } catch (e) { /* bỏ qua */ }
  const dark = p === 'dark' || (p === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name=theme-color]').setAttribute('content', dark ? '#0b1220' : '#1d4ed8');
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme());

/* ---------------- Khung trang ---------------- */
function navItems() {
  const b = state.boot;
  const items = [{ href: '#/', label: 'Trang chủ', ic: 'home' }];
  if (b.canDecide) items.push({ href: '#/approvals', label: 'Duyệt đơn', ic: 'check', badge: 'pending' });
  if (b.canSubmit) items.push({ href: '#/new', label: 'Tạo đơn', ic: 'plus', fab: true });
  if (b.canSubmit) items.push({ href: '#/mine', label: 'Đơn của tôi', ic: 'list' });
  if (isManager()) items.push({ href: '#/school', label: 'Toàn trường', ic: 'school' });
  if (!b.canSubmit && !isManager() && isAdmin()) {
    if (adminCan('users')) items.push({ href: '#/admin/users', label: 'Tài khoản', ic: 'users' });
    items.push({ href: '#/admin', label: 'Quản trị', ic: 'settings' });
  }
  items.push({ href: '#/notifications', label: 'Thông báo', ic: 'bell', badge: 'unread' });
  return items.slice(0, 5);
}

/**
 * Dựng một trang: tiêu đề, nút quay lại (tùy chọn), nội dung, thanh dưới.
 * Trả về phần tử .page để view đổ nội dung vào.
 */
export function layout(title, opts = {}) {
  const top = h('header.topbar',
    opts.back ? h('button.icon-btn', { 'aria-label': 'Quay lại', onclick: () => (history.length > 1 ? history.back() : go(opts.back)) }, icon('back')) : null,
    h('h1', title),
    opts.actions || null,
    state.boot ? h('a.icon-btn', { href: '#/profile', 'aria-label': 'Cá nhân' }, icon('user')) : null);
  const page = h('main.page' + (opts.action ? '.has-action' : ''));
  const parts = [top, page];
  if (state.boot && !opts.noNav) {
    const cur = location.hash || '#/';
    const nav = h('nav.bottom-nav', navItems().map((it) => {
      const active = it.href === '#/' ? cur === '#/' || cur === '' : cur.startsWith(it.href);
      const badgeVal = it.badge === 'unread' ? state.boot.unread : it.badge === 'pending' ? state.boot.pendingCount : 0;
      return h('a' + (active ? '.active' : '') + (it.fab ? '.fab' : ''), { href: it.href },
        icon(it.ic), h('span', it.label), badgeVal ? h('span.badge-dot', badgeVal > 99 ? '99+' : String(badgeVal)) : null);
    }));
    parts.push(nav);
  } else {
    page.classList.add('no-nav');
  }
  clear(app(), ...parts);
  window.scrollTo(0, 0);
  return page;
}

/** Cập nhật số trên biểu tượng Thông báo / Duyệt đơn mà không dựng lại trang. */
export function updateBadges() {
  const set = (href, n) => {
    const a = document.querySelector('.bottom-nav a[href="' + href + '"]');
    if (!a) return;
    let b = a.querySelector('.badge-dot');
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = h('span.badge-dot'); a.appendChild(b); }
    b.textContent = n > 99 ? '99+' : String(n);
  };
  set('#/notifications', state.boot.unread);
  set('#/approvals', state.boot.pendingCount);
}

export function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }

/* ---------------- Khởi động và định tuyến ---------------- */
export async function refreshBoot() {
  state.boot = await api('me.bootstrap');
  applyTheme(state.boot.user.themePref);
  if (state.boot.canDecide) {
    try { state.boot.pendingCount = (await api('leave.pending')).length; } catch (e) { state.boot.pendingCount = 0; }
  }
  return state.boot;
}

const ROUTES = [
  [/^#?\/?$/, () => Home.render()],
  [/^#\/new$/, () => LeaveForm.render(null)],
  [/^#\/edit\/(\w+)$/, (m) => LeaveForm.render(m[1])],
  [/^#\/leave\/(\w+)$/, (m) => LeaveDetail.render(m[1])],
  [/^#\/mine$/, () => Lists.renderMine()],
  [/^#\/approvals$/, () => Lists.renderApprovals()],
  [/^#\/school$/, () => Lists.renderSchool()],
  [/^#\/notifications$/, () => Lists.renderNotifications()],
  [/^#\/profile$/, () => Profile.render()],
  [/^#\/signature$/, () => Profile.renderSignature()],
  [/^#\/sessions$/, () => Profile.renderSessions()],
  [/^#\/balance$/, () => Profile.renderSessions()],
  [/^#\/password$/, () => Auth.renderChangePassword(false)],
  [/^#\/delegation$/, () => Admin.renderDelegation()],
  [/^#\/admin$/, () => Admin.renderMenu()],
  [/^#\/admin\/users$/, () => Admin.renderUsers()],
  [/^#\/admin\/user\/(\w+)$/, (m) => Admin.renderUserForm(m[1])],
  [/^#\/admin\/import$/, () => Admin.renderImport()],
  [/^#\/admin\/departments$/, () => Admin.renderDepartments()],
  [/^#\/admin\/campuses$/, () => Admin.renderCampuses()],
  [/^#\/admin\/balances$/, () => Admin.renderBalances()],
  [/^#\/admin\/settings$/, () => Admin.renderSettings()],
  [/^#\/admin\/audit$/, () => Admin.renderAudit()]
];

export async function route() {
  const hash = location.hash || '#/';
  if (hash.startsWith('#/reset')) return Auth.renderReset(new URLSearchParams(hash.split('?')[1] || '').get('t'));
  if (hash === '#/forgot') return Auth.renderForgot();
  if (!auth.token) return Auth.renderLogin();
  try {
    if (!state.boot) await refreshBoot();
  } catch (e) {
    if (!auth.token) return Auth.renderLogin();
    return renderFatal(e.message);
  }
  if (state.boot.user.mustChangePassword) return Auth.renderChangePassword(true);
  for (const [re, fn] of ROUTES) {
    const m = re.exec(hash);
    if (m) {
      try { await fn(m); } catch (e) { if (e && e.code !== 'AUTH') renderFatal(e.message); }
      return;
    }
  }
  go('#/');
}

function renderFatal(msg) {
  const page = layout('Có lỗi', { back: '#/' });
  page.append(h('div.alert.bad', msg), h('button.btn.primary.block', { onclick: () => { state.boot = null; route(); } }, 'Thử lại'));
}

setAuthHandlers((msg) => {
  state.boot = null;
  toast(msg || 'Phiên đăng nhập đã hết.', 'bad');
  Auth.renderLogin();
}, () => { if (state.boot) state.boot.user.mustChangePassword = true; Auth.renderChangePassword(true); });

window.addEventListener('hashchange', route);

/* ---------------- Khởi chạy ---------------- */
applyTheme();
if (ENV === 'DEMO') { const b = document.getElementById('env-banner'); b.textContent = 'MÔI TRƯỜNG THỬ NGHIỆM – DỮ LIỆU MẪU'; b.hidden = false; }
if (!API_URL) {
  clear(app(), h('div.auth-wrap', h('div.alert.warn', 'Chưa cấu hình địa chỉ máy chủ. Quản trị viên cần dán URL ứng dụng web Apps Script vào tệp js/config.js.')));
} else {
  route();
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw && nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          const bar = h('div.toast', { style: { cursor: 'pointer' } }, 'Có phiên bản mới – chạm để tải lại');
          bar.addEventListener('click', () => { nw.postMessage('skipWaiting'); location.reload(); });
          (document.querySelector('.toast-wrap') || document.body.appendChild(h('div.toast-wrap'))).appendChild(bar);
        }
      });
    });
  }).catch(() => { /* trình duyệt không hỗ trợ: vẫn dùng bình thường */ });
}
