// Vector SVG QR Code generator for ticket numbers and receipt QR codes.
// Generates standard Version 1-2 QR Code SVG with zero external dependencies.

export function generateQrSvg(text: string, size: number = 160): string {
  const clean = text.trim() || 'PARKING';
  const version = clean.length <= 14 ? 1 : 2;
  const n = version === 1 ? 21 : 25;
  const matrix: (boolean | null)[][] = Array.from({ length: n }, () => Array(n).fill(null));

  function addFinder(row: number, col: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const mr = row + r;
        const mc = col + c;
        if (mr >= 0 && mr < n && mc >= 0 && mc < n) {
          if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
            matrix[mr][mc] = (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
          } else {
            matrix[mr][mc] = false;
          }
        }
      }
    }
  }

  addFinder(0, 0);
  addFinder(0, n - 7);
  addFinder(n - 7, 0);

  if (version === 2) {
    const ar = 18, ac = 18;
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        matrix[ar + r][ac + c] = Math.max(Math.abs(r), Math.abs(c)) !== 1;
      }
    }
  }

  for (let i = 8; i < n - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }
  matrix[n - 8][8] = true;

  for (let i = 0; i < 9; i++) {
    if (matrix[8][i] === null) matrix[8][i] = false;
    if (matrix[i][8] === null) matrix[i][8] = false;
  }
  for (let i = n - 8; i < n; i++) {
    if (matrix[8][i] === null) matrix[8][i] = false;
    if (matrix[i][8] === null) matrix[i][8] = false;
  }

  const rawBytes = new TextEncoder().encode(clean);
  let bitString = '0100';
  bitString += rawBytes.length.toString(2).padStart(8, '0');
  for (const b of rawBytes) {
    bitString += b.toString(2).padStart(8, '0');
  }

  const totalBits = version === 1 ? 152 : 272;
  bitString += '0000'.slice(0, Math.max(0, totalBits - bitString.length));
  while (bitString.length % 8 !== 0) bitString += '0';

  let padToggle = false;
  while (bitString.length < totalBits) {
    bitString += padToggle ? '00010001' : '11101100';
    padToggle = !padToggle;
  }

  const dataBytes: number[] = [];
  for (let i = 0; i < totalBits; i += 8) {
    dataBytes.push(parseInt(bitString.slice(i, i + 8), 2));
  }

  const ecCount = version === 1 ? 7 : 10;
  const ecBytes = calcRS(dataBytes, ecCount);
  const allCodewords = [...dataBytes, ...ecBytes];

  let allBits = '';
  for (const b of allCodewords) {
    allBits += b.toString(2).padStart(8, '0');
  }

  let bitIdx = 0;
  let upward = true;
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col = 5;
    const rows = upward
      ? Array.from({ length: n }, (_, i) => n - 1 - i)
      : Array.from({ length: n }, (_, i) => i);

    for (const r of rows) {
      for (const c of [col, col - 1]) {
        if (matrix[r][c] === null) {
          const bit = bitIdx < allBits.length ? allBits[bitIdx] === '1' : false;
          const mask = (r + c) % 2 === 0;
          matrix[r][c] = mask ? !bit : bit;
          bitIdx++;
        }
      }
    }
    upward = !upward;
  }

  const formatBits = '111011111000100';
  let fb = 0;
  for (let c = 0; c <= 8; c++) {
    if (c === 6) continue;
    matrix[8][c] = formatBits[fb++] === '1';
  }
  for (let r = 7; r >= 0; r--) {
    if (r === 6) continue;
    matrix[r][8] = formatBits[fb++] === '1';
  }
  fb = 0;
  for (let r = n - 1; r >= n - 7; r--) {
    matrix[r][8] = formatBits[fb++] === '1';
  }
  for (let c = n - 8; c < n; c++) {
    matrix[8][c] = formatBits[fb++] === '1';
  }

  const quiet = 4;
  const totalCells = n + quiet * 2;
  const cellSize = size / totalCells;

  let rects = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) {
        const x = ((c + quiet) * cellSize).toFixed(2);
        const y = ((r + quiet) * cellSize).toFixed(2);
        const s = cellSize.toFixed(2);
        rects += '<rect x="' + x + '" y="' + y + '" width="' + s + '" height="' + s + '" fill="#000000"/>';
      }
    }
  }

  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '"><rect width="100%" height="100%" fill="#ffffff"/>' + rects + '</svg>';
}

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_EXP[i + 255] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 256) x ^= 0x11d;
  }
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return GF_EXP[GF_LOG[x] + GF_LOG[y]];
}

function calcRS(data: number[], ecCount: number): number[] {
  let gen = [1];
  for (let i = 0; i < ecCount; i++) {
    const nextGen = new Array(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      nextGen[j] ^= gfMul(gen[j], GF_EXP[i]);
      nextGen[j + 1] ^= gen[j];
    }
    gen = nextGen;
  }

  const res = new Array(ecCount).fill(0);
  for (const byte of data) {
    const factor = byte ^ res[0];
    res.shift();
    res.push(0);
    for (let j = 0; j < ecCount; j++) {
      res[j] ^= gfMul(gen[j + 1], factor);
    }
  }
  return res;
}
