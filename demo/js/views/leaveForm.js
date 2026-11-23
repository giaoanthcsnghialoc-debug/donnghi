// Tạo / sửa đơn: điền mẫu có sẵn hoặc tải đơn của mình lên (PDF, Word, ảnh chụp đơn viết tay).
import { api, uploadFile } from '../api.js';
import { h, clear, icon, toast, busy, SESSION_VI, fmtDays, fmtSize, todayStr } from '../ui.js';
import { state, layout, go } from '../app.js';
import { calcLeave } from '../leavecalc.js';
import { imagesToPdf, compressImage } from '../pdftools.js';
import { signAsSender } from './leaveDetail.js';
import { previewLeave, ensureSignature } from './preview.js';

function seg(options, value, onChange) {
  const el = h('div.seg');
  const draw = (v) => clear(el, options.map(([val, label]) => h('button' + (v === val ? '.on' : ''), { type: 'button', onclick: () => { onChange(val); draw(val); } }, label)));
  draw(value);
  return el;
}

function addDays(ymd, n) {
  const d = new Date(ymd + 'T00:00:00');
  d.setDate(d.getDate() + n);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function render(id) {
  const b = state.boot;
  const page = layout(id ? 'Sửa đơn' : 'Tạo đơn xin nghỉ', { back: id ? '#/leave/' + id : '#/' });
  if (!b.canSubmit) { page.append(h('div.alert.info', 'Tài khoản của bạn không tạo đơn trong hệ thống.')); return; }
  const today = todayStr();
  let refreshSend = () => {};
  const f = {
    id: null, rowVersion: '', sourceType: 'TEMPLATE', leaveTypeId: '', otherNote: '', startDate: today, startSession: 'AM',
    endDate: today, endSession: 'PM', reason: '', contactPhone: b.user.phone || '',
    campusIds: b.user.campusIds.length === 1 ? b.user.campusIds.slice() : [], attachments: [], upload: null
  };
  let needNote = '';
  if (id) {
    page.append(h('div.splash', h('div.spinner')));
    const L = await api('leave.get', { id });
    if (!page.isConnected) return;
    page.replaceChildren();
    if (!L.can.edit) { page.append(h('div.alert.info', 'Đơn này không sửa được nữa.')); return; }
    Object.assign(f, {
      id: L.id, rowVersion: L.rowVersion, sourceType: L.sourceType || 'TEMPLATE', leaveTypeId: L.leaveTypeId, otherNote: L.otherNote || '',
      startDate: L.startDate || today, startSession: L.startSession || 'AM', endDate: L.endDate || today, endSession: L.endSession || 'PM',
      reason: L.reason || '', contactPhone: L.contactPhone || '', campusIds: L.campusIds || []
    });
    for (const fid of L.attachmentIds || []) {
      try { const info = await api('files.info', { fileId: fid }); f.attachments.push(info); } catch (e) { /* tệp đã được chuyển vào hồ sơ */ }
    }
    if (L.uploadedFileId) { try { f.upload = await api('files.info', { fileId: L.uploadedFileId }); } catch (e) { /* bỏ qua */ } }
    const lastReq = (L.decisions || []).filter((d) => d.decision === 'REQUEST_CHANGES').pop();
    if (L.status === 'NEED_CHANGES' && lastReq) needNote = lastReq.note;
  }

  if (needNote) page.append(h('div.alert.purple', h('b', 'Nội dung cần bổ sung: '), needNote));

  // 1. Cách tạo đơn
  const uploadBox = h('div.stack');
  const drawUpload = () => {
    if (f.sourceType !== 'UPLOAD') { uploadBox.replaceChildren(); return; }
    const pickFile = h('input', { type: 'file', accept: 'application/pdf,.pdf,.doc,.docx,image/*', multiple: true, hidden: true, onchange: (e) => handleSourceFiles([...e.target.files]) });
    const pickCam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', multiple: true, hidden: true, onchange: (e) => handleSourceFiles([...e.target.files]) });
    clear(uploadBox,
      f.upload ? h('div.file-row', icon('file'), h('div.grow', h('div.title', f.upload.fileName), h('div.tiny', fmtSize(f.upload.size))),
        h('button.btn.sm.outline', { type: 'button', onclick: () => { f.upload = null; drawUpload(); } }, 'Đổi')) :
        h('div.btn-row',
          h('button.btn.outline', { type: 'button', onclick: () => pickCam.click() }, icon('camera'), 'Chụp đơn'),
          h('button.btn.outline', { type: 'button', onclick: () => pickFile.click() }, icon('file'), 'Chọn tệp')),
      pickFile, pickCam,
      h('div.hint.tiny', 'Nhận PDF, Word hoặc ảnh chụp (chụp nhiều trang thì chọn nhiều ảnh). Bạn vẫn cần điền nhanh các mục bên dưới để hệ thống tính ngày nghỉ.'));
  };
  async function handleSourceFiles(files) {
    if (!files.length) return;
    await busy('Đang chuẩn bị đơn…', async (say) => {
      const imgs = files.filter((x) => x.type.startsWith('image/'));
      let res;
      if (imgs.length === files.length) {
        say('Đang ghép ảnh thành PDF…');
        const pdf = await imagesToPdf(imgs);
        res = await uploadFile(new Uint8Array(pdf), 'don_xin_nghi.pdf', 'leave-source', (p) => say('Đang tải lên ' + Math.round(p * 100) + '%'));
      } else if (files.length === 1) {
        res = await uploadFile(files[0], files[0].name, 'leave-source', (p) => say('Đang tải lên ' + Math.round(p * 100) + '%'));
      } else {
        throw new Error('Chọn một tệp PDF/Word, hoặc nhiều ảnh.');
      }
      f.upload = { fileId: res.fileId, fileName: res.fileName, size: res.size };
    });
    drawUpload();
  }

  page.append(h('section.card.stack',
    h('h2', 'Cách tạo đơn'),
    seg([['TEMPLATE', 'Điền mẫu có sẵn'], ['UPLOAD', 'Tải đơn của tôi lên']], f.sourceType, (v) => { f.sourceType = v; drawUpload(); refreshSend(); }),
    uploadBox));
  drawUpload();

  // 2. Loại nghỉ
  const noteField = h('div.field', h('label', 'Ghi rõ nội dung'), h('input.input', { value: f.otherNote, oninput: (e) => { f.otherNote = e.target.value; } }));
  const types = h('div.chips');
  const drawTypes = () => {
    clear(types, b.leaveTypes.map((t) => h('button.chip' + (f.leaveTypeId === t.id ? '.on' : ''), { type: 'button', onclick: () => { f.leaveTypeId = t.id; drawTypes(); } }, t.name)));
    const t = b.leaveTypes.find((x) => x.id === f.leaveTypeId);
    noteField.hidden = !(t && t.requiresNote);
    annualHint.hidden = !(t && t.deductsAnnual);
  };
  const annualHint = h('div.tiny', b.balance ? 'Nghỉ phép năm: bạn còn ' + fmtDays(b.balance.remaining) + '.' : '');
  page.append(h('section.card.stack', h('h2', 'Loại nghỉ'), types, annualHint, noteField));
  drawTypes();

  // 3. Thời gian
  const daysOut = h('div');
  const sDate = h('input.input', { type: 'date', value: f.startDate });
  const eDate = h('input.input', { type: 'date', value: f.endDate });
  const sSeg = h('div'), eSeg = h('div');
  const drawSegs = () => {
    clear(sSeg, seg([['AM', 'Sáng'], ['PM', 'Chiều']], f.startSession, (v) => { f.startSession = v; recalc(); }));
    clear(eSeg, seg([['AM', 'Sáng'], ['PM', 'Chiều']], f.endSession, (v) => { f.endSession = v; recalc(); }));
  };
  const recalc = () => {
    const c = calcLeave(f.startDate, f.startSession, f.endDate, f.endSession);
    clear(daysOut, c.error ? h('div.alert.warn', c.error) : h('div.row', h('span.muted', 'Tổng cộng:'), h('span.days-pill', fmtDays(c.days) + ' (' + c.sessions + ' buổi)')));
    const retro = f.startDate && f.startDate < today;
    retroNote.hidden = !retro;
  };
  const retroNote = h('div.alert.info', 'Ngày nghỉ đã qua: đơn sẽ được ghi là nộp bổ sung sau khi nghỉ và vẫn cần Hiệu trưởng duyệt.');
  sDate.addEventListener('change', () => { f.startDate = sDate.value; if (!f.endDate || f.endDate < f.startDate) { f.endDate = f.startDate; eDate.value = f.endDate; } recalc(); });
  eDate.addEventListener('change', () => { f.endDate = eDate.value; recalc(); });
  const preset = (label, s, ss, e, es) => h('button.chip', { type: 'button', onclick: () => { Object.assign(f, { startDate: s, startSession: ss, endDate: e, endSession: es }); sDate.value = s; eDate.value = e; drawSegs(); recalc(); } }, label);
  // ngày làm việc kế tiếp (bỏ qua thứ Bảy, Chủ nhật)
  let tmr = addDays(today, 1);
  while ([0, 6].includes(new Date(tmr + 'T00:00:00').getDay())) tmr = addDays(tmr, 1);
  page.append(h('section.card.stack',
    h('h2', 'Thời gian nghỉ'),
    h('div.chips', preset('Sáng nay', today, 'AM', today, 'AM'), preset('Chiều nay', today, 'PM', today, 'PM'), preset('Cả ngày hôm nay', today, 'AM', today, 'PM'), preset('Ngày làm việc kế tiếp', tmr, 'AM', tmr, 'PM')),
    h('div.field', h('label', 'Từ ngày'), sDate), sSeg,
    h('div.field', h('label', 'Đến ngày'), eDate), eSeg,
    daysOut, retroNote,
    h('div.tiny', 'Hệ thống tự bỏ thứ Bảy, Chủ nhật. Ngày lễ vẫn được tính.')));
  drawSegs(); recalc();

  // 4. Điểm trường liên quan, lý do, liên hệ
  const myCampuses = b.campuses.filter((c) => b.user.campusIds.includes(c.id));
  const campusBox = h('div', myCampuses.map((c) => h('label.check', h('input', { type: 'checkbox', checked: f.campusIds.includes(c.id), onchange: (e) => { f.campusIds = e.target.checked ? [...new Set([...f.campusIds, c.id])] : f.campusIds.filter((x) => x !== c.id); } }), c.name)));
  page.append(h('section.card.stack',
    h('h2', 'Thông tin khác'),
    h('div.field', h('label', 'Điểm trường liên quan'), myCampuses.length ? campusBox : h('div.alert.warn', 'Bạn chưa được phân công điểm trường. Liên hệ quản trị viên.')),
    h('div.field', h('label', 'Lý do'), h('textarea.input', { rows: 3, value: f.reason, placeholder: 'Ví dụ: Đưa con đi khám bệnh', oninput: (e) => { f.reason = e.target.value; } })),
    h('div.field', h('label', 'Số điện thoại liên hệ'), h('input.input', { type: 'tel', inputmode: 'tel', value: f.contactPhone, oninput: (e) => { f.contactPhone = e.target.value; } }))));

  // 5. Tệp đính kèm
  const attBox = h('div.stack');
  const drawAtt = () => clear(attBox,
    f.attachments.map((a, i) => h('div.file-row', icon('file'), h('div.grow', h('div.title', a.fileName), h('div.tiny', fmtSize(a.size))),
      h('button.icon-btn', { type: 'button', 'aria-label': 'Bỏ tệp', onclick: () => { f.attachments.splice(i, 1); drawAtt(); } }, icon('x')))),
    attPick, h('button.btn.outline.block', { type: 'button', onclick: () => attPick.click() }, icon('plus'), 'Thêm tệp đính kèm'),
    h('div.tiny', 'Ảnh, PDF, Word, Excel, PowerPoint, TXT, CSV. Mỗi tệp tối đa 30 MB, cả đơn tối đa 50 MB.'));
  const attPick = h('input', {
    type: 'file', multiple: true, hidden: true, onchange: async (e) => {
      const files = [...e.target.files];
      e.target.value = '';
      for (const file of files) {
        await busy('Đang tải ' + file.name + '…', async (say) => {
          let bytes = file, name = file.name;
          if (/^image\/(jpeg|png|webp)$/.test(file.type) && file.size > 800 * 1024) { bytes = await compressImage(file); name = name.replace(/\.\w+$/, '') + '.jpg'; }
          const total = f.attachments.reduce((n, a) => n + (a.size || 0), 0) + (bytes.size || bytes.length);
          if (total > 50 * 1024 * 1024) throw new Error('Tổng dung lượng tệp đính kèm vượt 50 MB.');
          const r = await uploadFile(bytes, name, 'attachment', (p) => say('Đang tải ' + Math.round(p * 100) + '%'));
          f.attachments.push({ fileId: r.fileId, fileName: r.fileName, size: r.size });
        });
      }
      drawAtt();
    }
  });
  page.append(h('section.card.stack', h('h2', 'Tệp đính kèm (giấy khám, giấy mời…)'), attBox));
  drawAtt();

  // Chữ ký người làm đơn: luôn hiện để giáo viên biết chữ ký nào sẽ được chèn vào đơn.
  const sigBox = h('div.stack');
  const sigCard = h('section.card.stack', h('h2', 'Chữ ký người làm đơn'), sigBox);
  page.append(sigCard);
  const drawSig = () => api('me.signature.get').then((r) => {
    if (!sigCard.isConnected) return;
    clear(sigBox, r.pngBase64
      ? [h('img.sig-preview', { src: 'data:image/png;base64,' + r.pngBase64, alt: 'Chữ ký của bạn' }),
        h('div.tiny', 'Bấm Chèn chữ ký: đơn hiện lên với chữ ký này để bạn rà soát rồi mới gửi.'),
        h('button.btn.outline.sm', { type: 'button', onclick: async () => { if (await ensureSignature(true)) drawSig(); } }, icon('pen'), 'Đổi chữ ký')]
      : [h('div.alert.warn', 'Bạn chưa có ảnh chữ ký. Bấm Chèn chữ ký, hệ thống mở khung tạo chữ ký ngay tại đây.'),
        h('button.btn.outline.block', { type: 'button', onclick: async () => { if (await ensureSignature()) drawSig(); } }, icon('pen'), 'Tạo chữ ký trước')]);
  }).catch(() => {});
  drawSig();

  // Nút
  const payload = () => ({
    id: f.id, rowVersion: f.rowVersion, sourceType: f.sourceType, leaveTypeId: f.leaveTypeId, otherNote: f.otherNote,
    startDate: f.startDate, startSession: f.startSession, endDate: f.endDate, endSession: f.endSession, reason: f.reason,
    contactPhone: f.contactPhone, campusIds: f.campusIds, attachmentIds: f.attachments.map((a) => a.fileId),
    uploadedFileId: f.sourceType === 'UPLOAD' && f.upload ? f.upload.fileId : ''
  });
  const save = async () => {
    const L = await api('leave.save', payload(), { write: true });
    f.id = L.id; f.rowVersion = L.rowVersion;
    return L;
  };
  const validate = () => {
    if (f.sourceType === 'UPLOAD' && !f.upload) return 'Chưa tải đơn của bạn lên.';
    if (!f.leaveTypeId) return 'Chọn loại nghỉ.';
    const c = calcLeave(f.startDate, f.startSession, f.endDate, f.endSession);
    if (c.error) return c.error;
    if (!f.reason.trim()) return 'Nhập lý do nghỉ.';
    if (!f.campusIds.length) return 'Chọn điểm trường liên quan.';
    return '';
  };
  const sendBtn = h('button.btn.primary', {
    onclick: async () => {
      const v = validate(); if (v) { toast(v, 'bad'); return; }
      if (f.sourceType !== 'UPLOAD') {
        // Đơn theo mẫu: lưu nháp → (chưa có chữ ký thì tạo ngay tại chỗ) → đơn hiện lên đã chèn chữ ký → rà soát → Gửi duyệt.
        try { await busy('Đang lưu…', save); } catch (e) { return; }
        if (!await ensureSignature()) { drawSig(); return; }
        drawSig();
        if (!await previewLeave({ id: f.id })) return;
      }
      let L;
      try { L = await busy('Đang gửi đơn…', async () => { if (f.sourceType === 'UPLOAD') await save(); return api('leave.submit', { id: f.id }, { write: true }); }); } catch (e) { return; }
      await signAsSender(L);
    }
  });
  refreshSend = () => {
    const up = f.sourceType === 'UPLOAD';
    sendBtn.replaceChildren(icon(up ? 'send' : 'pen'), up ? 'Gửi duyệt' : 'Chèn chữ ký');
  };
  refreshSend();
  if (!page.parentNode) return;
  page.classList.add('has-action');
  page.parentNode.insertBefore(h('div.action-bar',
    h('button.btn.outline', { onclick: async () => { await busy('Đang lưu nháp…', save); toast('Đã lưu bản nháp.', 'ok'); go('#/leave/' + f.id); } }, 'Lưu nháp'),
    sendBtn), page.nextSibling);
}
