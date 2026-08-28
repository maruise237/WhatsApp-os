import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // JSX automático já é o default do transform esbuild no Vite 7+ (vitest 4);
  // a opção `esbuild.jsx` saiu do tipo — provado pelos testes de componente.
  test: {
    environment: "jsdom",
    // O padrão do vitest é 5s por teste. Numa suíte jsdom + Testing Library
    // isso é apertado: em máquina carregada (CI concorrido, dev rodando outras
    // coisas) testes SAUDÁVEIS estouram e a suíte fica vermelha por lentidão.
    // Aconteceu três vezes aqui, em testes diferentes a cada vez — inclusive
    // derrubando a main num PR que só mexia em documentação. Um gate que
    // reprova sem defeito ensina o time a ignorar o gate.
    // 15s não mascara travamento (quem trava continua reprovando, dez segundos
    // depois); só para de cronometrar a lentidão da máquina como se fosse
    // asserção. Caso que precisa de mais (abrir processo filho) declara o seu.
    testTimeout: 15_000,
    setupFiles: ["./tests/setup/vitest.setup.ts"],
    globals: true,
    // @neondatabase/auth importe `next/headers`/`next/server` sans exports map
    // dans next (mesuré: package.json de next 16.3.1 n'a pas de champ exports).
    // Externalisé, c'est le résolveur de Node qui traite l'import et casse
    // ("Cannot find module .../next/headers"). Inline + alias = l'import passe
    // par le résolveur de Vite, qui résout l'alias vers le fichier réel.
    server: {
      deps: {
        inline: [/@neondatabase\/auth/],
      },
    },
    coverage: { provider: "v8", reporter: ["text", "html"] },
    // tests/journeys/** roda no Playwright (jornada de baseline dos canais), igual
    // a tests/e2e/**: sem excluir, o include default do vitest o pegaria e o
    // import de @playwright/test derrubaria a suíte unitária.
    exclude: [
      "**/node_modules/**",
      ".next",
      "dist",
      ".claude/**",
      "tests/e2e/**",
      "tests/invariants/**",
      "tests/journeys/**",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // @neondatabase/auth déclare next comme peer; pnpm ne le lie pas dans le
      // node_modules du paquet, et le résolveur de vitest casse sur
      // `next/headers`/`next/server` venant de .pnpm (mesuré: 4 arquivos de
      // teste falhavam com "Cannot find module .../next/headers"). Alias vers
      // les modules réels de l'app.
      "next/headers": path.resolve(__dirname, "node_modules/next/headers.js"),
      "next/server": path.resolve(__dirname, "node_modules/next/server.js"),
    },
  },
});
