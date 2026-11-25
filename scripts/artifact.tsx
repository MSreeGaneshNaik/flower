// Single-page build of Flower for a claude.ai artifact: React app, CSS and latin fonts in two files.
import '@fontsource/archivo/latin-400.css';
import '@fontsource/archivo/latin-500.css';
import '@fontsource/archivo/latin-600.css';
import '@fontsource/courier-prime/latin-400.css';
import '../app/globals.css';
import { createRoot } from 'react-dom/client';
import Studio from '../components/Studio';

(window as unknown as { __FLOWER_EMBED: boolean }).__FLOWER_EMBED = true;
createRoot(document.getElementById('root') as HTMLElement).render(<Studio />);
