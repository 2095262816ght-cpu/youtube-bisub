// 生成扩展图标（16/32/48/128），纯 Node 内置 zlib 手写 PNG 编码
// 用法: node scripts/gen-icons.js
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const SIZES = [16, 32, 48, 128];
const SS = 4; // 超采样倍数，用于抗锯齿

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const rowLen = size * 4 + 1;
  const raw = Buffer.alloc(rowLen * size);
  for (let y = 0; y < size; y++) {
    raw[y * rowLen] = 0; // filter: none
    rgba.copy(raw, y * rowLen + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- 绘制（归一化坐标 0..1，画在 size*SS 的超采样画布上）----

function inRoundedRect(x, y, x0, y0, x1, y1, r) {
  const cx = Math.max(x0 + r, Math.min(x1 - r, x));
  const cy = Math.max(y0 + r, Math.min(y1 - r, y));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function inTriangle(x, y, ax, ay, bx, by, cx, cy) {
  const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
  const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
  const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function blend(buf, i, r, g, b, a) {
  const inv = 1 - a;
  buf[i] = Math.round(r * a + buf[i] * inv);
  buf[i + 1] = Math.round(g * a + buf[i + 1] * inv);
  buf[i + 2] = Math.round(b * a + buf[i + 2] * inv);
  buf[i + 3] = 255;
}

function drawIcon(size) {
  const s = size * SS;
  const buf = Buffer.alloc(s * s * 4, 0);
  for (let py = 0; py < s; py++) {
    for (let px = 0; px < s; px++) {
      const x = (px + 0.5) / s;
      const y = (py + 0.5) / s;
      const i = (py * s + px) * 4;
      if (inRoundedRect(x, y, 0, 0, 1, 1, 0.2)) {
        // 红色渐变背景（左上亮、右下深）
        const t = (x + y) / 2;
        const r = Math.round(226 - 66 * t);
        const g = Math.round(44 - 24 * t);
        const b = Math.round(40 - 18 * t);
        blend(buf, i, r, g, b, 1);
      }
      // 白色播放三角
      if (inTriangle(x, y, 0.36, 0.2, 0.36, 0.62, 0.74, 0.41)) {
        blend(buf, i, 255, 255, 255, 1);
      }
      // 底部字幕条（一实一虚）
      if (inRoundedRect(x, y, 0.16, 0.7, 0.84, 0.775, 0.037)) {
        blend(buf, i, 255, 255, 255, 1);
      }
      if (inRoundedRect(x, y, 0.3, 0.83, 0.7, 0.895, 0.032)) {
        blend(buf, i, 255, 255, 255, 0.65);
      }
    }
  }
  // box 下采样
  const out = Buffer.alloc(size * size * 4);
  const n = SS * SS;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const i = ((y * SS + dy) * s + (x * SS + dx)) * 4;
          r += buf[i];
          g += buf[i + 1];
          b += buf[i + 2];
          a += buf[i + 3];
        }
      }
      const o = (y * size + x) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = Math.round(a / n);
    }
  }
  return out;
}

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const size of SIZES) {
  const file = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(file, encodePng(size, drawIcon(size)));
  console.log('generated', file);
}
