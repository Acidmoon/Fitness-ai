import { createHash } from 'node:crypto';
import {
  POSE_TRACK_CONF_SCALE,
  POSE_TRACK_COORD_SCALE,
  POSE_TRACK_KEYPOINT_COUNT,
  type PoseTrack,
  type PoseTrackFrame,
  type PoseTrackSegment,
  type RenderedSkeletonGif,
} from './skeleton-contracts.ts';

/**
 * Pure-TypeScript GIF89a encoder and 2D MoveNet skeleton rasterizer.
 *
 * Uses a fixed 16-color palette (4-bit LZW) with per-frame dirty-rectangle
 * delta cropping and NETSCAPE2.0 infinite looping, requiring zero external
 * dependencies while producing compact, standards-compliant animated GIFs.
 */

const GIF_RENDER_VERSION = 'v1';
const MAX_LONG_EDGE = 320;
const MIN_SHORT_EDGE = 96;
const MIN_DELAY_CS = 5; // 50ms (~20fps max playback speed)
const MAX_DELAY_CS = 150; // 1.5s cap per frame

// 16-color RGB palette (indices 0..15).
const PALETTE: readonly (readonly [number, number, number])[] = [
  [0x0f, 0x17, 0x1a], // 0: deep slate background
  [0x1a, 0x26, 0x2b], // 1: subtle guide grid / frame border
  [0x2a, 0x3b, 0x42], // 2: timeline track background
  [0x47, 0x63, 0x6e], // 3: low-confidence bone / idle badge
  [0x34, 0xd3, 0x99], // 4: emerald — primary torso bones
  [0x10, 0xb9, 0x81], // 5: deeper emerald — left limbs
  [0x38, 0xbd, 0xf8], // 6: sky blue — right limbs
  [0xf5, 0x9e, 0x0b], // 7: amber — rep bottom / hold highlight
  [0xfb, 0xbf, 0x24], // 8: bright amber — hold/bottom joints & marker
  [0xf8, 0xfa, 0xfc], // 9: crisp white — joint core & head outline
  [0x6e, 0xe7, 0xb7], // 10: mint — active rep indicator
  [0x22, 0xc5, 0x5e], // 11: green — rep span on timeline
  [0xfb, 0x71, 0x85], // 12: coral — face / head accent
  [0x94, 0xa3, 0xb8], // 13: muted slate — head connections
  [0x1e, 0x29, 0x3b], // 14: HUD / timeline backdrop
  [0xe2, 0xe8, 0xf0], // 15: light gray — timeline playhead needle
];

interface BoneSpec {
  readonly a: number;
  readonly b: number;
  readonly group: 'head' | 'torso' | 'left' | 'right';
}

// Standard MoveNet / COCO 17-keypoint topology.
const COCO_BONES: readonly BoneSpec[] = [
  { a: 0, b: 1, group: 'head' },
  { a: 0, b: 2, group: 'head' },
  { a: 1, b: 3, group: 'head' },
  { a: 2, b: 4, group: 'head' },
  { a: 5, b: 6, group: 'torso' },
  { a: 5, b: 11, group: 'torso' },
  { a: 6, b: 12, group: 'torso' },
  { a: 11, b: 12, group: 'torso' },
  { a: 5, b: 7, group: 'left' },
  { a: 7, b: 9, group: 'left' },
  { a: 6, b: 8, group: 'right' },
  { a: 8, b: 10, group: 'right' },
  { a: 11, b: 13, group: 'left' },
  { a: 13, b: 15, group: 'left' },
  { a: 12, b: 14, group: 'right' },
  { a: 14, b: 16, group: 'right' },
];

class ByteWriter {
  private buffer = new Uint8Array(8192);
  private offset = 0;

  private ensure(extra: number): void {
    const needed = this.offset + extra;
    if (needed <= this.buffer.length) return;
    let next = this.buffer.length * 2;
    while (next < needed) next *= 2;
    const grown = new Uint8Array(next);
    grown.set(this.buffer.subarray(0, this.offset));
    this.buffer = grown;
  }

  writeByte(value: number): void {
    this.ensure(1);
    this.buffer[this.offset++] = value & 0xff;
  }

