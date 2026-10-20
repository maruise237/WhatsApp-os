/**
 * La stack Dokploy reste légère — et le reste sans que personne n'ait à y penser.
 *
 * Avant (mesuré, aucun numéro connecté) : 14 conteneurs sans plafond mémoire,
 * ~807 Mo au repos — WAHA et Evolution Go lancés ensemble, deux Postgres pour
 * Evolution, SeaweedFS en quatre conteneurs, Redis + srh. Après : 7 conteneurs
 * par défaut, ~312 Mo au repos, chacun plafonné. Ce test refuse le retour en
 * arrière : un service sans `mem_limit`, un second moteur WhatsApp hors profil,
 * un service construit sur la VPS, ou le SeaweedFS éclaté à nouveau.
 *
 * Même parser minimal que `packaging-artefato-do-cliente.test.ts` : les blocs
 * de service à 2 espaces sous `services:`.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "../..");
const compose = fs.readFileSync(path.join(RAIZ, "docker-compose.dokploy.yml"), "utf8");

function lerServicos(yaml: string): Map<string, string> {
  const servicos = new Map<string, string>();
  let dentro = false;
  let atual: string | null = null;
  let buffer: string[] = [];
  const fechar = () => {
    if (atual) servicos.set(atual, buffer.join("\n"));
    atual = null;
    buffer = [];
  };
  for (const linha of yaml.split("\n")) {
    if (/^services:\s*$/.test(linha)) {
      dentro = true;
      continue;
    }
    if (!dentro) continue;
    if (/^\S/.test(linha) && linha.trim() !== "") {
      fechar();
      dentro = false;
      continue;
    }
    const cabecalho = linha.match(/^ {2}([a-z0-9_-]+):\s*$/i);
    if (cabecalho) {
      fechar();
      atual = cabecalho[1] ?? null;
      continue;
    }
    if (atual) buffer.push(linha);
  }
  fechar();
  return servicos;
}

const servicos = lerServicos(compose);
const comPerfil = (bloco: string) => /^\s{4}profiles:/m.test(bloco);

describe("stack Dokploy allégée", () => {
  it("le parser voit les services attendus", () => {
    expect([...servicos.keys()].sort()).toEqual(
      [
        "app",
        "evolution-db",
        "evolution-go",
        "redis",
        "scheduler",
        "seaweedfs",
        "srh",
        "waha",
        "whatsapp-gateway",
        "worker",
      ].sort(),
    );
  });

  it("au plus 7 conteneurs démarrent sans profil", () => {
    const parDefaut = [...servicos.entries()].filter(([, b]) => !comPerfil(b)).map(([n]) => n);
    expect(parDefaut.length, `démarrent par défaut : ${parDefaut.join(", ")}`).toBeLessThanOrEqual(7);
  });

  it.each([...servicos.keys()])("'%s' a un plafond mémoire", (nome) => {
    expect(servicos.get(nome), `'${nome}' sans mem_limit : il peut prendre toute la VPS`).toMatch(
      /^\s{4}mem_limit:\s*\S/m,
    );
  });

  it.each(["waha", "redis", "srh"])("'%s' est optionnel (profil)", (nome) => {
    expect(comPerfil(servicos.get(nome) ?? ""), `'${nome}' doit rester derrière un profil`).toBe(true);
  });

  it("aucun service n'est build-only", () => {
    const buildOnly = [...servicos.entries()]
      .filter(([, b]) => /^\s{4}build:/m.test(b) && !/^\s{4}image:\s*\S/m.test(b))
      .map(([n]) => n);
    expect(buildOnly).toEqual([]);
  });

  it("SeaweedFS tourne en un seul conteneur, données persistées", () => {
    expect([...servicos.keys()].filter((n) => n.startsWith("seaweedfs"))).toEqual(["seaweedfs"]);
    const bloco = servicos.get("seaweedfs") ?? "";
    expect(bloco).toMatch(/- server\b/);
    expect(bloco).toMatch(/seaweedfs-data:\/data/);
  });

  it("une seule base Postgres pour Evolution Go", () => {
    expect([...servicos.keys()].filter((n) => /postgres|-db$/.test(n))).toEqual(["evolution-db"]);
  });

  it("les dépendances vers des services optionnels ne bloquent pas le démarrage", () => {
    const app = servicos.get("app") ?? "";
    for (const opcional of ["srh", "waha"]) {
      const bloco = app.match(new RegExp(`^ {6}${opcional}:\\n((?: {8}.*\\n?)+)`, "m"))?.[1] ?? "";
      expect(bloco, `app dépend de '${opcional}' sans required: false`).toMatch(/required:\s*false/);
    }
  });
});
