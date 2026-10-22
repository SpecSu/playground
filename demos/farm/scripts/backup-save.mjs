/** Consistent local SQLite backup. Never prints user records or credential values. */
import {DatabaseSync,backup} from 'node:sqlite';import {mkdirSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';
const source=resolve('.local/farm.sqlite'),dir=resolve('.local/backups');mkdirSync(dir,{recursive:true});
const name=new Date().toISOString().replace(/[:.]/g,'-')+'-before-v5.sqlite',target=resolve(dir,name);
const db=new DatabaseSync(source,{readOnly:true});await backup(db,target);db.close();const copy=new DatabaseSync(target,{readOnly:true});const integrity=copy.prepare('PRAGMA integrity_check').get().integrity_check;if(integrity!=='ok')throw new Error('Backup integrity check failed');copy.close();writeFileSync('.local/last-backup.txt',target+'\n');console.log(JSON.stringify({backup:target,integrity}));
