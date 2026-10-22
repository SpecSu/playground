import {createRoot} from 'react-dom/client';
import {FarmBoundary} from './FarmBoundary.tsx';
import EstateApp from './v5/EstateApp.tsx';
import './style.css';
import './v5/estate.css';
createRoot(document.getElementById('root')!).render(<FarmBoundary><EstateApp/></FarmBoundary>);
