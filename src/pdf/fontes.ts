/**
 * FONTES do PDF: como cada codigo vira TEXTO (tabela /ToUnicode; sem ela, a
 * codificacao da fonte com as /Differences por nome de glifo) e quanto cada
 * codigo AVANCA (as larguras /Widths ou /W, em milesimos do tamanho da fonte).
 * A largura real e o que permite saber onde ha espaco entre palavras quando o
 * gerador desenha letra por letra (o kit da MAPFRE).
 */
import { codificacaoDoCff, codificacaoDoType1 } from "./cff.js";
import { ehDic, ehRef, type DocumentoPdf, type Valor } from "./objetos.js";

/* ------------------------------------------------------- codificacoes */

/** Windows-1252 de 0x80 a 0x9F (o resto do WinAnsi e latin1). */
const CP1252: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6,
  0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c,
  0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a,
  0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
};
const winAnsi = (c: number): string => String.fromCharCode(CP1252[c] ?? c);

/** MacRoman de 0x80 a 0xFF. */
const MAC_ALTO =
  "ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ";
/** StandardEncoding (Type1 sem /Encoding): difere do WinAnsi em aspas e acima de 0xA0. */
const STANDARD_ALTO: Record<number, string> = {
  0x27: "’", 0x60: "‘", 0xa1: "¡", 0xa2: "¢", 0xa3: "£", 0xa4: "⁄", 0xa5: "¥", 0xa6: "ƒ", 0xa7: "§", 0xa8: "¤", 0xa9: "'",
  0xaa: "“", 0xab: "«", 0xac: "‹", 0xad: "›", 0xae: "fi", 0xaf: "fl", 0xb1: "–", 0xb2: "†", 0xb3: "‡", 0xb4: "·", 0xb6: "¶",
  0xb7: "•", 0xb8: "‚", 0xb9: "„", 0xba: "”", 0xbb: "»", 0xbc: "…", 0xbd: "‰", 0xbf: "¿", 0xc1: "`", 0xc2: "´", 0xc3: "ˆ",
  0xc4: "˜", 0xc5: "¯", 0xc6: "˘", 0xc7: "˙", 0xc8: "¨", 0xca: "˚", 0xcb: "¸", 0xcd: "˝", 0xce: "˛", 0xcf: "ˇ", 0xd0: "—",
  0xe1: "Æ", 0xe3: "ª", 0xe8: "Ł", 0xe9: "Ø", 0xea: "Œ", 0xeb: "º", 0xf1: "æ", 0xf5: "ı", 0xf8: "ł", 0xf9: "ø", 0xfa: "œ", 0xfb: "ß",
};
const standard = (c: number): string => (c < 0x80 && c !== 0x27 && c !== 0x60 ? String.fromCharCode(c) : (STANDARD_ALTO[c] ?? ""));
const macRoman = (c: number): string => (c < 0x80 ? String.fromCharCode(c) : (MAC_ALTO[c - 0x80] ?? ""));

