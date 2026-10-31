import type {BoardingInvitation,PublicBoardingInvitation} from './boarding-contract.ts';
import type {ApprovedFarmResourceContext} from './animal-resource-context.ts';
import type {CreativeInventory,CreativeJob,CreativeTemplate} from './creative-assets.ts';
import type {ExchangeAsset,ExchangeOfferData} from './exchange-contract.ts';
import type {AccountRows} from './account-contract.ts';
import type {MinimalAnimal, MinimalCommand, MinimalState, LegacyMinimalState} from './model.ts';

/** Authenticated actor and time are server inputs, never fields in a client request. */
export type MinimalBootstrapRequest = {requestId:string} & (
 | {mode:'new'}
 | {mode:'import'; legacySnapshot:MinimalState|LegacyMinimalState}
);
/** Server-only debug command; never part of the local/visitor simulation command set. */
export type DemoCoinGrantCommand = {type:'demoCoins';amount:10000|50000};
export type MinimalCommandRequest = {requestId:string;expectedRevision:number;command:MinimalCommand|{type:'stopMove'}|DemoCoinGrantCommand};
export type WishingCommand =
 | {type:'deposit';animalId:string;consent:'any-different-species'}
 | {type:'withdraw';offerId:string;offerRevision:number}
 | {type:'accept';offerId:string;offerRevision:number;ownAnimalId:string};
export type WishingRequest = {requestId:string;expectedRevision:number;command:WishingCommand};
export type MinimalOrigin = 'server-created'|'grandfathered-unverified';
export type CanonicalFarm = {accountId:string;farmId:string;revision:number;state:MinimalState;creative?:CreativeInventory;activeBoardingId?:string|null;boardingAnimalId?:string|null;boardingReservedEgg?:boolean;boardingInbox?:string[];legacyStateV2?:LegacyMinimalState;activeOfferId:string|null;initializedAt:number;origin:MinimalOrigin;assetProvenance:Record<string,MinimalOrigin>};
export type WishingOffer = {exchange?:ExchangeOfferData;offerId:string;ownerAccountId:string;animalId:string;revision:number;status:'open'|'completed'|'withdrawn'|'expired';createdAt:number;expiresAt:number;tradeId:string|null};
export type MinimalErrorCode = 'invalid-request'|'request-id-reused'|'not-initialized'|'already-initialized'|'invalid-import'|'duplicate-import'|'stale-farm'|'stale-offer'|'offer-unavailable'|'foreign-animal'|'animal-unavailable'|'animal-locked'|'active-offer'|'self-trade'|'same-species'|'quota-used'|'no-safe-landing'|'model-rejected'|'clock-regressed'|'foreign-asset'|'asset-unavailable'|'asset-locked'|'kind-not-accepted'|'capacity-full'|'model-not-ready'|'job-unavailable'|'boarding-unavailable'|'boarding-busy'|'boarding-partner'|'friend-unavailable';
/** Immutable original result. Replays return this exact result, including original revisions. GET refreshes current state. */
export type MinimalResult = {accepted:boolean;code:'ok'|MinimalErrorCode;message:string;serverTime:number;farm:CanonicalFarm|null;offer?:WishingOffer;tradeId?:string;job?:CreativeJob;boarding?:PublicBoardingInvitation};
export type MinimalReceipt = {accountId:string;requestId:string;fingerprint:string;result:MinimalResult};
export type MinimalImport = {accountId:string;requestId:string;sourceFingerprint:string;importedAt:number;provenance:'grandfathered-unverified';idMap:Record<string,string>};
export type MinimalImportSource = {accountId:string;sourceFingerprint:string};
export type WishingDaily = {accountId:string;dayKey:string;tradeId:string};
export type WishingTrade = {tradeId:string;offerId:string;ownerAccountId:string;takerAccountId:string;ownerAnimal?:MinimalAnimal;takerAnimal?:MinimalAnimal;ownerAsset?:ExchangeAsset;takerAsset?:ExchangeAsset;completedAt:number;dayKey:string};
export type MinimalRows = AccountRows & {boardings:BoardingInvitation;farms:CanonicalFarm;receipts:MinimalReceipt;imports:MinimalImport;importSources:MinimalImportSource;offers:WishingOffer;daily:WishingDaily;trades:WishingTrade};
export type MinimalTable = keyof MinimalRows;
/** Implementations MUST atomically commit the entire callback, serialize/CAS all writers,
 * and rollback all writes on exceptions. Reads must see earlier puts in the callback.
 * D1 implementations may rerun callback after a lost global CAS. */
export interface MinimalTransaction {
 get<K extends MinimalTable>(table:K,key:string):Promise<MinimalRows[K]|null>;
 put<K extends MinimalTable>(table:K,key:string,value:MinimalRows[K]):Promise<void>;
 listOpenOffers(now:number,after:string|null,limit:number):Promise<WishingOffer[]>;
}
export interface MinimalRepository {transaction<T>(work:(tx:MinimalTransaction)=>Promise<T>):Promise<T>;}
export type MinimalAuthorityOptions = {/** Trusted API binds this only after named-demo namespace and identity selection. Never request JSON. */demoDebugAccountId?:string;animalResources?:ApprovedFarmResourceContext;creativeCatalog?:readonly CreativeTemplate[];clock:()=>number;newId:()=>string;fingerprint:(normalized:string)=>Promise<string>};
export type MinimalView = {serverTime:number;dayKey:string;resetAt:number;farm:CanonicalFarm|null;ownOffer:WishingOffer|null;usedToday:boolean;serviceGate:'client-migration-required'};
export type PublicWishingOffer = {offerId:string;revision:number;expiresAt:number;own:boolean;animal:Pick<MinimalAnimal,'id'|'name'|'rarity'|'species'|'sex'|'size'|'growth'|'growthAgeMs'|'growthBonusMs'|'bornAt'>};
export type WishingPage = {serverTime:number;offers:PublicWishingOffer[];nextCursor:string|null};
export const minimalReceiptKey=(accountId:string,requestId:string)=>JSON.stringify([accountId,requestId]);
export const minimalDailyKey=(accountId:string,day:string)=>JSON.stringify([accountId,day]);