  writeUint16LE(value: number): void {
    this.ensure(2);
    this.buffer[this.offset++] = value & 0xff;
    this.buffer[this.offset++] = (value >>> 8) & 0xff;
  }

  writeAscii(text: string): void {
    this.ensure(text.length);
    for (let i = 0; i < text.length; i++) {
      this.buffer[this.offset++] = text.charCodeAt(i) & 0xff;
    }
  }

  writeBytes(data: Uint8Array, length = data.length): void {
    this.ensure(length);
    this.buffer.set(data.subarray(0, length), this.offset);
    this.offset += length;
  }

  toUint8Array(): Uint8Array {
    return this.buffer.slice(0, this.offset);
  }
}

/**
 * Encodes 4-bit palette indices (`0..15`) using GIF89a variable-width LZW
 * (minCodeSize = 4, Clear = 16, EOI = 17, max 12-bit code width).
 */
function encodeLzw4(pixels: Uint8Array, writer: ByteWriter, table: Int32Array): void {
  const minCodeSize = 4;
  const clearCode = 1 << minCodeSize; // 16
  const eoiCode = clearCode + 1; // 17
  const maxTableSize = 4096;

  writer.writeByte(minCodeSize);

  const subBlock = new Uint8Array(255);
  let subLen = 0;
  let bitBuffer = 0;
  let bitCount = 0;

  const flushSubBlock = () => {
    if (subLen === 0) return;
    writer.writeByte(subLen);
    writer.writeBytes(subBlock, subLen);
    subLen = 0;
  };

  const emitCode = (code: number, size: number) => {
    bitBuffer |= code << bitCount;
    bitCount += size;
    while (bitCount >= 8) {
      subBlock[subLen++] = bitBuffer & 0xff;
      bitBuffer >>>= 8;
      bitCount -= 8;
      if (subLen === 255) flushSubBlock();
    }
  };

  table.fill(-1);
  let codeSize = minCodeSize + 1; // 5
  let nextCode = eoiCode + 1; // 18
  emitCode(clearCode, codeSize);

  if (pixels.length > 0) {
    let prefix = pixels[0]! & 0x0f;
    for (let i = 1; i < pixels.length; i++) {
      const k = pixels[i]! & 0x0f;
      const slot = (prefix << 4) | k;
      const hit = table[slot]!;
      if (hit !== -1) {
        prefix = hit;
      } else {
        emitCode(prefix, codeSize);
        if (nextCode < maxTableSize) {
          table[slot] = nextCode++;
          if (nextCode > (1 << codeSize) && codeSize < 12) {
            codeSize++;
          }
        } else {
          emitCode(clearCode, codeSize);
          table.fill(-1);
          codeSize = minCodeSize + 1;
          nextCode = eoiCode + 1;
        }
        prefix = k;
      }
    }
    emitCode(prefix, codeSize);
  }

  emitCode(eoiCode, codeSize);
  if (bitCount > 0) {
    subBlock[subLen++] = bitBuffer & 0xff;
    bitBuffer = 0;
    bitCount = 0;
  }
  flushSubBlock();
  writer.writeByte(0x00); // Block terminator
}

function computeCanvasSize(sourceWidth: number, sourceHeight: number): { width: number; height: number } {
  const aspect = sourceWidth / sourceHeight;
  let width: number;
  let height: number;
  if (aspect >= 1) {
    width = MAX_LONG_EDGE;
    height = Math.max(MIN_SHORT_EDGE, Math.min(MAX_LONG_EDGE, Math.round(MAX_LONG_EDGE / aspect)));
  } else {
    height = MAX_LONG_EDGE;
    width = Math.max(MIN_SHORT_EDGE, Math.min(MAX_LONG_EDGE, Math.round(MAX_LONG_EDGE * aspect)));
  }
  // Keep dimensions even for clean sub-sampling/display scaling.
  width = Math.max(MIN_SHORT_EDGE, Math.round(width / 2) * 2);
  height = Math.max(MIN_SHORT_EDGE, Math.round(height / 2) * 2);
  return { width, height };
}

function setPixel(canvas: Uint8Array, width: number, height: number, x: number, y: number, color: number): void {
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  canvas[y * width + x] = color;
}

