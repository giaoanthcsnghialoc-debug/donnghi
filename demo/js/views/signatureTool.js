// Công cụ ảnh chữ ký: chụp chữ ký trên giấy trắng rồi xóa nền, hoặc vẽ bằng ngón tay. Xuất PNG nền trong suốt.
import { h, clear } from '../ui.js';

/** Ngưỡng Otsu trên độ sáng để tách nét chữ khỏi nền giấy. */
function otsu(lum) {
  const hist = new Array(256).fill(0);
  lum.forEach((v) => hist[v]++);
  const total = lum.length;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, th = 180;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; th = t; }
  }
  return th;
}

/**
 * Xử lý ảnh: điểm sáng hơn ngưỡng thành trong suốt; nét chữ giữ màu, chỉnh độ đậm; cắt sát chữ ký.
 * threshold: 0..255; strength: 0.5..2 (độ đậm nét); ink: 'original' | 'blue' | 'black'
 */
export function removeBackground(srcCanvas, threshold, strength, ink) {
  const w = srcCanvas.width, hgt = srcCanvas.height;
  const src = srcCanvas.getContext('2d').getImageData(0, 0, w, hgt);
  const out = new ImageData(w, hgt);
  const d = src.data, o = out.data;
  let minX = w, minY = hgt, maxX = -1, maxY = -1;
  const soft = 28; // vùng chuyển tiếp mềm quanh ngưỡng để nét không răng cưa
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    if (d[i + 3] < 10) continue;   // điểm trong suốt sẵn (khung vẽ tay)
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    let a = (threshold - lum) / soft;
    a = Math.max(0, Math.min(1, a + 0.5));
    if (a <= 0.02) continue;
    a = Math.min(1, a * strength);
    let r = d[i], g = d[i + 1], b = d[i + 2];
    if (ink === 'blue') { r = 20; g = 45; b = 160; } else if (ink === 'black') { r = 15; g = 15; b = 20; } else {
      const k = Math.max(0.35, 1 - (strength - 1) * 0.5);   // đậm hơn thì tối màu hơn
      r *= k; g *= k; b *= k;
    }
    o[i] = r; o[i + 1] = g; o[i + 2] = b; o[i + 3] = Math.round(a * 255);
    const x = p % w, y = (p / w) | 0;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (maxX < 0) return null;
  const pad = 12;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad); maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(hgt - 1, maxY + pad);
  const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = hgt;
  tmp.getContext('2d').putImageData(out, 0, 0);
  const cut = document.createElement('canvas'); cut.width = maxX - minX + 1; cut.height = maxY - minY + 1;
  cut.getContext('2d').drawImage(tmp, minX, minY, cut.width, cut.height, 0, 0, cut.width, cut.height);
  return cut;
}

async function fileToCanvas(file, maxSide = 1400) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('Không đọc được ảnh.')); i.src = url; });
    const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally { URL.revokeObjectURL(url); }
}

function canvasToPngBytes(c) {
  return new Promise((ok) => c.toBlob(async (b) => ok(new Uint8Array(await b.arrayBuffer())), 'image/png'));
}

/** Giảm kích thước PNG nếu quá lớn (tối đa 900 px chiều rộng). */
function shrink(c, maxW = 900) {
  if (c.width <= maxW) return c;
  const s = maxW / c.width;
  const t = document.createElement('canvas'); t.width = maxW; t.height = Math.round(c.height * s);
  t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
  return t;
}

/**
 * Dựng công cụ trong phần tử container. onSave(pngBytes) được gọi khi bấm Lưu.
 * opts.title: tiêu đề phần; opts.forStamp: dùng cho ảnh con dấu (giữ màu đỏ).
 */
