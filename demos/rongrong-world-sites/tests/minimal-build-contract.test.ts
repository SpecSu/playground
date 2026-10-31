import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Object3D} from 'three';
import {farmLocomotion} from '../src/minimal/avatar-pose.ts';
import {ANIMAL_TRANSFER_DURATION_MS,GREETING_DURATION_MS} from '../src/minimal/interaction-motion.ts';
import {LAB_ASSETS} from '../src/animation-lab/manifest.ts';
import {PLAYER_POND_CLEARANCE_CELLS,PLAYER_WALK_SPEED} from '../src/minimal/model.ts';

test('build metadata describes bounded implemented interactions without connected-service or browser claims',()=>{
 const build=JSON.parse(readFileSync(new URL('../public/farm-build.json',import.meta.url),'utf8'));
 assert.equal(build.version,'v29.0-shop-polish-named-demo');
 assert.equal(build.animalDetails,'click-only-compact-nonmodal-card');
 assert.equal(build.physicalActions,'explicit-revalidated-cancellable-approach');
 assert.equal(build.animalTransfer,`${ANIMAL_TRANSFER_DURATION_MS}ms-presentation-only-lift-lower-safe-nearby-landing`);
 assert.equal(build.animalGreeting,`${GREETING_DURATION_MS}ms-explicit-wave-and-full-animal-response`);
 assert.equal(build.animalTouch,'physical-44px-target-max14px-margin-ordinary-owned-ground-only');
 assert.equal(build.animalTouchCache,'five-versioned-models-verified-template-data-dynamic-fallback');
 assert.equal(build.groundedTransitions,'limb-only-partial-grounded-mix-floor-correction-excludes-carry-and-airborne-hatch');
 assert.equal(build.generation,'fixed-sample-mock-workflow-no-live-generation-api');
 assert.equal(build.friends,'not-connected-in-minimal-mode');
 assert.equal(build.visualQA,'actual-skinned-geometry-and-offline-Blender-not-real-browser');
});

test('interaction polish metadata names only implemented pointer, approach and nest-safety corrections',()=>{
 const build=readBuild();
 assert.deepEqual(build.interactionPolish,{
  tap:'release-displacement-checked-at-existing-6px-threshold',
  approach:'reachable-cardinal-then-diagonal-within-existing-1.6-cell-radius',
  nestSafety:'successful-ground-nest-clears-route-and-newly-unsafe-drink-anchors',
 });
});

test('animation lab metadata describes the isolated provisional Blender catalog without expanding farm species',()=>{
 const build=readBuild();
 assert.deepEqual(build.animationLab,{
  entry:'?animationLab=1',
  speciesCount:LAB_ASSETS.length,
  clipCount:LAB_ASSETS.reduce((count,asset)=>count+asset.clips.length,0),
  status:'provisional-Blender-skeletal-models',
  disclosure:'临时模型 · Blender 骨骼动画',
 });
 assert.equal(build.animationLab.speciesCount,25);
 assert.equal(build.animationLab.clipCount,332);
 assert.deepEqual(build.species,['sheep','pig','cow','bunny','duck']);
 assert.equal(build.animalAnimation,'five-Blender-skinned-species-nine-authored-clips');
 assert.equal(build.defaultMode,'minimal');
});

import {MAX_PLAYER_SPEED} from '../src/minimal/player-motion.ts';
import {HATCH_DURATION_MS} from '../src/minimal/hatch-choreography.ts';
import {ANIMAL_STAGE_MS,ANIMAL_ADULT_MS,ANIMAL_SCALE_BOUNDS} from '../src/minimal/animal-growth.ts';
import {tileSupply,terrainUpgradeCost,TERRAIN_QUALITY_LABELS,farmSupply} from '../src/minimal/terrain-supply.ts';
import type {Terrain} from '../src/minimal/model.ts';
const readBuild=()=>JSON.parse(readFileSync(new URL('../public/farm-build.json',import.meta.url),'utf8'));

