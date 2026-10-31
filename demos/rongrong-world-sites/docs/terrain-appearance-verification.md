# Terrain appearance DIY — current increment

Base: published v30 `adc12752`. Contract commit: `8848b94`.

## Functional delivery

- Settings → 编辑风景 → select an owned dry tile: 原生 / 月尘银灰 / 玄岩深灰 / 玫瑰砂. Native clears the override. The editor shows the current underlying ecology and costs no coins or eggs.
- Creative Studio links to the working surface editor separately from the still-locked prompt-generated terrain category.
- `Tile.appearance` is a finite optional scalar. `paintTerrain` goes through the existing authoritative command, receipts, import rules and central farm commit. Old absent fields retain the original rendering.
- Terrain, natural terrain, exploration, habitat, supplies, water physics, actor navigation and heights remain unchanged. A dry→pond/creek conversion clears the override; returning to dry land stays native. Existing conversion costs and unlock checks remain intact.
- Continuous ground blends the appearance field independently of ecology. Lunar dust/crater lighting is procedural color shading, not displaced geometry or a new Hunyuan ground mesh. Only bounded color/roughness texture regions update; normal/position arrays do not change. Compatibility rendering tints the ground and removes native green garnish while preserving contact geometry.
- This is the first working terrain-DIY increment, not a claim that arbitrary prompt-to-3D generation, height editing or all future terrain tools are complete.

## Evidence

- Untouched v30 baseline: **927/927** ordinary tests.
- Initial domain RED: command unsupported, unknown appearance accepted by old save validation, strict import rejected the new field. New domain/contract coverage now passes, including cloud read/reset, zero-cost semantics, old files, future-style fail-closed preservation, duplicate receipts and dry/water conversion compatibility.
- Initial renderer RED: palette unchanged, appearance-only dirty update returned zero, and both World stamps were unchanged. All three now pass; reset restores native texture bytes, geometry/normal data remains identical, and boundaries blend continuously.
- Actual App CPU DOM: editor click writes local storage and immediately changes the existing World texture; reset restores exact bytes; player root, ground geometry and normals remain identical. Water editing is disabled with an explicit reason.
- Actual AccountClient: lost paint ACK after canonical commit replays the same request once after reload; coins/eggs unchanged. A future unknown style response cannot replace the validated farm. VisitorSession rejects paint commands without mutation.
- Final author suite: **938/938** ordinary, **91/91** CPU DOM; no skips/failures. Typecheck, build and diff whitespace checks passed. The initial `npm run lint` exited zero but did not reliably scan this worktree; it is not full-source lint evidence (see correction below). Existing custom-egg UI assertion was updated to the more precise locked label “生成地皮 · 未开放”.
- Four-sample owner consumes the same `Tile.appearance:'lunar'` contract. Its newer four-layout integration and the one independent combined review are coordinated by the main integrator; this branch does not overwrite sample files.

No browser/GPU visual acceptance is claimed. No new GLB, paid API, permission change, or publication occurred.

## Client-boundary follow-up

Integration's explicit lint scan caught an import placed before `MinimalApp`'s `use client` directive and two unused type imports in the new domain test. The directive is now the first statement again and those unused imports are removed. A TypeScript-AST first-statement regression failed against the prior source and passes after the fix.

The fresh full ordinary suite passes **939/939**. The focused appearance/client-boundary suite passes **12/12**, and the actual App/World, CreativeStudio and AccountClient appearance DOM suite passes **3/3**. Typecheck, the explicit all-source lint command below, and production build pass after this correction:

```sh
node node_modules/eslint/bin/eslint.js --no-ignore --config eslint.config.mjs app components db hooks lib server src tests scripts worker '*.ts' '*.mjs'
```

Combined sample integration and independent review remain the main integrator's acceptance gate; this report does not claim its build or review result.
