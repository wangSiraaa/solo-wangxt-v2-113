<script lang="ts">
  import { onMount } from 'svelte';
  import { mat3, vec2 } from 'gl-matrix';
  import { GROUPS, GROUP_ORDER, enforceLattice } from './lib/groups';
  import {
    basisMatrix,
    cloneDoc,
    createSampleDoc,
    loadProject,
    makeId,
    saveProject,
  } from './lib/storage';
  import {
    drawRepeatedTileCheck,
    hitTest,
    renderEditor,
    renderPeriodTile,
    screenToWorld,
    type ViewState,
  } from './lib/renderer';
  import type { GroupId, ProjectDoc, SelectionTarget, Shape, Vec2 } from './lib/types';

  let canvas: HTMLCanvasElement;
  let tileCanvas: HTMLCanvasElement;
  let repeatCanvas: HTMLCanvasElement;

  let doc = $state<ProjectDoc>(createSampleDoc('pgg'));
  let selection = $state<SelectionTarget | null>(null);
  let showGuides = $state(true);
  let saveState = $state('正在载入 IndexedDB…');
  let canUndo = $state(false);
  let canRedo = $state(false);
  const view: ViewState = $state({ scale: 1.15, center: [0, 0] });

  let past: ProjectDoc[] = [];
  let future: ProjectDoc[] = [];
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let basisEditSnapshot: ProjectDoc | null = null;
  let controlEditSnapshot: ProjectDoc | null = null;

  interface DragState {
    kind: 'pan' | 'shape' | 'vertex';
    startScreen: Vec2;
    startWorld: Vec2;
    startCenter?: Vec2;
    vertexIndex?: number;
    moved: boolean;
    preDrag?: ProjectDoc;
  }
  let drag: DragState | null = null;

  const selectedShape = $derived.by(() => {
    const current = selection;
    return current ? (doc.shapes.find((shape) => shape.id === current.shapeId) ?? null) : null;
  });
  const groupDef = $derived(GROUPS[doc.groupId]);
  const selectedCoset = $derived(
    selection ? GROUPS[doc.groupId].cosets[selection.elementIndex] : null,
  );

  function refreshHistoryFlags() {
    canUndo = past.length > 0;
    canRedo = future.length > 0;
  }

  function commit(description?: string) {
    past.push(cloneDoc(doc));
    if (past.length > 80) past.shift();
    future = [];
    refreshHistoryFlags();
    scheduleSave(description);
  }

  function undo() {
    const previous = past.pop();
    if (!previous) return;
    future.push(cloneDoc(doc));
    // IDs survive, so selection and future edits keep referring to one object.
    const current = selection;
    if (current && !previous.shapes.some((s) => s.id === current.shapeId)) selection = null;
    basisEditSnapshot = null;
    controlEditSnapshot = null;
    doc = previous;
    refreshHistoryFlags();
    scheduleSave('撤销');
    requestAnimationFrame(draw);
  }

  function redo() {
    const next = future.pop();
    if (!next) return;
    past.push(cloneDoc(doc));
    const current = selection;
    if (current && !next.shapes.some((s) => s.id === current.shapeId)) selection = null;
    basisEditSnapshot = null;
    controlEditSnapshot = null;
    doc = next;
    refreshHistoryFlags();
    scheduleSave('重做');
    requestAnimationFrame(draw);
  }

  function scheduleSave(reason = '自动保存') {
    saveState = `${reason}…`;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveProject(doc).then(
        () => { saveState = `已保存 ${new Date().toLocaleTimeString()}`; },
        () => { saveState = '保存失败（浏览器禁用了 IndexedDB？）'; },
      );
    }, 250);
  }

  function draw() {
    if (canvas) renderEditor(canvas, doc, { view, selection, showGuides });
  }

  let tilePreviewTimer: ReturnType<typeof setTimeout> | undefined;
  function refreshTilePreview() {
    clearTimeout(tilePreviewTimer);
    tilePreviewTimer = setTimeout(() => {
      if (!tileCanvas || !repeatCanvas) return;
      renderPeriodTile(tileCanvas, doc, 520);
      drawRepeatedTileCheck(repeatCanvas, tileCanvas, doc, 3);
    }, 220);
  }

  function changeGroup(id: GroupId) {
    if (id === doc.groupId) return;
    commit('切换墙纸群');
    doc.groupId = id;
    doc.basis = enforceLattice(id, doc.basis);
    selection = null;
    requestAnimationFrame(draw);
  }

  function updateBasis() {
    if (!basisEditSnapshot) basisEditSnapshot = cloneDoc(doc);
    doc.basis = enforceLattice(doc.groupId, doc.basis);
    requestAnimationFrame(draw);
  }

  function commitBasis() {
    if (basisEditSnapshot) {
      past.push(basisEditSnapshot);
      basisEditSnapshot = null;
      future = [];
      refreshHistoryFlags();
    }
    doc.basis = enforceLattice(doc.groupId, doc.basis);
    scheduleSave('修改周期');
    requestAnimationFrame(draw);
  }

  function beginControlEdit() {
    controlEditSnapshot = cloneDoc(doc);
  }

  function finishControlEdit(reason: string, redrawTile = false) {
    if (controlEditSnapshot) {
      past.push(controlEditSnapshot);
      controlEditSnapshot = null;
      future = [];
      refreshHistoryFlags();
    }
    scheduleSave(reason);
    requestAnimationFrame(() => {
      draw();
      if (redrawTile) {
        renderPeriodTile(tileCanvas, doc, 520);
        drawRepeatedTileCheck(repeatCanvas, tileCanvas, doc, 3);
      }
    });
  }

  function addPolygon() {
    const shape: Shape = {
      id: makeId('shape'),
      name: `多边形 ${doc.shapes.length + 1}`,
      type: 'polygon',
      points: [[-0.11, -0.08], [0.12, -0.05], [0.08, 0.09], [-0.09, 0.07]],
      color: '#5ac8a4',
      opacity: 0.78,
      rx: 1,
      ry: 1,
      transform: Array.from(mat3.fromTranslation(mat3.create(), [0.28, 0.36])) as Shape['transform'],
    };
    doc.shapes.push(shape);
    selection = { shapeId: shape.id, elementIndex: 0, cell: [0, 0], point: [0, 0] };
    requestAnimationFrame(draw);
  }

  function addEllipse() {
    const shape: Shape = {
      id: makeId('shape'),
      name: `椭圆 ${doc.shapes.length + 1}`,
      type: 'ellipse',
      points: [],
      color: '#7aa7ff',
      opacity: 0.72,
      rx: 0.11,
      ry: 0.055,
      transform: Array.from(mat3.fromTranslation(mat3.create(), [0.5, 0.5])) as Shape['transform'],
    };
    doc.shapes.push(shape);
    selection = { shapeId: shape.id, elementIndex: 0, cell: [0, 0], point: [0, 0] };
    requestAnimationFrame(draw);
  }

  function deleteSelected() {
    if (!selectedShape) return;
    commit('删除对象');
    doc.shapes = doc.shapes.filter((shape) => shape.id !== selectedShape.id);
    selection = null;
    requestAnimationFrame(draw);
  }

  function worldToFractional(world: Vec2): Vec2 {
    const inverse = mat3.invert(mat3.create(), basisMatrix(doc.basis))!;
    return Array.from(vec2.transformMat3(vec2.create(), vec2.fromValues(...world), inverse)) as Vec2;
  }

  /** Pre-multiply a world/fractional-space affine op around point p. */
  function transformSelectedAround(p: Vec2, operation: mat3) {
    if (!selectedShape) return;
    commit('变换对象');
    const shape = doc.shapes.find((item) => item.id === selectedShape.id)!;
    const toP = mat3.fromTranslation(mat3.create(), p);
    const fromP = mat3.fromTranslation(mat3.create(), [-p[0], -p[1]]);
    const full = mat3.mul(mat3.create(), toP, mat3.mul(mat3.create(), operation, fromP));
    const next = mat3.mul(mat3.create(), full, mat3.fromValues(...shape.transform));
    shape.transform = Array.from(next) as Shape['transform'];
    requestAnimationFrame(draw);
  }

  function locateSourceObject() {
    if (!selectedShape) return;
    const localOrigin = vec2.transformMat3(
      vec2.create(),
      vec2.fromValues(0, 0),
      mat3.fromValues(...selectedShape.transform),
    );
    view.center = Array.from(vec2.transformMat3(vec2.create(), localOrigin, basisMatrix(doc.basis))) as Vec2;
    requestAnimationFrame(draw);
  }

  function rotateSelected(deltaDeg: number) {
    transformSelectedAround([0, 0], mat3.fromRotation(mat3.create(), (deltaDeg * Math.PI) / 180));
  }

  function reflectSelected(axis: 'x' | 'y') {
    transformSelectedAround([0, 0], axis === 'x'
      ? mat3.fromValues(1, 0, 0, 0, -1, 0, 0, 0, 1)
      : mat3.fromValues(-1, 0, 0, 0, 1, 0, 0, 0, 1));
  }

  function moveSelected(dx: number, dy: number) {
    if (!selectedShape) return;
    commit('移动对象');
    const shape = doc.shapes.find((item) => item.id === selectedShape.id)!;
    const next = mat3.mul(
      mat3.create(),
      mat3.fromTranslation(mat3.create(), [dx, dy]),
      mat3.fromValues(...shape.transform),
    );
    shape.transform = Array.from(next) as Shape['transform'];
    requestAnimationFrame(draw);
  }

  function onPointerDown(event: PointerEvent) {
    (event.target as Element).setPointerCapture(event.pointerId);
    const screen: Vec2 = [event.clientX, event.clientY];
    const world = screenToWorld(canvas, view, screen);
    drag = { kind: 'shape', startScreen: screen, startWorld: world, moved: false };

    if (event.button === 1 || event.shiftKey) {
      drag = { kind: 'pan', startScreen: screen, startWorld: world, startCenter: [...view.center], moved: false };
      return;
    }

    const hit = hitTest(canvas, doc, view, screen);
    if (!hit) {
      selection = null;
      drag.kind = 'pan';
      drag.startCenter = [...view.center];
      requestAnimationFrame(draw);
      return;
    }

    // Click any orbit image: retain source object id, but record the image's
    // coset and lattice cell. Editing acts on the source object only.
    selection = {
      shapeId: hit.shapeId,
      elementIndex: hit.elementIndex,
      cell: hit.cell,
      point: hit.point,
    };
    drag.kind = hit.vertexIndex === undefined ? 'shape' : 'vertex';
    drag.vertexIndex = hit.vertexIndex;
    drag.preDrag = cloneDoc(doc);
    requestAnimationFrame(draw);
  }

  function onPointerMove(event: PointerEvent) {
    if (!drag) return;
    const screen: Vec2 = [event.clientX, event.clientY];
    const world = screenToWorld(canvas, view, screen);
    if (Math.hypot(screen[0] - drag.startScreen[0], screen[1] - drag.startScreen[1]) > 3) {
      drag.moved = true;
    }

    if (drag.kind === 'pan' && drag.startCenter) {
      view.center = [
        drag.startCenter[0] - (screen[0] - drag.startScreen[0]) / view.scale,
        drag.startCenter[1] - (screen[1] - drag.startScreen[1]) / view.scale,
      ];
      requestAnimationFrame(draw);
      return;
    }

    const shape = selectedShape;
    if (!shape) return;

    if (!drag.moved) return;
    if (drag.kind === 'shape') {
      const df = worldToFractional(world);
      const sf = worldToFractional(drag.startWorld);
      const m = mat3.fromTranslation(mat3.create(), [df[0] - sf[0], df[1] - sf[1]]);
      const next = mat3.mul(mat3.create(), m, mat3.fromValues(...shape.transform));
      shape.transform = Array.from(next) as Shape['transform'];
      drag.startWorld = world;
      requestAnimationFrame(draw);
    } else if (drag.kind === 'vertex' && drag.vertexIndex !== undefined) {
      const inverse = mat3.invert(mat3.create(), mat3.fromValues(...shape.transform))!;
      const local = vec2.transformMat3(vec2.create(), vec2.fromValues(...worldToFractional(world)), inverse);
      shape.points[drag.vertexIndex] = [local[0], local[1]];
      requestAnimationFrame(draw);
    }
  }

  function onPointerUp() {
    if (!drag) return;
    const wasGeometryDrag = (drag.kind === 'shape' || drag.kind === 'vertex') && drag.moved && drag.preDrag;
    if (wasGeometryDrag && drag.preDrag) {
      past.push(drag.preDrag);
      if (past.length > 80) past.shift();
      future = [];
      refreshHistoryFlags();
      scheduleSave('几何编辑');
    }
    drag = null;
  }

  function wheelZoom(event: WheelEvent) {
    event.preventDefault();
    const before = screenToWorld(canvas, view, [event.clientX, event.clientY]);
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    view.scale = Math.min(6, Math.max(0.25, view.scale * factor));
    const after = screenToWorld(canvas, view, [event.clientX, event.clientY]);
    view.center = [view.center[0] + before[0] - after[0], view.center[1] + before[1] - after[1]];
    requestAnimationFrame(draw);
  }

  function regenerateSample() {
    if (!confirm('载入内置 pgg 样例会替换当前工程，确定继续？')) return;
    commit('载入样例');
    doc = createSampleDoc('pgg');
    selection = null;
    requestAnimationFrame(draw);
  }

  function exportTile() {
    renderPeriodTile(tileCanvas, doc, 640);
    requestAnimationFrame(() => drawRepeatedTileCheck(repeatCanvas, tileCanvas, doc, 3));
    tileCanvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc.name || 'period'}-unit.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }

  function matrixLabel(m: mat3 | null) {
    if (!m) return '—';
    return `${m[0].toFixed(2)}, ${m[3].toFixed(2)}, ${m[6].toFixed(2)} / ${m[1].toFixed(2)}, ${m[4].toFixed(2)}, ${m[7].toFixed(2)}`;
  }

  onMount(async () => {
    const saved = await loadProject();
    if (saved) {
      saved.shapes = saved.shapes.map((shape) => ({ ...shape, opacity: shape.opacity ?? 1 }));
      doc = { ...saved, basis: enforceLattice(saved.groupId, saved.basis) };
      saveState = `已载入本地工程 ${new Date(saved.updatedAt).toLocaleTimeString()}`;
    } else {
      saveState = '未找到旧工程，已创建 pgg 样例';
      scheduleSave('初始化样例');
    }
    view.center = [doc.basis.a / 2, doc.basis.b / 2];
    requestAnimationFrame(() => {
      draw();
      renderPeriodTile(tileCanvas, doc, 520);
      drawRepeatedTileCheck(repeatCanvas, tileCanvas, doc, 3);
    });
  });

  $effect(() => {
    // Re-render when state changes made by controls occur outside event draw.
    doc;
    selection;
    showGuides;
    requestAnimationFrame(draw);
  });

  $effect(() => {
    const signature = JSON.stringify({
      groupId: doc.groupId,
      basis: doc.basis,
      shapes: doc.shapes,
    });
    refreshTilePreview();
    return () => clearTimeout(tilePreviewTimer);
  });

  function keyDown(event: KeyboardEvent) {
    const tag = (event.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
      event.preventDefault();
      undo();
    } else if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))) {
      event.preventDefault();
      redo();
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      deleteSelected();
    }
  }
