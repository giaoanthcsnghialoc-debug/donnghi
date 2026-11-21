// Công cụ PDF chạy trên điện thoại: ghép ảnh thành PDF, chèn ảnh chữ ký/con dấu vào PDF (pdf-lib).
import { loadScript } from './ui.js';

const base = new URL('../vendor/', import.meta.url).href;

export async function pdfLib() {
  await loadScript(base + 'pdf-lib.min.js');
  return window.PDFLib;
}

export async function pdfJs() {
  await loadScript(base + 'pdf.min.js');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js';
  return window.pdfjsLib;
}

/** Thu nhỏ ảnh chụp (cạnh dài tối đa maxSide px) và xuất JPEG. */
export async function compressImage(file, maxSide = 2000, quality = 0.85) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('Không đọc được ảnh.')); i.src = url; });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', quality));
    return new Uint8Array(await blob.arrayBuffer());
  } finally { URL.revokeObjectURL(url); }
}

/** Ghép một hoặc nhiều ảnh chụp đơn viết tay thành một PDF khổ A4. */
export async function imagesToPdf(files) {
  const { PDFDocument } = await pdfLib();
  const doc = await PDFDocument.create();
  const A4 = [595.28, 841.89], margin = 24;
  for (const f of files) {
    const jpg = await doc.embedJpg(await compressImage(f));
    const page = doc.addPage(A4);
    const s = Math.min((A4[0] - 2 * margin) / jpg.width, (A4[1] - 2 * margin) / jpg.height);
    const w = jpg.width * s, hgt = jpg.height * s;
    page.drawImage(jpg, { x: (A4[0] - w) / 2, y: (A4[1] - hgt) / 2, width: w, height: hgt });
  }
  return doc.save();
}

/**
 * Chèn ảnh vào PDF. items: [{pngBytes, page (1..n), x, y, w, h}] – x,y,w,h là tỉ lệ 0..1 so với trang,
 * gốc tọa độ góc trên bên trái (như trên màn hình).
 */
export async function stampPdf(pdfBytes, items) {
  const { PDFDocument } = await pdfLib();
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  for (const it of items) {
    const page = pages[Math.max(0, Math.min(pages.length - 1, (it.page || 1) - 1))];
    const { width, height } = page.getSize();
    const img = await doc.embedPng(it.pngBytes);
    page.drawImage(img, { x: it.x * width, y: height - (it.y + it.h) * height, width: it.w * width, height: it.h * height });
  }
  return doc.save();
}
