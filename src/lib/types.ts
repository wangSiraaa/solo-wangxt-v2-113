import type { mat3 } from 'gl-matrix';

export type Vec2 = [number, number];
export type MatrixData = [
  number, number, number,
  number, number, number,
  number, number, number,
];
export type Mat = mat3;

export type LatticeKind = 'oblique' | 'rectangular' | 'centered' | 'square' | 'hexagonal';

export type GroupId =
  | 'p1' | 'p2'
  | 'pm' | 'pg' | 'cm'
  | 'pmm' | 'pmg' | 'pgg' | 'cmm'
  | 'p4' | 'p4m' | 'p4g'
  | 'p3' | 'p3m1' | 'p31m' | 'p6' | 'p6m';

export interface BasisParams {
  a: number;
  b: number;
  gamma: number;
}

export interface Shape {
  id: string;
  name: string;
  type: 'polygon' | 'ellipse';
  color: string;
  opacity: number;
  /** Polygon vertices in the shape's own pre-transform coordinate system. */
  points: Vec2[];
  /** Ellipse radii; the matrix still carries translation, rotation and scale. */
  rx: number;
  ry: number;
  /** Column-major affine matrix in fundamental-cell fractional coordinates. */
  transform: MatrixData;
}

export interface ProjectDoc {
  id: string;
  version: 1;
  name: string;
  groupId: GroupId;
  basis: BasisParams;
  shapes: Shape[];
  updatedAt: number;
}

export interface SelectionTarget {
  shapeId: string;
  elementIndex: number;
  cell: Vec2;
  point: Vec2;
}

export interface HitResult extends SelectionTarget {
  vertexIndex?: number;
}
