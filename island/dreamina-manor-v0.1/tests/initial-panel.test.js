import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../components/manor/Manor.tsx',import.meta.url),'utf8');
test('initial entry and recovery keep the panel closed while the bag shortcut explicitly opens it',()=>{
 assert.match(source,/\[collapsed,setCollapsed\]=useState\(true\)/);
 const init=source.slice(source.indexOf("useEffect(()=>{const id=new URLSearchParams"),source.indexOf('useEffect(()=>{const element=trayRef.current'));
 assert.match(init,/await c\.recover\(\)/);
 assert.match(init,/createManorScene/);
 assert.doesNotMatch(init,/setCollapsed\(false\)/);
 assert.match(source,/hidden=\{chatOpen\|\|\(collapsed&&!mode\)\}/);
 assert.match(source,/className="bag-shortcut"[^>]+onClick=\{\(\)=>\{[^}]*setCollapsed\(false\)/);
});
