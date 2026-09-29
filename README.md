# 本地墙纸群平面对称图案编辑器

一个无服务端的 Svelte + TypeScript + Canvas 2D 编辑器，使用 `gl-matrix` 的 `mat3` 复合平移、旋转、反射和滑移反射。工程通过 IndexedDB 自动保存到当前浏览器。

## 功能

- 支持全部 17 种二维墙纸群：`p1, p2, pm, pg, cm, pmm, pmg, pgg, cmm, p4, p4m, p4g, p3, p3m1, p31m, p6, p6m`。
- 每个群显式列出仿射生成元；平移陪集由矩阵乘法在模整数格平移下封闭生成，而非手工复制几块图形。
- 基本单元中的一个形状拥有稳定 ID；所有可见实例由 `形状矩阵 · 群陪集 · 整数格平移` 生成。
- 点选任意实例会记录它对应的源形状 ID、陪集编号与周期格位置，并高亮源对象。
- 绘制每个周期格时先裁剪到基本单元，跨边界路径由相邻格中的同一数学路径补齐，接缝不是手工对齐的副本。
- 默认 `pgg` 样例包含滑移反射、180° 旋转中心、跨越边界的形状以及透明填充。
- 可导出带透明 Alpha 的一个周期单元 PNG，并在同一界面中按晶格矩阵重复铺排检查接缝。
- 撤销/重做恢复完整几何和仿射矩阵；历史记录保留形状 ID，不重新生成对象身份。

## 矩阵约定

图形路径定义在自身局部坐标，`Shape.transform` 是列主序 3×3 矩阵。渲染复合顺序为：

```text
屏幕 = ViewMatrix · BasisMatrix · T(cellX, cellY) · CosetMatrix · ShapeTransform · path
```

`src/lib/groups.ts` 中群矩阵写在基本单元分数坐标。渲染器再用 `BasisMatrix` 把 `(1,0)`、`(0,1)` 映射为实际晶格向量 `u`、`v`。因此斜格、矩形格、正方形格和 60° 六方格都使用同一套数学路径。

## 操作

- 拖动图形：移动源对象，所有群实例同步。
- 拖动白色顶点：编辑源路径，自动裁切并同步所有实例。
- Shift 拖动或拖动空白处：平移视图；滚轮：缩放。
- Delete/Backspace：删除选中源对象。
- Ctrl/Cmd+Z：撤销；Ctrl/Cmd+Y 或 Ctrl/Cmd+Shift+Z：重做。
- “更新并下载 PNG”：导出一个周期单元；右侧同时显示 3×3 重复接缝检查。

## 开发

```bash
npm install
npm run dev
npm run check
npm run build
```

构建产物完全是静态文件，可用任意静态文件服务器打开；数据只存于浏览器 IndexedDB 的 `wallpaper-pattern-editor / projects`。
