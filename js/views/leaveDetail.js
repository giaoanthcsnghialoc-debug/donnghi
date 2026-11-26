// Chi tiết đơn, lịch sử, các nút thao tác theo quyền; luồng chèn chữ ký của người gửi và người duyệt.
import { api, uploadFile, downloadFile, base64ToBytes } from '../api.js';
import { h, clear, icon, toast, busy, askText, sheet, statusBadge, fmtDays, fmtSize, viDate, viDateTime, openBytes, saveBytes, SESSION_VI, confirmSheet } from '../ui.js';
import { state, layout, go, refreshBoot, route } from '../app.js';
import { stampPdf } from '../pdftools.js';
import { calcLeave } from '../leavecalc.js';
import { placeSignature } from './signPlacer.js';
import { previewLeave, ensureSignature, viewPdf } from './preview.js';
import { zaloButton, msgSubmitted, msgApproved, askNotifyPrincipal } from './zalo.js';

const DECISION_VI = { APPROVE: 'Phê duyệt', REJECT: 'Từ chối', REQUEST_CHANGES: 'Yêu cầu bổ sung', CANCEL: 'Hủy đơn' };

/** Lỗi ký: thiếu ảnh chữ ký thì đưa tới trang tạo chữ ký, tạo xong quay lại đúng đơn. Trả về true nếu đã chuyển trang. */
function handleSignError(e, leaveId) {
  if (e.code === 'NO_SIGNATURE') {
    try { sessionStorage.setItem('dn_after_sig', '#/leave/' + leaveId); } catch (x) { /* bỏ qua */ }
    toast('Bạn cần tạo ảnh chữ ký trước khi ký. Tạo xong sẽ quay lại đơn.', 'bad');
    go('#/signature');
    return true;
  }
  if (e.code === 'SIGN_NOT_CONFIGURED') toast(e.message, 'bad');
  return false;
}

async function mySignaturePng() {
  const r = await api('me.signature.get');
  if (!r.pngBase64) { const e = new Error('Bạn chưa có ảnh chữ ký. Vào Cá nhân → Ảnh chữ ký để tải lên trước.'); e.code = 'NO_SIGNATURE'; throw e; }
  return base64ToBytes(r.pngBase64);
}

/** Người gửi chèn chữ ký: đơn mẫu – máy chủ tự đặt; đơn tải lên – chọn vị trí trên trang. */
export async function signAsSender(L) {
  let done = null;
  try {
    if (L.sourceType === 'UPLOAD') {
      const { src, sig } = await busy('Đang mở đơn…', async () => ({
        src: await downloadFile('leave.pdf', { id: L.id, which: 'source' }),
        sig: await mySignaturePng()
      }));
      const placed = await placeSignature(src.bytes, [{ key: 'sig', label: 'Chữ ký của bạn', png: sig, defaultPos: { x: 0.55, y: 0.72, w: 0.3 } }], 'Chèn chữ ký người làm đơn');
      if (!placed) { toast('Chưa chèn chữ ký. Đơn đang ở trạng thái Chờ ký người gửi.'); go('#/leave/' + L.id); return; }
      done = await busy('Đang chèn chữ ký và gửi…', async (say) => {
        const pdf = await stampPdf(src.bytes, placed.map((p) => ({ pngBytes: sig, ...p })));
        const up = await uploadFile(new Uint8Array(pdf), (L.code || 'don') + '_ky.pdf', 'signed-pdf', (x) => say('Đang tải lên ' + Math.round(x * 100) + '%'));
        return api('leave.sign', { id: L.id, signedFileId: up.fileId, placement: placed[0] }, { write: true });
      });
    } else {
      done = await busy('Đang chèn chữ ký và gửi…', () => api('leave.sign', { id: L.id }, { write: true }));
    }
    toast('Đã ký và gửi đơn tới Hiệu trưởng.', 'ok');
    go('#/leave/' + L.id);
    if (done && done.status === 'PENDING') setTimeout(() => askNotifyPrincipal(done), 400);
  } catch (e) {
    if (handleSignError(e, L.id)) return;
    go('#/leave/' + L.id);
  }
}