export function mountSignatureTool(container, onSave, opts = {}) {
  let mode = 'photo';
  let source = null, result = null;
  const preview = h('div.checker', { style: { padding: '10px', minHeight: '120px', display: 'grid', placeItems: 'center' } }, h('span.tiny', 'Chưa có ảnh'));
  const th = h('input', { type: 'range', min: '60', max: '250', value: '180' });
  const st = h('input', { type: 'range', min: '50', max: '200', value: '110' });
  let ink = opts.forStamp ? 'original' : 'original';
  const controls = h('div.stack', { hidden: true });
  const saveBtn = h('button.btn.primary.block', { disabled: true }, 'Lưu ảnh');

  const process = () => {
    if (!source) return;
    result = removeBackground(source, Number(th.value), Number(st.value) / 100, ink);
    if (!result) { clear(preview, h('span.tiny', 'Không thấy nét chữ. Thử kéo thanh "Độ lọc nền" sang phải.')); saveBtn.disabled = true; return; }
    const img = h('img.sig-preview', { alt: 'Xem trước' });
    img.src = result.toDataURL('image/png');
    clear(preview, img);
    saveBtn.disabled = false;
  };
  th.addEventListener('input', process);
  st.addEventListener('input', process);

  const pickCam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  const pickFile = h('input', { type: 'file', accept: 'image/*', hidden: true });
  const onPick = async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    source = await fileToCanvas(f);
    const g = source.getContext('2d').getImageData(0, 0, source.width, source.height).data;
    const lum = new Uint8Array(source.width * source.height);
    for (let i = 0, p = 0; i < g.length; i += 4, p++) lum[p] = (0.299 * g[i] + 0.587 * g[i + 1] + 0.114 * g[i + 2]) | 0;
    th.value = String(Math.min(235, otsu(lum) + 15));
    controls.hidden = false;
    process();
  };
  pickCam.addEventListener('change', onPick);
  pickFile.addEventListener('change', onPick);

  const inkSeg = h('div.seg', [['original', 'Giữ màu'], ['blue', 'Mực xanh'], ['black', 'Mực đen']].map(([v, l]) => h('button' + (v === ink ? '.on' : ''), {
    type: 'button', onclick: (e) => { ink = v; [...e.target.parentNode.children].forEach((b) => b.classList.toggle('on', b === e.target)); process(); }
  }, l)));
  controls.append(
    h('div.field', h('label', 'Độ lọc nền'), th, h('div.hint', 'Kéo sang phải nếu nét bị mất, sang trái nếu còn vết bẩn, bóng giấy.')),
    h('div.field', h('label', 'Độ đậm nét'), st),
    opts.forStamp ? null : h('div.field', h('label', 'Màu nét'), inkSeg));

  // Vẽ bằng ngón tay
  const pad = h('canvas.draw-pad');
  let drawing = false, last = null, drawn = false;
  const setupPad = () => {
    const r = pad.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    pad.width = r.width * dpr; pad.height = r.height * dpr;
    const g = pad.getContext('2d'); g.scale(dpr, dpr); g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 3; g.strokeStyle = '#142da0';
    drawn = false;
  };
  const pos = (e) => { const r = pad.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  pad.addEventListener('pointerdown', (e) => { drawing = true; last = pos(e); pad.setPointerCapture(e.pointerId); });
  pad.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const p = pos(e), g = pad.getContext('2d');
    g.beginPath(); g.moveTo(last[0], last[1]); g.lineTo(p[0], p[1]); g.stroke(); last = p; drawn = true; saveBtn.disabled = false;
  });
  const stop = () => { drawing = false; };
  pad.addEventListener('pointerup', stop); pad.addEventListener('pointercancel', stop);

  const photoBox = h('div.stack',
    h('p.small.muted', opts.forStamp ? 'Chụp hoặc chọn ảnh con dấu (đóng trên giấy trắng). Hệ thống làm nền trong suốt.' : 'Ký lên giấy trắng bằng bút mực đậm, chụp gần, đủ sáng. Hệ thống tự xóa nền giấy.'),
    h('div.btn-row', h('button.btn.outline', { type: 'button', onclick: () => pickCam.click() }, 'Chụp ảnh'), h('button.btn.outline', { type: 'button', onclick: () => pickFile.click() }, 'Chọn ảnh có sẵn')),
    pickCam, pickFile, preview, controls);
  const drawBox = h('div.stack', { hidden: true },
    h('p.small.muted', 'Ký bằng ngón tay vào khung trắng.'), pad,
    h('button.btn.sm.outline', { type: 'button', onclick: setupPad }, 'Xóa vẽ lại'));

  const modeSeg = opts.forStamp ? null : h('div.seg', [['photo', 'Chụp chữ ký'], ['draw', 'Vẽ chữ ký']].map(([v, l]) => h('button' + (v === mode ? '.on' : ''), {
    type: 'button', onclick: (e) => {
      mode = v; [...e.target.parentNode.children].forEach((b) => b.classList.toggle('on', b === e.target));
      photoBox.hidden = v !== 'photo'; drawBox.hidden = v !== 'draw';
      saveBtn.disabled = v === 'photo' ? !result : !drawn;
      if (v === 'draw') requestAnimationFrame(setupPad);
    }
  }, l)));

  saveBtn.addEventListener('click', async () => {
    let c = mode === 'draw' ? removeBackground(pad, 200, 1.2, 'original') : result;
    if (!c) return;
    c = shrink(c);
    await onSave(await canvasToPngBytes(c));
  });
  container.append(modeSeg, photoBox, drawBox, saveBtn);
}
