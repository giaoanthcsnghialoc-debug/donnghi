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
 * Làm phẳng nền giấy: ước lượng độ sáng của giấy ở từng vùng (kể cả chỗ có bóng tay, bóng đèn, mép tối)
 * rồi chia cho độ sáng đó. Giấy ở mọi chỗ thành trắng đều, còn nét mực vẫn đậm và giữ nguyên độ dày,
 * nên không phải kéo thanh lọc nền xuống thấp (làm nét mảnh, chữ ký trông nhỏ đi).
 */
export function flattenPaper(src) {
  const w = src.width, hgt = src.height;
  const img = src.getContext('2d').getImageData(0, 0, w, hgt);
  const d = img.data;
  const cell = Math.max(12, Math.round(Math.max(w, hgt) / 45));
  const gw = Math.ceil(w / cell), gh = Math.ceil(hgt / cell);
  let grid = new Float32Array(gw * gh);
  for (let y = 0; y < hgt; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const k = ((y / cell) | 0) * gw + ((x / cell) | 0);
      if (l > grid[k]) grid[k] = l;                       // giấy là phần sáng nhất trong mỗi ô
    }
  }
  const pass = (g, fn) => {
    const o = new Float32Array(gw * gh);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const vals = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < gw && ny < gh) vals.push(g[ny * gw + nx]);
      }
      o[y * gw + x] = fn(vals);
    }
    return o;
  };
  grid = pass(grid, (v) => Math.max(...v));                               // ô bị nét đậm phủ kín: lấy giấy ô bên cạnh
  grid = pass(grid, (v) => v.reduce((a, b) => a + b, 0) / v.length);     // làm mượt
  const out = src.ownerDocument ? src.ownerDocument.createElement('canvas') : document.createElement('canvas');
  out.width = w; out.height = hgt;
  const res = new ImageData(w, hgt), o = res.data;
  for (let y = 0; y < hgt; y++) {
    const gy = Math.min(gh - 1.001, Math.max(0, y / cell - 0.5)), y0 = gy | 0, fy = gy - y0, y1 = Math.min(gh - 1, y0 + 1);
    for (let x = 0; x < w; x++) {
      const gx = Math.min(gw - 1.001, Math.max(0, x / cell - 0.5)), x0 = gx | 0, fx = gx - x0, x1 = Math.min(gw - 1, x0 + 1);
      const bg = (grid[y0 * gw + x0] * (1 - fx) + grid[y0 * gw + x1] * fx) * (1 - fy) + (grid[y1 * gw + x0] * (1 - fx) + grid[y1 * gw + x1] * fx) * fy;
      const k = 250 / Math.max(40, bg);
      const i = (y * w + x) * 4;
      o[i] = Math.min(255, d[i] * k); o[i + 1] = Math.min(255, d[i + 1] * k); o[i + 2] = Math.min(255, d[i + 2] * k); o[i + 3] = 255;
    }
  }
  out.getContext('2d').putImageData(res, 0, 0);
  return out;
}

/**
 * Xử lý ảnh: điểm sáng hơn ngưỡng thành trong suốt; nét chữ giữ màu, chỉnh độ đậm; cắt sát chữ ký.
 * threshold: 0..255; strength: 0.5..2 (độ đậm nét); ink: 'original' | 'blue' | 'black'
 */
