import { defineConfig } from 'vite';
import { feedbackWriterPlugin } from './vite-plugins/feedback-writer';

export default defineConfig({
  plugins: [feedbackWriterPlugin()],
  server: {
    port: 5173,
    open: false,
  },
});
