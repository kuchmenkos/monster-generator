import { defineConfig } from 'vite';
import { feedbackWriterPlugin } from './vite-plugins/feedback-writer';
import { voiceApiPlugin } from './vite-plugins/voice-api';

export default defineConfig({
  plugins: [feedbackWriterPlugin(), voiceApiPlugin()],
  server: {
    port: 5173,
    open: false,
  },
});
