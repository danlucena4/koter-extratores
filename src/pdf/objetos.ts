/**
 * OS OBJETOS DE UM PDF, sem dependencia (so `zlib` do Node): le "N G obj ...
 * endobj" do arquivo inteiro e os objetos guardados dentro de OBJECT STREAMS
 * (`/Type /ObjStm`, PDF 1.5+: o kit da MAPFRE guarda as fontes la), e decodifica
 * streams (Flate, ASCII85, ASCIIHex, LZW, sem filtro).
 *
 * O valor de cada objeto e uma arvore simples (`Valor`): numero, booleano,
 * null, nome ("/Nome"), texto (bytes em latin1), referencia, lista, dicionario.
 */
import { inflateSync } from "node:zlib";

export type Valor = number | boolean | null | string | Texto | Ref | Valor[] | Dicionario;
/** Uma string do PDF: os bytes como latin1 (um char = um byte). */
export interface Texto {
  bytes: string;
}
export interface Ref {
  ref: number;
}
export interface Dicionario {
  dic: Map<string, Valor>;
}

export const ehNome = (v: Valor | undefined): v is string => typeof v === "string";
export const ehRef = (v: Valor | undefined): v is Ref => typeof v === "object" && v !== null && "ref" in v;
export const ehDic = (v: Valor | undefined): v is Dicionario => typeof v === "object" && v !== null && "dic" in v;
export const ehTexto = (v: Valor | undefined): v is Texto => typeof v === "object" && v !== null && "bytes" in v;

const BRANCO = /[\x00\t\n\f\r ]/;
const DELIM = /[()<>[\]{}/%]/;

/** Analisador de valores do PDF a partir de `i` em `s` (latin1). */
export class Leitor {
  i: number;
  constructor(
    readonly s: string,
    inicio = 0,
  ) {
    this.i = inicio;
  }

  pularBrancos(): void {
    const s = this.s;
    for (;;) {
      while (this.i < s.length && BRANCO.test(s[this.i] as string)) this.i++;
      if (s[this.i] === "%") {
        while (this.i < s.length && s[this.i] !== "\n" && s[this.i] !== "\r") this.i++;
        continue;
      }
      return;
    }
  }

  /** Uma palavra solta (numero, operador, `R`, `obj`...). */
  palavra(): string {
    const s = this.s;
    const ini = this.i;
    while (this.i < s.length && !BRANCO.test(s[this.i] as string) && !DELIM.test(s[this.i] as string)) this.i++;
    return s.slice(ini, this.i);
  }

  nome(): string {
    this.i++; // "/"
    const bruto = this.palavra();
    return "/" + bruto.replace(/#([0-9A-Fa-f]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
  }

  textoLiteral(): Texto {
    const s = this.s;
    this.i++; // "("
    let nivel = 1;
    let out = "";
    const ESC: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" };
    while (this.i < s.length) {
      const c = s[this.i] as string;
      if (c === "\\") {
        const p = s[this.i + 1] ?? "";
        if (p in ESC) {
          out += ESC[p];
          this.i += 2;
        } else if (/[0-7]/.test(p)) {
          const m = /^[0-7]{1,3}/.exec(s.slice(this.i + 1, this.i + 4)) as RegExpExecArray;
          out += String.fromCharCode(parseInt(m[0], 8) & 0xff);
          this.i += 1 + m[0].length;
        } else if (p === "\r") {
          this.i += s[this.i + 2] === "\n" ? 3 : 2;
        } else if (p === "\n") {
          this.i += 2;
        } else {
          out += p;
          this.i += 2;
        }
        continue;
      }
      if (c === "(") nivel++;
      if (c === ")") {
        nivel--;
        if (nivel === 0) {
          this.i++;
          break;
        }
      }
      out += c;
      this.i++;
    }
    return { bytes: out };
  }

  textoHex(): Texto {
    const s = this.s;
    this.i++; // "<"
    const fim = s.indexOf(">", this.i);
    let h = s.slice(this.i, fim < 0 ? s.length : fim).replace(/[^0-9A-Fa-f]/g, "");
    this.i = fim < 0 ? s.length : fim + 1;
    if (h.length % 2 === 1) h += "0";
    let out = "";
    for (let k = 0; k < h.length; k += 2) out += String.fromCharCode(parseInt(h.slice(k, k + 2), 16));
    return { bytes: out };
  }

  /** O proximo valor; `undefined` no fim ou em delimitador de fechamento. */
  valor(): Valor | undefined {
    this.pularBrancos();
    const s = this.s;
    const c = s[this.i];
    if (c === undefined) return undefined;
    if (c === "/") return this.nome();
    if (c === "(") return this.textoLiteral();
    if (c === "<") {
      if (s[this.i + 1] === "<") {
        this.i += 2;
        const dic = new Map<string, Valor>();
        for (;;) {
          this.pularBrancos();
          if (s[this.i] === ">" && s[this.i + 1] === ">") {
            this.i += 2;
            break;
          }
          if (this.i >= s.length) break;
          const k = this.valor();
          if (typeof k !== "string") {
            if (k === undefined) this.i++;
            continue;
          }
          const v = this.valor();
          dic.set(k, v === undefined ? null : v);
        }
        return { dic };
      }
      return this.textoHex();
    }
    if (c === "[") {
      this.i++;
      const lista: Valor[] = [];
      for (;;) {
        this.pularBrancos();
        if (s[this.i] === "]") {
          this.i++;
          break;
        }
        if (this.i >= s.length) break;
        const v = this.valor();
        if (v === undefined) {
          this.i++;
          continue;
        }
        lista.push(v);
      }
      return lista;
    }
    if (c === "]" || c === ">" || c === ")" || c === "{" || c === "}") return undefined;
    const p = this.palavra();
    if (p === "") {
      this.i++;
      return undefined;
    }
    if (p === "true") return true;
    if (p === "false") return false;
    if (p === "null") return null;
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(p)) {
      /* "12 0 R" = referencia. */
      const volta = this.i;
      this.pularBrancos();
      const g = this.palavra();
      if (/^\d+$/.test(p) && /^\d+$/.test(g)) {
        this.pularBrancos();
        if (s[this.i] === "R" && (this.i + 1 >= s.length || BRANCO.test(s[this.i + 1] as string) || DELIM.test(s[this.i + 1] as string))) {
          this.i++;
          return { ref: Number(p) };
        }
      }
      this.i = volta;
      return Number(p);
    }
    /* Operador/palavra solta dentro de um objeto: tratamos como nome sem barra. */
    return p;
  }
}

