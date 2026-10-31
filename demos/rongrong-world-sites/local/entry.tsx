import {createRoot} from 'react-dom/client';
import Farm from '../src/main.tsx';
// The same v34 game root; only the hosting shell differs from Sites SSR.
createRoot(document.getElementById('root')!).render(<Farm/>);
