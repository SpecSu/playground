> 历史阶段资料：保留当时的设计与结果，不代表当前状态。当前入口见 [流程框架 0.1](../../../../README.md)。

# 方形地块单元 · 生成记录 v0.2

生成工具：内置 image_gen。

输入参考：`../../../v0.1/assets/ground/primary.png`。

输出：`primary.png`。原始 2×2 地块保留，不覆盖。

目视检查：一块完整地块，顶部无十字分割；外形为规整方形、轻微倒角；保留黄绿草皮、暖赭土层、浅砂底层和柔和中性背景。此图是建模参考；四边的精确尺寸与拼接平整度需在 3D 模型阶段校准。

## 实际提示词

Use case: precise-object-edit. Asset type: a clean single modular terrain unit reference image for image-to-3D modeling.
Input image: the existing four-part grassy island terrain, used as the exact material, color, texture and stylization reference.
Primary request: replace the 2-by-2 grouped terrain with EXACTLY ONE regular SQUARE terrain tile. One indivisible square slab with an uninterrupted flat grassy top. NO cross-shaped seam, NO subdivision, NO four blocks, NO surrounding tiles.
Geometry: square footprint with equal width and depth, four perfectly straight parallel/opposing sides, four right-angle corners with only tiny soft bevels. The four vertical side walls are plumb, flat and the same height. Level flat top, level flat bottom, no warped edge, no slant or trapezoid, no bulbous mound, no inset cuts. Total thickness approximately 30 percent of one side length. A modular repeatable unit that can be duplicated on a regular square grid; preserve straight structural boundaries. Grass edge detail is fine surface relief, not a dramatically wavy or oversized overhanging silhouette. A square in 3D naturally projects as a diamond/parallelogram in this camera.
Materials: faithfully preserve the reference's vivid fresh yellow-green short grassy top with subtle leaf flecks and tiny clover-like details, thick soft green turf cap with small sculpted downward leaf/blade tips around the edge, warm ochre/orange earth middle layer with restrained small facets and subtle soil mottling, pale warm sandy bottom band. Preserve the same premium miniature sculpted finish, tactile thickness, soft bevels and restrained roughness. The pale sandy band continues level around all four edges. All sides use the SAME layer heights and material treatment. Do not change to photoreal soil, Minecraft pixels, flat geometric plastic, dark mud or a stone plinth.
Composition: show this ONE whole tile alone in a centered slightly elevated three-quarter orthographic-like view, looking down approximately 30 degrees, showing the complete square top and two side faces. Full asset and all corners entirely in frame with 10 percent clear margin. Plain neutral off-white background, soft low-contrast neutral studio lighting with minimal contact shadow, crisp focus throughout, no dramatic warm sunlight or baked directional shading.
Avoid: trees, shrubs, tall plants, flowers, standalone rocks, water, docks, characters, any other tiles, grid lines, text, labels, numbers, ruler, collage, multiple views. Only the one square grass/earth unit.