/** Gửi đơn nháp: đơn theo mẫu được xem trước (đã chèn chữ ký) rồi mới gửi. */
export async function sendDraft(L) {
  if (L.sourceType !== 'UPLOAD') {
    if (!await ensureSignature()) return;
    if (!await previewLeave({ id: L.id })) return;
  }
  let S;
  try { S = await busy('Đang gửi…', () => api('leave.submit', { id: L.id }, { write: true })); } catch (e) { return; }
  await signAsSender(S);
}

/** Đơn đang chờ ký người gửi: xem trước rồi chèn chữ ký. */
export async function signWithPreview(L) {
  if (!await ensureSignature()) return;
  if (L.sourceType !== 'UPLOAD' && !await previewLeave({ id: L.id })) return;
  await signAsSender(L);
}

/**
 * Chọn số ngày duyệt: duyệt đủ (một chạm) hoặc duyệt ít hơn đề nghị (chọn lại thời gian trong khoảng xin nghỉ),
 * kèm ý kiến thêm (không bắt buộc). Trả về { approvedPeriod, note } hoặc null nếu đóng.
 */
function askApproval(L) {
  return new Promise((resolve) => {
    let done = false;
    const f = { startDate: L.startDate, startSession: L.startSession, endDate: L.endDate, endSession: L.endSession };
    sheet('Duyệt đơn ' + (L.code || ''), (box, close) => {
      const finish = (v) => { done = true; close(); resolve(v); };
      const note = h('textarea.input', { rows: 2, maxlength: 500, placeholder: 'Không bắt buộc. Ví dụ: Các ngày còn lại đề nghị đồng chí đi làm bình thường.' });
      const seg = (val, on) => { const el = h('div.seg'); const draw = (v) => clear(el, [['AM', 'Sáng'], ['PM', 'Chiều']].map(([k, l]) => h('button' + (v === k ? '.on' : ''), { type: 'button', onclick: () => { on(k); draw(k); recalc(); } }, l))); draw(val); return el; };
      const sD = h('input.input', { type: 'date', value: f.startDate, min: L.startDate, max: L.endDate });
      const eD = h('input.input', { type: 'date', value: f.endDate, min: L.startDate, max: L.endDate });
      const out = h('div');
      const okBtn = h('button.btn.ok.block', { type: 'button' }, icon('check'), 'Duyệt');
      const key = (d, ss) => d + (ss === 'PM' ? '|1' : '|0');
      let days = 0;
      const recalc = () => {
        f.startDate = sD.value; f.endDate = eD.value;
        let err = '';
        if (!f.startDate || !f.endDate) err = 'Chọn ngày.';
        else if (key(f.startDate, f.startSession) < key(L.startDate, L.startSession) || key(f.endDate, f.endSession) > key(L.endDate, L.endSession)) err = 'Phải nằm trong thời gian xin nghỉ.';
        const c = err ? { error: err } : calcLeave(f.startDate, f.startSession, f.endDate, f.endSession);
        days = c.error ? 0 : c.days;
        clear(out, c.error ? h('div.alert.warn', c.error) : h('div.row', h('span.muted', 'Duyệt:'), h('span.days-pill', fmtDays(c.days) + ' / ' + fmtDays(L.days) + ' đề nghị')));
        okBtn.disabled = !!c.error;
        clear(okBtn, icon('check'), c.error ? 'Duyệt' : 'Duyệt ' + fmtDays(c.days) + ' và ký');
      };
      sD.addEventListener('change', recalc); eD.addEventListener('change', recalc);
      const part = h('div.stack', { hidden: true },
        h('div.field', h('label', 'Từ ngày'), sD), seg(f.startSession, (v) => { f.startSession = v; }),
        h('div.field', h('label', 'Đến hết ngày'), eD), seg(f.endSession, (v) => { f.endSession = v; }),
        out, okBtn);
      okBtn.onclick = () => { if (days > 0) finish({ approvedPeriod: { ...f }, note: note.value.trim() }); };
      const partBtn = h('button.btn.outline.block', { type: 'button', onclick: () => { part.hidden = false; partBtn.hidden = true; recalc(); } }, 'Duyệt ít ngày hơn…');
      box.append(
        h('p.muted', 'Giáo viên xin nghỉ ', h('b', fmtDays(L.days)), ' (' + (L.period || '') + ').'),
        h('div.field', h('label', 'Ý kiến thêm của Hiệu trưởng'), note),
        h('button.btn.ok.block', { type: 'button', onclick: () => finish({ approvedPeriod: null, note: note.value.trim() }) }, icon('check'), 'Duyệt đủ ' + fmtDays(L.days) + ' và ký'),
        partBtn, part);
    }, { onClose: () => { if (!done) resolve(null); } });
  });
}

