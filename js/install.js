// Cài ứng dụng lên màn hình chính (PWA): nút Cài đặt trên Android/máy tính, hướng dẫn từng bước cho iPhone và khi đang mở trong Zalo.
import { h, sheet, toast, icon } from './ui.js';

let deferred = null;
const listeners = new Set();
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; listeners.forEach((f) => f()); });
window.addEventListener('appinstalled', () => { deferred = null; try { localStorage.setItem('dn_installed', '1'); } catch (x) { /* bỏ qua */ } listeners.forEach((f) => f()); toast('Đã cài ứng dụng. Biểu tượng "Đơn nghỉ" đã có trên màn hình chính.', 'ok'); });

export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const ua = navigator.userAgent || '';
export const isIOS = () => /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isAndroid = () => /Android/i.test(ua);
export const inAppBrowser = () => (/Zalo/i.test(ua) ? 'Zalo' : /FBAN|FBAV|FB_IAB/i.test(ua) ? 'Facebook' : /Messenger/i.test(ua) ? 'Messenger' : '');

const appUrl = () => location.origin + location.pathname;
const step = (n, ...content) => h('li.install-step', h('span.install-num', String(n)), h('div', ...content));

export function showInstallHelp() {
  const inApp = inAppBrowser();
  sheet('Cài ứng dụng lên điện thoại', (box, close) => {
    box.append(h('div.install-head', h('img', { src: 'icons/icon-192.png', alt: '', width: 56, height: 56 }),
      h('div', h('b', 'Đơn nghỉ'), h('div.tiny', 'Cài một lần, sau đó mở bằng biểu tượng trên màn hình như các ứng dụng khác. Miễn phí, không cần CH Play hay App Store.'))));
    let steps;
    if (inApp) {
      steps = [
        step(1, 'Bạn đang mở trong ', h('b', inApp), '. Ứng dụng trong ' + inApp + ' không cài được.'),
        step(2, 'Bấm nút ', h('b', '⋯'), ' hoặc ', h('b', '⋮'), ' ở góc trên bên phải → chọn ', h('b', isIOS() ? 'Mở bằng Safari' : 'Mở bằng trình duyệt'), '.'),
        step(3, 'Trang mở trong ', h('b', isIOS() ? 'Safari' : 'Chrome'), ', bấm lại nút ', h('b', 'Cài ứng dụng'), ' trên trang đăng nhập.')];
    } else if (isIOS()) {
      steps = [
        step(1, 'Mở trang này bằng ', h('b', 'Safari'), ' (trình duyệt la bàn màu xanh).'),
        step(2, 'Bấm nút ', h('b', 'Chia sẻ'), ' ', h('span.install-ico', '⬆'), ' (ô vuông có mũi tên lên) ở thanh dưới cùng hoặc cạnh ô địa chỉ.'),
        step(3, 'Kéo xuống, chọn ', h('b', 'Thêm vào MH chính'), ' (Add to Home Screen).'),
        step(4, 'Bấm ', h('b', 'Thêm'), ' ở góc trên bên phải. Biểu tượng ', h('b', 'Đơn nghỉ'), ' hiện trên màn hình chính.')];
    } else if (isAndroid()) {
      steps = [
        step(1, 'Mở trang này bằng ', h('b', 'Chrome'), '.'),
        step(2, 'Bấm nút ', h('b', '⋮'), ' ở góc trên bên phải.'),
        step(3, 'Chọn ', h('b', 'Cài đặt ứng dụng'), ' (hoặc ', h('b', 'Thêm vào màn hình chính'), ') → ', h('b', 'Cài đặt'), '.')];
    } else {
      steps = [
        step(1, 'Trên máy tính dùng Chrome hoặc Edge: bấm biểu tượng ', h('b', 'Cài đặt'), ' ở cuối ô địa chỉ, hoặc menu ⋮ → ', h('b', 'Cài đặt Đơn nghỉ'), '.'),
        step(2, 'Trên điện thoại: mở địa chỉ dưới đây rồi làm theo hướng dẫn trên trang.')];
    }
    box.append(h('ol.install-steps', steps),
      h('div.field', h('label.tiny', 'Địa chỉ ứng dụng'), h('div.row', h('input.input', { value: appUrl(), readonly: true, onclick: (e) => e.target.select() }),
        h('button.btn.outline.sm', { type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(appUrl()); toast('Đã sao chép địa chỉ.', 'ok'); } catch (e) { toast('Chạm giữ vào ô địa chỉ để sao chép.'); } } }, 'Sao chép'))),
      h('button.btn.primary.block', { onclick: close, style: { marginTop: '10px' } }, 'Đã hiểu'));
  });
}

export async function installNow() {
  if (deferred) {
    deferred.prompt();
    const r = await deferred.userChoice.catch(() => null);
    deferred = null;
    if (r && r.outcome === 'accepted') return true;
    return false;
  }
  showInstallHelp();
  return false;
}

/** Thẻ mời cài ứng dụng (ẩn khi đã cài hoặc người dùng bấm Để sau trong 7 ngày). */
export function installCard({ compact = false } = {}) {
  if (isStandalone()) return null;
  try { const t = Number(localStorage.getItem('dn_install_later') || 0); if (!compact && Date.now() - t < 7 * 86400000) return null; } catch (e) { /* bỏ qua */ }
  const card = h('section.card.install-card',
    h('img', { src: 'icons/icon-192.png', alt: '', width: 48, height: 48 }),
    h('div.grow', h('b', 'Cài ứng dụng lên điện thoại'), h('div.tiny', 'Có biểu tượng trên màn hình, mở nhanh như ứng dụng thường.')),
    h('div.install-actions',
      h('button.btn.primary.sm', { type: 'button', onclick: async () => { if (await installNow()) card.remove(); } }, icon('download'), 'Cài'),
      compact ? null : h('button.btn.ghost.sm', { type: 'button', onclick: () => { try { localStorage.setItem('dn_install_later', String(Date.now())); } catch (e) { /* bỏ qua */ } card.remove(); } }, 'Để sau')));
  return card;
}
