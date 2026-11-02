/**
 * Four authored island collections, using existing geometry and species only.
 * This module describes space, not player state: the server owns versioned IDs,
 * initialisation time, prices, discovery history and any one-time NPC migration.
 * Names/avatars are original cast identities, not claims of online presence.
 * scale is finalSize / standardSize, applied exactly once by the state builder.
 */
const cell=(x,z)=>({x,z});
const rectangle=(x,z,width,depth)=>Array.from({length:width*depth},(_,i)=>cell(x+i%width,z+Math.floor(i/width)));
const plant=(speciesId,x,z,mutation='normal')=>({speciesId,cell:cell(x,z),mutation,scale:1});
const fish=(speciesId,mutation='normal')=>({speciesId,mutation,scale:1});
const production=(kind,tier,speciesId,x,z)=>({kind,tier,speciesId,cell:cell(x,z)});
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};

export const NPC_ISLAND_LAYOUTS=freeze([
 {
  uid:'demo-kelly',profile:{name:'Kelly',avatar:'human-kelly'},theme:'花洲',
  // A two-cell-wide strand bends twice; flower groups mark the corners.
  land:[...rectangle(0,0,2,3),...rectangle(2,2,2,3),...rectangle(4,4,2,2)],
  docks:[cell(6,4),cell(7,4)],tank:[cell(4,5),cell(5,5)],position:cell(1,1),
  displayPlants:[plant('iris',0,0),plant('iris',0,2),plant('tulip',2,2),plant('tulip',3,3),plant('phalaenopsis',4,4,'gold')],
  displayFish:[fish('clownfish'),fish('blue-tang')],
  production:[production('plant',1,'daisy',2,4),production('fish',1,'sardine',7,4)],
 },
 {
  uid:'demo-bear',profile:{name:'Bear熊',avatar:'human-bear'},theme:'水馆',
  // The open end of the U stays sea. A contiguous L-shaped aquarium sits
  // within the broad base, leaving a continuous dry route around its back.
  land:rectangle(0,0,6,5).filter(c=>!(c.x>=2&&c.x<=3&&c.z<=1)),
  docks:[cell(6,3),cell(7,3)],tank:[...rectangle(1,2,3,2),cell(1,1)],position:cell(4,2),
  displayPlants:[plant('mimosa',0,0),plant('string-of-pearls',5,4)],
  displayFish:[fish('manta-ray'),fish('hammerhead'),fish('king-crab','gold'),fish('oarfish')],
  production:[production('plant',1,'radish',5,0),production('fish',2,'salmon',7,3)],
 },
 {
  uid:'demo-frog',profile:{name:'奶蛙',avatar:'milk-frog'},theme:'树林',
  // Three widely spaced umbrella crowns frame a clear T-shaped promenade.
  // No aquarium here: this island's landmark is the grove, not every facility.
  land:[...rectangle(-2,0,5,2),...rectangle(0,2,2,3)],
  docks:[cell(-1,4),cell(-2,4)],tank:[],position:cell(0,2),
  displayPlants:[plant('rafflesia',-2,0),plant('rafflesia',2,0),plant('rafflesia',1,4),plant('spiral-aloe',-1,1)],
  displayFish:[],
  production:[production('plant',2,'mimosa',1,2),production('fish',1,'sardine',-2,4)],
 },
 {
  uid:'demo-cat',profile:{name:'香蕉猫',avatar:'banana-cat'},theme:'果园',
  // Low red fruit beds form the long arm, with a single grape canopy at the
  // elbow and a small aquarium at the far end; the centre stays walkable.
  land:[...rectangle(0,0,2,5),...rectangle(2,3,3,2)],
  docks:[cell(-1,4),cell(-2,4)],tank:[cell(4,3),cell(4,4)],position:cell(1,2),
  displayPlants:[plant('lithops',0,0),plant('lithops',0,2),plant('tomato',1,0),plant('tomato',2,4),plant('grape',3,3)],
  displayFish:[fish('clownfish'),fish('sardine')],
  production:[production('plant',1,'lithops',0,3),production('fish',1,'sardine',-2,4)],
 },
]);