function fillRect(
  canvas: Uint8Array, width: number, height: number,
  x0: number, y0: number, rw: number, rh: number, color: number,
): void {
  const startX = Math.max(0, x0);
  const startY = Math.max(0, y0);
  const endX = Math.min(width, x0 + rw);
  const endY = Math.min(height, y0 + rh);
  for (let y = startY; y < endY; y++) {
    const row = y * width;
    for (let x = startX; x < endX; x++) {
      canvas[row + x] = color;
    }
  }
}

function drawCircle(
  canvas: Uint8Array, width: number, height: number,
  cx: number, cy: number, radius: number, color: number,
): void {
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= r2) {
        setPixel(canvas, width, height, cx + dx, cy + dy, color);
      }
    }
  }
}

function drawLine(
  canvas: Uint8Array, width: number, height: number,
  x0: number, y0: number, x1: number, y1: number,
  thickness: number, color: number,
): void {
  let cx = x0;
  let cy = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  const radius = thickness <= 1 ? 0 : Math.floor(thickness / 2);

  while (true) {
    if (radius === 0) {
      setPixel(canvas, width, height, cx, cy, color);
    } else {
      drawCircle(canvas, width, height, cx, cy, radius, color);
    }
    if (cx === x1 && cy === y1) break;
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      cx += sx;
    }
    if (e2 < dx) {
      err += dx;
      cy += sy;
    }
  }
}

type FramePhase = 'idle' | 'rep' | 'peak' | 'hold';

function classifyPhase(timestampMs: number, segments: readonly PoseTrackSegment[]): FramePhase {
  for (const segment of segments) {
    if (timestampMs >= segment.startMs && timestampMs <= segment.endMs) {
      if (segment.kind === 'hold') return 'hold';
      if (segment.bottomMs !== undefined && Math.abs(timestampMs - segment.bottomMs) <= 160) {
        return 'peak';
      }
      return 'rep';
    }
  }
  return 'idle';
}

function drawBackground(canvas: Uint8Array, width: number, height: number): void {
  canvas.fill(0);
  // Subtle border
  fillRect(canvas, width, height, 0, 0, width, 1, 1);
  fillRect(canvas, width, height, 0, height - 1, width, 1, 1);
  fillRect(canvas, width, height, 0, 0, 1, height, 1);
  fillRect(canvas, width, height, width - 1, 0, 1, height, 1);

  // Subtle rule-of-thirds reference guides inside the skeleton viewport
  const timelineH = 14;
  const viewH = height - timelineH;
  for (const frac of [0.25, 0.5, 0.75]) {
    const gx = Math.round(width * frac);
    const gy = Math.round(viewH * frac);
    for (let y = 4; y < viewH - 2; y += 4) setPixel(canvas, width, height, gx, y, 1);
    for (let x = 4; x < width - 4; x += 4) setPixel(canvas, width, height, x, gy, 1);
  }
}

function drawTimeline(
  canvas: Uint8Array, width: number, height: number,
  frame: PoseTrackFrame, startMs: number, endMs: number,
  segments: readonly PoseTrackSegment[], phase: FramePhase,
): void {
  const barTop = height - 12;
  const barH = 11;
  fillRect(canvas, width, height, 1, barTop, width - 2, barH, 14);

  const trackX = 8;
  const trackW = Math.max(16, width - 16);
  const trackY = height - 8;
  const trackH = 4;
  fillRect(canvas, width, height, trackX, trackY, trackW, trackH, 2);

  const span = Math.max(1, endMs - startMs);
  const toX = (ms: number) => trackX + Math.max(0, Math.min(trackW - 1, Math.round(((ms - startMs) / span) * (trackW - 1))));

  for (const seg of segments) {
    const sx = toX(seg.startMs);
    const ex = Math.max(sx + 1, toX(seg.endMs));
    const color = seg.kind === 'hold' ? 7 : 11;
    fillRect(canvas, width, height, sx, trackY, ex - sx + 1, trackH, color);
    if (seg.bottomMs !== undefined) {
      const bx = toX(seg.bottomMs);
      fillRect(canvas, width, height, bx, trackY - 1, 2, trackH + 2, 8);
    }
  }

  // Playhead needle
  const playX = toX(frame.timestampMs);
  fillRect(canvas, width, height, Math.max(trackX, playX - 1), trackY - 2, 2, trackH + 4, 15);

  // Label-free phase status dot in top-left corner
  const badgeColor = phase === 'hold' || phase === 'peak' ? 8 : phase === 'rep' ? 10 : 3;
  fillRect(canvas, width, height, 7, 7, 12, 6, 14);
  drawCircle(canvas, width, height, 10, 10, 2, badgeColor);
  fillRect(canvas, width, height, 14, 9, 4, 2, badgeColor);
}

