# Terrain appearance DIY

Root-approved scope, 2026-10-26: editable appearance for owned dry ground; fourth lunar friend consumes the same style contract. No repeated user questions, heightmap editing, new models, or paid generation.

**Approach:** Optional `Tile.appearance` uses `natural | lunar | slate | rose`. Missing means natural. `terrain`, `naturalTerrain`, `owned`, `level`, exploration, habitat, supplies, water geometry and navigation remain the gameplay source. A new `paintTerrain` command applies an enum at an integer owned dry non-shop tile through existing authoritative receipts/commit; selecting natural deletes the override. Free, no egg used. Water and creek retain water appearance/physics. Old saves remain valid; strict imports allow and validate the bounded scalar, not arbitrary textures/objects.

**Alternatives:** New lunar ecology would require species/unlock/economy design and is not authorized. Client-only paint would lose cloud roundtrip and authority integrity. Arbitrary prompt-to-3D terrain is not implemented and remains locked.

**UI:** Settings → Edit landscape → select owned tile → functional four-choice ‘地表外观 DIY · 免费’ selector. Always show appearance and underlying ecology. Creative Studio retains locked ‘生成地皮 · 未开放’ and links separately to the working appearance editor. Short copy: ‘只改外观，不消耗蛋或金币’ and ‘生态、孵化和供给不变’.

**Rendering:** Continuous blended appearance palette and procedural lunar dust/crater shading. Colors/roughness/normals only; never vertex/contact height. Dirty updates include style and update affected texture bytes. Fallback render and scenery accents must reflect style without new colliders or hiding water. Original style resets deterministically.

**Ownership:** This worker owns model/authority, terrain-appearance helper, terrain-field/ground/scenery-art/cache hooks, TerrainAppearance UI, MinimalApp/CreativeStudio minimum attachment and tests. Showcase worker owns four sample-farms/scenery/cards; lunar samples use `appearance:'lunar'` directly on appropriate tiles, no second whole-ground plane.
