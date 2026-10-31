import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
const here=(relative:string)=>fileURLToPath(new URL(relative,import.meta.url));
export default defineConfig({
 root:here('./'),publicDir:here('../public'),
 define:{'import.meta.env.VITE_LOCAL_ANIMAL_MODELS':JSON.stringify('1')},
 build:{outDir:here('../dist-local'),emptyOutDir:true},
});
