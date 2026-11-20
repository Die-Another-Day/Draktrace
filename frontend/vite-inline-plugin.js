// Puts the built JS and CSS inside index.html so `npm run build:single` produces ONE file.
// Replaces the `vite-plugin-singlefile` package, which pulled in micromatch and braces (npm audit: 3 high warnings,
// no patched braces release exists). This covers what the project used: a single HTML entry, JS and CSS inlined,
// everything else (images, fonts) already embedded as data: URIs by the build settings below.
import { version as viteVersion } from 'vite';

const escapeRe = (s) => s.replaceAll('.', '\\.');

function inlineScript(html, fileName, code) {
  const re = new RegExp(`<script([^>]*?) src="(?:[^"]*?/)?${escapeRe(fileName)}"([^>]*)></script>`);
  // Vite's preload helper marker must not stay in the output, and "</script>" or "<!--" inside the code would end the tag early.
  const safe = code.replace(/"?__VITE_PRELOAD__"?/g, 'void 0').replace(/<(\/script>|!--)/g, '\\x3C$1');
  return html.replace(re, (_, before, after) => `<script${before}${after}>${safe.trim()}</script>`);
}

function inlineCss(html, fileName, css) {
  const re = new RegExp(`<link([^>]*?) href="(?:[^"]*?/)?${escapeRe(fileName)}"([^>]*)>`);
  const safe = css.replace('@charset "UTF-8";', '');
  return html.replace(re, (_, before, after) => `<style${before}${after}>${safe.trim()}</style>`);
}

export default function inlineEverything() {
  return {
    name: 'inline-everything',
    enforce: 'post',
    config(config) {
      const build = (config.build ??= {});
      build.assetsInlineLimit = () => true; // embed every asset as a data: URI
      build.chunkSizeWarningLimit = 100000000;
      build.cssCodeSplit = false; // one CSS file, so there is one thing to inline
      build.assetsDir = '';
      config.base = './';
      const rollup = (build.rollupOptions ??= {});
      const output = (rollup.output ??= {});
      const major = parseInt(viteVersion.split('.')[0], 10);
      for (const o of Array.isArray(output) ? output : [output]) {
        if (major >= 8) o.codeSplitting = false; // Vite 8 (Rolldown): one JS file, lazy imports included
        else o.inlineDynamicImports = true;
      }
    },
    generateBundle(_options, bundle) {
      const names = Object.keys(bundle);
      const htmlFiles = names.filter((n) => /\.html?$/.test(n));
      const jsFiles = names.filter((n) => /\.[mc]?js$/.test(n));
      const cssFiles = names.filter((n) => /\.css$/.test(n));
      const inlined = new Set();

      for (const name of htmlFiles) {
        const page = bundle[name];
        let html = page.source;
        for (const f of jsFiles) {
          if (bundle[f].code == null) continue;
          html = inlineScript(html, bundle[f].fileName, bundle[f].code);
          inlined.add(f);
        }
        for (const f of cssFiles) {
          html = inlineCss(html, bundle[f].fileName, bundle[f].source);
          inlined.add(f);
        }
        page.source = html;
      }
      for (const f of inlined) delete bundle[f];

      const left = Object.keys(bundle).filter((n) => !htmlFiles.includes(n));
      if (left.length) this.warn(`Not inlined: ${left.join(', ')}`);
    },
  };
}