test('nightly movement and hatch metadata match implemented timing constants',()=>{
 const build=readBuild();
 assert.equal(build.releaseStatus,'candidate-not-deployment-confirmation');
 assert.equal(build.walking,`farm-only-neutral-LX-eased-stroll-${MAX_PLAYER_SPEED}cells-per-second`);
 assert.equal(build.hatching,`${HATCH_DURATION_MS}ms-nest-sized-shell-opening-low-hop-three-glints-no-auto-camera-pan`);
 assert.deepEqual(build.saleFeedback,{handoffMs:850,reducedMotionMs:180,audio:'accepted-sale-gesture-unlocked-three-note-WebAudio-chime',wallet:'actual-sale-price-receipt'});
});

test('growth timing metadata explicitly describes base age rather than accelerated real-time ETA',()=>{
 const build=readBuild();
 assert.equal(build.growthStageSeconds,ANIMAL_STAGE_MS/1000);
 assert.equal(build.newAnimalAdultSeconds,ANIMAL_ADULT_MS/1000);
 assert.equal(build.growthTimingMeaning,'base-effective-age-new-profiles-terrain-can-shorten-real-time-legacy-unchanged');
 assert.deepEqual(build.growthScaleBounds,[ANIMAL_SCALE_BOUNDS.min,ANIMAL_SCALE_BOUNDS.max]);
 assert.equal(build.growth,'saved-random-monotone-baby-juvenile-adult-with-bounded-terrain-bonus');
});

test('terrain metadata is derived from real capacities and cultivated levels, not random rarity',()=>{
 const build=readBuild();
 assert.deepEqual(build.terrain.levels,[1,2,3]);
 assert.deepEqual(build.terrain.qualityLabels,TERRAIN_QUALITY_LABELS);
 assert.equal(build.terrain.qualityMeaning,'cultivated-level-not-independent-random-rarity');
 assert.deepEqual(build.terrain.upgradeCoins,[terrainUpgradeCost({level:1}),terrainUpgradeCost({level:2})]);
 assert.equal(terrainUpgradeCost({level:3}),null);
 for(const terrain of ['meadow','creek','pond','grove','hill'] as Terrain[]){
  assert.deepEqual(build.terrain.baseCapacity[terrain],tileSupply({terrain,level:1}));
  for(const level of [1,2,3] as const){
   const supply=tileSupply({terrain,level});
   for(const kind of ['food','water','rest'] as const)assert.equal(supply[kind],build.terrain.baseCapacity[terrain][kind]*build.terrain.levelMultipliers[level-1]);
  }
 }
 assert.deepEqual(build.terrain.freeBaseCapacity,farmSupply({tiles:[],animals:[]}).capacity);
 assert.equal(build.terrain.maxGrowthBonusRate,.2);
 assert.equal(build.terrain.supplyMeaning,'reachable-owned-capacity-not-consumable-inventory');
});

test('service and persistence metadata retain explicit offline boundaries',()=>{
 const build=readBuild();
 assert.equal(build.wishingPool,'trusted-account-authority-runtime-gated-escrow-exchange');
 assert.equal(build.atlas,'local-history-or-verified-UID-scoped-online-history');
 assert.equal(build.saveProtection,'preserved-local-keys-explicit-owner-import-canonical-receipts');
 assert.equal(build.audioQA,'programmatic-synthesis-checks-not-listening-verification');
});

test('lifecycle metadata distinguishes hidden pause and one-time offline settlement from foreground autosave',()=>{
 const build=readBuild();
 assert.deepEqual(build.lifecycle,{
  hidden:'pause-periodic-simulation-save-and-World-render-loop',
  resume:'settle-offline-growth-once-before-resuming-audio',
  encounters:'no-repeated-unseen-wolf-encounters',
  transientEffects:'finish-hatch-sale-and-transfer-offscreen-without-replay',
  foregroundSave:'existing-250ms-cadence-unchanged',
 });
});

