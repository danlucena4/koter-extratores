/**
 * Quanto o LEITOR de PDF de cada cia acha nos PDFs baixados por
 * `_baixar-pdfs-renovacao.mts`: por campo, em quantos PDFs saiu valor. So
 * contagens e, para campos de resposta (vocabulario fechado), os valores
 * distintos; nunca nome, CPF, placa ou endereco. Uso:
 *   npx tsx scripts/cobertura.ts <cia>
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pastaDosPdfs } from "./pasta.js";
import { linhasDoPdf } from "../src/pdf-texto.js";
import { lerApoliceMapfreQualquer } from "../src/compat.js";
import { lerApoliceYelum } from "../src/yelum.js";
import { lerApoliceAllianz } from "../src/allianz.js";
import { lerApolicePorto } from "../src/porto.js";

type Leitor = (linhas: string[], identificador: { partes: Record<string, string> }) => Record<string, unknown> | null;

const LEITORES: Record<string, Leitor> = {
  mapfre: (l, id) => lerApoliceMapfreQualquer(l, id.partes.policyNumber ?? "") as never,
  yelum: (l, id) => lerApoliceYelum(l, id.partes.PolicyNumber ?? "") as never,
  aliro: (l, id) => lerApoliceYelum(l, id.partes.PolicyNumber ?? "") as never,
  allianz: (l) => lerApoliceAllianz(l) as never,
  porto: (l, id) => lerApolicePorto(l, id.partes.apolice ?? "") as never,
};

/** Campos cujo valor e resposta de vocabulario fechado: podem aparecer na tela. */
const RESPOSTA = /sexo|estado_civil|vinculo|residentes|uso|categoria|combustivel|garagem|km|residencia|isencao|zero_km|classe_bonus|menores|tipo/;

const cia = process.argv[2] ?? "";
const leitor = LEITORES[cia];
if (!leitor) throw new Error(`sem leitor para ${cia} (${Object.keys(LEITORES).join(", ")})`);
const pasta = pastaDosPdfs(cia);
const pdfs = readdirSync(pasta).filter((f) => f.endsWith(".pdf"));

const contagem = new Map<string, number>();
const valores = new Map<string, Set<string>>();
let lidos = 0;
for (const f of pdfs) {
  const id = JSON.parse(readFileSync(join(pasta, f.replace(/\.pdf$/, ".json")), "utf8")).identificador;
  const r = leitor(linhasDoPdf(new Uint8Array(readFileSync(join(pasta, f)))), id);
  if (r === null) {
    console.log(`  ${f}: o leitor recusou (trava do numero ou layout desconhecido)`);
    continue;
  }
  lidos++;
  for (const [campo, v] of Object.entries(r)) {
    const tem = v !== null && v !== undefined && v !== "" && !(typeof v === "object" && Object.values(v as object).every((x) => x === null));
    contagem.set(campo, (contagem.get(campo) ?? 0) + (tem ? 1 : 0));
    if (tem && RESPOSTA.test(campo) && typeof v !== "object") {
      const s = valores.get(campo) ?? new Set<string>();
      s.add(String(v));
      valores.set(campo, s);
    }
  }
}
console.log(`${cia}: ${lidos}/${pdfs.length} PDFs lidos`);
for (const [campo, n] of contagem) {
  const vs = valores.get(campo);
  console.log(`  ${campo.padEnd(28)} ${n}/${lidos}${vs ? `  valores: ${[...vs].join(" | ")}` : ""}`);
}
