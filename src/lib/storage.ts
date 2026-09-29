import { mat3 } from 'gl-matrix';
import type { BasisParams, GroupId, ProjectDoc, Shape, Vec2 } from './types';
import { aff } from './groups';

export function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function polygon(
  name: string,
  points: Vec2[],
  tx: number,
  ty: number,
  color: string,
  opacity = 1,
  angle = 0,
  scale = 1,
): Shape {
  return {
    id: makeId('shape'),
    name,
    type: 'polygon',
    points,
    color,
    opacity,
    rx: 1,
    ry: 1,
    transform: Array.from(
      mat3.fromTranslation(
        mat3.fromRotation(
          mat3.fromScaling(mat3.create(), [scale, scale] as [number, number]),
          angle,
        ),
        [tx, ty],
      ),
    ) as Shape['transform'],
  };
}

function ellipse(name: string, rx: number, ry: number, tx: number, ty: number, color: string, opacity = 1, angle = 0): Shape {
  return {
    id: makeId('shape'),
    name,
    type: 'ellipse',
    points: [],
    rx,
    ry,
    color,
    opacity,
    transform: Array.from(
      mat3.fromTranslation(mat3.fromRotation(mat3.create(), angle), [tx, ty]),
    ) as Shape['transform'],
  };
}

/**
 * A deliberately asymmetric pgg motif. pgg's two glides make paired reflected
 * copies and four rotation centers, while both ribbon shapes cross cell edges.
 */
export function createSampleDoc(groupId: GroupId = 'pgg'): ProjectDoc {
  const shapes: Shape[] = [
    polygon(
      '跨边界滑移缎带',
      [[-0.62, -0.055], [0.24, -0.055], [0.62, 0.02], [0.23, 0.09], [-0.62, 0.09]],
      0.5,
      0.25,
      '#32b5c8',
      0.62,
      -0.08,
    ),
    polygon(
      '透明折线',
      [[-0.36, -0.055], [-0.1, -0.055], [0.05, 0.04], [0.22, -0.055], [0.47, -0.055], [0.1, 0.18], [-0.13, 0.09]],
      0.5,
      0.76,
      '#f26d9d',
      0.55,
      0.04,
    ),
    polygon(
      '非对称手性箭头',
      [[-0.14, -0.08], [0.12, 0], [-0.14, 0.08], [-0.07, 0.02], [-0.2, 0.02], [-0.2, -0.02], [-0.07, -0.02]],
      0.36,
      0.55,
      '#f2b84b',
      0.92,
      -0.35,
      0.9,
    ),
    ellipse('半透明旋转点', 0.055, 0.025, 0.78, 0.72, '#8b6cf0', 0.48, 0.55),
  ];

  return {
    id: makeId('project'),
    version: 1,
    name: 'pgg 滑移与旋转样例',
    groupId,
    basis: { a: 260, b: 220, gamma: 90 },
    shapes,
    updatedAt: Date.now(),
  };
}

export function basisMatrix(basis: BasisParams): mat3 {
  const gamma = (basis.gamma * Math.PI) / 180;
  return aff(basis.a, basis.b * Math.cos(gamma), 0, basis.b * Math.sin(gamma));
}

const DB_NAME = 'wallpaper-pattern-editor';
const DB_VERSION = 1;
const STORE = 'projects';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadProject(id = 'local-current'): Promise<ProjectDoc | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(id);
    request.onsuccess = () => resolve((request.result as ProjectDoc | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function saveProject(project: ProjectDoc): Promise<void> {
  const db = await openDb();
  const record: ProjectDoc = { ...project, updatedAt: Date.now() };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function cloneDoc(doc: ProjectDoc): ProjectDoc {
  return structuredClone(doc);
}

export function matrixFromRows(values: Shape['transform']): Shape['transform'] {
  return [...values];
}