/* ------------------------------------------------------------- filtros */

function ascii85(d: string): string {
  const s = d.replace(/\s+/g, "").replace(/~>.*$/, "").replace(/^<~/, "");
  let out = "";
  let grupo: number[] = [];
  for (const c of s) {
    if (c === "z" && grupo.length === 0) {
      out += "\0\0\0\0";
      continue;
    }
    grupo.push(c.charCodeAt(0) - 33);
    if (grupo.length === 5) {
      let n = 0;
      for (const g of grupo) n = n * 85 + g;
      out += String.fromCharCode((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
      grupo = [];
    }
  }
  if (grupo.length > 1) {
    const falta = 5 - grupo.length;
    while (grupo.length < 5) grupo.push(84);
    let n = 0;
    for (const g of grupo) n = n * 85 + g;
    const b = [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    out += String.fromCharCode(...b.slice(0, 4 - falta));
  }
  return out;
}

function asciiHex(d: string): string {
  let h = d.replace(/>.*$/s, "").replace(/[^0-9A-Fa-f]/g, "");
  if (h.length % 2) h += "0";
  let out = "";
  for (let i = 0; i < h.length; i += 2) out += String.fromCharCode(parseInt(h.slice(i, i + 2), 16));
  return out;
}

function lzw(d: string): string {
  const out: number[] = [];
  let dic: number[][] = [];
  const reset = () => {
    dic = [];
    for (let i = 0; i < 256; i++) dic.push([i]);
    dic.push([], []);
  };
  reset();
  let bits = 9;
  let buf = 0;
  let nbuf = 0;
  let anterior: number[] | null = null;
  for (let i = 0; i < d.length; i++) {
    buf = (buf << 8) | d.charCodeAt(i);
    nbuf += 8;
    while (nbuf >= bits) {
      const codigo = (buf >>> (nbuf - bits)) & ((1 << bits) - 1);
      nbuf -= bits;
      if (codigo === 256) {
        reset();
        bits = 9;
        anterior = null;
        continue;
      }
      if (codigo === 257) return String.fromCharCode(...out);
      let entrada: number[];
      if (codigo < dic.length && dic[codigo]!.length > 0) entrada = dic[codigo]!;
      else if (anterior !== null) entrada = [...anterior, anterior[0]!];
      else continue;
      out.push(...entrada);
      if (anterior !== null) dic.push([...anterior, entrada[0]!]);
      anterior = entrada;
      if (dic.length + 1 >= 1 << bits && bits < 12) bits++;
    }
  }
  return String.fromCharCode(...out);
}

/** PNG predictors (DecodeParms /Predictor >= 10), usados em alguns streams Flate. */
function semPreditor(d: string, colunas: number, cores: number, bpc: number): string {
  const bpp = Math.max(1, Math.ceil((cores * bpc) / 8));
  const largura = Math.ceil((colunas * cores * bpc) / 8);
  const out: number[] = [];
  let anterior = new Array<number>(largura).fill(0);
  for (let i = 0; i + largura < d.length + 1; i += largura + 1) {
    const tipo = d.charCodeAt(i);
    const linha: number[] = [];
    for (let k = 0; k < largura; k++) {
      const x = d.charCodeAt(i + 1 + k) || 0;
      const a = k >= bpp ? (linha[k - bpp] as number) : 0;
      const b = anterior[k] as number;
      const c = k >= bpp ? (anterior[k - bpp] as number) : 0;
      let v = x;
      if (tipo === 1) v = x + a;
      else if (tipo === 2) v = x + b;
      else if (tipo === 3) v = x + Math.floor((a + b) / 2);
      else if (tipo === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      linha.push(v & 255);
    }
    out.push(...linha);
    anterior = linha;
  }
  return String.fromCharCode(...out);
}

/* --------------------------------------------------------------- o PDF */

interface ObjetoCru {
  /** Onde o valor comeca no texto do arquivo (ou no texto do ObjStm). */
  inicio: number;
  fonte: "arquivo" | number;
}

export class DocumentoPdf {
  readonly s: string;
  private readonly crus = new Map<number, ObjetoCru>();
  private readonly cache = new Map<number, Valor>();
  private readonly objStm = new Map<number, string>();
  private readonly streams = new Map<number, { inicio: number; fim: number }>();

  constructor(readonly buf: Buffer) {
    this.s = buf.toString("latin1");
    for (const m of this.s.matchAll(/(?:^|[\s>\]])(\d+)\s+(\d+)\s+obj\b/g)) {
      this.crus.set(Number(m[1]), { inicio: (m.index ?? 0) + m[0].length, fonte: "arquivo" });
    }
    /* Objetos dentro de object streams (so os que nao existem soltos no arquivo). */
    for (const [num, c] of [...this.crus]) {
      if (c.fonte !== "arquivo") continue;
      const cabeca = this.s.slice(c.inicio, c.inicio + 400);
      if (!/\/Type\s*\/ObjStm/.test(cabeca)) continue;
      try {
        const v = this.objeto(num);
        if (!ehDic(v)) continue;
        const dados = this.dadosDoStream(num);
        if (dados === null) continue;
        const n = Number(v.dic.get("/N") ?? 0);
        const primeiro = Number(v.dic.get("/First") ?? 0);
        const pares = dados.slice(0, primeiro).trim().split(/\s+/).map(Number);
        this.objStm.set(num, dados);
        for (let k = 0; k < n; k++) {
          const id = pares[2 * k] as number;
          const off = pares[2 * k + 1] as number;
          if (!this.crus.has(id)) this.crus.set(id, { inicio: primeiro + off, fonte: num });
        }
      } catch {
        /* object stream ilegivel: segue com o resto */
      }
    }
  }

  numeros(): number[] {
    return [...this.crus.keys()];
  }

  objeto(num: number): Valor {
    if (this.cache.has(num)) return this.cache.get(num) as Valor;
    const c = this.crus.get(num);
    if (c === undefined) return null;
    const texto = c.fonte === "arquivo" ? this.s : (this.objStm.get(c.fonte) ?? "");
    const l = new Leitor(texto, c.inicio);
    const v = l.valor();
    const valor = v === undefined ? null : v;
    this.cache.set(num, valor);
    if (c.fonte === "arquivo") {
      l.pularBrancos();
      if (texto.startsWith("stream", l.i)) {
        let ini = l.i + 6;
        if (texto[ini] === "\r") ini++;
        if (texto[ini] === "\n") ini++;
        let fim = -1;
        const comp = ehDic(valor) ? this.resolver(valor.dic.get("/Length")) : null;
        if (typeof comp === "number" && texto.startsWith("endstream", this.depoisDeBrancos(ini + comp))) fim = ini + comp;
        if (fim < 0) {
          fim = texto.indexOf("endstream", ini);
          if (fim < 0) fim = texto.length;
          while (fim > ini && (texto[fim - 1] === "\n" || texto[fim - 1] === "\r")) fim--;
        }
        this.streams.set(num, { inicio: ini, fim });
      }
    }
    return valor;
  }

  private depoisDeBrancos(i: number): number {
    while (i < this.s.length && BRANCO.test(this.s[i] as string)) i++;
    return i;
  }

  /** Resolve uma referencia (ate 10 niveis). */
  resolver(v: Valor | undefined): Valor | undefined {
    let x = v;
    for (let k = 0; k < 10 && ehRef(x); k++) x = this.objeto(x.ref);
    return x;
  }

  dic(v: Valor | undefined): Map<string, Valor> | null {
    const x = this.resolver(v);
    return ehDic(x) ? x.dic : null;
  }

  /** Os bytes decodificados do stream do objeto `num` (latin1), ou `null`. */
  dadosDoStream(num: number): string | null {
    const v = this.objeto(num);
    const pos = this.streams.get(num);
    if (pos === undefined || !ehDic(v)) return null;
    let dados = this.s.slice(pos.inicio, pos.fim);
    const filtros = this.resolver(v.dic.get("/Filter"));
    const parms = this.resolver(v.dic.get("/DecodeParms"));
    const lista = Array.isArray(filtros) ? filtros.map((f) => this.resolver(f)) : filtros === undefined || filtros === null ? [] : [filtros];
    const listaParms = Array.isArray(parms) ? parms.map((p) => this.resolver(p)) : [parms];
    for (let k = 0; k < lista.length; k++) {
      const f = lista[k];
      if (f === "/FlateDecode" || f === "/Fl") {
        const bytes = Buffer.from(dados, "latin1");
        try {
          dados = inflateSync(bytes).toString("latin1");
        } catch {
          try {
            dados = inflateSync(bytes, { finishFlush: 2 }).toString("latin1");
          } catch {
            return null;
          }
        }
        const p = listaParms[k] ?? listaParms[0];
        if (ehDic(p ?? undefined)) {
          const pd = (p as Dicionario).dic;
          const pred = Number(pd.get("/Predictor") ?? 1);
          if (pred >= 10) dados = semPreditor(dados, Number(pd.get("/Columns") ?? 1), Number(pd.get("/Colors") ?? 1), Number(pd.get("/BitsPerComponent") ?? 8));
        }
      } else if (f === "/ASCII85Decode" || f === "/A85") dados = ascii85(dados);
      else if (f === "/ASCIIHexDecode" || f === "/AHx") dados = asciiHex(dados);
      else if (f === "/LZWDecode" || f === "/LZW") dados = lzw(dados);
      else if (f === "/DCTDecode" || f === "/JPXDecode" || f === "/CCITTFaxDecode" || f === "/JBIG2Decode") return null;
    }
    return dados;
  }

  /** As paginas em ordem (arvore /Pages do catalogo), com os recursos herdados. */
  paginas(): Array<{ num: number; dic: Map<string, Valor>; recursos: Map<string, Valor> | null }> {
    const out: Array<{ num: number; dic: Map<string, Valor>; recursos: Map<string, Valor> | null }> = [];
    const vistos = new Set<number>();
    const visitar = (ref: Valor | undefined, herdado: Map<string, Valor> | null, prof: number) => {
      if (!ehRef(ref) || vistos.has(ref.ref) || prof > 50) return;
      vistos.add(ref.ref);
      const d = this.dic(ref);
      if (d === null) return;
      const recursos = this.dic(d.get("/Resources")) ?? herdado;
      const tipo = d.get("/Type");
      const kids = this.resolver(d.get("/Kids"));
      if (tipo === "/Pages" || Array.isArray(kids)) {
        for (const k of Array.isArray(kids) ? kids : []) visitar(k, recursos, prof + 1);
      } else {
        out.push({ num: ref.ref, dic: d, recursos });
      }
    };
    /* O catalogo mais recente (atualizacao incremental vem depois no arquivo). */
    let catalogo: Map<string, Valor> | null = null;
    for (const n of this.numeros()) {
      const c = this.crus.get(n) as ObjetoCru;
      if (c.fonte === "arquivo" && !/\/Type\s*\/Catalog/.test(this.s.slice(c.inicio, c.inicio + 600))) continue;
      const d = this.dic(this.objeto(n));
      if (d !== null && d.get("/Type") === "/Catalog") catalogo = d;
    }
    if (catalogo !== null) visitar(catalogo.get("/Pages"), null, 0);
    if (out.length > 0) return out;
    /* Sem catalogo legivel: as paginas soltas, na ordem do arquivo. */
    for (const n of this.numeros()) {
      const d = this.dic(this.objeto(n));
      if (d !== null && d.get("/Type") === "/Page") out.push({ num: n, dic: d, recursos: this.dic(d.get("/Resources")) });
    }
    return out;
  }
}