</script>

<svelte:window on:keydown={keyDown} />

<main>
  <aside class="panel">
    <header>
      <p class="eyebrow">本地 Wallpaper Editor</p>
      <h1>平面对称图案编辑器</h1>
      <p class="small">平移、旋转、反射全部由 gl-matrix 矩阵复合；实例不是复制的图形。</p>
    </header>

    <label class="field">
      工程名
      <input bind:value={doc.name} onfocus={beginControlEdit} onchange={() => finishControlEdit('重命名')} />
    </label>

    <label class="field">
      墙纸群
      <select value={doc.groupId} onchange={(e) => changeGroup(e.currentTarget.value as GroupId)}>
        {#each GROUP_ORDER as id}
          <option value={id}>{GROUPS[id].name}</option>
        {/each}
      </select>
    </label>
    <p class="small">{groupDef.description}</p>

    <section class="generators">
      <h2>变换生成元（另有整数格平移）</h2>
      {#if groupDef.generators.length === 0}
        <p class="small">p1：仅 T(u) 与 T(v)。</p>
      {/if}
      {#each groupDef.generators as g}
        <div class="generator">
          <strong>{g.label}</strong>
          <code>{matrixLabel(g.matrix)}</code>
        </div>
      {/each}
      <p class="small">当前群轨道含 <b>{groupDef.cosets.length}</b> 个平移陪集。</p>
    </section>

    <section class="grid-fields">
      <label>a<input type="number" min="80" max="500" bind:value={doc.basis.a} oninput={updateBasis} onchange={commitBasis} /></label>
      <label>b<input type="number" min="80" max="500" bind:value={doc.basis.b} oninput={updateBasis} onchange={commitBasis} /></label>
      <label>γ°<input type="number" min="30" max="150" step="1" bind:value={doc.basis.gamma} oninput={updateBasis} onchange={commitBasis} /></label>
    </section>

    <section class="buttons">
      <button onclick={() => { commit(); addPolygon(); }}>多边形</button>
      <button onclick={() => { commit(); addEllipse(); }}>椭圆</button>
      <button disabled={!selectedShape} onclick={deleteSelected}>删除</button>
    </section>

    {#if selectedShape}
      <section class="inspector">
        <h2>原始对象</h2>
        <p class="small">
          身份 ID：<code>{selectedShape.id}</code><br />
          点击的实例：陪集 #{selection?.elementIndex}，周期格 ({selection?.cell[0]}, {selection?.cell[1]})
        </p>
        <button onclick={locateSourceObject}>定位到原始对象</button>
        <label class="field">
          名称
          <input bind:value={selectedShape.name} onfocus={beginControlEdit} onchange={() => finishControlEdit('改名对象', true)} />
        </label>
        <label class="field">
          颜色
          <input type="color" bind:value={selectedShape.color} onpointerdown={beginControlEdit} onchange={() => finishControlEdit('颜色', true)} />
        </label>
        <label class="field">
          不透明度 {Math.round(selectedShape.opacity * 100)}%
          <input type="range" min="0.08" max="1" step="0.01" bind:value={selectedShape.opacity} onpointerdown={beginControlEdit} oninput={() => requestAnimationFrame(draw)} onchange={() => finishControlEdit('透明度', true)} />
        </label>
        {#if selectedShape.type === 'ellipse'}
          <section class="grid-fields">
            <label>rx<input type="range" min="0.02" max="0.35" step="0.005" bind:value={selectedShape.rx} onpointerdown={beginControlEdit} oninput={() => requestAnimationFrame(draw)} onchange={() => finishControlEdit('椭圆几何', true)} /></label>
            <label>ry<input type="range" min="0.02" max="0.35" step="0.005" bind:value={selectedShape.ry} onpointerdown={beginControlEdit} oninput={() => requestAnimationFrame(draw)} onchange={() => finishControlEdit('椭圆几何', true)} /></label>
          </section>
        {/if}
        <section class="buttons wrap">
          <button onclick={() => rotateSelected(-15)}>−15°</button>
          <button onclick={() => rotateSelected(15)}>+15°</button>
          <button onclick={() => reflectSelected('y')}>竖向反射</button>
          <button onclick={() => reflectSelected('x')}>横向反射</button>
          <button onclick={() => moveSelected(-0.02, 0)}>←</button>
          <button onclick={() => moveSelected(0, -0.02)}>↑</button>
          <button onclick={() => moveSelected(0.02, 0)}>→</button>
          <button onclick={() => moveSelected(0, 0.02)}>↓</button>
        </section>
        <p class="small">也可拖动本体或顶点；所有轨道实例同步，形状 ID 不变。</p>
      </section>
    {/if}

    <section class="history">
      <button onclick={undo} disabled={!canUndo}>撤销</button>
      <button onclick={redo} disabled={!canRedo}>重做</button>
      <button onclick={() => { showGuides = !showGuides; requestAnimationFrame(draw); }}>
        {showGuides ? '隐藏辅助线' : '显示辅助线'}
      </button>
    </section>
    <p class="save">{saveState}</p>
  </aside>

  <section class="workspace">
    <div class="toolbar">
      <span>滚轮缩放 · Shift/空白处拖动平移 · 点选任一实例定位源对象</span>
      <button onclick={regenerateSample}>载入 pgg 样例</button>
    </div>
    <canvas
      bind:this={canvas}
      class="editor-canvas"
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={() => (drag = null)}
      onwheel={wheelZoom}
      aria-label="可编辑的周期对称画布"
    ></canvas>
  </section>

  <aside class="export-panel">
    <h2>一个周期单元</h2>
    <p class="small">跨边界路径在单元分数坐标 [0,1]² 内裁切；透明边缘保留 Alpha。</p>
    <canvas bind:this={tileCanvas} class="tile"></canvas>
    <button class="primary" onclick={exportTile}>更新并下载 PNG</button>
    <h2>重复铺排接缝检查</h2>
    <p class="small">同一单元按晶格矩阵重复，红线为周期格边界，不在内部补缝。</p>
    <canvas bind:this={repeatCanvas} class="repeat"></canvas>
    <button onclick={() => { renderPeriodTile(tileCanvas, doc, 640); drawRepeatedTileCheck(repeatCanvas, tileCanvas, doc, 3); }}>
      重新检查
    </button>
    {#if selectedCoset && selection}
      <section class="matrix-box">
        <h2>选中原对象到实例</h2>
        <code>{matrixLabel(selectedCoset)}</code>
      </section>
    {/if}
  </aside>
</main>
