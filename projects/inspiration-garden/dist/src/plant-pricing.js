/** Trusted local-demo appraisal. Raw saved records and planted timestamps are never migrated. */
export const OFFICIAL_TARIFFS=Object.freeze({radish:[8,14,45000],tomato:[16,26,90000],mushroom:[30,48,180000],pumpkin:[55,85,420000],eggplant:[90,140,720000],corn:[140,215,1200000],cabbage:[210,320,2100000],sunflower:[320,490,3000000],weeping_willow_tree:[500,760,5400000],golden_ginkgo_tree:[800,1200,10800000],evergreen_fir_tree:[1200,1800,21600000],ancient_star_tree:[1800,2700,43200000]});
export const PREVIOUS_BASIC_TARIFFS=Object.freeze({radish:[8,14,45000],tomato:[12,20,60000],mushroom:[10,17,50000],pumpkin:[16,25,75000],eggplant:[14,23,70000],corn:[18,29,90000],cabbage:[20,32,100000],sunflower:[24,38,120000]});
const groups=[['whisper_radish','puffer_tomato','plush_button_sprout','yarn_ball_flower','bear_bubble_leaf'],['jiji_crimson_rose_bush','bear_plush_bloom','lx_silver_biofern','lx_orbital_bloom','drum_pumpkin','piano_pumpkin','singing_eggplant','keyboard_corn','wave_cabbage','sleepy_sunflower','glow_mushroom','painter_tomato','controller_sprout','bear_foldbud','silver_veil_willow','oxblood_bellflower'],['cloud_lantern','bubble_teapot','gramophone_flower','radar_succulent','pace_meter_bamboo','lx_bio_vault'],['giant_piano_sunflower','giant_moon_mushroom','giant_bubble_lotus','plush_cotton_tree','circuit_bonsai']];
const tiers=[[40,64,240000],[90,140,720000],[180,275,1800000],[450,680,5400000]];
export const creativeTariff=id=>tiers[groups.findIndex(ids=>ids.includes(id))]??tiers[1];
export const tariffFields=['seedPrice','salePrice','growMs'];
export const matchesTariff=(v,tuple)=>!!v&&!!tuple&&tariffFields.every((k,i)=>v[k]===tuple[i]);
export const withTariff=(v,tuple)=>({...v,...Object.fromEntries(tariffFields.map((k,i)=>[k,tuple[i]]))});
