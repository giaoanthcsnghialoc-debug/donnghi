// Tính buổi/ngày nghỉ trên điện thoại để hiện ngay (máy chủ vẫn tính lại khi lưu).
export function calcLeave(startDate, startSession, endDate, endSession) {
  const p = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; };
  const s = p(startDate), e = p(endDate);
  if (isNaN(s) || isNaN(e)) return { error: 'Chọn ngày nghỉ.' };
  if (e < s) return { error: 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.' };
  if (e === s && startSession === 'PM' && endSession === 'AM') return { error: 'Trong cùng ngày, buổi kết thúc phải sau buổi bắt đầu.' };
  const n = Math.round((e - s) / 86400000) + 1;
  if (n > 366) return { error: 'Khoảng nghỉ quá dài.' };
  let sessions = 0;
  for (let i = 0; i < n; i++) {
    const wd = new Date(s + i * 86400000).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    if (!(i === 0 && startSession === 'PM')) sessions++;
    if (!(i === n - 1 && endSession === 'AM')) sessions++;
  }
  if (!sessions) return { error: 'Khoảng này chỉ gồm thứ Bảy, Chủ nhật.' };
  return { sessions, days: sessions / 2 };
}
