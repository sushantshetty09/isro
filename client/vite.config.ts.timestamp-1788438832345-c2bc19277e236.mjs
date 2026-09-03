// vite.config.ts
import { defineConfig } from "file:///C:/Users/susha/OneDrive/Desktop/New%20folder/client/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/susha/OneDrive/Desktop/New%20folder/client/node_modules/@vitejs/plugin-react/dist/index.js";
import { crx } from "file:///C:/Users/susha/OneDrive/Desktop/New%20folder/client/node_modules/@crxjs/vite-plugin/dist/index.mjs";

// manifest.config.ts
import { defineManifest } from "file:///C:/Users/susha/OneDrive/Desktop/New%20folder/client/node_modules/@crxjs/vite-plugin/dist/index.mjs";
var manifest_config_default = defineManifest({
  manifest_version: 3,
  name: "ISRO Visual Perception Agent - Privacy Engine",
  version: "1.0.0",
  description: "On-device Visual Perception, WebGPU ML & DOM Privacy Redaction Engine for Light-weight Browser Agents (ISRO SIH PS 26171)",
  icons: {
    16: "icons/icon16.png",
    48: "icons/icon48.png",
    128: "icons/icon128.png"
  },
  action: {
    default_popup: "index.html",
    default_icon: {
      16: "icons/icon16.png",
      48: "icons/icon48.png",
      128: "icons/icon128.png"
    },
    default_title: "ISRO Visual Perception Agent"
  },
  permissions: [
    "activeTab",
    "scripting",
    "offscreen",
    "tabs"
  ],
  host_permissions: [
    "http://localhost:8000/*",
    "<all_urls>"
  ],
  background: {
    service_worker: "src/background/serviceWorker.ts",
    type: "module"
  },
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["src/content/contentScript.ts"],
      run_at: "document_idle"
    }
  ],
  web_accessible_resources: [
    {
      resources: ["src/offscreen/offscreen.html", "src/offscreen/offscreen.ts", "icons/*"],
      matches: ["<all_urls>"]
    }
  ],
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
  }
});

