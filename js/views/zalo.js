// Gửi đơn qua Zalo thường (miễn phí): sao chép tin soạn sẵn kèm link xem đơn, người dùng dán vào Zalo của mình.
// Hệ thống không tự gửi Zalo (muốn tự gửi phải có Zalo OA trả phí).
import { h, sheet, toast, icon } from '../ui.js';
import { state } from '../app.js';

const appLink = (id) => location.origin + location.pathname + '#/leave/' + id;
const vi = (s) => String(s || '').trim();

function who(L) {
  const s = L.snapshot || {};
  return vi(L.fullName) + ([s.positionTitle, L.departmentName].filter(Boolean).length ? ' (' + [s.positionTitle, L.departmentName].filter(Boolean).join(', ') + ')' : '');
}

/** Tin giáo viên báo Hiệu trưởng sau khi gửi đơn. */
export function msgSubmitted(L) {
  return 'Kính gửi Hiệu trưởng,\n' +
    'Tôi là ' + who(L) + ' xin ' + vi(L.typeName).toLowerCase().replace(/^nghỉ /, 'nghỉ ') + (L.otherNote ? ' – ' + vi(L.otherNote) : '') + ': ' + vi(L.period) +
    (L.days ? ' (' + String(L.days).replace('.', ',') + ' ngày)' : '') + '.\n' +
    (L.campusNames && L.campusNames.length ? 'Điểm trường liên quan: ' + L.campusNames.join(', ') + '.\n' : '') +
    'Đơn ' + vi(L.code) + ' đã gửi trên hệ thống, kính mong Hiệu trưởng xem xét, duyệt:\n' + appLink(L.id);
}

/** Tin Hiệu trưởng báo nhóm PHT – tổ trưởng sau khi duyệt, để phân công dạy thay. */
export function msgApproved(L) {
  return '[ĐƠN NGHỈ ĐÃ DUYỆT – ' + vi(L.code) + ']\n' +
    who(L) + ' – ' + vi(L.typeName) + (L.otherNote ? ' (' + vi(L.otherNote) + ')' : '') + ': ' + vi(L.period) +
    (L.days ? ' (' + String(L.days).replace('.', ',') + ' ngày)' : '') + '.\n' +
    (L.campusNames && L.campusNames.length ? 'Điểm trường: ' + L.campusNames.join(', ') + '.\n' : '') +
    'Kính báo các đồng chí Phó Hiệu trưởng, tổ trưởng để bố trí dạy thay, trực thay.\n' +
    'Xem đơn: ' + appLink(L.id);
}

/**
 * Sao chép tin (kèm link xem đơn) để dán vào Zalo thường. Hệ thống không tự gửi Zalo.
 * Luôn hiện ô xác nhận có sẵn nội dung; trên điện thoại có thêm nút Chia sẻ để chọn thẳng Zalo.
 */
export async function copyForZalo(text, toWhom) {
  let copied = false;
  try { await navigator.clipboard.writeText(text); copied = true; } catch (e) { /* trình duyệt không cho chép tự động */ }
  sheet(copied ? 'Đã sao chép đơn' : 'Sao chép đơn', (box, close) => {
    const ta = h('textarea.input', { rows: 9, readonly: true }, text);
    box.append(
      h('div.alert.' + (copied ? 'ok' : 'info'), copied
        ? 'Đã sao chép. Mở Zalo → chọn ' + toWhom + ' → chạm giữ vào ô nhập tin → Dán → Gửi.'
        : 'Chạm giữ vào đoạn dưới đây → Chọn tất cả → Sao chép, rồi dán vào Zalo gửi ' + toWhom + '.'),
      ta,
      h('div.tiny', { style: { margin: '6px 0' } }, 'Người nhận bấm vào đường link trong tin để mở đơn trên hệ thống (cần đăng nhập).'),
      h('div.btn-row', { style: { marginTop: '8px' } },
        navigator.share ? h('button.btn.outline', { onclick: () => navigator.share({ text }).catch(() => {}) }, icon('send'), 'Chia sẻ…') : null,
        h('button.btn.primary', { onclick: () => close() }, 'Xong')));
    if (!copied) setTimeout(() => { ta.focus(); ta.select(); }, 50);
  });
  return copied;
}

/** Nút sao chép dùng ở nhiều nơi. */
export function zaloButton(label, getText, toWhom, cls = '.outline') {
  return h('button.btn' + cls, { type: 'button', onclick: () => copyForZalo(getText(), toWhom) }, icon('file'), label);
}

/** Sau khi gửi đơn: nhắc sao chép đơn gửi Hiệu trưởng qua Zalo. */
export function askNotifyPrincipal(L) {
  sheet('Đã gửi đơn', (box, close) => {
    box.append(
      h('div.alert.ok', 'Đơn ' + vi(L.code) + ' đã gửi tới Hiệu trưởng trên hệ thống.'),
      h('p.small', 'Bấm nút dưới để sao chép đơn, rồi dán vào Zalo gửi Hiệu trưởng.'),
      h('div.btn-row', { style: { marginTop: '12px' } },
        h('button.btn.outline', { onclick: () => close() }, 'Để sau'),
        h('button.btn.primary', { onclick: () => { close(); copyForZalo(msgSubmitted(L), 'Hiệu trưởng'); } }, icon('file'), 'Sao chép đơn')));
  });
}
