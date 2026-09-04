import { BoundingBox } from '../types';

export interface DetectedFaceBox extends BoundingBox {
  confidence: number;
  type: 'face_avatar';
}

/**
 * High-Recall On-Device Visual Face & Avatar Detector
 * Scans image frames for human faces, profile photos, headshots, and avatar badges.
 */
export function detectVisualFaces(
  canvas: HTMLCanvasElement,
  confidenceThreshold: number = 0.35
): DetectedFaceBox[] {
  const detected: DetectedFaceBox[] = [];
  const width = canvas.width;
  const height = canvas.height;
  if (width <= 0 || height <= 0) return detected;

  try {
    // 1. Downscale to fast analysis grid (max 480x360)
    const sampleWidth = Math.min(width, 480);
    const sampleHeight = Math.min(height, 360);

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = sampleWidth;
    tempCanvas.height = sampleHeight;
    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
    if (!tempCtx) return detected;

    tempCtx.drawImage(canvas, 0, 0, sampleWidth, sampleHeight);
    const imgData = tempCtx.getImageData(0, 0, sampleWidth, sampleHeight);
    const data = imgData.data;

    const scaleX = width / sampleWidth;
    const scaleY = height / sampleHeight;

    // 2. Fine-grained 12x12 px grid accumulator
    const cellW = 12;
    const cellH = 12;
    const cols = Math.floor(sampleWidth / cellW);
    const rows = Math.floor(sampleHeight / cellH);
    const grid: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));

    for (let y = 0; y < sampleHeight; y += 2) {
      const rowIdx = Math.min(rows - 1, Math.floor(y / cellH));
      for (let x = 0; x < sampleWidth; x += 2) {
        const colIdx = Math.min(cols - 1, Math.floor(x / cellW));
        const idx = (y * sampleWidth + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // Multi-Space Skin & Portrait Color Models
        // 1. Standard RGB Skin Heuristic
        const isRgbSkin = r > 55 && g > 30 && b > 15 && r > g && (r - g) >= 8 && (r - b) >= 10;
        
        // 2. YCbCr Color Space (Broad spectrum across all ethnicities)
        const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
        const isYCbCrSkin = cb >= 73 && cb <= 138 && cr >= 128 && cr <= 186;

        // 3. Avatar / Stylized skin tones (pinkish/pastel/warm)
        const isAvatarTone = (r > 180 && g > 140 && b > 140 && r > b) || (r > 200 && g > 170 && b > 160);

        if (isRgbSkin || isYCbCrSkin || isAvatarTone) {
          grid[rowIdx][colIdx]++;
        }
      }
    }

    // 3. Cluster contiguous skin cells into face bounding boxes
    const threshold = Math.max(3, Math.floor(7 * confidenceThreshold));
    const visited: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!visited[r][c] && grid[r][c] >= threshold) {
          let minC = c;
          let maxC = c;
          let minR = r;
          let maxR = r;
          let totalHits = 0;

          const queue: [number, number][] = [[r, c]];
          visited[r][c] = true;

          while (queue.length > 0) {
            const [curR, curC] = queue.shift()!;
            totalHits += grid[curR][curC];
            minC = Math.min(minC, curC);
            maxC = Math.max(maxC, curC);
            minR = Math.min(minR, curR);
            maxR = Math.max(maxR, curR);

            const neighbors: [number, number][] = [
              [curR + 1, curC],
              [curR - 1, curC],
              [curR, curC + 1],
              [curR, curC - 1],
            ];

            for (const [nr, nc] of neighbors) {
              if (
                nr >= 0 &&
                nr < rows &&
                nc >= 0 &&
                nc < cols &&
                !visited[nr][nc] &&
                grid[nr][nc] >= threshold
              ) {
                visited[nr][nc] = true;
                queue.push([nr, nc]);
              }
            }
          }

          const clusterW = (maxC - minC + 1) * cellW;
          const clusterH = (maxR - minR + 1) * cellH;
          const aspect = clusterW / (clusterH || 1);

          // Human face / headshot aspect ratio check (0.5 to 2.0)
          if (clusterW >= 18 && clusterH >= 18 && aspect >= 0.5 && aspect <= 2.0) {
            // Generous 25% boundary expansion for complete face, ear, and hair coverage
            const padX = Math.round(clusterW * 0.25);
            const padY = Math.round(clusterH * 0.30);

            const rx = Math.max(0, minC * cellW - padX);
            const ry = Math.max(0, minR * cellH - padY);
            const rw = Math.min(sampleWidth - rx, clusterW + padX * 2);
            const rh = Math.min(sampleHeight - ry, clusterH + padY * 2);

            const origX = Math.round(rx * scaleX);
            const origY = Math.round(ry * scaleY);
            const origW = Math.round(rw * scaleX);
            const origH = Math.round(rh * scaleY);

            // Filter out full-page backgrounds (faces are < 55% of viewport)
            if (origW < width * 0.55 && origH < height * 0.55) {
              detected.push({
                x: origX,
                y: origY,
                width: origW,
                height: origH,
                confidence: Math.min(0.99, 0.80 + totalHits / 120),
                type: 'face_avatar',
              });
            }
          }
        }
      }
    }
  } catch (err) {
    console.debug('[FaceDetector] Notice:', err);
  }

  return detected;
}