import {COMPANION_GREETING_GIFT_COINS} from '../src/minimal/companion-gift.ts';
test('companion gift metadata bounds daily game currency and preserves flat sale prices',()=>{
 assert.deepEqual(readBuild().companionGift,{coins:COMPANION_GREETING_GIFT_COINS,scope:'once-per-farm-per-UTC+8-calendar-day',trigger:'successful-explicit-adult-greeting',currency:'game-coins-not-Dreamina-credits',offline:'no-bank-or-auto-claim',clock:'local-date-guard-or-cloud-trusted-clock-when-enabled',feedback:'checked-commit-wallet-receipt-and-optional-two-note-gesture-unlocked-chime',salePrices:{normal:40,large:65,giant:100}});
});

// Public release claims must not silently expand during release integration.
// The complete approved pre-integration metadata literal below is independent of runtime exports.
test('pond clearance metadata bounds the player-only rule and empirical evidence',()=>{
 const build=readBuild();
 assert.deepEqual(build.playerPondClearance,{
  cells:.12,
  scope:'player-only-expanded-pond-boxes',
  legacy:'preserve-v2-cancel-unsafe-intent-checked-dry-center-retreat',
  evidence:'actual-weighted-shoe-CPU-sampling-not-continuous-proof',
 });
 assert.equal(build.playerPondClearance.cells,PLAYER_POND_CLEARANCE_CELLS);
});

test('lab-only shoulder polish metadata preserves authored animation and limits its evidence',()=>{
 assert.deepEqual(readBuild().animationLabPolish,{
  species:['dog','bear'],
  scope:'lab-only-proximal-leg-joins',
  preserved:'rigs-inverse-binds-and-authored-clips',
  evidence:'offline-Blender-and-actual-skinned-geometry-not-browser-acceptance',
 });
});

test('lab-only cat coat metadata bounds torso-conforming markings and their evidence',()=>{
 assert.deepEqual(readBuild().animationLabCatCoat,{
  species:'cat',
  scope:'lab-only-torso-conforming-markings',
  surfaceOffsetMeters:.0006,
  preserved:'rigs-inverse-binds-and-authored-clips',
  evidence:'offline-Blender-and-actual-skinned-geometry-not-browser-distance-acceptance',
 });
});

test('lab startup cleanup metadata bounds ownership rollback and fault-injected evidence',()=>{
 assert.deepEqual(readBuild().animationLabStartupCleanup,{
  scope:'lab-only-partial-startup-rollback',
  ownership:'idempotent-best-effort-owned-resource-release',
  errors:'preserve-original-startup-error-and-retry-ui',
  evidence:'fault-injected-controller-and-React-tests-not-real-browser-acceptance',
 });
});

test('game panel metadata bounds the compact controls and DOM-only help evidence',()=>{
 assert.deepEqual(readBuild().gamePanels,{
  layout:'compact-visual-status-and-actions',
  help:'labeled-question-modal-portal-focus-trap-Escape-inert-return-cleanup',
  evidence:'React-DOM-and-CSS-contracts-not-real-browser-acceptance',
 });
});

test('brisk walk metadata matches actual farm-human speed and stride without claiming perceived gait acceptance',()=>{
 const build=readBuild();
 assert.deepEqual(build.briskWalk,{
  cellsPerSecond:.5,
  strideScale:1.1,
  scope:'farm-human-only-nonfarm-defaults-unchanged',
  evidence:'actual-weighted-shoe-and-frame-rate-tests-not-perceived-gait-acceptance',
 });
 assert.equal(build.briskWalk.cellsPerSecond,PLAYER_WALK_SPEED);
 assert.equal(build.briskWalk.cellsPerSecond,MAX_PLAYER_SPEED);
 assert.equal(build.briskWalk.strideScale,farmLocomotion(new Object3D(),MAX_PLAYER_SPEED,0).farmStrideScale);
});

