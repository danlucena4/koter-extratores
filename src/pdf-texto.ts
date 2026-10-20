/**
 * TEXTO DE UM PDF em linhas, sem dependencia nova: so o `zlib` do Node.
 *
 * Serve para PDF gerado por sistema (texto em fonte padrao, conteudo
 * comprimido com FlateDecode), que e o caso da apolice da Allianz (OpenText
 * Exstream, 8 paginas, texto legivel sem tabela ToUnicode). PDF escaneado
 * (imagem) nao tem texto e devolve `[]`.
 *
 * Como funciona: descomprime cada `stream`, acha os operadores de texto
 * (`Tj`, `TJ`) e a posicao corrente (`Td`, `Tm`), e junta os pedacos que caem
 * na MESMA altura (coordenada Y arredondada) numa linha, da esquerda para a
 * direita. A ordem das linhas e de cima para baixo dentro de cada stream.
 *
 * Fonte composta (Type0, `/Identity-H`, a apolice da Porto): o texto vem em
 * hexadecimal (`<0012003A> Tj`) com codigos de glifo, e so a tabela
 * `/ToUnicode` da fonte diz que letra cada codigo e. Para essas, o leitor
 * resolve a fonte de cada pagina (`/Resources /Font`) e traduz pela tabela.
 * Fonte sem tabela segue como antes (texto literal).
 *
 * E leitura de melhor esforco, de proposito pequena: quem usa le RÓTULOS
 * conhecidos ("Placa:", "Chassi:") nas linhas e carimba o que extraiu.
 *
 * So no servidor: nao entra em `contrato.ts` (navegador).
 */
import { inflateSync } from "node:zlib";
import { glifosDoPdf, linhasPosicionadas, pedacosDosGlifos, type LinhaPosicionada } from "./pdf/motor.js";

export type { LinhaPosicionada, PalavraPosicionada } from "./pdf/motor.js";

const TOKEN =
  /(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+T[dD]|(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+Tm|\(((?:\\.|[^\\)])*)\)\s*Tj|\[((?:\\.|[^\]])*)\]\s*TJ|\bBT\b|\/([^\s/<>[\]()]+)\s+-?\d*\.?\d+\s+Tf|<([0-9A-Fa-f\s]*)>\s*Tj/g;

/** Tabela `/ToUnicode` de uma fonte: codigo em hexadecimal -> texto, e o tamanho do codigo em bytes. */
export interface TabelaUnicode {
  bytes: number;
  mapa: Map<string, string>;
}

/** Hexadecimal UTF-16BE de uma CMap ("00E9") -> texto. */
function utf16(hex: string): string {
  let out = "";
  for (let i = 0; i + 4 <= hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  return out;
}

/** Le uma CMap `/ToUnicode` (`bfchar` e `bfrange`). */
export function lerToUnicode(cmap: string): TabelaUnicode {
  const mapa = new Map<string, string>();
  const espaco = /begincodespacerange\s*<([0-9A-Fa-f]+)>/.exec(cmap);
  const bytes = espaco ? (espaco[1] as string).length / 2 : 2;
  for (const bloco of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const par of (bloco[1] as string).matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)) {
      mapa.set((par[1] as string).toUpperCase(), utf16(par[2] as string));
    }
  }
  for (const bloco of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const r of (bloco[1] as string).matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]+>|\[[^\]]*\])/g)) {
      const ini = parseInt(r[1] as string, 16);
      const fim = parseInt(r[2] as string, 16);
      const largura = (r[1] as string).length;
      const destino = r[3] as string;
      const lista = destino.startsWith("[") ? [...destino.matchAll(/<([0-9A-Fa-f]+)>/g)].map((x) => x[1] as string) : null;
      const base = lista === null ? parseInt(destino.slice(1, -1), 16) : 0;
      for (let c = ini; c <= fim && c - ini < 65536; c++) {
        const chave = c.toString(16).toUpperCase().padStart(largura, "0");
        mapa.set(chave, lista === null ? String.fromCharCode(base + (c - ini)) : utf16(lista[c - ini] ?? ""));
      }
    }
  }
  return { bytes, mapa };
}

