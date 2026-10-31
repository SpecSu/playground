# Lunar sample life, growth and contact verification

Base is published v33 `33d5a5cfe6b4b6d21d31a7c9c2eb603881de2ec3`.
The five identities remain visitor-only DIY partners, not ordinary species or
owned farm assets. Original user-generated geometry provenance and authored-motion
labels remain explicit. No live generation, formal raising, trading or breeding
is implied. Exact business source is `f888426335bf5a4dc510f50f19ce080b710efac9`;
publication is a separate native operation.

## Exact walk derivatives

| Identity | GLB bytes | SHA-256 | Adult stride / cycle | Maximum growth |
|---|---:|---|---|---:|
| 长耳黄狗 | 1662648 | `01f4d0db63a5e7548bf429aa3bf285c89afc05bd270a4bab19a2f87ac759f968` | .2528087579 m / 1.2 s | 1.2 |
| 坤坤鸡 | 1782444 | `029d83a7bc876a0172487a00beacc6ba175934fdfa95e8e534881a9c434103f6` | .27 m / 1 s | 2 |
| 红围巾 | 1778192 | `ab304fef37a3c2dc3d25b5324a1d45f18bf4c43675bd0727f10461362beeb2ed` | .1493073684 m / 1 s | 1.2 |
| 粉裙羊 | 2027552 | `4e706b14ba4c3bd8875c9a0b310629ea6fbdc05cc75aa5503abb2907a1fad049` | .1915283560 m / 1.1 s | 1.2 |
| 花马甲 | 1922100 | `2f6a482d92077666289a8201083e2e19ec346d068cf62a96f669cdb7bc3fbbfa` | .1678598571 m / 1 s | 3 |

Total 9,172,936 bytes. Portrait image pixels and unrelated models are unchanged.
Each GLB has actual alternating articulated walk animation. Original geometry,
UVs and textures are preserved. Explicit sole/garment weight repairs affect dog
1549, chicken 690 and sheep 329 vertices; old clip arrays and old posed geometry
were separately checked. Humanoid old clips, skin and bind arrays are unchanged.
The runtime does not infer motion from a renamed pig or rigid whole-model bob.

## Runtime

Five deterministic, staggered local lives alternate reachable walks, rests and
recurring meaningful actions. Active-time growth uses the ordinary age/scale
calculation without ordinary species identity: young samples grow, care adds a
bounded age bonus with a six-active-second cooldown, and the two adult giants
start at chicken 2× / floral 3×. Their actual heights are about 3.00 / 2.85 m.
Leaving the visit resets sample life. Hidden/modal/carried time is not replayed.
Stop gives a ten-second rest before natural activity resumes.

World footprints reserve the final growth radius and reject water, shop, occupied
cells, other actors and the player. Straight phase follows travelled distance;
stance keeps world ankle position and orientation through rotation-only IK. A
neutral pivot is bounded by each foot's landing heading and actual reach. A
bounded explicit replant uses lifted foot arcs with retained support, rather than
sliding grounded feet between poses. Body/root XZ and heading pause during this
brief contact change. Every frame remains visible and is checked for continuity.

The giant court is a 2× authored layout, not a second multiplication of world
ball coordinates. Chicken returns to its reserved stand and aligns before any
ball is visible. Authored ball motion is not presented as Newtonian simulation.

## Verification boundaries

The independent asset reviewer checked exact five gait bytes and preservation.
The historical failed turning/skipped-leg/replant cases and the bounded corrections
are retained in `lunar-life-stance-candidate.md`; they are not accepted tolerances.
CPU scene tests use actual GLB skinning, full-mesh floor and radius oracles, both
20 Hz and 60 Hz callers, and epsilon transition probes. Production uses cached
low-foot subsets (1564/397/683/324/1217 vertices) and 12 IK legs, not all vertices.

The giant court/World reviewer independently verified 828 posed-skin ball samples,
minimum clearance 1.954 mm, continuous release, rim crossing, no ball before
arrival/alignment, and temporary carry against the actual LX mesh. A later
replant-only change does not alter clips, ball or carry math; final source binding
and return gating are checked again. CPU HUD bounds include top/header and bottom
controls. These are not browser, mobile GPU, or visual-performance acceptance.

## Final exact-input results

Independent motion review on `f888426`: actual public five bytes/profiles match;
120 s at 60 Hz, 120 s at 20 Hz and 60 s care-accelerated 20 Hz all pass. No
unreachable or hidden frames; minimum full skin is -2.14e-16 m numerical noise;
maximum strict-stance sole displacement is 0.830 mm. Every replant frame retains
support (maximum lowest-skin gap .9852 mm), and all full-skin radius ratios are
below .957. Previous final-segment jumps have epsilon regressions: floral
2.78e-7 m, dog 1.53e-9 m. Ten interrupted stop/greeting and four mid-replant
pickup/putdown cases converge and retain isolation, including the 3× floral.

Independent UI review uses real public bytes, not private test admission: modal,
blur/hidden freeze, care cooldown, stop/resume, visitor identity reset, retry and
late-load isolation. The exact final report accompanies the source handoff.

Fresh full suite: 1019 passed, one optional private-asset test skipped (the new
public-byte integration test runs normally); all 108 DOM tests passed. Typecheck,
explicit full-source lint, production build and 17 official deployment contracts
passed. Node CPU-only 120-second five-grown-actor sampling: 60 Hz caller mean
2.32 ms / p95 3.69 ms; 20 Hz caller (three bounded simulation steps per call)
mean 5.94 ms / p95 8.44 ms. No renderer/mobile FPS claim.

Two existing v33 PNGs (dog/sheep) contained a cloud source-file path in a `File`
text chunk. Only those two chunks were removed. Every other chunk, compressed
IDAT stream, image dimensions/mode and decoded pixel byte is unchanged; no
portrait was regenerated or resized. This is a documented baseline metadata
cleanup, not a claim that v33 never contained it.

No permissions, schema, dependencies or canonical account data changed. This
report does not itself claim native publication.

## Verified demo path

Friends → 月球剧场 → 串门. With models ready, the five partners independently
walk, rest and repeat actions without clicks. Select a portrait or actual actor;
坤坤鸡 offers 运球 / 投篮 / 庆祝. A basketball request waits for court arrival
and alignment. 幼崽/少年 show 照料成长; the two giant adults remain adult. 停下
rests briefly then resumes, rather than permanently disabling life. All growth
and temporary carry reset when leaving the sample island.
