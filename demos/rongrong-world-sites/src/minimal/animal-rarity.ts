/** Individual cosmetic quality, independent of species and ecology; no economy/stat bonus. */
export const ANIMAL_RARITIES=['white','green','blue','purple','gold'] as const;
export type AnimalRarity=typeof ANIMAL_RARITIES[number];
export const RARITY_LABELS:Readonly<Record<AnimalRarity,string>>={white:'白色',green:'绿色',blue:'蓝色',purple:'紫色',gold:'金色'};
export const RARITY_COLORS:Readonly<Record<AnimalRarity,string>>={white:'#F1F0E8',green:'#4C8659',blue:'#4C7EBD',purple:'#9064B6',gold:'#B48628'};
/** Pair the symbol with its label; color must never be the only quality cue. */
export const RARITY_SYMBOLS:Readonly<Record<AnimalRarity,string>>={white:'○',green:'△',blue:'◇',purple:'✦',gold:'★'};
/** Fractional probabilities, not percent integers. Every species uses this same distribution. */
export const RARITY_PROBABILITIES:Readonly<Record<AnimalRarity,number>>={white:.55,green:.25,blue:.13,purple:.06,gold:.01};
export function isAnimalRarity(value:unknown):value is AnimalRarity{return typeof value==='string'&&ANIMAL_RARITIES.some(rarity=>rarity===value);}
/** Old animals/eggs without this optional field retain white quality; never reroll on read. */
export function rarityOf(rarity?:AnimalRarity):AnimalRarity{return rarity??'white';}
/** Caller supplies its deterministic roll. Reject invalid input rather than biasing a tier by clamping. */
export function sampleRarity(roll:number):AnimalRarity{
 if(!Number.isFinite(roll)||roll<0||roll>=1)throw new RangeError('Rarity roll must be finite and in [0, 1)');
 // Explicit boundaries avoid accumulated floating-point drift at .93 and .99.
 return roll<.55?'white':roll<.8?'green':roll<.93?'blue':roll<.99?'purple':'gold';
}
