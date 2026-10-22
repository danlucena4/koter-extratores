/**
 * REGRESSAO dos leitores sobre os PDFs reais (locais, nunca no git): roda o
 * leitor de cada pasta em cada PDF e grava o resultado em
 * `<EXTRATORES_PDFS>/../estudo/regressao/<rotulo>/`. Com dois rotulos,
 * compara campo a campo e mostra so o CAMINHO do campo que mudou (nunca o
 * valor: tem dado de cliente).
 *
 *   npx tsx scripts/regressao.ts gravar antes
 *   npx tsx scripts/regressao.ts comparar antes depois
 *
 * Cada pasta de `pdfs-renovacao` traz `<n>.pdf` + `<n>.json` com o
 * identificador da apolice no portal (a TRAVA de cada leitor sai dele).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pastaDosPdfs } from "./pasta.js";
import { linhasDoPdf } from "../src/pdf-texto.js";
import { lerApoliceMapfreQualquer } from "../src/compat.js";
import { lerApoliceYelum } from "../src/yelum.js";
import { lerApoliceAllianz } from "../src/allianz.js";
import { lerApoliceResidencialAllianz } from "../src/allianz-residencial.js";
import { lerApolicePorto } from "../src/porto.js";
import { lerApoliceBradesco } from "../src/compat.js";
import { lerApoliceZurich } from "../src/compat.js";
import { lerApoliceTokio } from "../src/tokio.js";
import { lerResidencialHdi } from "../src/hdi-residencial.js";
import { lerResidencialMapfre } from "../src/mapfre-residencial.js";
import { lerResidencialPorto } from "../src/porto-residencial.js";
import { lerResidencialTokio } from "../src/tokio-residencial.js";
import { lerVidaAllianz } from "../src/allianz-vida.js";
import { lerVidaMapfre } from "../src/mapfre-vida.js";
import { lerVidaYelum } from "../src/yelum-vida.js";
import { extrairDocumento } from "../src/documento.js";

type Partes = Record<string, string>;
type Leitor = (linhas: string[], partes: Partes, bytes: Uint8Array) => unknown;

/** Pasta -> leitor. A ordem importa: o primeiro prefixo que casa vence. */
const LEITORES: Array<[RegExp, Leitor]> = [
  [/^mapfre-cobranca-residencial$/, (l, p) => lerResidencialMapfre(l, p.policyNumber ?? "")],
  [/^mapfre-cobranca-vida$/, (l, p) => lerVidaMapfre(l, p.policyNumber ?? "")],
  [/^mapfre$/, (l, p) => lerApoliceMapfreQualquer(l, p.policyNumber ?? "")],
  [/^(yelum|aliro)$/, (l, p) => lerApoliceYelum(l, p.PolicyNumber ?? "")],
  [/^yelum-cobranca-vida$/i, (l, p) => lerVidaYelum(l, p.PolicyNumber ?? "")],
  [/^allianz$/, (l) => lerApoliceAllianz(l)],
  [/^allianz(-cobranca)?-residencial$/, (l, p) => lerApoliceResidencialAllianz(l, p.apoliceSusep ?? "")],
  [/^allianz-cobranca-vida$/, (l, p) => lerVidaAllianz(l, p.apoliceSusep ?? "")],
  [/^porto(-antes)?$/, (l, p) => lerApolicePorto(l, p.apolice ?? "")],
  [/^porto-cobranca-residencial$/, (l, p) => lerResidencialPorto(l, p.policy ?? "")],
  [/^bradesco$/, (l, p) => lerApoliceBradesco(l, p.apolice ?? "")],
  [/^zurich(-cobranca)?$/, (_l, p, b) => lerApoliceZurich(b, p.numeroApolice ?? "")],
  [/^tokio-cobranca$/, (l, p) => lerApoliceTokio(l, p.apolice ?? "") ?? lerResidencialTokio(l, p.apolice ?? "")],
  [/^hdi-cobranca-LAR_EM_CASA$/, (l) => lerResidencialHdi(l)],
];

const base = join(dirname(pastaDosPdfs("x")), "..", "estudo", "regressao");
const raiz = dirname(pastaDosPdfs("x"));

function gravar(rotulo: string): void {
  const destino = join(base, rotulo);
  mkdirSync(destino, { recursive: true });
  let n = 0;
  for (const pasta of readdirSync(raiz).filter((d) => statSync(join(raiz, d)).isDirectory())) {
    const leitor = LEITORES.find(([re]) => re.test(pasta))?.[1];
    const pdfs = readdirSync(join(raiz, pasta)).filter((f) => f.endsWith(".pdf"));
    for (const f of pdfs) {
      const bytes = new Uint8Array(readFileSync(join(raiz, pasta, f)));
      const jsonPath = join(raiz, pasta, f.replace(/\.pdf$/, ".json"));
      const partes: Partes = existsSync(jsonPath) ? (JSON.parse(readFileSync(jsonPath, "utf8")).identificador?.partes ?? {}) : {};
      const linhas = linhasDoPdf(bytes);
      const saida = {
        linhas: linhas.length,
        leitor: leitor === undefined ? "sem leitor" : leitor(linhas, partes, bytes),
        documento: extrairDocumento(bytes),
      };
      writeFileSync(join(destino, `${pasta}__${f.replace(/\.pdf$/, "")}.json`), JSON.stringify(saida, null, 1));
      n++;
    }
  }
  console.log(`${n} PDFs gravados em ${rotulo}`);
}

/** Folhas de um objeto: caminho -> valor (JSON). */
function folhas(o: unknown, prefixo = "", out = new Map<string, string>()): Map<string, string> {
  if (o === null || typeof o !== "object") {
    out.set(prefixo, JSON.stringify(o));
    return out;
  }
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) folhas(v, prefixo ? `${prefixo}.${k}` : k, out);
  return out;
}

function comparar(a: string, b: string): void {
  const pa = join(base, a);
  const pb = join(base, b);
  const resumo = { iguais: 0, ganhou: 0, perdeu: 0, mudou: 0 };
  for (const f of readdirSync(pa)) {
    if (!existsSync(join(pb, f))) continue;
    const va = folhas(JSON.parse(readFileSync(join(pa, f), "utf8")));
    const vb = folhas(JSON.parse(readFileSync(join(pb, f), "utf8")));
    const linhas: string[] = [];
    for (const k of new Set([...va.keys(), ...vb.keys()])) {
      const x = va.get(k) ?? "null";
      const y = vb.get(k) ?? "null";
      if (x === y) {
        resumo.iguais++;
        continue;
      }
      if (k === "linhas") continue;
      const tipo = x === "null" ? "ganhou" : y === "null" ? "perdeu" : "mudou";
      resumo[tipo]++;
      linhas.push(`  ${tipo.padEnd(6)} ${k}`);
    }
    if (linhas.length > 0) console.log(`${f}\n${linhas.join("\n")}`);
  }
  console.log(JSON.stringify(resumo));
}

const [acao, r1, r2] = process.argv.slice(2);
if (acao === "gravar" && r1) gravar(r1);
else if (acao === "comparar" && r1 && r2) comparar(r1, r2);
else throw new Error("uso: gravar <rotulo> | comparar <rotulo-a> <rotulo-b>");
