import { mat3, vec2, type mat3 as Mat3 } from 'gl-matrix';
import { basisMatrix } from './storage';
import { GROUPS } from './groups';
import type { HitResult, ProjectDoc, SelectionTarget, Shape, Vec2 } from './types';

export interface ViewState {
  scale: number;
  /** World position placed at the canvas center. */
  center: Vec2;
}

export interface RenderOptions {
  view: ViewState;
  selection: SelectionTarget | null;
  showGuides: boolean;
  highlightOnly?: boolean;
}

export function viewMatrix(canvas: HTMLCanvasElement, view: ViewState): mat3 {
  return mat3.fromValues(
    view.scale, 0, 0,
    0, view.scale, 0,
    canvas.clientWidth / 2 - view.center[0] * view.scale,
    canvas.clientHeight / 2 - view.center[1] * view.scale,
    1,
  );
}

export function screenToWorld(canvas: HTMLCanvasElement, view: ViewState, screen: Vec2): Vec2 {
  const rect = canvas.getBoundingClientRect();
  const p = vec2.fromValues(screen[0] - rect.left, screen[1] - rect.top);
  return Array.from(vec2.transformMat3(vec2.create(), p, mat3.invert(mat3.create(), viewMatrix(canvas, view))!)) as Vec2;
}

export function applyMat(ctx: CanvasRenderingContext2D, m: mat3) {
  ctx.transform(m[0], m[1], m[3], m[4], m[6], m[7]);
}

export function transformedPoints(shape: Shape): Vec2[] {
  const m = mat3.fromValues(...shape.transform);
  const local = shape.type === 'polygon'
    ? shape.points
    : Array.from({ length: 56 }, (_, i) => {
        const t = (i / 56) * Math.PI * 2;
        return [shape.rx * Math.cos(t), shape.ry * Math.sin(t)] as Vec2;
      });
  return local.map((p) => Array.from(vec2.transformMat3(vec2.create(), vec2.fromValues(p[0], p[1]), m))) as Vec2[];
}

