/**
 * LAYOUT dos PDFs de apolice baixados por `_baixar-pdfs-renovacao.mts`, sem
 * dado de cliente. Uso:
 *   npx tsx scripts/layout.ts <cia> [saida.txt]
 *
 * Mascara: uma palavra so aparece se estiver em pelo menos metade dos PDFs da
 * cia (texto do modelo) ou no vocabulario de respostas (SIM, NAO, CASA...).
 * Nome, CPF, placa, endereco variam de um PDF para outro e viram "▒".
 * Digitos viram "#". Sai o PDF mais completo inteiro, mascarado, mais a
 * frequencia de cada linha-modelo entre os PDFs (para ver as variacoes).
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pastaDosPdfs } from "./pasta.js";
import { linhasDoPdf } from "../src/pdf-texto.js";

const [cia, saida] = process.argv.slice(2);
if (!cia) throw new Error("uso: <cia> [saida]");
const pasta = pastaDosPdfs(cia);
const arquivos = readdirSync(pasta).filter((f) => f.endsWith(".pdf"));

const VOCABULARIO = new Set(
  `SIM NAO NÃO N/A NENHUM NENHUMA CASA APARTAMENTO CONDOMINIO CONDOMÍNIO CHACARA CHÁCARA OUTROS OUTRO
  PARTICULAR COMERCIAL LOCOMOCAO LOCOMOÇÃO DIARIA DIÁRIA PASSEIO TRABALHO ESTUDO GARAGEM PORTAO PORTÃO
  ELETRONICO ELETRÔNICO MANUAL FECHADA ABERTA ESTACIONAMENTO PAGO RUA VIA PUBLICA PÚBLICA PROPRIO PRÓPRIO
  CONJUGE CÔNJUGE FILHO FILHA PAI MAE MÃE IRMAO IRMÃO OUTRA PESSOA EMPREGADO SOCIO SÓCIO
  MASCULINO FEMININO SOLTEIRO SOLTEIRA CASADO CASADA VIUVO VIÚVO VIUVA VIÚVA DIVORCIADO DIVORCIADA SEPARADO
  UNIAO UNIÃO ESTAVEL ESTÁVEL FLEX GASOLINA ALCOOL ÁLCOOL ETANOL DIESEL ELETRICO ELÉTRICO HIBRIDO HÍBRIDO
  BICOMBUSTIVEL BI-COMBUSTIVEL AMBOS SEXOS RESIDEM RESIDE NAO-RESIDEM UTILIZA UTILIZAM APLICA SE
  ATE ATÉ KM MES MÊS ACIMA ENTRE DE A E OU COM SEM NORMAL REDUZIDA OBRIGATORIA OBRIGATÓRIA FACULTATIVA
  APP TAXI TÁXI UBER APLICATIVO VISITAS SERVICOS SERVIÇOS ENTREGA`.split(/\s+/).filter(Boolean),
);

const textos = arquivos.map((f) => linhasDoPdf(new Uint8Array(readFileSync(join(pasta, f)))));
const total = textos.length;

/* Em quantos PDFs cada palavra aparece. */
const docsDaPalavra = new Map<string, number>();
for (const linhas of textos) {
  const vistas = new Set(linhas.flatMap((l) => l.split(/\s+/)).filter(Boolean));
  for (const p of vistas) docsDaPalavra.set(p, (docsDaPalavra.get(p) ?? 0) + 1);
}
const doModelo = (p: string) =>
  (docsDaPalavra.get(p) ?? 0) >= Math.max(2, Math.ceil(total / 2)) ||
  VOCABULARIO.has(p.toUpperCase().replace(/[.,:;()]/g, ""));
const mascarar = (l: string) =>
  l
    .split(/(\s+)/)
    .map((p) => (/^\s+$/.test(p) || p === "" ? p : doModelo(p) ? p : /\d/.test(p) && !/[A-Za-zÀ-ú]{2}/.test(p) ? p : "▒"))
    .join("")
    .replace(/\d/g, "#")
    .replace(/▒(\s*▒)+/g, "▒");

const out: string[] = [`# ${cia}: ${total} PDFs`];
textos.forEach((l, i) => out.push(`  ${arquivos[i]}: ${l.length} linhas`));

/* Linhas-modelo e em quantos PDFs aparecem. */
const freq = new Map<string, number>();
for (const linhas of textos) {
  for (const m of new Set(linhas.map(mascarar))) freq.set(m, (freq.get(m) ?? 0) + 1);
}
const maior = textos.reduce((a, b, i) => (b.length > (textos[a]?.length ?? 0) ? i : a), 0);
const textoMaior = textos[maior] ?? [];
out.push(`\n## PDF mais longo (${arquivos[maior]}), mascarado; [n] = em quantos PDFs a linha-modelo aparece`);
textoMaior.forEach((l, i) => {
  const m = mascarar(l);
  out.push(`${String(i).padStart(3)} [${freq.get(m)}/${total}] ${m}`);
});
out.push(`\n## Linhas-modelo que NAO estao no PDF mais longo (variacoes de layout)`);
const doMaior = new Set(textoMaior.map(mascarar));
for (const [m, n] of [...freq.entries()].filter(([m]) => !doMaior.has(m)).sort((a, b) => b[1] - a[1])) {
  if (m.replace(/[▒#\s]/g, "").length > 3) out.push(`[${n}/${total}] ${m}`);
}
const texto = out.join("\n");
if (saida) writeFileSync(saida, texto);
else console.log(texto);
