// Báo cáo & sổ nghỉ: tổng hợp ngày nghỉ đã duyệt theo người (phục vụ xếp loại thi đua), xuất Excel, gói lưu trữ PDF.
import { api, downloadFile } from '../api.js';
import { h, clear, icon, busy, toast, fmtDays, viDate, viDateTime, saveBytes, todayStr } from '../ui.js';
import { layout, has } from '../app.js';
import { buildXlsx, XLSX_MIME } from '../xlsx.js';

const num = (x) => String(Math.round((Number(x) || 0) * 10) / 10).replace('.', ',');

export async function renderReports() {
  const page = layout('Báo cáo & sổ nghỉ', { back: '#/school' });
  const f = { yearId: '', from: '', to: '', campusId: '', departmentId: '', range: 'YEAR' };
  let data = null;
  const filters = h('section.card.stack');
  const body = h('div.stack');
  page.append(filters, body);

  function monthRange(offset) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset);
    const p = (n) => String(n).padStart(2, '0');
    const first = `${d.getFullYear()}-${p(d.getMonth() + 1)}-01`;
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return [first, `${last.getFullYear()}-${p(last.getMonth() + 1)}-${p(last.getDate())}`];
  }

  function drawFilters() {
    const sel = (key, options, onchange) => h('select.input', { onchange: (e) => { f[key] = e.target.value; (onchange || load)(); } },
      options.map(([v, l]) => h('option', { value: v, selected: f[key] === v }, l)));
    const from = h('input.input', { type: 'date', value: f.from, onchange: (e) => { f.from = e.target.value; load(); } });
    const to = h('input.input', { type: 'date', value: f.to, onchange: (e) => { f.to = e.target.value; load(); } });
    clear(filters,
      h('div.grid2',
        h('div.field', h('label.tiny', 'Năm học'), sel('yearId', data.years.map((y) => [y.id, y.name + (y.status === 'CLOSED' ? ' (đã khóa)' : '')]), () => { f.range = 'YEAR'; f.from = ''; f.to = ''; load(); })),
        h('div.field', h('label.tiny', 'Khoảng thời gian'), sel('range', [['YEAR', 'Cả năm học'], ['MONTH', 'Tháng này'], ['LAST', 'Tháng trước'], ['CUSTOM', 'Tự chọn ngày']], () => {
          if (f.range === 'YEAR') { f.from = ''; f.to = ''; }
          if (f.range === 'MONTH') [f.from, f.to] = monthRange(0);
          if (f.range === 'LAST') [f.from, f.to] = monthRange(-1);
          if (f.range === 'CUSTOM') { f.from = f.from || data.from; f.to = f.to || todayStr(); }
          load();
        }))),
      f.range === 'CUSTOM' ? h('div.grid2', h('div.field', h('label.tiny', 'Từ ngày'), from), h('div.field', h('label.tiny', 'Đến ngày'), to)) : null,
      h('div.grid2',
        sel('departmentId', [['', 'Mọi tổ'], ...data.departments.map((d) => [d.id, d.name])]),
        sel('campusId', [['', 'Mọi điểm trường'], ...data.campuses.map((c) => [c.id, c.name])])),
      h('div.tiny', 'Chỉ tính đơn đã duyệt. Đơn đã hủy, từ chối, thu hồi không tính. Nếu chọn khoảng ngày, đơn kéo dài ra ngoài khoảng chỉ tính phần nằm trong khoảng.'));
  }

  function draw() {
    const d = data;
    const typeCols = d.types.filter((t) => d.people.some((p) => p.byType[t.id]));
    const dl = h('div.btn-row',
      h('button.btn.primary', { onclick: () => exportExcel(d, typeCols) }, icon('download'), 'Tải sổ nghỉ (Excel)'),
      has('PRINCIPAL') || has('VICE') ? h('button.btn.outline', { onclick: () => downloadPackage(d) }, icon('download'), 'Tải PDF đơn (ZIP)') : null);
    const people = d.people.slice().sort((a, b) => b.totalDays - a.totalDays || a.fullName.localeCompare(b.fullName));
    clear(body,
      h('div.grid2',
        h('div.card.stat', h('div.tiny', 'Ngày nghỉ đã duyệt'), h('div.big', num(d.totals.days))),
        h('div.card.stat', h('div.tiny', 'Số đơn · số người nghỉ'), h('div.big', d.totals.leaves + ' · ' + d.totals.withLeave + '/' + d.totals.people))),
      h('div.tiny', 'Năm học ' + d.year.name + ' · từ ' + viDate(d.from) + ' đến ' + viDate(d.to)),
      dl,
      h('section.card', h('h2', 'Theo từng người'),
        people.length ? h('div.list', people.map((p) => personRow(p, d, typeCols))) : h('div.empty', 'Không có ai trong phạm vi đã chọn.')));
  }

  function personRow(p, d, typeCols) {
    const detail = h('div.stack', { hidden: true, style: { padding: '0 14px 12px' } });
    const row = h('div.list-item', {
      onclick: () => {
        detail.hidden = !detail.hidden;
        if (!detail.hidden && !detail.children.length) {
          const mine = d.leaves.filter((x) => x.userId === p.userId);
          detail.append(mine.length ? h('div.list', mine.map((x) => h('a.list-item', { href: '#/leave/' + x.id },
            h('div.grow', h('div.title', x.typeName + (x.otherNote ? ' – ' + x.otherNote : '')), h('div.sub', x.period + ' · ' + fmtDays(x.days)), h('div.tiny', x.code + ' · ' + x.reason)),
            h('span.chev', icon('chev'))))) : h('div.tiny', 'Không có đơn nghỉ đã duyệt trong khoảng này.'));
        }
      }
    },
    h('div.grow',
      h('div.row.between', h('span.title', p.fullName), h('b', p.totalDays ? fmtDays(p.totalDays) : '0')),
      h('div.sub', [p.departmentName, p.positionTitle].filter(Boolean).join(' · ')),
      h('div.tiny', (p.count ? p.count + ' đơn · ' + typeCols.filter((t) => p.byType[t.id]).map((t) => t.name + ' ' + num(p.byType[t.id])).join(', ') + ' · ' : '') +
        (p.granted ? 'Phép năm còn ' + num(p.remaining) + '/' + num(p.granted) : 'Chưa nhập phép năm'))));
    return h('div', row, detail);
  }

  async function exportExcel(d, typeCols) {
    const scope = [f.departmentId ? d.departments.find((x) => x.id === f.departmentId).name : '', f.campusId ? d.campuses.find((x) => x.id === f.campusId).name : ''].filter(Boolean).join(' – ');
    const sub = 'Năm học ' + d.year.name + ' · Từ ' + viDate(d.from) + ' đến ' + viDate(d.to) + (scope ? ' · ' + scope : '') + ' · Xuất lúc ' + viDateTime(new Date().toISOString());
    const sum = {
      name: 'Tổng hợp', title: 'SỔ THEO DÕI NGÀY NGHỈ – ' + String(d.school || '').toUpperCase(), subtitle: sub,
      header: ['STT', 'Họ và tên', 'Mã NV', 'Chức vụ', 'Tổ', ...typeCols.map((t) => t.name), 'Tổng số ngày nghỉ', 'Số đơn', 'Phép năm được cấp', 'Phép năm đã dùng', 'Phép năm còn lại'],
      widths: [6, 26, 10, 16, 22, ...typeCols.map(() => 12), 12, 9, 11, 11, 11],
      rows: d.people.map((p, i) => [i + 1, p.fullName, p.staffCode, p.positionTitle, p.departmentName, ...typeCols.map((t) => p.byType[t.id] || 0), p.totalDays, p.count, p.granted, p.used, p.remaining])
    };
    const det = {
      name: 'Chi tiết đơn', title: 'DANH SÁCH ĐƠN NGHỈ ĐÃ DUYỆT', subtitle: sub,
      header: ['STT', 'Mã đơn', 'Họ và tên', 'Tổ', 'Loại nghỉ', 'Thời gian nghỉ', 'Số ngày (trong khoảng)', 'Số ngày của đơn', 'Lý do', 'Điểm trường liên quan', 'Nộp sau khi nghỉ', 'Người duyệt', 'Thời điểm duyệt'],
      widths: [6, 15, 24, 20, 18, 30, 11, 10, 34, 20, 10, 20, 17],
      rows: d.leaves.map((x, i) => [i + 1, x.code, x.fullName, x.departmentName, x.typeName + (x.otherNote ? ' – ' + x.otherNote : ''), x.period, x.days, x.fullDays, x.reason, x.campusNames.join(', '), x.isRetroactive ? 'Có' : '', x.decider, x.decidedAt ? viDateTime(x.decidedAt) : ''])
    };
    const bytes = buildXlsx([sum, det]);
    saveBytes(bytes, XLSX_MIME, 'SoNghi_' + d.year.name + (f.range === 'YEAR' ? '' : '_' + d.from + '_' + d.to) + '.xlsx');
    api('report.logDownload', { type: 'REPORT_XLSX', yearId: d.year.id }).catch(() => {});
    toast('Đã tạo tệp Excel.', 'ok');
  }

  async function downloadPackage(d) {
    try {
      const r = await busy('Đang gom PDF các đơn đã duyệt… (có thể mất 1–2 phút)', () => api('package.build', { yearId: d.year.id }));
      const file = await busy('Đang tải gói về máy…', (say) => downloadFile('files.downloadOwn', { fileId: r.fileId }, (p) => say('Đang tải ' + Math.round(p * 100) + '%')));
      saveBytes(file.bytes, 'application/zip', r.fileName);
      toast('Đã tải ' + r.count + ' đơn' + (r.skipped ? ' (bỏ qua ' + r.skipped + ' tệp lỗi hoặc quá dung lượng)' : '') + '.', 'ok');
    } catch (e) { /* đã báo lỗi */ }
  }

  async function load() {
    clear(body, h('div.splash', h('div.spinner')));
    const payload = { yearId: f.yearId, campusId: f.campusId, departmentId: f.departmentId };
    if (f.range !== 'YEAR') { payload.from = f.from; payload.to = f.to; }
    data = await api('report.summary', payload);
    if (!page.isConnected) return;
    f.yearId = data.year.id;
    drawFilters();
    draw();
  }
  await load();
}
