import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'ISRO Visual Perception Agent - Privacy Engine',
  version: '1.0.0',
  description: 'On-device Visual Perception, WebGPU ML & DOM Privacy Redaction Engine for Light-weight Browser Agents (ISRO SIH PS 26171)',
  icons: {
    16: 'icons/icon16.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },
  action: {
    default_popup: 'index.html',
    default_icon: {
      16: 'icons/icon16.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    },
    default_title: 'ISRO Visual Perception Agent',
  },
  permissions: [
    'activeTab',
    'scripting',
    'offscreen',
    'tabs',
  ],
  host_permissions: [
    'http://127.0.0.1:8000/*',
    'http://localhost:8000/*',
    '<all_urls>',
  ],
  background: {
    service_worker: 'src/background/serviceWorker.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/contentScript.ts'],
      run_at: 'document_idle',
    },
  ],
  web_accessible_resources: [
    {
      resources: ['src/offscreen/offscreen.html', 'src/offscreen/offscreen.ts', 'icons/*'],
      matches: ['<all_urls>'],
    },
  ],
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
  },
});