/* Nomes de glifo (Adobe Glyph List, o subconjunto que aparece em PDF brasileiro). */
const GLIFOS: Record<string, string> = {
  space: " ", exclam: "!", quotedbl: '"', numbersign: "#", dollar: "$", percent: "%", ampersand: "&", quotesingle: "'",
  quoteright: "’", quoteleft: "‘", parenleft: "(", parenright: ")", asterisk: "*", plus: "+", comma: ",", hyphen: "-",
  minus: "-", period: ".", slash: "/", zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6",
  seven: "7", eight: "8", nine: "9", colon: ":", semicolon: ";", less: "<", equal: "=", greater: ">", question: "?",
  at: "@", bracketleft: "[", backslash: "\\", bracketright: "]", asciicircum: "^", underscore: "_", grave: "`",
  braceleft: "{", bar: "|", braceright: "}", asciitilde: "~", exclamdown: "¡", cent: "¢", sterling: "£",
  currency: "¤", yen: "¥", brokenbar: "¦", section: "§", dieresis: "¨", copyright: "©", ordfeminine: "ª",
  guillemotleft: "«", logicalnot: "¬", registered: "®", macron: "¯", degree: "°", plusminus: "±", twosuperior: "²",
  threesuperior: "³", acute: "´", mu: "µ", paragraph: "¶", periodcentered: "·", cedilla: "¸", onesuperior: "¹",
  ordmasculine: "º", guillemotright: "»", onequarter: "¼", onehalf: "½", threequarters: "¾", questiondown: "¿",
  multiply: "×", divide: "÷", germandbls: "ß", AE: "Æ", ae: "æ", Oslash: "Ø", oslash: "ø", OE: "Œ", oe: "œ",
  endash: "–", emdash: "—", quotedblleft: "“", quotedblright: "”", quotesinglbase: "‚", quotedblbase: "„",
  bullet: "•", ellipsis: "…", Euro: "€", trademark: "™", dagger: "†", daggerdbl: "‡", perthousand: "‰",
  fi: "fi", fl: "fl", ff: "ff", ffi: "ffi", ffl: "ffl", nbspace: " ", nonbreakingspace: " ", sfthyphen: "-",
  circumflex: "ˆ", tilde: "˜", dotlessi: "ı", Eth: "Ð", eth: "ð", Thorn: "Þ", thorn: "þ",
};
const MARCAS: Record<string, string> = { acute: "́", grave: "̀", circumflex: "̂", tilde: "̃", dieresis: "̈", cedilla: "̧", ring: "̊", caron: "̌" };

/** Nome de glifo -> texto ("Aacute" -> "Á", "uni00E9" -> "é", "a" -> "a"). */
export function textoDoGlifo(nome: string): string | null {
  const n = nome.replace(/^\//, "").replace(/\.(?:sc|alt|\w+)$/, "");
  if (n in GLIFOS) return GLIFOS[n] as string;
  if (/^[A-Za-z]$/.test(n)) return n;
  const m = /^([A-Za-z])(acute|grave|circumflex|tilde|dieresis|cedilla|ring|caron)$/.exec(n);
  if (m !== null) return ((m[1] as string) + MARCAS[m[2] as string]).normalize("NFC");
  const uni = /^uni([0-9A-Fa-f]{4,})$/.exec(n);
  if (uni !== null) {
    let out = "";
    for (let i = 0; i + 4 <= (uni[1] as string).length; i += 4) out += String.fromCharCode(parseInt((uni[1] as string).slice(i, i + 4), 16));
    return out;
  }
  const u = /^u([0-9A-Fa-f]{4,6})$/.exec(n);
  if (u !== null) return String.fromCodePoint(parseInt(u[1] as string, 16));
  return null;
}

/* ----------------------------------------------------------- ToUnicode */

export interface TabelaUnicode {
  bytes: number;
  mapa: Map<string, string>;
}

function utf16(hex: string): string {
  let out = "";
  for (let i = 0; i + 4 <= hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  if (hex.length === 2) out += String.fromCharCode(parseInt(hex, 16));
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
      const baseHex = lista === null ? destino.slice(1, -1) : "";
      for (let c = ini; c <= fim && c - ini < 65536; c++) {
        const chave = c.toString(16).toUpperCase().padStart(largura, "0");
        if (lista !== null) {
          mapa.set(chave, utf16(lista[c - ini] ?? ""));
        } else {
          /* Incrementa o ULTIMO caractere do destino (pode ter mais de um). */
          const prefixo = baseHex.slice(0, -4);
          const ultimo = parseInt(baseHex.slice(-4), 16) + (c - ini);
          mapa.set(chave, utf16(prefixo) + String.fromCharCode(ultimo));
        }
      }
    }
  }
  return { bytes, mapa };
}

/* --------------------------------------------------------------- fonte */

