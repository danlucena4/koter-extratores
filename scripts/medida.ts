/**
 * MEDIDA do modelo unificado sobre uma gravacao da regressao: por seguradora
 * e ramo, quantos campos de `documento` sairam preenchidos (folha nao nula;
 * lista nao vazia conta 1). Com dois rotulos, mostra antes -> depois. So
 * contagens, nunca valores.
 *
 *   npx tsx scripts/medida.ts <rotulo> [<rotulo-depois>]
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { pastaDosPdfs } from "./pasta.js";

const base = join(dirname(pastaDosPdfs("x")), "..", "estudo", "regressao");

const cheios = (o: unknown): number =>
  o === null || o === undefined ? 0
  : Array.isArray(o) ? (o.length > 0 ? 1 : 0)
  : typeof o === "object" ? Object.values(o as object).reduce((a: number, v) => a + cheios(v), 0)
  : 1;
const total = (o: unknown): number =>
  o === null || typeof o !== "object" || Array.isArray(o) ? 1 : Object.values(o as object).reduce((a: number, v) => a + total(v), 0);

type Doc = { seguradora: string; ramo: string | null; [k: string]: unknown } | null;

function medir(rotulo: string): Map<string, Map<string, { cheios: number; total: number }>> {
  const out = new Map<string, Map<string, { cheios: number; total: number }>>();
  for (const f of readdirSync(join(base, rotulo))) {
    const doc = (JSON.parse(readFileSync(join(base, rotulo, f), "utf8")) as { documento: Doc }).documento;
    if (doc === null) continue;
    const chave = `${doc.seguradora}/${doc.ramo ?? "?"}`;
    if (!out.has(chave)) out.set(chave, new Map());
    /* So o ramo do documento: os blocos dos outros ramos (nulos) nao entram no total. */
    const { auto, residencial, vida, ...comum } = doc as Record<string, unknown>;
    const doRamo = { ...comum, ...(doc.ramo === "auto" ? { auto } : doc.ramo === "residencial" ? { residencial } : doc.ramo === "vida" ? { vida } : {}) };
    out.get(chave)?.set(f, { cheios: cheios(doRamo), total: total(doRamo) });
  }
  return out;
}

const faixa = (xs: number[]) => (xs.length === 0 ? "-" : `${Math.min(...xs)}–${Math.max(...xs)}`);
const [a, b] = process.argv.slice(2);
if (!a) throw new Error("uso: medida.ts <rotulo> [<rotulo-depois>]");
const antes = medir(a);
const depois = b ? medir(b) : null;
for (const chave of [...new Set([...antes.keys(), ...(depois?.keys() ?? [])])].sort()) {
  const x = [...(antes.get(chave)?.values() ?? [])];
  const y = [...(depois?.get(chave)?.values() ?? [])];
  const linha = `${chave.padEnd(22)} ${String(x.length).padStart(3)} PDFs  ${faixa(x.map((v) => v.cheios))} de ~${Math.max(0, ...x.map((v) => v.total))}`;
  console.log(depois === null ? linha : `${linha}  ->  ${faixa(y.map((v) => v.cheios))} de ~${Math.max(0, ...y.map((v) => v.total))}`);
}
