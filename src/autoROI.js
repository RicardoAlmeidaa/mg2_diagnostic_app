// autoROI.js
// Deteta automaticamente a região circular do chip (ROI) numa imagem de canvas.
// Pipeline: 1) binarização de Otsu (luminosidade) -> 2) K-means (k=2) em Lab
// para refinar a separação de cor -> 3) deteção do maior blob circular.

export function rgbToLab(r, g, b) {
  let [nr, ng, nb] = [r / 255, g / 255, b / 255].map(v =>
    v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92
  );
  let x = (nr * 0.4124 + ng * 0.3576 + nb * 0.1805) * 100;
  let y = (nr * 0.2126 + ng * 0.7152 + nb * 0.0722) * 100;
  let z = (nr * 0.0193 + ng * 0.1192 + nb * 0.9505) * 100;
  const f = (t) => (t > 0.008856 ? Math.pow(t, 1 / 3) : 7.787 * t + 16 / 116);
  return {
    L: 116 * f(y / 100) - 16,
    a: 500 * (f(x / 95.047) - f(y / 100)),
    b: 200 * (f(y / 100) - f(z / 108.883)),
  };
}

function labDist(p1, p2) {
  return Math.sqrt((p1.L - p2.L) ** 2 + (p1.a - p2.a) ** 2 + (p1.b - p2.b) ** 2);
}

// ---- 1. Otsu's adaptive thresholding ----
function otsuThreshold(histogram, total) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];

  let sumB = 0, wB = 0, varMax = 0, threshold = 0;

  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;

    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const varBetween = wB * wF * (mB - mF) * (mB - mF);

    if (varBetween > varMax) {
      varMax = varBetween;
      threshold = t;
    }
  }
  return threshold;
}

// ---- 2. K-means simples (k=2) em Lab ----
function kMeans2(points, iterations = 8) {
  let c0 = points[0];
  let c1 = points[points.length - 1];

  for (let iter = 0; iter < iterations; iter++) {
    let sum0 = { L: 0, a: 0, b: 0 }, count0 = 0;
    let sum1 = { L: 0, a: 0, b: 0 }, count1 = 0;

    for (const p of points) {
      if (labDist(p, c0) <= labDist(p, c1)) {
        sum0.L += p.L; sum0.a += p.a; sum0.b += p.b; count0++;
      } else {
        sum1.L += p.L; sum1.a += p.a; sum1.b += p.b; count1++;
      }
    }
    if (count0 > 0) c0 = { L: sum0.L / count0, a: sum0.a / count0, b: sum0.b / count0 };
    if (count1 > 0) c1 = { L: sum1.L / count1, a: sum1.a / count1, b: sum1.b / count1 };
  }
  return [c0, c1];
}

// ---- 3. Flood fill + teste de circularidade ----
function findBestCircularBlob(mask, width, height) {
  const visited = new Uint8Array(width * height);
  let best = null;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!mask[idx] || visited[idx]) continue;

      const stack = [idx];
      visited[idx] = 1;
      let minX = x, maxX = x, minY = y, maxY = y, count = 0;

      while (stack.length) {
        const cur = stack.pop();
        const cx = cur % width;
        const cy = (cur / width) | 0;
        count++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const neighbors = [cur - 1, cur + 1, cur - width, cur + width];
        for (const n of neighbors) {
          if (n >= 0 && n < mask.length && mask[n] && !visited[n]) {
            visited[n] = 1;
            stack.push(n);
          }
        }
      }

      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      const radius = Math.max(w, h) / 2;
      const circularity = count / (Math.PI * radius * radius);

      // filtra blobs demasiado pequenos, junto à borda da imagem, ou pouco circulares
      const touchesEdge = minX <= 1 || minY <= 1 || maxX >= width - 2 || maxY >= height - 2;
      if (count > 150 && circularity > 0.55 && circularity < 1.25 && !touchesEdge) {
        if (!best || count > best.count) {
          best = {
            count,
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2,
            radius,
            circularity,
          };
        }
      }
    }
  }
  return best;
}

/**
 * Deteta automaticamente o ROI circular numa imagem já desenhada num canvas.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width  - largura da imagem a analisar (recomenda-se reduzir para ~200-300px por performance)
 * @param {number} height
 * @returns {{centerX:number, centerY:number, radius:number}|null}
 */
export function autoDetectROI(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const total = width * height;

  const gray = new Uint8ClampedArray(total);
  const histogram = new Array(256).fill(0);
  const labPoints = new Array(total);

  for (let i = 0; i < total; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const g8 = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    gray[i] = g8;
    histogram[g8]++;
    labPoints[i] = rgbToLab(r, g, b);
  }

  const threshold = otsuThreshold(histogram, total);

  // amostragem para o K-means correr rápido (1 em cada 6 pixels)
  const sampled = labPoints.filter((_, i) => i % 6 === 0);
  const [c0, c1] = kMeans2(sampled);

  // testa as DUAS direções possíveis (chip mais claro OU mais escuro que o fundo)
  // e fica com a que encontrar o melhor blob circular
  const candidates = [];

  for (const clusterAsChip of [c0, c1]) {
    const mask = new Uint8Array(total);
    for (let i = 0; i < total; i++) {
      const closeToCluster = labDist(labPoints[i], clusterAsChip) < 18;
      mask[i] = closeToCluster ? 1 : 0;
    }
    const blob = findBestCircularBlob(mask, width, height);
    if (blob) candidates.push(blob);
  }

  // também tenta só com Otsu (grayscale), como fallback adicional
  const maskOtsuDark = new Uint8Array(total);
  const maskOtsuLight = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    maskOtsuDark[i] = gray[i] < threshold ? 1 : 0;
    maskOtsuLight[i] = gray[i] >= threshold ? 1 : 0;
  }
  const blobDark = findBestCircularBlob(maskOtsuDark, width, height);
  const blobLight = findBestCircularBlob(maskOtsuLight, width, height);
  if (blobDark) candidates.push(blobDark);
  if (blobLight) candidates.push(blobLight);

  if (candidates.length === 0) return null;

  // escolhe o candidato com maior circularidade (mais próximo de 1 = círculo perfeito)
  candidates.sort((a, b) => Math.abs(1 - a.circularity) - Math.abs(1 - b.circularity));
  return candidates[0];
}