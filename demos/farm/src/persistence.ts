import type {Command} from './model.ts';
export type Persistence={pending:Command|null;busy:boolean;commandError:string;readError:string};
export const initialPersistence:Persistence={pending:null,busy:false,commandError:'',readError:''};
export type PersistenceEvent={type:'submit';command:Command}|{type:'failed'|'readFailed';message:string}|{type:'saved'|'readOK'};
/** Reads and writes resolve independently; a late read cannot confirm a failed command. */
export function persistenceReducer(s:Persistence,e:PersistenceEvent):Persistence{
 switch(e.type){
  case 'submit':return {...s,pending:s.pending||e.command,busy:true,commandError:''};
  case 'failed':return {...s,busy:false,commandError:e.message};
  case 'saved':return {...initialPersistence};
  case 'readOK':return {...s,readError:''};
  case 'readFailed':return {...s,readError:e.message};
 }
}
