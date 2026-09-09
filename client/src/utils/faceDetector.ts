import { BoundingBox } from '../types';

export interface DetectedFaceBox extends BoundingBox {
  confidence: number;
  type: 'face_avatar';
}

/**
 * High-Recall On-Device Visual Face & Avatar Detector
 * 1. Checks Chrome/Edge native Shape Detection API (window.FaceDetector) for pixel-accurate detection.
 * 2. Fallbacks to high-recall multi-space skin/portrait contour analyzer with headshot padding.
 */
export async function detectVisualFaces(
  canvas: HTMLCanvasElement,
  confidenceThreshold: number = 0.35
): Promise<DetectedFaceBox[]> {
  const detected: DetectedFaceBox[] = [];
  const width = canvas.width;
  const height = canvas.height;
  if (width <= 0 || height <= 0) return detected;

  // 1. Try Native Chrome FaceDetector API (Shape Detection API)
  if (typeof window !== 'undefined' && 'FaceDetector' in window) {
    try {
      const FaceDetectorClass = (window as any).FaceDetector;
      const detector = new FaceDetectorClass({ fastMode: false, maxDetectedFaces: 10 });
      const nativeFaces = await detector.detect(canvas);

      if (nativeFaces && nativeFaces.length > 0) {
        for (const face of nativeFaces) {
          const b = face.boundingBox;
          // Expand by 40% horizontally and 45% vertically to encompass full hair, ears, forehead, and chin
          const padX = Math.round(b.width * 0.40);
          const padTop = Math.round(b.height * 0.45);
          const padBottom = Math.round(b.height * 0.35);

          const fx = Math.max(0, Math.round(b.x - padX));
          const fy = Math.max(0, Math.round(b.y - padTop));
          const fw = Math.min(width - fx, Math.round(b.width + padX * 2));
          const fh = Math.min(height - fy, Math.round(b.height + padTop + padBottom));

          detected.push({
            x: fx,
            y: fy,
            width: fw,
            height: fh,
            confidence: 0.99,
            type: 'face_avatar',
          });
        }

        if (detected.length > 0) {
          return detected;
        }
      }
    } catch (nativeErr) {
      console.debug('[FaceDetector] Native FaceDetector fallback:', nativeErr);
    }
  }

  // 2. High-Recall Color & Portrait Space Analyzer
  try {
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

    const cellW = 10;
    const cellH = 10;
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
        // RGB Model
        const isRgbSkin = r > 50 && g > 25 && b > 15 && r > g && (r - g) >= 6 && (r - b) >= 8;

        // YCbCr Model (inclusive across all skin tones)
        const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
        const isYCbCrSkin = cb >= 70 && cb <= 142 && cr >= 125 && cr <= 190;

        // Warm / Pastel / Portrait tones
        const isWarmPortrait = (r > 160 && g > 120 && b > 110 && r > b) || (r > 190 && g > 160 && b > 140);

        if (isRgbSkin || isYCbCrSkin || isWarmPortrait) {
          grid[rowIdx][colIdx]++;
        }
      }
    }

    // Cluster skin cells into contiguous regions
    const threshold = Math.max(2, Math.floor(6 * confidenceThreshold));
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

          // Headshot / Face portrait geometry check
          if (clusterW >= 16 && clusterH >= 16 && aspect >= 0.45 && aspect <= 2.2) {
            // Generous margins: 45% top for full hair/forehead, 35% bottom for chin, 40% sides for ears/cheeks
            const padSides = Math.round(clusterW * 0.40);
            const padTop = Math.round(clusterH * 0.45);
            const padBottom = Math.round(clusterH * 0.35);

            const rx = Math.max(0, minC * cellW - padSides);
            const ry = Math.max(0, minR * cellH - padTop);
            const rw = Math.min(sampleWidth - rx, clusterW + padSides * 2);
            const rh = Math.min(sampleHeight - ry, clusterH + padTop + padBottom);

            const origX = Math.round(rx * scaleX);
            const origY = Math.round(ry * scaleY);
            const origW = Math.round(rw * scaleX);
            const origH = Math.round(rh * scaleY);

            // Filter out full-page solid backgrounds (> 65% of viewport)
            if (origW < width * 0.65 && origH < height * 0.65) {
              detected.push({
                x: origX,
                y: origY,
                width: origW,
                height: origH,
                confidence: Math.min(0.99, 0.82 + totalHits / 100),
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