// vite.config.ts
import { resolve } from "path";
var __vite_injected_original_dirname = "C:\\Users\\susha\\OneDrive\\Desktop\\New folder\\client";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    crx({ manifest: manifest_config_default })
  ],
  optimizeDeps: {
    exclude: ["@huggingface/transformers", "onnxruntime-web"]
  },
  build: {
    rollupOptions: {
      input: {
        popup: resolve(__vite_injected_original_dirname, "index.html"),
        offscreen: resolve(__vite_injected_original_dirname, "src/offscreen/offscreen.html")
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiLCAibWFuaWZlc3QuY29uZmlnLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcc3VzaGFcXFxcT25lRHJpdmVcXFxcRGVza3RvcFxcXFxOZXcgZm9sZGVyXFxcXGNsaWVudFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcc3VzaGFcXFxcT25lRHJpdmVcXFxcRGVza3RvcFxcXFxOZXcgZm9sZGVyXFxcXGNsaWVudFxcXFx2aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovVXNlcnMvc3VzaGEvT25lRHJpdmUvRGVza3RvcC9OZXclMjBmb2xkZXIvY2xpZW50L3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XG5pbXBvcnQgcmVhY3QgZnJvbSAnQHZpdGVqcy9wbHVnaW4tcmVhY3QnO1xuaW1wb3J0IHsgY3J4IH0gZnJvbSAnQGNyeGpzL3ZpdGUtcGx1Z2luJztcbmltcG9ydCBtYW5pZmVzdCBmcm9tICcuL21hbmlmZXN0LmNvbmZpZyc7XG5pbXBvcnQgeyByZXNvbHZlIH0gZnJvbSAncGF0aCc7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHBsdWdpbnM6IFtcbiAgICByZWFjdCgpLFxuICAgIGNyeCh7IG1hbmlmZXN0IH0pLFxuICBdLFxuICBvcHRpbWl6ZURlcHM6IHtcbiAgICBleGNsdWRlOiBbJ0BodWdnaW5nZmFjZS90cmFuc2Zvcm1lcnMnLCAnb25ueHJ1bnRpbWUtd2ViJ10sXG4gIH0sXG4gIGJ1aWxkOiB7XG4gICAgcm9sbHVwT3B0aW9uczoge1xuICAgICAgaW5wdXQ6IHtcbiAgICAgICAgcG9wdXA6IHJlc29sdmUoX19kaXJuYW1lLCAnaW5kZXguaHRtbCcpLFxuICAgICAgICBvZmZzY3JlZW46IHJlc29sdmUoX19kaXJuYW1lLCAnc3JjL29mZnNjcmVlbi9vZmZzY3JlZW4uaHRtbCcpLFxuICAgICAgfSxcbiAgICB9LFxuICB9LFxuICBzZXJ2ZXI6IHtcbiAgICBwb3J0OiA1MTczLFxuICAgIHN0cmljdFBvcnQ6IHRydWUsXG4gICAgaG1yOiB7XG4gICAgICBwb3J0OiA1MTczLFxuICAgIH0sXG4gIH0sXG59KTtcbiIsICJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcc3VzaGFcXFxcT25lRHJpdmVcXFxcRGVza3RvcFxcXFxOZXcgZm9sZGVyXFxcXGNsaWVudFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcc3VzaGFcXFxcT25lRHJpdmVcXFxcRGVza3RvcFxcXFxOZXcgZm9sZGVyXFxcXGNsaWVudFxcXFxtYW5pZmVzdC5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0M6L1VzZXJzL3N1c2hhL09uZURyaXZlL0Rlc2t0b3AvTmV3JTIwZm9sZGVyL2NsaWVudC9tYW5pZmVzdC5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVNYW5pZmVzdCB9IGZyb20gJ0Bjcnhqcy92aXRlLXBsdWdpbic7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZU1hbmlmZXN0KHtcbiAgbWFuaWZlc3RfdmVyc2lvbjogMyxcbiAgbmFtZTogJ0lTUk8gVmlzdWFsIFBlcmNlcHRpb24gQWdlbnQgLSBQcml2YWN5IEVuZ2luZScsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGRlc2NyaXB0aW9uOiAnT24tZGV2aWNlIFZpc3VhbCBQZXJjZXB0aW9uLCBXZWJHUFUgTUwgJiBET00gUHJpdmFjeSBSZWRhY3Rpb24gRW5naW5lIGZvciBMaWdodC13ZWlnaHQgQnJvd3NlciBBZ2VudHMgKElTUk8gU0lIIFBTIDI2MTcxKScsXG4gIGljb25zOiB7XG4gICAgMTY6ICdpY29ucy9pY29uMTYucG5nJyxcbiAgICA0ODogJ2ljb25zL2ljb240OC5wbmcnLFxuICAgIDEyODogJ2ljb25zL2ljb24xMjgucG5nJyxcbiAgfSxcbiAgYWN0aW9uOiB7XG4gICAgZGVmYXVsdF9wb3B1cDogJ2luZGV4Lmh0bWwnLFxuICAgIGRlZmF1bHRfaWNvbjoge1xuICAgICAgMTY6ICdpY29ucy9pY29uMTYucG5nJyxcbiAgICAgIDQ4OiAnaWNvbnMvaWNvbjQ4LnBuZycsXG4gICAgICAxMjg6ICdpY29ucy9pY29uMTI4LnBuZycsXG4gICAgfSxcbiAgICBkZWZhdWx0X3RpdGxlOiAnSVNSTyBWaXN1YWwgUGVyY2VwdGlvbiBBZ2VudCcsXG4gIH0sXG4gIHBlcm1pc3Npb25zOiBbXG4gICAgJ2FjdGl2ZVRhYicsXG4gICAgJ3NjcmlwdGluZycsXG4gICAgJ29mZnNjcmVlbicsXG4gICAgJ3RhYnMnLFxuICBdLFxuICBob3N0X3Blcm1pc3Npb25zOiBbXG4gICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6ODAwMC8qJyxcbiAgICAnPGFsbF91cmxzPicsXG4gIF0sXG4gIGJhY2tncm91bmQ6IHtcbiAgICBzZXJ2aWNlX3dvcmtlcjogJ3NyYy9iYWNrZ3JvdW5kL3NlcnZpY2VXb3JrZXIudHMnLFxuICAgIHR5cGU6ICdtb2R1bGUnLFxuICB9LFxuICBjb250ZW50X3NjcmlwdHM6IFtcbiAgICB7XG4gICAgICBtYXRjaGVzOiBbJzxhbGxfdXJscz4nXSxcbiAgICAgIGpzOiBbJ3NyYy9jb250ZW50L2NvbnRlbnRTY3JpcHQudHMnXSxcbiAgICAgIHJ1bl9hdDogJ2RvY3VtZW50X2lkbGUnLFxuICAgIH0sXG4gIF0sXG4gIHdlYl9hY2Nlc3NpYmxlX3Jlc291cmNlczogW1xuICAgIHtcbiAgICAgIHJlc291cmNlczogWydzcmMvb2Zmc2NyZWVuL29mZnNjcmVlbi5odG1sJywgJ3NyYy9vZmZzY3JlZW4vb2Zmc2NyZWVuLnRzJywgJ2ljb25zLyonXSxcbiAgICAgIG1hdGNoZXM6IFsnPGFsbF91cmxzPiddLFxuICAgIH0sXG4gIF0sXG4gIGNvbnRlbnRfc2VjdXJpdHlfcG9saWN5OiB7XG4gICAgZXh0ZW5zaW9uX3BhZ2VzOiBcInNjcmlwdC1zcmMgJ3NlbGYnICd3YXNtLXVuc2FmZS1ldmFsJzsgb2JqZWN0LXNyYyAnc2VsZidcIixcbiAgfSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFxVixTQUFTLG9CQUFvQjtBQUNsWCxPQUFPLFdBQVc7QUFDbEIsU0FBUyxXQUFXOzs7QUNGeVUsU0FBUyxzQkFBc0I7QUFFNVgsSUFBTywwQkFBUSxlQUFlO0FBQUEsRUFDNUIsa0JBQWtCO0FBQUEsRUFDbEIsTUFBTTtBQUFBLEVBQ04sU0FBUztBQUFBLEVBQ1QsYUFBYTtBQUFBLEVBQ2IsT0FBTztBQUFBLElBQ0wsSUFBSTtBQUFBLElBQ0osSUFBSTtBQUFBLElBQ0osS0FBSztBQUFBLEVBQ1A7QUFBQSxFQUNBLFFBQVE7QUFBQSxJQUNOLGVBQWU7QUFBQSxJQUNmLGNBQWM7QUFBQSxNQUNaLElBQUk7QUFBQSxNQUNKLElBQUk7QUFBQSxNQUNKLEtBQUs7QUFBQSxJQUNQO0FBQUEsSUFDQSxlQUFlO0FBQUEsRUFDakI7QUFBQSxFQUNBLGFBQWE7QUFBQSxJQUNYO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsRUFDRjtBQUFBLEVBQ0Esa0JBQWtCO0FBQUEsSUFDaEI7QUFBQSxJQUNBO0FBQUEsRUFDRjtBQUFBLEVBQ0EsWUFBWTtBQUFBLElBQ1YsZ0JBQWdCO0FBQUEsSUFDaEIsTUFBTTtBQUFBLEVBQ1I7QUFBQSxFQUNBLGlCQUFpQjtBQUFBLElBQ2Y7QUFBQSxNQUNFLFNBQVMsQ0FBQyxZQUFZO0FBQUEsTUFDdEIsSUFBSSxDQUFDLDhCQUE4QjtBQUFBLE1BQ25DLFFBQVE7QUFBQSxJQUNWO0FBQUEsRUFDRjtBQUFBLEVBQ0EsMEJBQTBCO0FBQUEsSUFDeEI7QUFBQSxNQUNFLFdBQVcsQ0FBQyxnQ0FBZ0MsOEJBQThCLFNBQVM7QUFBQSxNQUNuRixTQUFTLENBQUMsWUFBWTtBQUFBLElBQ3hCO0FBQUEsRUFDRjtBQUFBLEVBQ0EseUJBQXlCO0FBQUEsSUFDdkIsaUJBQWlCO0FBQUEsRUFDbkI7QUFDRixDQUFDOzs7QUQvQ0QsU0FBUyxlQUFlO0FBSnhCLElBQU0sbUNBQW1DO0FBTXpDLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVM7QUFBQSxJQUNQLE1BQU07QUFBQSxJQUNOLElBQUksRUFBRSxrQ0FBUyxDQUFDO0FBQUEsRUFDbEI7QUFBQSxFQUNBLGNBQWM7QUFBQSxJQUNaLFNBQVMsQ0FBQyw2QkFBNkIsaUJBQWlCO0FBQUEsRUFDMUQ7QUFBQSxFQUNBLE9BQU87QUFBQSxJQUNMLGVBQWU7QUFBQSxNQUNiLE9BQU87QUFBQSxRQUNMLE9BQU8sUUFBUSxrQ0FBVyxZQUFZO0FBQUEsUUFDdEMsV0FBVyxRQUFRLGtDQUFXLDhCQUE4QjtBQUFBLE1BQzlEO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQSxFQUNBLFFBQVE7QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLFlBQVk7QUFBQSxJQUNaLEtBQUs7QUFBQSxNQUNILE1BQU07QUFBQSxJQUNSO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