/** Texto de uma string hexadecimal pela tabela da fonte; sem tabela, cada byte vira letra latin1. */
function deHex(hex: string, tabela: TabelaUnicode | undefined): string {
  const h = hex.replace(/\s+/g, "").toUpperCase();
  let out = "";
  if (tabela === undefined) {
    for (let i = 0; i + 2 <= h.length; i += 2) out += String.fromCharCode(parseInt(h.slice(i, i + 2), 16));
    return out;
  }
  const passo = tabela.bytes * 2;
  for (let i = 0; i + passo <= h.length; i += passo) {
    const codigo = h.slice(i, i + passo);
    /* Codigo fora da tabela: em fonte de 1 byte, o proprio byte; em fonte composta, nada. */
    out += tabela.mapa.get(codigo) ?? (tabela.bytes === 1 ? String.fromCharCode(parseInt(codigo, 16)) : "");
  }
  return out;
}

/** Os BYTES de uma string literal do PDF (escapes desfeitos byte a byte), em hexadecimal. */
function hexDoLiteral(s: string): string {
  const bytes: number[] = [];
  const ESCAPES: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12 };
  for (let i = 0; i < s.length; i++) {
    const c = s[i] as string;
    if (c !== "\\") {
      bytes.push(c.charCodeAt(0) & 0xff);
      continue;
    }
    const prox = s[i + 1] ?? "";
    const octal = /^[0-7]{1,3}/.exec(s.slice(i + 1, i + 4));
    if (octal !== null) {
      bytes.push(parseInt(octal[0], 8) & 0xff);
      i += octal[0].length;
    } else if (prox in ESCAPES) {
      bytes.push(ESCAPES[prox] as number);
      i++;
    } else if (prox === "\r" || prox === "\n") {
      i++;
    } else {
      bytes.push(prox.charCodeAt(0) & 0xff);
      i++;
    }
  }
  return bytes.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join("");
}

/**
 * Texto de uma string literal: pela tabela `/ToUnicode` da fonte quando ela
 * tem (composta de 2 bytes, ou simples com codigos proprios, como a "Apólice"
 * da Allianz); sem tabela, como sempre.
 */
function deLiteral(s: string, tabela: TabelaUnicode | undefined): string {
  return tabela !== undefined ? deHex(hexDoLiteral(s), tabela) : semEscapes(s);
}

/** Desfaz os escapes de string do PDF (`\(`, `\)`, `\\`, octal `\351`). */
function semEscapes(s: string): string {
  return s
    .replace(/\\(\d{1,3})/g, (_, o: string) => String.fromCharCode(parseInt(o, 8)))
    .replace(/\\([nrtbf])/g, " ")
    .replace(/\\(.)/g, "$1");
}