function rasterizeFrame(
  canvas: Uint8Array, width: number, height: number,
  frame: PoseTrackFrame, startMs: number, endMs: number,
  segments: readonly PoseTrackSegment[],
): void {
  drawBackground(canvas, width, height);
  const phase = classifyPhase(frame.timestampMs, segments);
  drawTimeline(canvas, width, height, frame, startMs, endMs, segments, phase);

  const padX = 10;
  const padTop = 10;
  const padBottom = 18;
  const drawW = Math.max(16, width - padX * 2);
  const drawH = Math.max(16, height - padTop - padBottom);

  const xs = new Int32Array(POSE_TRACK_KEYPOINT_COUNT);
  const ys = new Int32Array(POSE_TRACK_KEYPOINT_COUNT);
  const cs = new Float32Array(POSE_TRACK_KEYPOINT_COUNT);

  for (let k = 0; k < POSE_TRACK_KEYPOINT_COUNT; k++) {
    const qx = frame.keypoints[k * 3]!;
    const qy = frame.keypoints[k * 3 + 1]!;
    const qc = frame.keypoints[k * 3 + 2]!;
    xs[k] = padX + Math.round((qx / POSE_TRACK_COORD_SCALE) * (drawW - 1));
    ys[k] = padTop + Math.round((qy / POSE_TRACK_COORD_SCALE) * (drawH - 1));
    cs[k] = qc / POSE_TRACK_CONF_SCALE;
  }

  // Draw bones first, then joints on top for crisp visual hierarchy.
  for (const bone of COCO_BONES) {
    const minConf = Math.min(cs[bone.a]!, cs[bone.b]!);
    if (minConf < 0.2) continue;
    const high = minConf >= 0.35;
    let color: number;
    if (!high) {
      color = 3;
    } else if (phase === 'peak' || phase === 'hold') {
      color = bone.group === 'head' ? 13 : bone.group === 'torso' ? 7 : 8;
    } else if (bone.group === 'torso') {
      color = phase === 'rep' ? 10 : 4;
    } else if (bone.group === 'left') {
      color = 5;
    } else if (bone.group === 'right') {
      color = 6;
    } else {
      color = 13;
    }
    drawLine(canvas, width, height, xs[bone.a]!, ys[bone.a]!, xs[bone.b]!, ys[bone.b]!, high ? 3 : 1, color);
  }

  for (let k = 0; k < POSE_TRACK_KEYPOINT_COUNT; k++) {
    const conf = cs[k]!;
    if (conf < 0.22) continue;
    const isFace = k <= 4;
    const outerRadius = isFace ? 2 : conf >= 0.5 ? 3 : 2;
    const ringColor = conf < 0.35
      ? 3
      : phase === 'peak' || phase === 'hold'
        ? 7
        : isFace
          ? 12
          : k % 2 === 1
            ? 5
            : 6;
    drawCircle(canvas, width, height, xs[k]!, ys[k]!, outerRadius, ringColor);
    if (conf >= 0.45 && !isFace) {
      drawCircle(canvas, width, height, xs[k]!, ys[k]!, 1, 9);
    } else if (k === 0 && conf >= 0.45) {
      setPixel(canvas, width, height, xs[k]!, ys[k]!, 9);
    }
  }
}

/**
 * Encodes a validated {@link PoseTrack} into a standards-compliant animated GIF89a.
 */
