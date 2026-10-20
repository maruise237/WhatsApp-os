/**
 * Parser de pacote de skill instalável (.zip → objeto validado). Entrada é upload de
 * terceiro (não confiável): todo erro é um erro de ENSINO em pt-br ({ ok:false, error }),
 * nunca um throw. Frontmatter do SKILL.md é lido à mão (só as chaves conhecidas) em vez
 * de com uma lib de YAML genérica — superfície de ataque menor para input não confiável.
 */
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import { skillMatcherSchema, validateSkillBody, type SkillMatcher } from '../../agent-engine/agent/skills';

export interface SkillManifestEntry {
  path: string;
  size: number;
  sha256: string;
  kind: 'reference' | 'asset';
}

export interface ParsedSkillPackage {
  name: string;
  description: string;
  matcher: SkillMatcher;
  body: string;
  files: Array<{ path: string; bytes: Uint8Array; entry: SkillManifestEntry }>;
}

export type ParseSkillResult =
  | { ok: true; pkg: ParsedSkillPackage }
  | { ok: false; error: { code: string; message: string } };

const MAX_FILES = 64;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;
const MAX_FILE_BYTES = 1 * 1024 * 1024;
const ASSET_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'pdf', 'mp3', 'ogg', 'mp4']);

function fail(code: string, message: string): ParseSkillResult {
  return { ok: false, error: { code, message } };
}

/** Caminho seguro: relativo, sem `..`, sem raiz absoluta, sem separador de Windows. */
function isSafePath(p: string): boolean {
  if (p === '' || p.startsWith('/') || p.includes('\\')) return false;
  const segments = p.split('/');
  return segments.every((s) => s !== '..' && s !== '');
}

function extensionOf(p: string): string {
  const idx = p.lastIndexOf('.');
  return idx === -1 ? '' : p.slice(idx + 1).toLowerCase();
}

/**
 * Lê só as 4 chaves conhecidas do frontmatter (name, description, matcher.any_keywords,
 * matcher.probe_keywords) — parser dedicado, não YAML genérico. Aceita a forma exata do
 * frontmatter de skill: `chave: valor` na raiz, `matcher:` seguido de `  any_keywords: [a, b]`
 * indentado por baixo.
 */
function parseFrontmatter(raw: string): { name?: string; description?: string; matcher: Record<string, unknown> } {
  const lines = raw.split('\n');
  let name: string | undefined;
  let description: string | undefined;
  const matcher: Record<string, unknown> = {};

  const parseInlineArray = (value: string): string[] => {
    const trimmed = value.trim();
    if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return [];
    const inner = trimmed.slice(1, -1).trim();
    if (inner === '') return [];
    return inner.split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (/^name:/.test(line)) {
      name = line.slice(line.indexOf(':') + 1).trim();
    } else if (/^description:/.test(line)) {
      description = line.slice(line.indexOf(':') + 1).trim();
    } else if (/^matcher:/.test(line)) {
      // varre as linhas indentadas abaixo de `matcher:` (matcher inline tipo `matcher: {}` não tem sub-linhas)
      let j = i + 1;
      while (j < lines.length) {
        const sub = lines[j] ?? '';
        if (sub === '' || !/^\s+\S/.test(sub)) break;
        const subTrimmed = sub.trim();
        const m = /^any_keywords:\s*(.*)$/.exec(subTrimmed);
        const p = /^probe_keywords:\s*(.*)$/.exec(subTrimmed);
        if (m) matcher.any_keywords = parseInlineArray(m[1] ?? '');
        else if (p) matcher.probe_keywords = parseInlineArray(p[1] ?? '');
        j += 1;
      }
      i = j - 1;
    }
  }

  return { name, description, matcher };
}