/** Largura relativa aproximada de um caractere (em "ems" de fonte proporcional). */
function largura(c: string): number {
  if (/[il.,:;'|!Ijft1 ]/.test(c)) return 0.3;
  if (/[MWmw]/.test(c)) return 0.85;
  if (/[A-ZÀ-Ú0-9]/.test(c)) return 0.65;
  return 0.55;
}

const mediana = (v: number[]): number => {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};

/**
 * Junta os pedacos de UMA linha. O normal e um pedaco por palavra ou frase, e
 * eles se juntam com espaco. Ha gerador (o kit da MAPFRE, sonda 2026-10-15) que
 * desenha CADA LETRA na sua posicao; ai juntar com espaco devolve
 * "A n o  M o d e l o". Quando a maioria dos pedacos tem um caractere, o espaco
 * so entra onde o vao entre duas letras passa do que a letra anterior ocupa.
 */
export function juntarPedacos(pedacos: ReadonlyArray<readonly [number, string]>): string {
  const umaLetra = pedacos.filter((p) => p[1].length === 1).length;
  if (pedacos.length < 4 || umaLetra / pedacos.length < 0.6) {
    return pedacos.map((p) => p[1]).join(" ");
  }
  const passos: number[] = [];
  for (let i = 1; i < pedacos.length; i++) {
    const ant = pedacos[i - 1] as readonly [number, string];
    const passo = (pedacos[i] as readonly [number, string])[0] - ant[0];
    if (ant[1].length === 1 && passo > 0) passos.push(passo / largura(ant[1]));
  }
  const em = mediana(passos);
  if (em <= 0) return pedacos.map((p) => p[1]).join(" ");
  let s = (pedacos[0] as readonly [number, string])[1];
  for (let i = 1; i < pedacos.length; i++) {
    const ant = pedacos[i - 1] as readonly [number, string];
    const atual = pedacos[i] as readonly [number, string];
    const ocupa = ant[1].length * largura(ant[1].slice(-1)) * em;
    const vao = atual[0] - ant[0] - ocupa;
    s += (vao > 0.2 * em ? " " : "") + atual[1];
  }
  return s;
}

/** Um pedaco de texto com a POSICAO (x, y) em que o PDF o desenha. */
export interface PedacoDeTexto {
  x: number;
  y: number;
  texto: string;
}

/** As linhas de texto de um stream de conteudo ja descomprimido. */
export function linhasDoConteudo(conteudo: string, fontes?: ReadonlyMap<string, TabelaUnicode>): string[] {
  const porY = new Map<number, Array<[number, string]>>();
  for (const p of pedacosDoConteudo(conteudo, fontes)) {
    const chave = Math.round(p.y);
    const linha = porY.get(chave) ?? [];
    linha.push([p.x, p.texto]);
    porY.set(chave, linha);
  }
  return [...porY.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, pedacos]) =>
      juntarPedacos(pedacos.sort((a, b) => a[0] - b[0]))
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((l) => l.length > 0);
}

/**
 * Os pedacos de texto de um stream, com a posicao. Para layout em COLUNAS (a
 * Zurich desenha varias colunas na mesma altura): quem le separa por x.
 */
export function pedacosDoConteudo(conteudo: string, fontes?: ReadonlyMap<string, TabelaUnicode>): PedacoDeTexto[] {
  let x = 0;
  let y = 0;
  let fonte: TabelaUnicode | undefined;
  const out: PedacoDeTexto[] = [];
  TOKEN.lastIndex = 0;
  let t: RegExpExecArray | null;
  while ((t = TOKEN.exec(conteudo)) !== null) {
    if (t[0] === "BT") {
      x = 0;
      y = 0;
      continue;
    }
    if (t[1] !== undefined) {
      x += Number(t[1]);
      y += Number(t[2]);
      continue;
    }
    if (t[3] !== undefined) {
      x = Number(t[7]);
      y = Number(t[8]);
      continue;
    }
    if (t[11] !== undefined) {
      fonte = fontes?.get(t[11]);
      continue;
    }
    let texto: string;
    if (t[12] !== undefined) texto = deHex(t[12], fonte);
    else if (t[9] !== undefined) texto = deLiteral(t[9], fonte);
    else {
      /* TJ: pedacos literais "(...)" e hexadecimais "<...>", na ordem. */
      texto = (t[10]?.match(/\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]*>/g) ?? [])
        .map((p) => (p.startsWith("<") ? deHex(p.slice(1, -1), fonte) : deLiteral(p.slice(1, -1), fonte)))
        .join("");
    }
    out.push({ x, y, texto });
  }
  return out;
}

interface Objeto {
  corpo: string;
  ini: number;
  fim: number;
}

/** Cada objeto "N 0 obj ... endobj" pelo numero. */
function objetosDoPdf(s: string): Map<number, Objeto> {
  const out = new Map<number, Objeto>();
  for (const m of s.matchAll(/(\d+)\s+0\s+obj\b/g)) {
    const ini = (m.index ?? 0) + m[0].length;
    const fim = s.indexOf("endobj", ini);
    if (fim < 0) break;
    out.set(Number(m[1]), { corpo: s.slice(ini, fim), ini, fim });
  }
  return out;
}

function streamDoObjeto(buf: Buffer, s: string, o: Objeto): string | null {
  const m = /stream\r?\n/.exec(o.corpo);
  if (m === null) return null;
  const ini = o.ini + m.index + m[0].length;
  const fim = s.indexOf("endstream", ini);
  try {
    return inflateSync(buf.subarray(ini, fim)).toString("latin1");
  } catch {
    return null;
  }
}

