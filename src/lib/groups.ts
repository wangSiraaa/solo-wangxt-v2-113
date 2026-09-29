import { mat3, type mat3 as Mat3 } from 'gl-matrix';
import type { GroupId, LatticeKind } from './types';

export type Mat = Mat3;

export interface GeneratorSpec {
  kind: 'translation' | 'rotation' | 'reflection' | 'glide';
  label: string;
  matrix: Mat;
}

export interface GroupDef {
  id: GroupId;
  name: string;
  lattice: LatticeKind;
  generators: GeneratorSpec[];
  cosets: Mat[];
  description: string;
}

const I = mat3.identity(mat3.create());

/** Affine map x' = a*x + b*y + tx, y' = c*x + d*y + ty. */
export function aff(a: number, b: number, c: number, d: number, tx = 0, ty = 0): Mat {
  return mat3.fromValues(a, c, 0, b, d, 0, tx, ty, 1);
}

export function translation(tx: number, ty: number): Mat {
  return aff(1, 0, 0, 1, tx, ty);
}

export function fractionalDistance(a: number, b: number): number {
  const raw = Math.abs(((a - b) % 1 + 1.5) % 1 - 0.5);
  return Math.min(raw, 1 - raw);
}

function sameModuloLattice(a: Mat, b: Mat): boolean {
  for (let i = 0; i < 8; i++) {
    if (Math.abs(a[i] - b[i]) > 1e-7) return false;
  }
  return fractionalDistance(a[6], b[6]) < 1e-7 && fractionalDistance(a[7], b[7]) < 1e-7;
}

function canonical(m: Mat): Mat {
  const out = mat3.clone(m);
  out[6] = ((out[6] % 1) + 1) % 1;
  out[7] = ((out[7] % 1) + 1) % 1;
  if (out[6] > 1 - 1e-7) out[6] = 0;
  if (out[7] > 1 - 1e-7) out[7] = 0;
  return out;
}

/**
 * Coset representatives relative to the two conventional lattice translations.
 * The renderer later reintroduces every integer translation and clips each
 * period, so these matrices are reduced modulo Z². Centered groups keep the
 * centering translation because it is an independent lattice coset.
 */
function buildCosets(generators: Mat[]): Mat[] {
  const result: Mat[] = [mat3.clone(I)];
  const queue: Mat[] = [mat3.clone(I)];

  while (queue.length) {
    const current = queue.shift()!;
    for (const g of generators) {
      const next = canonical(mat3.mul(mat3.create(), current, g));
      if (!result.some((m) => sameModuloLattice(m, next))) {
        result.push(next);
        queue.push(next);
      }
    }
  }
  return result;
}

function group(
  id: GroupId,
  name: string,
  lattice: LatticeKind,
  description: string,
  rawGenerators: GeneratorSpec[],
): GroupDef {
  return {
    id,
    name,
    lattice,
    description,
    generators: rawGenerators,
    cosets: buildCosets(rawGenerators.map((g) => g.matrix)),
  };
}

// Fractional-coordinate linear parts. For gamma=60°: R60(e1)=e2, R60(e2)=e2-e1.
const r180 = aff(-1, 0, 0, -1);
const r90 = aff(0, -1, 1, 0);
const r120 = aff(-1, -1, 1, 0);
const r60 = aff(0, -1, 1, 1);
const mirrorX = aff(-1, 0, 0, 1); // x -> -x
const mirrorY = aff(1, 0, 0, -1); // y -> -y
const mirrorDiagonal = aff(0, 1, 1, 0); // x <-> y
const mirrorHexX = aff(1, 1, 0, -1); // reflection along e1 in a 60° basis
const glideX = aff(1, 0, 0, -1, 0.5, 0);
const glideY = aff(-1, 0, 0, 1, 0, 0.5);
const center = translation(0.5, 0.5);
const p4gGlide = aff(1, 0, 0, -1, 0.5, 0.5); // glide axis y=1/4, vector (1/2,0)
const p31mMirror = aff(1, 1, 0, -1, -1 / 3, 2 / 3); // horizontal axis at y=1/3