/** Người duyệt chèn chữ ký phê duyệt. */
async function approveFlow(L) {
  let res = null;
  const choice = await askApproval(L);
  if (!choice) return;
  const extra = { approvedPeriod: choice.approvedPeriod, note: choice.note };
  try {
    if (L.sourceType === 'UPLOAD') {
      const { src, sig, stamp } = await busy('Đang mở đơn…', async () => ({
        src: await downloadFile('leave.pdf', { id: L.id, version: L.currentVersion }),
        sig: await mySignaturePng(),
        stamp: await api('me.stamp.get').then((r) => (r.pngBase64 ? base64ToBytes(r.pngBase64) : null))
      }));
      const items = [{ key: 'sig', label: 'Chữ ký duyệt', png: sig, defaultPos: { x: 0.1, y: 0.72, w: 0.3 } }];
      if (stamp) items.push({ key: 'stamp', label: 'Con dấu', png: stamp, defaultPos: { x: 0.04, y: 0.68, w: 0.2 }, square: true });
      const placed = await placeSignature(src.bytes, items, 'Chèn chữ ký phê duyệt');
      if (!placed) return;
      res = await busy('Đang chèn chữ ký và duyệt…', async (say) => {
        const pngs = { sig, stamp };
        const pdf = await stampPdf(src.bytes, placed.map((p) => ({ pngBytes: pngs[p.key], ...p })));
        const up = await uploadFile(new Uint8Array(pdf), (L.code || 'don') + '_duyet.pdf', 'signed-pdf', (x) => say('Đang tải lên ' + Math.round(x * 100) + '%'));
        return api('leave.approve', { id: L.id, rowVersion: L.rowVersion, signedFileId: up.fileId, placement: placed[0], returnPdf: true, ...extra }, { write: true });
      });
    } else {
      res = await busy('Đang chèn chữ ký và duyệt…', () => api('leave.approve', { id: L.id, rowVersion: L.rowVersion, returnPdf: true, ...extra }, { write: true }));
    }
    toast('Đã phê duyệt và ký đơn ' + L.code + '.', 'ok');
    state.boot.pendingCount = Math.max(0, (state.boot.pendingCount || 1) - 1);
    // Ở lại trang đơn vừa duyệt và mở ngay đơn đã duyệt để xem.
    if (location.hash === '#/leave/' + L.id) route(); else go('#/leave/' + L.id);
    if (res && res.finalPdf) viewPdf(base64ToBytes(res.finalPdf.dataBase64), 'Đơn đã duyệt ' + (L.code || ''), res.finalPdf.fileName,
      zaloButton('Sao chép đơn gửi PHT, tổ trưởng (Zalo)', () => msgApproved(res), 'nhóm Phó Hiệu trưởng, tổ trưởng', '.ok'));
  } catch (e) {
    handleSignError(e, L.id);
  }
}

