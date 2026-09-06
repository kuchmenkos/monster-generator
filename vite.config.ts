import { bulalaVoicePlugin } from './vite-plugins/bulala-voice';
import { defineConfig } from 'vite';
import { feedbackWriterPlugin } from './vite-plugins/feedback-writer';
import { respeecherProxyPlugin } from './vite-plugins/respeecher-proxy';

export default defineConfig({
  plugins: [feedbackWriterPlugin(), respeecherProxyPlugin(), bulalaVoicePlugin()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        legacy: 'legacy.html',
        ttsDemo: 'tts-demo.html',
      },
    },
  },
  server: {
    port: 5173,
    open: false,
  },
});
