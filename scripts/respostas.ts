/**
 * As RESPOSTAS de perguntas de perfil nos PDFs baixados: so linhas cujo rotulo
 * casa com o padrao dado (perguntas, nunca nome/CPF/placa), sem digitos.
 *   npx tsx scripts/respostas.ts <cia> "<regex do rotulo>"
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pastaDosPdfs } from "./pasta.js";
import { linhasDoPdf } from "../src/pdf-texto.js";
const [cia = "", padrao] = process.argv.slice(2);
const re = new RegExp(padrao ?? "", "i");
const pasta = pastaDosPdfs(cia);
const cont = new Map<string, number>();
for (const f of readdirSync(pasta).filter((x) => x.endsWith(".pdf"))) {
  const linhas = linhasDoPdf(new Uint8Array(readFileSync(join(pasta, f))));
  for (const l of new Set(linhas.filter((x) => re.test(x) && !/CPF|Nome|Placa|Chassi|Endere/i.test(x)))) {
    const m = l.replace(/\d/g, "#").trim();
    cont.set(m, (cont.get(m) ?? 0) + 1);
  }
}
for (const [l, n] of [...cont].sort((a, b) => b[1] - a[1])) console.log(`${String(n).padStart(3)}  ${l}`);
