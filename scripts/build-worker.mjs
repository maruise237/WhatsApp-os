/**
 * Compile le worker (workers/agent-worker/main.ts) en UN fichier JS autonome.
 *
 * Pourquoi : l'image exécutait le TypeScript via `tsx`, avec toutes les
 * devDependencies installées. Mesuré au même point de boot (connexion Postgres
 * établie) : 286 Mo de RSS avec tsx contre 169 Mo pour ce bundle — tsx garde un
 * processus esbuild et le cache de transpilation en mémoire pendant toute la
 * vie du worker. À l'exécution, il ne faut que ce fichier et pdfjs-dist.
 *
 * Usage : `pnpm build:worker` → dist/worker/worker.mjs
 */
import { build } from "esbuild";

await build({
  entryPoints: ["workers/agent-worker/main.ts"],
  outfile: "dist/worker/worker.mjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  // Tout est compilé dans le fichier, SAUF pdfjs-dist : en Node il charge son
  // `pdf.worker.mjs` par chemin relatif à lui-même, ce qu'un bundle casse. Il
  // est installé seul dans l'image (Dockerfile.worker, `PDFJS_VERSION`).
  // (Laisser TOUS les paquets externes ne marche pas : @neondatabase/auth
  // importe `next/headers` sans extension, que seul tsx tolère en ESM.)
  external: ["pdfjs-dist", "pdfjs-dist/*"],
  tsconfig: "tsconfig.json",
  logLevel: "warning",
  // Certaines dépendances CJS embarquées lisent `require`, `__dirname` ou
  // `__filename`, qui n'existent pas en ESM.
  banner: {
    js: [
      "import { createRequire as __bundleRequire } from 'node:module';",
      "import { fileURLToPath as __bundleFileUrl } from 'node:url';",
      "import { dirname as __bundleDirname } from 'node:path';",
      "const require = __bundleRequire(import.meta.url);",
      "const __filename = __bundleFileUrl(import.meta.url);",
      "const __dirname = __bundleDirname(__filename);",
    ].join("\n"),
  },
});