export function encodeSkeletonGif(track: PoseTrack): RenderedSkeletonGif {
  const { width, height } = computeCanvasSize(track.width, track.height);
  const frames = track.frames;
  const startMs = frames[0]!.timestampMs;
  const endMs = frames[frames.length - 1]!.timestampMs;

  const writer = new ByteWriter();
  // 1. GIF89a Header
  writer.writeAscii('GIF89a');
  // 2. Logical Screen Descriptor
  writer.writeUint16LE(width);
  writer.writeUint16LE(height);
  writer.writeByte(0xf3); // GCT=1, ColorRes=7 (8-bit), Sort=0, GCT Size=3 (16 colors)
  writer.writeByte(0x00); // Background color index = 0
  writer.writeByte(0x00); // Pixel aspect ratio = 0
  // 3. Global Color Table (16 * 3 = 48 bytes)
  for (const [r, g, b] of PALETTE) {
    writer.writeByte(r);
    writer.writeByte(g);
    writer.writeByte(b);
  }
  // 4. NETSCAPE2.0 Application Extension (infinite loop)
  writer.writeByte(0x21);
  writer.writeByte(0xff);
  writer.writeByte(0x0b);
  writer.writeAscii('NETSCAPE2.0');
  writer.writeByte(0x03);
  writer.writeByte(0x01);
  writer.writeUint16LE(0x0000); // 0 = loop forever
  writer.writeByte(0x00);

  const current = new Uint8Array(width * height);
  const previous = new Uint8Array(width * height);
  const lzwTable = new Int32Array(4096 * 16);
  const fallbackDelayCs = Math.max(MIN_DELAY_CS, Math.min(MAX_DELAY_CS, Math.round(100 / Math.max(0.5, track.fps))));

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]!;
    rasterizeFrame(current, width, height, frame, startMs, endMs, track.segments);

    let delayCs: number;
    if (i < frames.length - 1) {
      const deltaMs = frames[i + 1]!.timestampMs - frame.timestampMs;
      delayCs = Math.max(MIN_DELAY_CS, Math.min(MAX_DELAY_CS, Math.round(deltaMs / 10)));
    } else {
      delayCs = Math.max(fallbackDelayCs, 20); // Slight pause before loop restarts
    }

    // Compute dirty bounding box relative to previous frame for compact GIF size.
    let left = 0;
    let top = 0;
    let rectW = width;
    let rectH = height;
    let rectPixels: Uint8Array;

    if (i === 0) {
      rectPixels = current;
    } else {
      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < height; y++) {
        const row = y * width;
        for (let x = 0; x < width; x++) {
          if (current[row + x] !== previous[row + x]) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < minX) {
        // Identical frame: emit a 1×1 no-op patch preserving the exact delay.
        left = 0;
        top = 0;
        rectW = 1;
        rectH = 1;
        rectPixels = new Uint8Array([current[0]!]);
      } else {
        left = minX;
        top = minY;
        rectW = maxX - minX + 1;
        rectH = maxY - minY + 1;
        rectPixels = new Uint8Array(rectW * rectH);
        for (let y = 0; y < rectH; y++) {
          const srcOffset = (top + y) * width + left;
          rectPixels.set(current.subarray(srcOffset, srcOffset + rectW), y * rectW);
        }
      }
    }

    // Graphic Control Extension (disposal=1 "do not dispose", no transparency)
    writer.writeByte(0x21);
    writer.writeByte(0xf9);
    writer.writeByte(0x04);
    writer.writeByte(0x04);
    writer.writeUint16LE(delayCs);
    writer.writeByte(0x00);
    writer.writeByte(0x00);

    // Image Descriptor
    writer.writeByte(0x2c);
    writer.writeUint16LE(left);
    writer.writeUint16LE(top);
    writer.writeUint16LE(rectW);
    writer.writeUint16LE(rectH);
    writer.writeByte(0x00); // No local color table, non-interlaced

    // Image Data (LZW 4-bit)
    encodeLzw4(rectPixels, writer, lzwTable);
    previous.set(current);
  }

  // 5. GIF Trailer
  writer.writeByte(0x3b);

  const bytes = writer.toUint8Array();
  const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  return Object.freeze({
    bytes,
    width,
    height,
    frameCount: frames.length,
    etag: `"skel-${digest}-${GIF_RENDER_VERSION}"`,
  });
}

export function skeletonEtagForHash(contentSha256: string): string {
  return `"skel-${contentSha256.slice(0, 16)}-${GIF_RENDER_VERSION}"`;
}
