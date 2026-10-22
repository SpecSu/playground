/** Consistent local SQLite backup. Never prints user records or credential values. */
import {DatabaseSync,backup} from 'node:sqlite';import {mkdirSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';
const source=resolve('.local/farm.sqlite'),dir=resolve('.local/backups');mkdirSync(dir,{recursive:true});
const label=process.argv[2]??'before-v5';if(!/^[a-z0-9-]{1,40}$/.test(label))throw new Error('Invalid backup label');
const name=new Date().toISOString().replace(/[:.]/g,'-')+'-'+label+'.sqlite',target=resolve(dir,name);
const db=new DatabaseSync(source,{readOnly:true});await backup(db,target);db.close();const copy=new DatabaseSync(target,{readOnly:true});const integrity=copy.prepare('PRAGMA integrity_check').get().integrity_check;if(integrity!=='ok')throw new Error('Backup integrity check failed');copy.close();writeFileSync('.local/last-backup.txt',target+'\n');console.log(JSON.stringify({backup:target,integrity}));