/** O dicionario que abre em `ini` ("<<") ate o ">>" que o fecha. */
function dicionario(texto: string, ini: number): string {
  let nivel = 0;
  for (let i = ini; i < texto.length - 1; i++) {
    if (texto[i] === "<" && texto[i + 1] === "<") {
      nivel++;
      i++;
    } else if (texto[i] === ">" && texto[i + 1] === ">") {
      nivel--;
      i++;
      if (nivel === 0) return texto.slice(ini, i + 1);
    }
  }
  return "";
}

const numeroDaRef = (v: string | undefined): number | null => {
  const m = v === undefined ? null : /(\d+)\s+0\s+R/.exec(v);
  return m === null ? null : Number(m[1]);
};

/**
 * Fontes com `/ToUnicode` de cada stream de conteudo: pagina -> `/Resources
 * /Font` -> nome (`/F0`) -> tabela. Vazio quando o PDF nao tem fonte com
 * tabela (todo PDF lido antes da Porto), e o leitor segue como sempre.
 */
function fontesPorConteudo(buf: Buffer, s: string): Map<number, Map<string, TabelaUnicode>> {
  const out = new Map<number, Map<string, TabelaUnicode>>();
  if (!/\/ToUnicode/.test(s)) return out;
  const objs = objetosDoPdf(s);
  const tabelas = new Map<number, TabelaUnicode | null>();
  const tabelaDaFonte = (id: number): TabelaUnicode | null => {
    if (tabelas.has(id)) return tabelas.get(id) ?? null;
    const corpo = objs.get(id)?.corpo ?? "";
    const tu = numeroDaRef(/\/ToUnicode\s+(\d+\s+0\s+R)/.exec(corpo)?.[1]);
    const o = tu === null ? undefined : objs.get(tu);
    const cmap = o === undefined ? null : streamDoObjeto(buf, s, o);
    const t = cmap === null ? null : lerToUnicode(cmap);
    tabelas.set(id, t);
    return t;
  };
  /* O valor de `/chave`: dicionario em linha ou o do objeto referenciado. */
  const resolver = (corpo: string, chave: string): string => {
    const m = new RegExp(`/${chave}\\s*(<<|\\d+\\s+0\\s+R)`).exec(corpo);
    if (m === null) return "";
    if (m[1] === "<<") return dicionario(corpo, m.index + m[0].length - 2);
    const o = objs.get(numeroDaRef(m[1]) ?? -1);
    return o === undefined ? "" : dicionario(o.corpo, o.corpo.indexOf("<<"));
  };
  for (const pagina of objs.values()) {
    if (!/\/Type\s*\/Page\b/.test(pagina.corpo)) continue;
    const fontes = resolver(resolver(pagina.corpo, "Resources"), "Font");
    const mapa = new Map<string, TabelaUnicode>();
    for (const f of fontes.matchAll(/\/([^\s/<>[\]()]+)\s+(\d+)\s+0\s+R/g)) {
      const t = tabelaDaFonte(Number(f[2]));
      if (t !== null) mapa.set(f[1] as string, t);
    }
    if (mapa.size === 0) continue;
    const conteudos = /\/Contents\s*(\[[^\]]*\]|\d+\s+0\s+R)/.exec(pagina.corpo)?.[1] ?? "";
    for (const c of conteudos.matchAll(/(\d+)\s+0\s+R/g)) out.set(Number(c[1]), mapa);
  }
  return out;
}

/**
 * Stream de imagem descomprimido pode conter "Tj" por acaso (o Itau da Porto
 * tem imagens de 1 MB assim) e travar a leitura. Conteudo de pagina e texto:
 * mais de 10% de bytes fora do ASCII imprimivel no comeco e imagem.
 */
function pareceBinario(conteudo: string): boolean {
  const amostra = conteudo.slice(0, 2000);
  /* Conteudo de pagina seleciona fonte ("/F1 200 Tf"); a fonte com codigos altos (Allianz "Apólice") nao e imagem. */
  if (/\/[^\s/<>[\]()]+\s+-?\d*\.?\d+\s+Tf\b/.test(conteudo.slice(0, 4000))) return false;
  let fora = 0;
  for (let i = 0; i < amostra.length; i++) {
    const c = amostra.charCodeAt(i);
    if (c > 126 || (c < 32 && c !== 9 && c !== 10 && c !== 13)) fora++;
  }
  return fora > amostra.length * 0.1;
}

