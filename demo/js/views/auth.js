// Đăng nhập, quên mật khẩu, đặt lại mật khẩu, đổi mật khẩu (bắt buộc lần đầu).
import { api, auth, swrClear, swrPut } from '../api.js';
import { h, clear, toast, busy } from '../ui.js';
import { state, route, layout, go, refreshBoot, applyTheme } from '../app.js';
import { installCard, inAppBrowser } from '../install.js';

const app = () => document.getElementById('app');
let bootInfo = null;

async function header() {
  if (!bootInfo) { try { bootInfo = await api('app.bootstrap'); } catch (e) { bootInfo = {}; } }
  return h('div.auth-title',
    bootInfo.logo ? h('img.auth-logo', { src: bootInfo.logo, alt: 'Logo trường' }) : null,
    h('h1', 'Đơn xin nghỉ trực tuyến'),
    h('p', bootInfo.schoolName || ''));
}

function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Thiết bị';
  const br = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : /Firefox/.test(ua) ? 'Firefox' : '';
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  return `${os} · ${br}${standalone ? ' (ứng dụng)' : ''}`;
}

export async function renderLogin() {
  const wrap = h('div.auth-wrap', h('div.splash', h('div.spinner')));
  clear(app(), wrap);
  const user = h('input.input', { autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true });
  const pass = h('input.input', { type: 'password', autocomplete: 'current-password', required: true });
  const err = h('div.alert.bad', { hidden: true });
  const btn = h('button.btn.primary.block', { type: 'submit' }, 'Đăng nhập');
  const form = h('form.card.stack', {
    onsubmit: async (e) => {
      e.preventDefault();
      err.hidden = true; btn.disabled = true; btn.textContent = 'Đang đăng nhập…';
      try {
        const r = await api('auth.login', { username: user.value.trim(), password: pass.value, deviceLabel: deviceLabel(), userAgent: navigator.userAgent });
        swrClear();
        auth.token = r.token;
        state.boot = r.boot || null;
        if (state.boot) swrPut('me.bootstrap', {}, state.boot);
        if (state.boot) applyTheme(state.boot.user.themePref);
        if (location.hash.startsWith('#/reset') || location.hash === '#/forgot') location.hash = '#/';
        await route();
      } catch (ex) {
        err.textContent = ex.message; err.hidden = false;
        btn.disabled = false; btn.textContent = 'Đăng nhập';
      }
    }
  },
  h('div.field', h('label', 'Tên đăng nhập'), user),
  h('div.field', h('label', 'Mật khẩu'), pass),
  err, btn,
  h('a.btn.ghost.block', { href: '#/forgot' }, 'Quên mật khẩu?'));
  clear(wrap, await header(), installCard({ compact: true }), form,
    h('p.tiny', { style: { textAlign: 'center', marginTop: '16px' } }, 'Tài khoản do quản trị viên nhà trường cấp.'));
  if (!inAppBrowser()) user.focus();
}

export async function renderForgot() {
  const wrap = h('div.auth-wrap');
  clear(app(), wrap);
  const user = h('input.input', { autocapitalize: 'none', autocomplete: 'username' });
  const msg = h('div.alert.info', { hidden: true });
  clear(wrap, await header(), h('form.card.stack', {
    onsubmit: async (e) => {
      e.preventDefault();
      if (!user.value.trim()) return;
      const r = await busy('Đang gửi…', () => api('auth.requestReset', { username: user.value.trim() }));
      msg.textContent = r.message; msg.hidden = false;
    }
  },
  h('h2', 'Quên mật khẩu'),
  h('p.muted.small', 'Nhập tên đăng nhập. Hệ thống gửi liên kết đặt lại mật khẩu tới email bạn đã đăng ký với nhà trường.'),
  h('div.field', h('label', 'Tên đăng nhập'), user), msg,
  h('button.btn.primary.block', { type: 'submit' }, 'Gửi liên kết'),
  h('a.btn.ghost.block', { href: '#/' }, 'Quay lại đăng nhập'),
  h('p.tiny', 'Chưa đăng ký email? Liên hệ quản trị viên để đặt lại mật khẩu.')));
}

function passwordFields() {
  const p1 = h('input.input', { type: 'password', autocomplete: 'new-password' });
  const p2 = h('input.input', { type: 'password', autocomplete: 'new-password' });
  const check = () => {
    const v = p1.value;
    if (v.length < 8 || !/[A-Za-z]/.test(v) || !/[0-9]/.test(v)) return 'Mật khẩu cần tối thiểu 8 ký tự, có cả chữ và số.';
    if (v !== p2.value) return 'Hai lần nhập mật khẩu không khớp.';
    return '';
  };
  return { p1, p2, check, nodes: [h('div.field', h('label', 'Mật khẩu mới'), p1, h('div.hint', 'Tối thiểu 8 ký tự, có cả chữ và số.')), h('div.field', h('label', 'Nhập lại mật khẩu mới'), p2)] };
}

export async function renderReset(token) {
  const wrap = h('div.auth-wrap');
  clear(app(), wrap);
  const f = passwordFields();
  const err = h('div.alert.bad', { hidden: true });
  clear(wrap, await header(), h('form.card.stack', {
    onsubmit: async (e) => {
      e.preventDefault();
      const c = f.check(); if (c) { err.textContent = c; err.hidden = false; return; }
      try {
        const r = await busy('Đang lưu…', () => api('auth.confirmReset', { token, newPassword: f.p1.value }));
        toast(r.message, 'ok');
        location.hash = '#/';
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    }
  }, h('h2', 'Đặt mật khẩu mới'), ...f.nodes, err, h('button.btn.primary.block', { type: 'submit' }, 'Lưu mật khẩu')));
}

export function renderChangePassword(forced) {
  const page = forced ? (clear(app(), h('div.auth-wrap')), app().firstChild) : layout('Đổi mật khẩu', { back: '#/profile' });
  const old = h('input.input', { type: 'password', autocomplete: 'current-password' });
  const f = passwordFields();
  const err = h('div.alert.bad', { hidden: true });
  page.append(h('form.card.stack', {
    onsubmit: async (e) => {
      e.preventDefault();
      const c = f.check(); if (c) { err.textContent = c; err.hidden = false; return; }
      try {
        await busy('Đang lưu…', () => api('auth.changePassword', { oldPassword: old.value, newPassword: f.p1.value }, { write: true }));
        toast('Đã đổi mật khẩu. Các thiết bị khác đã được đăng xuất.', 'ok');
        await refreshBoot();
        go('#/');
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    }
  },
  h('h2', forced ? 'Đổi mật khẩu lần đầu' : 'Đổi mật khẩu'),
  forced ? h('p.muted.small', 'Vì lý do bảo mật, bạn cần đổi mật khẩu tạm do quản trị viên cấp trước khi sử dụng.') : null,
  h('div.field', h('label', forced ? 'Mật khẩu tạm' : 'Mật khẩu hiện tại'), old), ...f.nodes, err,
  h('button.btn.primary.block', { type: 'submit' }, 'Lưu mật khẩu'),
  forced ? h('button.btn.ghost.block', { type: 'button', onclick: () => { const t = auth.token; swrClear(); auth.token = ''; state.boot = null; if (t) api('auth.logout', {}, { token: t }).catch(() => {}); route(); } }, 'Đăng xuất') : null));
}
