/** Public account UID is derived server-side from the trusted site-scoped subject.
 * It is an identifier, never a login credential or an ownership claim. */
export type FarmAccount={uid:string;handle:string;createdAt:number};
export type FarmAccountRow=FarmAccount&{ownerBound:boolean};
export type AccountRows={profiles:FarmAccountRow};
export type AccountServiceStatus='online'|'disabled'|'sign-in-required'|'unavailable';