async function openPdf(L, which, version) {
  const f = await busy('Đang tải PDF…', (say) => downloadFile('leave.pdf', { id: L.id, which, version }, (p) => say('Đang tải ' + Math.round(p * 100) + '%')));
  viewPdf(f.bytes, which === 'final' ? 'Đơn đã duyệt ' + (L.code || '') : 'Xem đơn', f.fileName);
}

export async function render(id) {
  const page = layout('Chi tiết đơn', { back: '#/' });
  page.append(h('div.splash', h('div.spinner')));
  const L = await api('leave.get', { id });
  if (!page.isConnected) return;   // người dùng đã chuyển sang trang khác trong lúc tải
  page.replaceChildren();
  const snap = L.snapshot || {};

  page.append(h('section.card',
    h('div.row.between', h('div', h('div.tiny', L.code || 'Bản nháp chưa có mã'), h('h2', { style: { margin: '2px 0' } }, L.fullName)), statusBadge(L.status, L.statusLabel)),
    h('dl.kv', { style: { marginTop: '12px' } },
      h('dt', 'Loại nghỉ'), h('dd', L.typeName || '—'),
      h('dt', 'Thời gian'), h('dd', L.period || '—'),
      h('dt', 'Số ngày'), h('dd', L.days ? fmtDays(L.days) + ' (' + L.sessions + ' buổi)' : '—'),
      h('dt', 'Lý do'), h('dd', L.reason || '—'),
      h('dt', 'Điểm trường'), h('dd', (L.campusNames || []).join(', ') || '—'),
      snap.positionTitle ? [h('dt', 'Chức vụ'), h('dd', snap.positionTitle)] : null,
      snap.departmentName ? [h('dt', 'Tổ'), h('dd', snap.departmentName)] : null,
      L.requested ? [h('dt', 'Đề nghị ban đầu'), h('dd', fmtDays(L.requested.days) + ' – Hiệu trưởng duyệt ' + fmtDays(L.days))] : null,
      L.extra && L.extra.handoverTo ? [h('dt', 'Dạy thay'), h('dd', L.extra.handoverTo + (L.extra.handoverDeptId ? ' (' + ((state.boot.departments || []).find((d) => d.id === L.extra.handoverDeptId) || {}).name + ')' : ''))] : null,
      L.extra && L.extra.payMode === 'UNPAID' ? [h('dt', 'Chế độ'), h('dd', 'Không lương')] : null,
      L.contactPhone ? [h('dt', 'Liên hệ'), h('dd', h('a', { href: 'tel:' + L.contactPhone }, L.contactPhone))] : null,
      h('dt', 'Cách tạo'), h('dd', L.sourceType === 'UPLOAD' ? 'Đơn tải lên' : 'Mẫu của trường'),
      L.submittedAt ? [h('dt', 'Gửi lúc'), h('dd', viDateTime(L.submittedAt) + (L.isRetroactive ? ' (nộp sau khi nghỉ)' : ''))] : null)));

  const lastNote = (type) => (L.decisions || []).filter((d) => d.decision === type).pop();
  if (L.status === 'NEED_CHANGES' && lastNote('REQUEST_CHANGES')) page.append(h('div.alert.purple', h('b', 'Cần bổ sung: '), lastNote('REQUEST_CHANGES').note));
  if (L.status === 'REJECTED' && lastNote('REJECT')) page.append(h('div.alert.bad', h('b', 'Lý do từ chối: '), lastNote('REJECT').note));
  if (L.status === 'CANCELLED' && lastNote('CANCEL')) page.append(h('div.alert.bad', h('b', 'Lý do hủy: '), lastNote('CANCEL').note));
  if (L.status === 'WAIT_SIGN') page.append(h('div.alert.info', 'Đơn chưa được gửi tới Hiệu trưởng vì chưa chèn chữ ký.'));
  if (L.balanceWarning) page.append(h('div.alert.warn', L.balanceWarning));

  if (L.overlaps && L.overlaps.length && L.status === 'PENDING') {
    page.append(h('section.card',
      h('h2', 'Trùng lịch với ' + L.overlaps.length + ' người'),
      h('div.list', L.overlaps.map((o) => h('a.list-item', { href: '#/leave/' + o.id },
        h('div.grow', h('div.row.between', h('span.title', o.fullName), statusBadge(o.status, o.statusLabel)),
          h('div.sub', o.period + ' · trùng ' + o.sharedSlots + ' buổi'),
          h('div.tiny', (o.campusNames || []).join(', '))))))));
  }

  // Tệp
  const fileCard = h('section.card.stack', h('h2', 'Đơn và tệp đính kèm'));
  if (L.hasFinalPdf) fileCard.append(h('div.btn-row', h('button.btn.primary', { onclick: () => openPdf(L, 'final') }, icon('eye'), 'Xem đơn đã duyệt'),
    h('button.btn.outline', { onclick: async () => { const f = await busy('Đang tải…', () => downloadFile('leave.pdf', { id: L.id, which: 'final' })); saveBytes(f.bytes, 'application/pdf', f.fileName); } }, icon('download'), 'Tải về')));
  (L.versions || []).filter((v) => v.hasPdf).slice().reverse().forEach((v) => {
    fileCard.append(h('button.btn.outline.block', { onclick: () => openPdf(L, 'version', v.version) }, icon('eye'), 'Xem đơn' + (v.version > 1 ? ' – lần gửi ' + v.version : '') + ' đã ký'));
  });
  if (L.userId === state.boot.user.id && L.sourceType !== 'UPLOAD' && ['DRAFT', 'WAIT_SIGN', 'NEED_CHANGES'].includes(L.status))
    fileCard.append(h('button.btn.outline.block', { onclick: () => previewLeave({ id: L.id }, { viewOnly: true }) }, icon('eye'), 'Xem trước đơn'));
  if (L.can.sign && L.sourceType === 'UPLOAD') fileCard.append(h('button.btn.outline.block', { onclick: () => openPdf(L, 'source') }, icon('file'), 'Xem đơn đã tải lên'));
  (L.attachments || []).forEach((a) => fileCard.append(h('button.file-row', { style: { width: '100%', background: 'none', cursor: 'pointer', textAlign: 'left' }, onclick: async () => {
    const f = await busy('Đang tải tệp…', () => downloadFile('leave.attachment', { attachmentId: a.id }));
    openBytes(f.bytes, f.mimeType, f.fileName);
  } }, icon('file'), h('div.grow', h('div.title', a.fileName), h('div.tiny', fmtSize(a.size) + ' · phiên bản ' + a.version)))));
  if (fileCard.children.length === 1) fileCard.append(h('div.tiny', 'Chưa có tệp.'));
  page.append(fileCard);

  // Sao chép đơn để gửi qua Zalo thường (đặt ngay dưới phần thông tin đơn cho dễ thấy)
  const me = state.boot.user;
  const zaloRow = [];
  if (L.userId === me.id && L.status === 'PENDING') zaloRow.push(zaloButton('Sao chép đơn gửi Hiệu trưởng', () => msgSubmitted(L), 'Hiệu trưởng', '.primary'));
  if (L.status === 'APPROVED' && (L.userId === me.id || state.boot.canDecide || me.roles.includes('PRINCIPAL')))
    zaloRow.push(zaloButton('Sao chép đơn đã duyệt gửi PHT, tổ trưởng', () => msgApproved(L), 'nhóm Phó Hiệu trưởng, tổ trưởng', '.primary'));
  if (zaloRow.length) {
    const zcard = h('section.card.stack', h('h2', 'Gửi qua Zalo'),
      h('div.tiny', 'Sao chép nội dung đơn kèm đường link, rồi dán vào Zalo. Người nhận bấm link để xem đơn trên hệ thống.'), ...zaloRow);
    page.insertBefore(zcard, page.children[1] || null);
  }

  // Lịch sử
  page.append(h('section.card', h('h2', 'Lịch sử xử lý'),
    (L.history || []).length ? h('ul.timeline', L.history.slice().reverse().map((x) => h('li',
      h('div', h('b', x.toLabel), x.delegated ? h('span.tiny', ' (theo ủy quyền)') : null),
      h('div.tiny', viDateTime(x.at) + ' · ' + x.actor), x.note ? h('div.small.muted', x.note) : null))) : h('div.tiny', 'Chưa gửi.')));

  // Nút thao tác
  const btns = [];
  const c = L.can;
  if (c.edit) btns.push(h('a.btn.outline', { href: '#/edit/' + L.id }, 'Sửa'));
  if (c.deleteDraft) btns.push(h('button.btn.outline', {
    onclick: async () => {
      if (!await confirmSheet('Xóa bản nháp', 'Xóa bản nháp này? Không khôi phục được.', 'Xóa', 'danger')) return;
      await busy('Đang xóa…', () => api('leave.deleteDraft', { id: L.id }, { write: true })); toast('Đã xóa bản nháp.', 'ok'); go('#/mine');
    }
  }, icon('trash'), 'Xóa nháp'));
  if (c.submit && L.status === 'DRAFT') btns.push(h('button.btn.primary', {
    onclick: () => sendDraft(L)
  }, icon('send'), 'Gửi duyệt'));
  if (c.sign) btns.push(h('button.btn.primary', { onclick: () => signWithPreview(L) }, icon('pen'), 'Chèn chữ ký'));
  if (c.withdraw) btns.push(h('button.btn.outline', {
    onclick: async () => {
      const note = await askText('Thu hồi đơn', 'Lý do thu hồi (không bắt buộc)', { required: false, okText: 'Thu hồi', okClass: 'danger' });
      if (note === null) return;
      await busy('Đang thu hồi…', () => api('leave.withdraw', { id: L.id, note }, { write: true }));
      toast('Đã thu hồi đơn.'); render(L.id);
    }
  }, 'Thu hồi'));
  if (c.decide) {
    btns.push(h('button.btn.outline', {
      onclick: async () => {
        const note = await askText('Từ chối đơn', 'Lý do từ chối (bắt buộc)', { okText: 'Từ chối', okClass: 'danger' });
        if (!note) return;
        await busy('Đang xử lý…', () => api('leave.reject', { id: L.id, note }, { write: true }));
        toast('Đã từ chối đơn.'); await refreshBoot(); go('#/approvals');
      }
    }, 'Từ chối'));
    btns.push(h('button.btn.outline', {
      onclick: async () => {
        const note = await askText('Yêu cầu bổ sung', 'Nội dung cần bổ sung', { okText: 'Gửi yêu cầu' });
        if (!note) return;
        await busy('Đang gửi…', () => api('leave.requestChanges', { id: L.id, note }, { write: true }));
        toast('Đã gửi yêu cầu bổ sung.'); await refreshBoot(); go('#/approvals');
      }
    }, 'Bổ sung'));
    btns.push(h('button.btn.ok', { onclick: () => approveFlow(L) }, icon('check'), 'Duyệt và ký'));
  }
  if (c.cancel) btns.push(h('button.btn.danger', {
    onclick: async () => {
      const note = await askText('Hủy đơn đã duyệt', 'Lý do hủy (bắt buộc). Số ngày phép đã trừ sẽ được hoàn lại.', { okText: 'Hủy đơn', okClass: 'danger' });
      if (!note) return;
      await busy('Đang hủy…', () => api('leave.cancel', { id: L.id, note }, { write: true }));
      toast('Đã hủy đơn.'); render(L.id);
    }
  }, 'Hủy đơn'));
  if (btns.length && page.parentNode) {
    page.classList.add('has-action');
    page.parentNode.insertBefore(h('div.action-bar', btns), page.nextSibling);
  }
}
