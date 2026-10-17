import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

// Custom plugin to ensure large public/audio files are NOT bundled into dist/
function excludeAudioFromBuild() {
  return {
    name: 'exclude-audio-from-dist',
    closeBundle() {
      const distAudioDir = path.resolve(__dirname, 'dist/audio');
      if (fs.existsSync(distAudioDir)) {
        console.log(`[vite] Removing bundled audio directory from dist to keep build under 5MB...`);
        fs.rmSync(distAudioDir, { recursive: true, force: true });
      }
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), excludeAudioFromBuild()],
  server: {
    host: true,
    allowedHosts: true,
  }
});