/** Larguras aproximadas da Helvetica (fontes padrao sem /Widths). */
const HELVETICA: Record<string, number> = {
  " ": 278, "!": 278, '"': 355, "#": 556, $: 556, "%": 889, "&": 667, "'": 191, "(": 333, ")": 333, "*": 389, "+": 584,
  ",": 278, "-": 333, ".": 278, "/": 278, ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556, "@": 1015,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833, N: 722,
  O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611, "[": 278, "\\": 278,
  "]": 278, _: 556, a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222,
  m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
};
const larguraHelvetica = (t: string): number => {
  const c = (t[0] ?? " ").normalize("NFD")[0] as string;
  if (/\d/.test(c)) return 556;
  return HELVETICA[c] ?? 556;
};

export interface Glifo {
  /** O codigo (para Tw: so o byte 32 de fonte simples ganha o espacamento de palavra). */
  codigo: number;
  texto: string;
  /** Avanco em milesimos do tamanho da fonte. */
  largura: number;
  umByte: boolean;
}

export class Fonte {
  private readonly larguras = new Map<number, number>();
  private larguraPadrao = 0;
  private readonly composta: boolean;
  private readonly bytesPorCodigo: number;
  private readonly unicode: TabelaUnicode | null;
  private readonly codificacao = new Map<number, string>();
  private readonly base: (c: number) => string;
  private readonly monoespacada: boolean;
  /** Fator das larguras (Type3 usa a /FontMatrix; o resto, 1/1000 ja embutido). */
  private readonly escala: number;
  readonly temLarguras: boolean;

  constructor(pdf: DocumentoPdf, dic: Map<string, Valor>) {
    const subtipo = dic.get("/Subtype");
    this.composta = subtipo === "/Type0";
    const nomeBase = String(pdf.resolver(dic.get("/BaseFont")) ?? "");
    this.monoespacada = /Courier|Mono/i.test(nomeBase);
    const tu = dic.get("/ToUnicode");
    const tuNum = ehRef(tu) ? tu.ref : null;
    const cmap = tuNum === null ? null : pdf.dadosDoStream(tuNum);
    this.unicode = cmap === null ? null : lerToUnicode(cmap);

    let escala = 1;
    if (subtipo === "/Type3") {
      const fm = pdf.resolver(dic.get("/FontMatrix"));
      if (Array.isArray(fm) && typeof fm[0] === "number") escala = fm[0] * 1000;
    }
    this.escala = escala;

    if (this.composta) {
      const desc = pdf.resolver(dic.get("/DescendantFonts"));
      const cid = pdf.dic(Array.isArray(desc) ? desc[0] : undefined);
      this.larguraPadrao = Number(pdf.resolver(cid?.get("/DW")) ?? 1000);
      const w = pdf.resolver(cid?.get("/W"));
      if (Array.isArray(w)) {
        let i = 0;
        while (i < w.length) {
          const c1 = Number(pdf.resolver(w[i]));
          const prox = pdf.resolver(w[i + 1]);
          if (Array.isArray(prox)) {
            prox.forEach((x, k) => this.larguras.set(c1 + k, Number(pdf.resolver(x))));
            i += 2;
          } else {
            const c2 = Number(prox);
            const larg = Number(pdf.resolver(w[i + 2]));
            for (let c = c1; c <= c2 && c - c1 < 65536; c++) this.larguras.set(c, larg);
            i += 3;
          }
        }
      }
      const enc = pdf.resolver(dic.get("/Encoding"));
      /* Identity-H/V e as CMaps de 2 bytes; a ToUnicode diz o tamanho quando existe. */
      this.bytesPorCodigo = this.unicode?.bytes ?? (enc === "/Identity-H" || enc === "/Identity-V" ? 2 : 2);
      this.base = () => "";
    } else {
      this.bytesPorCodigo = 1;
      const primeiro = Number(pdf.resolver(dic.get("/FirstChar")) ?? 0);
      const ws = pdf.resolver(dic.get("/Widths"));
      if (Array.isArray(ws)) ws.forEach((x, k) => this.larguras.set(primeiro + k, Number(pdf.resolver(x))));
      const descritor = pdf.dic(dic.get("/FontDescriptor"));
      this.larguraPadrao = Number(pdf.resolver(descritor?.get("/MissingWidth")) ?? 0);
      const enc = pdf.resolver(dic.get("/Encoding"));
      let baseEnc: Valor | undefined = enc;
      if (ehDic(enc)) {
        baseEnc = pdf.resolver(enc.dic.get("/BaseEncoding"));
        const dif = pdf.resolver(enc.dic.get("/Differences"));
        if (Array.isArray(dif)) {
          let c = 0;
          for (const x of dif) {
            const v = pdf.resolver(x);
            if (typeof v === "number") c = v;
            else if (typeof v === "string") {
              const t = textoDoGlifo(v);
              if (t !== null) this.codificacao.set(c, t);
              c++;
            }
          }
        }
      }
      /*
       * Sem codificacao base no PDF, vale a da propria fonte: Type1 embutida
       * (CFF ou Type1) traz a dela no programa; Type1 padrao (as 14 base) usa
       * a StandardEncoding; TrueType e o resto, WinAnsi.
       */
      let base: (c: number) => string = winAnsi;
      if (baseEnc === "/MacRomanEncoding") base = macRoman;
      else if (baseEnc === "/StandardEncoding") base = standard;
      else if ((baseEnc === undefined || baseEnc === null) && (subtipo === "/Type1" || subtipo === "/MMType1")) {
        const propria = this.codificacaoPropria(pdf, descritor);
        if (propria === "standard") base = standard;
        else if (propria !== null) {
          for (const [c, nome] of propria) {
            const t = textoDoGlifo(nome);
            if (t !== null && !this.codificacao.has(c)) this.codificacao.set(c, t);
          }
        }
      }
      this.base = base;
    }
    this.temLarguras = this.larguras.size > 0;
  }