export function removeBackground(srcCanvas, threshold, strength, ink, opts = {}) {
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
    if (a < 0.12) continue;          // vệt mờ gần như trong suốt: bỏ, để không làm khung ảnh to ra
    let r = d[i], g = d[i + 1], b = d[i + 2];
    if (ink === 'blue') { r = 20; g = 45; b = 160; } else if (ink === 'black') { r = 15; g = 15; b = 20; } else {
      const k = Math.max(0.35, 1 - (strength - 1) * 0.5);   // đậm hơn thì tối màu hơn
      r *= k; g *= k; b *= k;
    }
    o[i] = r; o[i + 1] = g; o[i + 2] = b; o[i + 3] = Math.round(a * 255);
    if (a < 0.35) continue;          // chỉ nét đủ đậm mới tính vào khung cắt
    const x = p % w, y = (p / w) | 0;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (maxX < 0) return null;
  // Cắt sát nét chữ ký: tách các cụm nét liền nhau, bỏ các chấm bẩn, bóng mép giấy nằm xa nét chính,
  // để ảnh lưu chỉ vừa chữ ký và chữ ký không bị nhỏ khi chèn vào đơn.
  {
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    const lab = new Int32Array(bw * bh);
    const comps = [];
    const stack = new Int32Array(bw * bh);
    for (let y0 = 0; y0 < bh; y0++) {
      for (let x0 = 0; x0 < bw; x0++) {
        const k0 = y0 * bw + x0;
        if (lab[k0] || o[((y0 + minY) * w + x0 + minX) * 4 + 3] < 90) continue;
        const id = comps.length + 1;
        let sp = 0, n = 0, cx0 = x0, cx1 = x0, cy0 = y0, cy1 = y0;
        stack[sp++] = k0; lab[k0] = id;
        while (sp) {
          const k = stack[--sp]; n++;
          const x = k % bw, y = (k / bw) | 0;
          if (x < cx0) cx0 = x; if (x > cx1) cx1 = x; if (y < cy0) cy0 = y; if (y > cy1) cy1 = y;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
            const nk = ny * bw + nx;
            if (lab[nk] || o[((ny + minY) * w + nx + minX) * 4 + 3] < 90) continue;
            lab[nk] = id; stack[sp++] = nk;
          }
        }
        comps.push({ n, x0: cx0, x1: cx1, y0: cy0, y1: cy1 });
      }
    }
    if (comps.length > 1 && !opts.keepAll) {
      // cụm chạm mép ảnh thường là bóng mép giấy, viền bàn: bỏ (trừ khi chỉ có các cụm như vậy)
      const ex = Math.max(3, w * 0.02), ey = Math.max(3, hgt * 0.02);
      const edge = (c) => c.x0 + minX <= ex || c.y0 + minY <= ey || c.x1 + minX >= w - 1 - ex || c.y1 + minY >= hgt - 1 - ey;
      const pool = comps.some((c) => !edge(c) && c.n >= 15) ? comps.filter((c) => !edge(c)) : comps;
      const big = Math.max(...pool.map((c) => c.n));
      const main = pool.filter((c) => c.n >= Math.max(15, big * 0.08));
      let X0 = Math.min(...main.map((c) => c.x0)), X1 = Math.max(...main.map((c) => c.x1));
      let Y0 = Math.min(...main.map((c) => c.y0)), Y1 = Math.max(...main.map((c) => c.y1));
      // giữ thêm dấu chấm, dấu thanh nhỏ nằm sát nét chính
      const mx = (X1 - X0) * 0.12 + 8, my = (Y1 - Y0) * 0.25 + 8;
      pool.forEach((c) => {
        if (c.x0 >= X0 - mx && c.x1 <= X1 + mx && c.y0 >= Y0 - my && c.y1 <= Y1 + my) {
          X0 = Math.min(X0, c.x0); X1 = Math.max(X1, c.x1); Y0 = Math.min(Y0, c.y0); Y1 = Math.max(Y1, c.y1);
        }
      });
      // xóa các chấm bẩn còn lại trong khung
      const keep = new Uint8Array(comps.length + 1);
      comps.forEach((c, i) => { if (c.x0 >= X0 && c.x1 <= X1 && c.y0 >= Y0 && c.y1 <= Y1) keep[i + 1] = 1; });
      for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
        const l = lab[y * bw + x];
        if (l && !keep[l]) o[((y + minY) * w + x + minX) * 4 + 3] = 0;
      }
      minX += X0; maxX = minX + (X1 - X0); minY += Y0; maxY = minY + (Y1 - Y0);
    }
  }
  const pad = Math.max(6, Math.round(Math.max(maxX - minX, maxY - minY) * 0.03));
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
    source = flattenPaper(await fileToCanvas(f));
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
    h('div.field', h('label', 'Độ lọc nền'), th, h('div.hint', 'Hệ thống đã tự làm trắng nền giấy. Thường không cần chỉnh; còn vết bẩn thì kéo sang trái một chút, nét bị đứt thì kéo sang phải.')),
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
    let c = mode === 'draw' ? removeBackground(pad, 200, 1.2, 'original', { keepAll: true }) : result;
    if (!c) return;
    c = shrink(c);
    await onSave(await canvasToPngBytes(c));
  });
  container.append(modeSeg, photoBox, drawBox, saveBtn);
}