/**
 * As linhas de cada pagina com as palavras posicionadas (motor de
 * `pdf/motor.ts`: larguras reais das fontes, object streams, texto girado).
 */
export function paginasDoPdf(bytes: Uint8Array): LinhaPosicionada[][] {
  try {
    return glifosDoPdf(bytes).map((g, i) => linhasPosicionadas(g, i));
  } catch {
    return [];
  }
}

/**
 * Todas as linhas de texto do PDF, pagina por pagina. `[]` quando nao ha
 * texto. Usa o motor completo; se ele nao achar texto nenhum, cai na leitura
 * antiga (stream por stream), que e mais tolerante a PDF corrompido.
 */
export function linhasDoPdf(bytes: Uint8Array): string[] {
  const pos = paginasDoPdf(bytes).flat();
  if (pos.length === 0) return linhasDoPdfLegado(bytes);
  const linhas = pos.map((l) => l.texto);
  /* As posicoes viajam junto, invisiveis: quem recebe so as linhas ainda pode ler quadros por coluna (`posicoesDe`). */
  Object.defineProperty(linhas, POSICOES, { value: pos, enumerable: false });
  return linhas;
}

const POSICOES = Symbol.for("koter-extratores.posicoes");

/**
 * As linhas posicionadas de um array vindo de `linhasDoPdf`; para linhas de
 * outra origem (testes, texto puro), `null`.
 */
export function posicoesDe(linhas: readonly string[]): LinhaPosicionada[] | null {
  const pos = (linhas as unknown as Record<symbol, LinhaPosicionada[] | undefined>)[POSICOES];
  return pos !== undefined && pos.length === linhas.length ? pos : null;
}

/** A leitura antiga (stream por stream, sem largura de fonte). */
export function linhasDoPdfLegado(bytes: Uint8Array): string[] {
  return streamsDeTexto(bytes).flatMap(({ conteudo, fontes }) => linhasDoConteudo(conteudo, fontes));
}

/**
 * Os pedacos com posicao, um grupo por stream de conteudo (em geral uma
 * pagina). Para leitor de layout em colunas.
 */
export function pedacosDoPdf(bytes: Uint8Array): PedacoDeTexto[][] {
  try {
    const novos = glifosDoPdf(bytes).map((g) => pedacosDosGlifos(g));
    if (novos.some((p) => p.length > 0)) return novos;
  } catch {
    /* cai na leitura antiga */
  }
  return streamsDeTexto(bytes).map(({ conteudo, fontes }) => pedacosDoConteudo(conteudo, fontes));
}

/** Cada stream de conteudo com texto, ja descomprimido, com as fontes da pagina dele. */
function streamsDeTexto(bytes: Uint8Array): Array<{ conteudo: string; fontes: ReadonlyMap<string, TabelaUnicode> | undefined }> {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const s = buf.toString("latin1");
  const fontes = fontesPorConteudo(buf, s);
  /* O numero do objeto dono do stream que comeca em `pos`. */
  const donoDe = (pos: number): number | null => {
    const antes = s.lastIndexOf(" obj", pos);
    const m = antes < 0 ? null : /(\d+)\s+0$/.exec(s.slice(Math.max(0, antes - 24), antes));
    return m === null ? null : Number(m[1]);
  };
  const saida: Array<{ conteudo: string; fontes: ReadonlyMap<string, TabelaUnicode> | undefined }> = [];
  const inicio = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = inicio.exec(s)) !== null) {
    const ini = m.index + m[0].length;
    const fim = s.indexOf("endstream", ini);
    if (fim < 0) break;
    let conteudo: string;
    try {
      conteudo = inflateSync(buf.subarray(ini, fim)).toString("latin1");
    } catch {
      continue;
    }
    if (!/\bT[jJ]\b/.test(conteudo) || pareceBinario(conteudo)) continue;
    const dono = fontes.size > 0 ? donoDe(m.index) : null;
    saida.push({ conteudo, fontes: dono === null ? undefined : fontes.get(dono) });
  }
  return saida;
}

/** `%PDF-` nos primeiros bytes. */
export function pareceUmPdf(bytes: Uint8Array): boolean {
  return Buffer.from(bytes.buffer, bytes.byteOffset, Math.min(bytes.byteLength, 8)).toString("latin1").startsWith("%PDF-");
}