  /** A codificacao embutida no programa da fonte (CFF ou Type1); fonte nao embutida: StandardEncoding. */
  private codificacaoPropria(pdf: DocumentoPdf, descritor: Map<string, Valor> | null): Map<number, string> | "standard" | null {
    if (descritor === null) return "standard";
    const ff3 = descritor.get("/FontFile3");
    if (ehRef(ff3)) {
      const d = pdf.dadosDoStream(ff3.ref);
      return d === null ? null : codificacaoDoCff(d);
    }
    const ff1 = descritor.get("/FontFile");
    if (ehRef(ff1)) {
      const d = pdf.dadosDoStream(ff1.ref);
      return d === null ? null : codificacaoDoType1(d);
    }
    return descritor.has("/FontFile2") ? null : "standard";
  }

  /** Os glifos dos bytes de uma string do PDF. */
  glifos(bytes: string): Glifo[] {
    const out: Glifo[] = [];
    const passo = this.bytesPorCodigo;
    for (let i = 0; i + passo <= bytes.length; i += passo) {
      let codigo = 0;
      let hex = "";
      for (let k = 0; k < passo; k++) {
        const b = bytes.charCodeAt(i + k) & 255;
        codigo = codigo * 256 + b;
        hex += b.toString(16).toUpperCase().padStart(2, "0");
      }
      let texto = this.unicode?.mapa.get(hex) ?? (passo === 1 ? this.unicode?.mapa.get(hex.padStart(4, "0")) : undefined) ?? null;
      if (texto === null && !this.composta) texto = this.codificacao.get(codigo) ?? this.base(codigo);
      if (texto === null) texto = "";
      /* Caracteres de controle e de uso privado nao viram texto. */
      texto = texto.replace(/[\u0000-\u0008\u000b-\u001f-]/g, "").replace(/[\t\n\r ]/g, " ");
      let largura = this.larguras.get(codigo);
      if (largura === undefined || (largura === 0 && texto.trim().length > 0 && !this.composta)) {
        largura = this.larguraPadrao > 0 ? this.larguraPadrao : this.monoespacada ? 600 : this.composta ? 1000 : larguraHelvetica(texto);
      }
      out.push({ codigo, texto, largura: largura * this.escala, umByte: passo === 1 });
    }
    return out;
  }
}