test('reviewed release capability fields retain unrelated V25 claims',()=>{
 const baseline=JSON.parse(readFileSync(new URL('./fixtures/sites-v27-preservation.json',import.meta.url),'utf8')).oldBuildMetadata;
 const current=readBuild();
 for(const field of ['version','storage','entry','generation','wishingPool','atlas','saveProtection','companionGift','biomeExploration','accounts','creative','sourceProvenance','sourceCommit','configSha256','siteOrigin','mobileGPUFPS','namedDemo','shopPolish','modelAdmission','customAnimalLifecycle','commandRecovery','localSaveCompatibility']){delete baseline[field];delete current[field];}
 delete current.terrain.baseCapacity.desert;delete current.terrain.baseCapacity.glacier;
 assert.deepEqual(current,baseline);
});

test('V27 capabilities distinguish implemented source from deployment configuration and never claim owner migration occurred',()=>{
 const build=readBuild();
 assert.match(build.sourceProvenance.candidateCommit,/^[a-f0-9]{40}$/);assert.equal(build.sourceProvenance.candidateCommit,build.sourceCommit);assert.equal(build.sourceProvenance.previousSiteCommit,'69952a467a3c9636150da2bb223b6fbbb2c5d07c');
 assert.equal(build.accounts.runtimeDefault,'disabled-unless-FARM_MINIMAL_ONLINE-is-1');
 assert.equal(build.accounts.accessPolicy,'existing-Sites-policy-unchanged');
 assert.equal(build.accounts.ownerBinding,'verified-canonical-UID-or-site-subject-never-first-visitor');
 assert.equal(build.accounts.ownerImport,'explicit-owner-only-once-no-overwrite');
 assert.equal(build.creative.workflow,'fixed-sample-mock-no-live-generation-api');
 assert.equal(build.creative.uniqueHunyuanModels,6);
 assert.equal(build.creative.environmentModels,5);assert.equal(build.creative.catalogModels,4);
 assert.deepEqual(build.biomeExploration.readyPools,{grassland:['sheep','pig','cow'],forest:['bunny'],wetland:['duck'],desert:[],glacier:[]});
 assert.equal(build.biomeExploration.groundMode,'continuous-ground-default-with-compatible-fallback');
 assert.equal(build.releaseStatus,'candidate-not-deployment-confirmation');
 assert.equal(build.accounts.online,undefined);assert.equal(build.accounts.ownerMigrated,undefined);
});

test('named shop capabilities distinguish demo targets and bounded UI changes without adding live-generation or terrain claims',()=>{
 const build=readBuild();assert.equal(build.namedDemo.authentication,false);assert.equal(build.namedDemo.localAndHostedSynchronized,false);assert.deepEqual(build.namedDemo.runtimeRequires,['FARM_NAMED_DEMO=1','FARM_NAMED_REQUIRE_MODELS=1']);assert.deepEqual(build.namedDemo.readyPools.desert,['alpaca']);assert.deepEqual(build.namedDemo.readyPools.glacier,['penguin']);assert.equal(build.shopPolish.purchase,'shared-domain-availability-real-disabled-lock-short-reason');assert.equal(build.shopPolish.unavailableHatchTerrainDoesNotBanPurchase,true);assert.equal(build.shopPolish.customTerrain,'not-open-existing-land-edit-only');assert.equal(build.modelAdmission.browserGPUFPS,'unmeasured');assert.match(build.configSha256,/^[a-f0-9]{64}$/);
});

test('current custom lifecycle and command recovery metadata are bounded and preserve unknown operations',()=>{const b=readBuild();assert.equal(b.customAnimalLifecycle.visual,'actual-static-GLB-with-procedural-root-actions-not-skeletal-gait');assert.equal(b.customAnimalLifecycle.sale,'same-ordinary-value-no-added-adult-gate');assert.equal(b.commandRecovery.confirmedPost,'unlocks-before-optional-background-read');assert.equal(b.commandRecovery.timeoutMs,12000);assert.equal(b.commandRecovery.unknownPost,'same-durable-request-id-until-explicit-retry');assert.equal(b.namedDemo.namespace,'trusted-signed-in-subject-partitioned-server-D1');assert.equal(b.namedDemo.authentication,false);assert.equal(b.localSaveCompatibility.invalidOrFuture,'still-blocked-no-original-key-overwrite');});