export function parseSkillPackage(zipBytes: Uint8Array): ParseSkillResult {
  // Guard contra zip-bomb: fflate expõe o tamanho DECLARADO (do header local do zip) a este
  // filtro ANTES de inflar cada entrada — recusamos aqui, sem nunca descomprimir o conteúdo
  // malicioso na memória. Resíduo: um header mentiroso (originalSize menor que o real) ainda
  // passaria por este filtro — por isso os checks de byteLength pós-unzip abaixo permanecem
  // como defesa em profundidade.
  let oversize: { code: 'skill_file_too_large' | 'skill_package_too_large'; message: string } | undefined;
  let declaredTotal = 0;
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(zipBytes, {
      filter: (f) => {
        if (oversize !== undefined) return false; // já recusado, não gasta CPU inflando o resto
        if (f.originalSize > MAX_FILE_BYTES) {
          oversize = {
            code: 'skill_file_too_large',
            message: `Le fichier "${f.name}" dépasse ${MAX_FILE_BYTES / 1024 / 1024} Mo.`,
          };
          return false;
        }
        declaredTotal += f.originalSize;
        if (declaredTotal > MAX_TOTAL_BYTES) {
          oversize = {
            code: 'skill_package_too_large',
            message: `Le paquet décompressé dépasse ${MAX_TOTAL_BYTES / 1024 / 1024} Mo.`,
          };
          return false;
        }
        return true;
      },
    });
  } catch {
    return fail('skill_zip_invalid', 'Impossible d’ouvrir le fichier .zip — vérifiez que le paquet n’est pas corrompu.');
  }
  // O filtro acima descarta entradas silenciosamente — não podemos seguir como se o
  // arquivo parcial resultante fosse o pacote completo.
  if (oversize !== undefined) return fail(oversize.code, oversize.message);

  const entryNames = Object.keys(unzipped).filter((p) => !p.endsWith('/'));

  if (entryNames.length > MAX_FILES) {
    return fail('skill_too_many_files', `Le paquet contient ${entryNames.length} fichiers — la limite est de ${MAX_FILES}.`);
  }

  for (const p of entryNames) {
    if (!isSafePath(p)) {
      return fail('skill_unsafe_path', `Chemin non autorisé dans le paquet : "${p}" (pas de "..", pas de chemin absolu).`);
    }
  }

  let totalBytes = 0;
  for (const p of entryNames) {
    const bytes = unzipped[p];
    if (bytes === undefined) continue;
    if (bytes.byteLength > MAX_FILE_BYTES) {
      return fail('skill_file_too_large', `Le fichier "${p}" dépasse ${MAX_FILE_BYTES / 1024 / 1024} Mo.`);
    }
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_TOTAL_BYTES) {
      return fail('skill_package_too_large', `Le paquet décompressé dépasse ${MAX_TOTAL_BYTES / 1024 / 1024} Mo.`);
    }
  }

  const skillMdBytes = unzipped['SKILL.md'];
  if (skillMdBytes === undefined) {
    return fail('skill_md_missing', 'Le paquet doit contenir un fichier SKILL.md à la racine.');
  }

  const skillMdRaw = new TextDecoder('utf-8').decode(skillMdBytes);
  const fmMatch = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(skillMdRaw);
  if (!fmMatch) {
    return fail('skill_frontmatter_invalid', 'SKILL.md doit commencer par un frontmatter délimité par "---".');
  }
  const [, frontmatterRaw, bodyRaw] = fmMatch;
  const { name, description, matcher } = parseFrontmatter(frontmatterRaw ?? '');

  if (name === undefined || name === '') {
    return fail('skill_frontmatter_invalid', 'SKILL.md doit avoir un champ "name" dans le frontmatter.');
  }
  if (description === undefined || description === '') {
    return fail('skill_frontmatter_invalid', 'SKILL.md doit avoir un champ "description" dans le frontmatter.');
  }
  const matcherResult = skillMatcherSchema.safeParse(matcher);
  if (!matcherResult.success) {
    return fail(
      'skill_frontmatter_invalid',
      'Le "matcher" de SKILL.md doit avoir "any_keywords" (liste d’au moins 1 mot).',
    );
  }

  const body = (bodyRaw ?? '').trim();
  try {
    validateSkillBody(body);
  } catch (e) {
    return fail('skill_frontmatter_invalid', e instanceof Error ? e.message : 'contenu de compétence invalide');
  }

  const files: Array<{ path: string; bytes: Uint8Array; entry: SkillManifestEntry }> = [];
  for (const p of entryNames) {
    if (p === 'SKILL.md') continue;
    const bytes = unzipped[p];
    if (bytes === undefined) continue;

    let kind: 'reference' | 'asset';
    if (p.startsWith('references/')) {
      kind = 'reference';
    } else if (p.startsWith('assets/')) {
      const ext = extensionOf(p);
      if (!ASSET_EXTENSIONS.has(ext)) {
        return fail('skill_asset_extension_invalid', `Extension non autorisée pour "${p}" — utilisez : ${[...ASSET_EXTENSIONS].join(', ')}.`);
      }
      kind = 'asset';
    } else {
      return fail(
        'skill_unexpected_path',
        `Fichier inattendu : "${p}" — le paquet n’accepte que SKILL.md, references/ et assets/.`,
      );
    }

    const sha256 = createHash('sha256').update(bytes).digest('hex');
    files.push({ path: p, bytes, entry: { path: p, size: bytes.byteLength, sha256, kind } });
  }

  return {
    ok: true,
    pkg: { name, description, matcher: matcherResult.data, body, files },
  };
}
