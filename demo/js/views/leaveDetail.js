// Chi tiết đơn, lịch sử, các nút thao tác theo quyền; luồng chèn chữ ký của người gửi và người duyệt.
import { api, uploadFile, downloadFile, base64ToBytes } from '../api.js';
import { h, clear, icon, toast, busy, askText, statusBadge, fmtDays, fmtSize, viDate, viDateTime, openBytes, saveBytes, SESSION_VI, confirmSheet } from '../ui.js';
import { state, layout, go, refreshBoot } from '../app.js';
import { stampPdf } from '../pdftools.js';
import { placeSignature } from './signPlacer.js';
import { previewLeave, ensureSignature } from './preview.js';

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
  try {
    if (L.sourceType === 'UPLOAD') {
      const { src, sig } = await busy('Đang mở đơn…', async () => ({
        src: await downloadFile('leave.pdf', { id: L.id, which: 'source' }),
        sig: await mySignaturePng()
      }));
      const placed = await placeSignature(src.bytes, [{ key: 'sig', label: 'Chữ ký của bạn', png: sig, defaultPos: { x: 0.55, y: 0.72, w: 0.3 } }], 'Chèn chữ ký người làm đơn');
      if (!placed) { toast('Chưa chèn chữ ký. Đơn đang ở trạng thái Chờ ký người gửi.'); go('#/leave/' + L.id); return; }
      await busy('Đang chèn chữ ký và gửi…', async (say) => {
        const pdf = await stampPdf(src.bytes, placed.map((p) => ({ pngBytes: sig, ...p })));
        const up = await uploadFile(new Uint8Array(pdf), (L.code || 'don') + '_ky.pdf', 'signed-pdf', (x) => say('Đang tải lên ' + Math.round(x * 100) + '%'));
        await api('leave.sign', { id: L.id, signedFileId: up.fileId, placement: placed[0] }, { write: true });
      });
    } else {
      await busy('Đang chèn chữ ký và gửi…', () => api('leave.sign', { id: L.id }, { write: true }));
    }
    toast('Đã ký và gửi đơn tới Hiệu trưởng.', 'ok');
    go('#/leave/' + L.id);
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

/** Người duyệt chèn chữ ký phê duyệt. */
async function approveFlow(L) {
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
      await busy('Đang chèn chữ ký và duyệt…', async (say) => {
        const pngs = { sig, stamp };
        const pdf = await stampPdf(src.bytes, placed.map((p) => ({ pngBytes: pngs[p.key], ...p })));
        const up = await uploadFile(new Uint8Array(pdf), (L.code || 'don') + '_duyet.pdf', 'signed-pdf', (x) => say('Đang tải lên ' + Math.round(x * 100) + '%'));
        await api('leave.approve', { id: L.id, rowVersion: L.rowVersion, signedFileId: up.fileId, placement: placed[0] }, { write: true });
      });
    } else {
      await busy('Đang chèn chữ ký và duyệt…', () => api('leave.approve', { id: L.id, rowVersion: L.rowVersion }, { write: true }));
    }
    toast('Đã phê duyệt và ký đơn ' + L.code + '.', 'ok');
    await refreshBoot();
    go(state.boot.canDecide ? '#/approvals' : '#/');
  } catch (e) {
    handleSignError(e, L.id);
  }
}

async function openPdf(L, which, version) {
  const f = await busy('Đang tải PDF…', (say) => downloadFile('leave.pdf', { id: L.id, which, version }, (p) => say('Đang tải ' + Math.round(p * 100) + '%')));
  openBytes(f.bytes, 'application/pdf', f.fileName);
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