export function shapeFractionalBounds(shape: Shape): [number, number, number, number] {
  const pts = transformedPoints(shape);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function shapePath(shape: Shape): Path2D {
  const path = new Path2D();
  if (shape.type === 'polygon') {
    shape.points.forEach((p, i) => {
      if (i === 0) path.moveTo(p[0], p[1]);
      else path.lineTo(p[0], p[1]);
    });
    path.closePath();
  } else {
    path.ellipse(0, 0, shape.rx, shape.ry, 0, 0, Math.PI * 2);
  }
  return path;
}

export function cellPath(): Path2D {
  const p = new Path2D();
  p.moveTo(0, 0);
  p.lineTo(1, 0);
  p.lineTo(1, 1);
  p.lineTo(0, 1);
  p.closePath();
  return p;
}

function composeInstance(shape: Shape, coset: mat3, cell: Vec2): mat3 {
  const shapeM = mat3.fromValues(...shape.transform);
  const cellM = mat3.fromTranslation(mat3.create(), cell);
  // local -> shape -> group coset -> integer cell translation
  return mat3.mul(mat3.create(), cellM, mat3.mul(mat3.create(), coset, shapeM));
}

export function paintShape(ctx: CanvasRenderingContext2D, shape: Shape, selected = false) {
  const path = shapePath(shape);
  ctx.fillStyle = shape.color;
  ctx.strokeStyle = selected ? '#fff36a' : '#17202b';
  ctx.globalAlpha = shape.opacity;
  ctx.lineWidth = selected ? 0.014 : 0.007;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.fill(path);
  ctx.stroke(path);
}

function candidateOffsets(shape: Shape, coset?: Mat3): Vec2[] {
  const pts = transformedPoints(shape).map((p) => {
    if (!coset) return p;
    return Array.from(vec2.transformMat3(vec2.create(), vec2.fromValues(...p), coset)) as Vec2;
  });
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const out: Vec2[] = [];
  const minTx = Math.floor(-maxX) - 1;
  const maxTx = Math.ceil(-minX) + 1;
  const minTy = Math.floor(-maxY) - 1;
  const maxTy = Math.ceil(-minY) + 1;
  for (let y = minTy; y <= maxTy; y++) {
    for (let x = minTx; x <= maxTx; x++) out.push([x, y]);
  }
  return out;
}

function visibleCellRange(ctx: CanvasRenderingContext2D, width: number, height: number, basis: mat3) {
  const inverse = mat3.invert(mat3.create(), basis)!;
  const corners = [[0, 0], [width, 0], [width, height], [0, height]] as Vec2[];
  const frac = corners.map((p) => Array.from(vec2.transformMat3(vec2.create(), vec2.fromValues(...p), inverse))) as Vec2[];
  const xs = frac.map((p) => p[0]);
  const ys = frac.map((p) => p[1]);
  return {
    minX: Math.floor(Math.min(...xs)) - 1,
    maxX: Math.ceil(Math.max(...xs)) + 1,
    minY: Math.floor(Math.min(...ys)) - 1,
    maxY: Math.ceil(Math.max(...ys)) + 1,
  };
}

function line(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number) {
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
}

function rotationMark(ctx: CanvasRenderingContext2D, x: number, y: number, order: 2 | 3 | 4 | 6, scale: number) {
  const r = 0.055 * scale;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = 'rgba(255,255,255,.95)';
  ctx.fillStyle = 'rgba(20,31,43,.82)';
  ctx.lineWidth = 0.012 * scale;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffd166';
  ctx.font = `${Math.round(r * 1.35)}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(order), 0, r * 0.05);
  ctx.restore();
}

function mirror(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, scale: number) {
  ctx.save();
  ctx.strokeStyle = 'rgba(79,220,255,.95)';
  ctx.lineWidth = 0.018 * scale;
  ctx.setLineDash([0.08, 0.045]);
  line(ctx, x1, y1, x2, y2);
  ctx.restore();
}

function glide(ctx: CanvasRenderingContext2D, horizontal: boolean, x: number, y: number, scale: number, length = 1) {
  ctx.save();
  ctx.strokeStyle = '#ffb84d';
  ctx.fillStyle = '#ffb84d';
  ctx.lineWidth = 0.014 * scale;
  const half = length / 2;
  if (horizontal) {
    line(ctx, x - half, y, x + half, y);
    for (const sx of [-length * 0.28, length * 0.28]) {
      ctx.beginPath();
      ctx.moveTo(x + sx + 0.055, y);
      ctx.lineTo(x + sx - 0.02, y - 0.035);
      ctx.lineTo(x + sx - 0.02, y + 0.035);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    line(ctx, x, y - half, x, y + half);
    for (const sy of [-length * 0.28, length * 0.28]) {
      ctx.beginPath();
      ctx.moveTo(x, y + sy + 0.055);
      ctx.lineTo(x - 0.035, y + sy - 0.02);
      ctx.lineTo(x + 0.035, y + sy - 0.02);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawGuidesForGroup(ctx: CanvasRenderingContext2D, groupId: ProjectDoc['groupId'], scale: number) {
  const marks2 = [[0, 0], [0.5, 0], [0, 0.5], [0.5, 0.5]] as Vec2[];

  if (groupId === 'p2') marks2.forEach(([x, y]) => rotationMark(ctx, x, y, 2, scale));
  if (groupId === 'pm') mirror(ctx, 0, 0, 0, 1, scale);
  if (groupId === 'pg') {
    glide(ctx, true, 0.5, 0, scale);
    glide(ctx, true, 0.5, 0.5, scale);
  }
  if (groupId === 'cm') {
    mirror(ctx, 0, 0, 0, 1, scale);
    mirror(ctx, 0.5, 0, 0.5, 1, scale);
    glide(ctx, false, 0.25, 0.25, scale, 0.5);
    glide(ctx, false, 0.75, 0.25, scale, 0.5);
    glide(ctx, false, 0.25, 0.75, scale, 0.5);
    glide(ctx, false, 0.75, 0.75, scale, 0.5);
  }
  if (groupId === 'pmm') {
    mirror(ctx, 0, 0, 0, 1, scale);
    mirror(ctx, 0.5, 0, 0.5, 1, scale);
    mirror(ctx, 0, 1, 1, 1, scale);
    mirror(ctx, 0, 0.5, 1, 0.5, scale);
    marks2.forEach(([x, y]) => rotationMark(ctx, x, y, 2, scale));
  }
  if (groupId === 'pmg') {
    mirror(ctx, 0, 0, 0, 1, scale);
    mirror(ctx, 0.5, 0, 0.5, 1, scale);
    glide(ctx, true, 0.5, 0, scale);
    glide(ctx, true, 0.5, 0.5, scale);
    [[0.25, 0], [0.75, 0], [0.25, 0.5], [0.75, 0.5]]
      .forEach(([x, y]) => rotationMark(ctx, x, y, 2, scale));
  }
  if (groupId === 'pgg') {
    glide(ctx, true, 0.5, 0, scale);
    glide(ctx, true, 0.5, 0.5, scale);
    glide(ctx, false, 0, 0.5, scale);
    glide(ctx, false, 0.5, 0.5, scale);
    [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]].forEach(([x, y]) => rotationMark(ctx, x, y, 2, scale));
  }
  if (groupId === 'cmm') {
    mirror(ctx, 0, 0, 0, 1, scale);
    mirror(ctx, 0.5, 0, 0.5, 1, scale);
    mirror(ctx, 0, 1, 1, 1, scale);
    mirror(ctx, 0, 0.5, 1, 0.5, scale);
    marks2.forEach(([x, y]) => rotationMark(ctx, x, y, 2, scale));
  }
  if (groupId === 'p4' || groupId === 'p4m' || groupId === 'p4g') {
    rotationMark(ctx, 0, 0, 4, scale);
    rotationMark(ctx, 0.5, 0.5, 4, scale);
    [[0.5, 0], [0, 0.5]].forEach(([x, y]) => rotationMark(ctx, x, y, 2, scale));
  }
  if (groupId === 'p4m') {
    mirror(ctx, 0, 0, 1, 1, scale);
    mirror(ctx, 0, 1, 1, 0, scale);
  }
  if (groupId === 'p4g') {
    glide(ctx, true, 0.5, 0.25, scale);
    glide(ctx, true, 0.5, 0.75, scale);
    glide(ctx, false, 0.25, 0.5, scale);
    glide(ctx, false, 0.75, 0.5, scale);
    mirror(ctx, 0, 0.5, 0.5, 1, scale);
    mirror(ctx, 0.5, 0, 1, 0.5, scale);
    mirror(ctx, 0.5, 1, 1, 0.5, scale);
    mirror(ctx, 0, 0.5, 0.5, 0, scale);
  }
  if (groupId === 'p3' || groupId === 'p3m1' || groupId === 'p31m') {
    [[0, 0], [1 / 3, 1 / 3], [2 / 3, 2 / 3]].forEach(([x, y]) => rotationMark(ctx, x, y, 3, scale));
  }
  if (groupId === 'p3m1') {
    mirror(ctx, 0, 0, 1, 0, scale);
    mirror(ctx, 0, 0, 0, 1, scale);
    mirror(ctx, 0, 1, 1, 0, scale);
  }
  if (groupId === 'p31m') mirror(ctx, 0, 1 / 3, 1, 1 / 3, scale);
  if (groupId === 'p6' || groupId === 'p6m') {
    rotationMark(ctx, 0, 0, 6, scale);
    rotationMark(ctx, 1 / 3, 1 / 3, 3, scale);
    rotationMark(ctx, 2 / 3, 2 / 3, 3, scale);
    [[0.5, 0], [0, 0.5], [0.5, 0.5]].forEach(([x, y]) => rotationMark(ctx, x, y, 2, scale));
  }
  if (groupId === 'p6m') {
    mirror(ctx, 0, 0, 1, 0, scale);
    mirror(ctx, 0, 0, 0, 1, scale);
    mirror(ctx, 0, 1, 1, 0, scale);
  }
}

export function renderEditor(
  canvas: HTMLCanvasElement,
  doc: ProjectDoc,
  options: RenderOptions,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const view = viewMatrix(canvas, options.view);
  const basis = basisMatrix(doc.basis);
  const range = visibleCellRange(ctx, width, height, mat3.mul(mat3.create(), view, basis));
  const def = GROUPS[doc.groupId];
  const cell = cellPath();

  // Cell backgrounds and grid.
  for (let y = range.minY; y <= range.maxY; y++) {
    for (let x = range.minX; x <= range.maxX; x++) {
      ctx.save();
      applyMat(ctx, view);
      applyMat(ctx, basis);
      ctx.translate(x, y);
      ctx.fillStyle = 'rgba(255,255,255,.52)';
      ctx.fill(cell);
      ctx.strokeStyle = 'rgba(34,54,72,.28)';
      ctx.lineWidth = 1 / Math.max(doc.basis.a, doc.basis.b) / options.view.scale;
      ctx.stroke(cell);
      ctx.restore();
    }
  }

  // Every visible point is produced as (shape matrix ∘ group coset ∘ lattice
  // translation). Cell clipping mathematically resolves paths crossing seams.
  for (let y = range.minY; y <= range.maxY; y++) {
    for (let x = range.minX; x <= range.maxX; x++) {
      ctx.save();
      applyMat(ctx, view);
      applyMat(ctx, basis);
      ctx.translate(x, y);
      ctx.clip(cell);
      for (const shape of doc.shapes) {
        for (const coset of def.cosets) {
          const selected = options.selection?.shapeId === shape.id
            && options.selection.cell[0] === x
            && options.selection.cell[1] === y
            && options.selection.elementIndex === def.cosets.indexOf(coset);
          ctx.save();
          for (const offset of candidateOffsets(shape, coset)) {
            ctx.save();
            applyMat(ctx, composeInstance(shape, coset, [x + offset[0], y + offset[1]]));
            paintShape(ctx, shape, Boolean(selected));
            ctx.restore();
          }
          ctx.restore();
        }
      }
      ctx.restore();
    }
  }

  if (options.showGuides) {
    for (let y = range.minY; y <= range.maxY; y++) {
      for (let x = range.minX; x <= range.maxX; x++) {
        ctx.save();
        applyMat(ctx, view);
        applyMat(ctx, basis);
        ctx.translate(x, y);
        ctx.clip(cell);
        drawGuidesForGroup(ctx, doc.groupId, Math.max(0.75, 260 / doc.basis.a));
        ctx.restore();
      }
    }
  }

  // Draw the editable source anchors: selecting any symmetry image locates the
  // same identity-preserving shape object, not a duplicated shape.
  const selectedShape = options.selection ? doc.shapes.find((s) => s.id === options.selection?.shapeId) : null;
  if (selectedShape) {
    ctx.save();
    applyMat(ctx, view);
    applyMat(ctx, basis);
    const m = mat3.fromValues(...selectedShape.transform);
    const p = vec2.transformMat3(vec2.create(), vec2.fromValues(0, 0), m);
    ctx.strokeStyle = '#fff36a';
    ctx.fillStyle = 'rgba(255,243,106,.25)';
    ctx.lineWidth = 0.01;
    ctx.beginPath();
    ctx.arc(p[0], p[1], 0.045, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (selectedShape.type === 'polygon') {
      for (const q of selectedShape.points) {
        const wq = vec2.transformMat3(vec2.create(), vec2.fromValues(q[0], q[1]), m);
        ctx.beginPath();
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#17202b';
        ctx.lineWidth = 0.006;
        ctx.arc(wq[0], wq[1], 0.022, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

export function hitTest(
  canvas: HTMLCanvasElement,
  doc: ProjectDoc,
  view: ViewState,
  screen: Vec2,
): HitResult | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const world = screenToWorld(canvas, view, screen);
  const basis = basisMatrix(doc.basis);
  const fracWorld = Array.from(
    vec2.transformMat3(vec2.create(), vec2.fromValues(...world), mat3.invert(mat3.create(), basis)!),
  ) as Vec2;
  const targetX = Math.floor(fracWorld[0]);
  const targetY = Math.floor(fracWorld[1]);
  const viewM = viewMatrix(canvas, view);
  const def = GROUPS[doc.groupId];
  const vertexHits: Array<{ result: HitResult; distance: number }> = [];

  for (const shape of [...doc.shapes].reverse()) {
    const path = shapePath(shape);
    for (let elementIndex = 0; elementIndex < def.cosets.length; elementIndex++) {
      for (const offset of candidateOffsets(shape, def.cosets[elementIndex])) {
        const cell: Vec2 = [targetX + offset[0], targetY + offset[1]];
        const screenM = mat3.mul(
          mat3.create(),
          viewM,
          mat3.mul(mat3.create(), basis, composeInstance(shape, def.cosets[elementIndex], cell)),
        );
        if (shape.type === 'polygon') {
          shape.points.forEach((p, vertexIndex) => {
            const q = vec2.transformMat3(vec2.create(), vec2.fromValues(...p), screenM);
            const distance = Math.hypot(q[0] - screen[0], q[1] - screen[1]);
            if (distance < 9) {
              vertexHits.push({ result: { shapeId: shape.id, elementIndex, cell, point: world, vertexIndex }, distance });
            }
          });
        }

        const inverseScreen = mat3.invert(mat3.create(), screenM)!;
        const localPoint = vec2.transformMat3(vec2.create(), vec2.fromValues(...screen), inverseScreen);
        if (ctx.isPointInPath(path, localPoint[0], localPoint[1])) {
          return { shapeId: shape.id, elementIndex, cell, point: world };
        }
      }
    }
  }
  vertexHits.sort((a, b) => a.distance - b.distance);
  return vertexHits[0]?.result ?? null;
}

/**
 * Render exactly one period. Offset images are clipped to [0,1]² in fractional
 * coordinates; for non-rectangular cells this is the image of the fundamental
 * parallelogram and remains a matrix-periodic data tile.
 */
export function renderPeriodTile(canvas: HTMLCanvasElement, doc: ProjectDoc, pixelSize = 520) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.width = pixelSize;
  canvas.height = pixelSize;
  ctx.setTransform(pixelSize, 0, 0, pixelSize, 0, 0);
  ctx.clearRect(0, 0, 1, 1);
  const def = GROUPS[doc.groupId];
  const clip = cellPath();
  ctx.save();
  ctx.clip(clip);
  for (const shape of doc.shapes) {
    def.cosets.forEach((coset) => {
      for (const offset of candidateOffsets(shape, coset)) {
        ctx.save();
        applyMat(ctx, composeInstance(shape, coset, offset));
        paintShape(ctx, shape);
        ctx.restore();
      }
    });
  }
  ctx.restore();
}

export function drawRepeatedTileCheck(
  canvas: HTMLCanvasElement,
  tile: HTMLCanvasElement,
  doc: ProjectDoc,
  repeat = 3,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const size = canvas.clientWidth;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#f3f6f8';
  ctx.fillRect(0, 0, size, size);

  const basis = basisMatrix(doc.basis);
  const spanA = Math.abs(basis[0]) + Math.abs(basis[3]);
  const spanB = Math.abs(basis[1]) + basis[4];
  const scale = size / (Math.max(spanA, spanB) * repeat * 1.18);
  const widthA = spanA * scale * repeat;
  const widthB = spanB * scale * repeat;
  const marginX = (size - widthA) / 2;
  const marginY = (size - widthB) / 2;
  const pattern = ctx.createPattern(tile, 'repeat');
  if (!pattern) return;
  const m = mat3.mul(
    mat3.create(),
    mat3.fromTranslation(mat3.fromScaling(mat3.create(), [scale, scale]), [marginX, marginY]),
    basis,
  );
  const dom = new DOMMatrix([m[0], m[1], m[3], m[4], m[6], m[7]].join(','));
  pattern.setTransform(dom);
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, size, size);

  // Overlay lattice-parallelogram boundaries; any discontinuity on these edges
  // is immediately visible. No internal seam is drawn.
  ctx.strokeStyle = 'rgba(220,53,69,.85)';
  ctx.lineWidth = 1.5;
  const e1 = vec2.fromValues(basis[0] * scale, basis[1] * scale);
  const e2 = vec2.fromValues(basis[3] * scale, basis[4] * scale);
  for (let j = 0; j < repeat; j++) {
    for (let i = 0; i < repeat; i++) {
      const origin = [
        marginX + e1[0] * i + e2[0] * j,
        marginY + e1[1] * i + e2[1] * j,
      ];
      ctx.beginPath();
      ctx.moveTo(origin[0], origin[1]);
      ctx.lineTo(origin[0] + e1[0], origin[1] + e1[1]);
      ctx.lineTo(origin[0] + e1[0] + e2[0], origin[1] + e1[1] + e2[1]);
      ctx.lineTo(origin[0] + e2[0], origin[1] + e2[1]);
      ctx.closePath();
      ctx.stroke();
    }
  }
}