export const GROUPS: Record<GroupId, GroupDef> = {
  p1: group('p1', 'p1 — 仅平移', 'oblique', '两个独立平移；平凡点群。', []),
  p2: group(
    'p2',
    'p2 — 180°旋转',
    'oblique',
    '平移与一个二阶旋转；平移共轭给出其余半格旋转中心。',
    [{ kind: 'rotation', label: 'r₁₈₀(0,0)', matrix: r180 }],
  ),
  pm: group(
    'pm',
    'pm — 平行反射',
    'rectangular',
    '矩形格上的平行镜面，平移生成间距一半的另一组轴。',
    [{ kind: 'reflection', label: 'σ: x→−x', matrix: mirrorX }],
  ),
  pg: group(
    'pg',
    'pg — 滑移反射',
    'rectangular',
    '唯一非平凡生成元是滑移 g；g²=(1,0)，不是普通镜像加复制。',
    [{ kind: 'glide', label: 'g:(x,y)→(x+1/2,−y)', matrix: glideX }],
  ),
  cm: group(
    'cm',
    'cm — 定心反射',
    'centered',
    '定心平移 c=(1/2,1/2) 与镜面复合，交错产生反射轴和滑移轴。',
    [
      { kind: 'translation', label: 'c:(1/2,1/2)', matrix: center },
      { kind: 'reflection', label: 'σ: x→−x', matrix: mirrorX },
    ],
  ),
  pmm: group(
    'pmm',
    'pmm — 正交反射',
    'rectangular',
    '水平与垂直两个镜面；点群为矩形 D2。',
    [
      { kind: 'reflection', label: 'σᵥ:x→−x', matrix: mirrorX },
      { kind: 'reflection', label: 'σₕ:y→−y', matrix: mirrorY },
    ],
  ),
  pmg: group(
    'pmg',
    'pmg — 镜面/垂直滑移',
    'rectangular',
    '镜面与垂直方向的滑移复合，产生二阶旋转中心。',
    [
      { kind: 'reflection', label: 'σᵥ:x→−x', matrix: mirrorX },
      { kind: 'glide', label: 'g:(x,y)→(x+1/2,−y)', matrix: glideX },
    ],
  ),
  pgg: group(
    'pgg',
    'pgg — 双滑移',
    'rectangular',
    '两条互相垂直的滑移；其复合是位于四分之一点的180°旋转。',
    [
      { kind: 'glide', label: 'gₓ:(x+1/2,−y)', matrix: glideX },
      { kind: 'glide', label: 'gᵧ:(−x,y+1/2)', matrix: glideY },
    ],
  ),
  cmm: group(
    'cmm',
    'cmm — 定心正交反射',
    'centered',
    '定心格与水平、垂直反射；常规单元含两个格点。',
    [
      { kind: 'translation', label: 'c:(1/2,1/2)', matrix: center },
      { kind: 'reflection', label: 'σᵥ:x→−x', matrix: mirrorX },
      { kind: 'reflection', label: 'σₕ:y→−y', matrix: mirrorY },
    ],
  ),
  p4: group(
    'p4',
    'p4 — 90°旋转',
    'square',
    '正方形格上的四阶旋转，r⁴ 回到平移恒等类。',
    [{ kind: 'rotation', label: 'r₉₀(0,0)', matrix: r90 }],
  ),
  p4m: group(
    'p4m',
    'p4m — 四阶+对角镜面',
    'square',
    '90°旋转和穿过旋转中心的对角反射，封闭为 D4。',
    [
      { kind: 'rotation', label: 'r₉₀(0,0)', matrix: r90 },
      { kind: 'reflection', label: 'σ:x↔y', matrix: mirrorDiagonal },
    ],
  ),
  p4g: group(
    'p4g',
    'p4g — 四阶+对角线滑移',
    'square',
    '90°旋转与半格滑移生成；其复合得到穿过二阶中心、但不穿过四转中心的反射轴。',
    [
      { kind: 'rotation', label: 'r₉₀(0,0)', matrix: r90 },
      { kind: 'glide', label: 'g:(x+1/2,1/2−y)', matrix: p4gGlide },
    ],
  ),
  p3: group(
    'p3',
    'p3 — 120°旋转',
    'hexagonal',
    '六方/三角格上的三阶旋转，分数坐标中 r(e1)=e2-e1。',
    [{ kind: 'rotation', label: 'r₁₂₀(0,0)', matrix: r120 }],
  ),
  p3m1: group(
    'p3m1',
    'p3m1 — 三旋转中心位于镜轴',
    'hexagonal',
    '120°旋转与穿过原点的反射复合为 D3。',
    [
      { kind: 'rotation', label: 'r₁₂₀(0,0)', matrix: r120 },
      { kind: 'reflection', label: 'σ:e₁轴', matrix: mirrorHexX },
    ],
  ),
  p31m: group(
    'p31m',
    'p31m — 错开的三反射',
    'hexagonal',
    '镜轴位于 y=1/3，不穿过原点三转中心；另一类三转中心在轴上。',
    [
      { kind: 'rotation', label: 'r₁₂₀(0,0)', matrix: r120 },
      { kind: 'reflection', label: 'σ:y=1/3', matrix: p31mMirror },
    ],
  ),
  p6: group(
    'p6',
    'p6 — 60°旋转',
    'hexagonal',
    '六阶旋转；r²、r³ 分别给出120°与180°旋转。',
    [{ kind: 'rotation', label: 'r₆₀(0,0)', matrix: r60 }],
  ),
  p6m: group(
    'p6m',
    'p6m — 六方全对称',
    'hexagonal',
    '60°旋转和镜面复合为 D6，包含三角格全套旋转与反射。',
    [
      { kind: 'rotation', label: 'r₆₀(0,0)', matrix: r60 },
      { kind: 'reflection', label: 'σ:e₁轴', matrix: mirrorHexX },
    ],
  ),
};

export const GROUP_ORDER: GroupId[] = [
  'p1', 'p2',
  'pm', 'pg', 'cm',
  'pmm', 'pmg', 'pgg', 'cmm',
  'p4', 'p4m', 'p4g',
  'p3', 'p3m1', 'p31m', 'p6', 'p6m',
];

export function enforceLattice(groupId: GroupId, current: { a: number; b: number; gamma: number }) {
  const lattice = GROUPS[groupId].lattice;
  if (lattice === 'square' || lattice === 'hexagonal') {
    const size = Math.max(80, current.a || 220);
    return { a: size, b: size, gamma: lattice === 'hexagonal' ? 60 : 90 };
  }
  if (lattice === 'rectangular' || lattice === 'centered') {
    return { a: Math.max(80, current.a || 220), b: Math.max(80, current.b || 220), gamma: 90 };
  }
  return {
    a: Math.max(80, current.a || 240),
    b: Math.max(80, current.b || 200),
    gamma: Math.min(150, Math.max(30, current.gamma || 75)),
  };
}
