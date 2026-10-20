/**
 * O MOTOR: interpreta o conteudo de cada pagina (na ordem da arvore de
 * paginas) como um leitor de PDF faria, glifo a glifo:
 *
 *  - estado grafico (q/Q, cm) e de texto (BT/ET, Tf, Tc, Tw, Tz, TL, Ts, Td,
 *    TD, Tm, T*, Tj, TJ, ', "), formularios (Do) e campos preenchidos
 *    (aparencia das anotacoes);
 *  - cada glifo sai com a posicao de inicio e de fim na pagina, calculada com a
 *    LARGURA REAL da fonte (ver `fontes.ts`).
 *
 * As LINHAS saem da geometria: glifos na mesma linha de base (por direcao do
 * texto: horizontal primeiro, texto girado depois), da esquerda para a
 * direita; espaco entra onde ha espaco desenhado ou onde o vao entre dois
 * glifos passa de ~1/6 do tamanho da fonte. Texto desenhado duas vezes por
 * cima (falso negrito) sai uma vez.
 */
import { DocumentoPdf, Leitor, ehDic, ehRef, ehTexto, type Valor } from "./objetos.js";
import { Fonte } from "./fontes.js";

type Matriz = [number, number, number, number, number, number];
const IDENT: Matriz = [1, 0, 0, 1, 0, 0];
const mult = (m: Matriz, n: Matriz): Matriz => [
  m[0] * n[0] + m[1] * n[2],
  m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2],
  m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4],
  m[4] * n[1] + m[5] * n[3] + n[5],
];

/** Um glifo posicionado na pagina. */
export interface GlifoNaPagina {
  x: number;
  y: number;
  xf: number;
  yf: number;
  texto: string;
  tamanho: number;
  /** Direcao do texto (vetor unitario). */
  dx: number;
  dy: number;
  /** Indice do operador que desenhou (agrupa os "pedacos"). */
  op: number;
}

interface EstadoGrafico {
  ctm: Matriz;
  fonte: Fonte | null;
  tamanho: number;
  tc: number;
  tw: number;
  th: number;
  tl: number;
  ts: number;
}

const numero = (v: Valor | undefined): number => (typeof v === "number" ? v : 0);

export class Motor {
  private readonly fontesCache = new Map<number, Fonte | null>();
  private op = 0;

  constructor(readonly pdf: DocumentoPdf) {}

  private fonteDe(recursos: Map<string, Valor> | null, nome: string): Fonte | null {
    const fontes = this.pdf.dic(recursos?.get("/Font"));
    const ref = fontes?.get(nome);
    const chave = ehRef(ref) ? ref.ref : -1;
    if (chave >= 0 && this.fontesCache.has(chave)) return this.fontesCache.get(chave) ?? null;
    const dic = this.pdf.dic(ref);
    let f: Fonte | null = null;
    try {
      f = dic === null ? null : new Fonte(this.pdf, dic);
    } catch {
      f = null;
    }
    if (chave >= 0) this.fontesCache.set(chave, f);
    return f;
  }

  /** Os glifos de uma pagina. */
  glifosDaPagina(pagina: { dic: Map<string, Valor>; recursos: Map<string, Valor> | null }): GlifoNaPagina[] {
    const out: GlifoNaPagina[] = [];
    const conteudos = this.pdf.resolver(pagina.dic.get("/Contents"));
    const lista = Array.isArray(conteudos) ? conteudos : [pagina.dic.get("/Contents")];
    const partes: string[] = [];
    for (const c of lista) if (ehRef(c)) partes.push(this.pdf.dadosDoStream(c.ref) ?? "");
    this.executar(partes.join("\n"), pagina.recursos, IDENT, out, 0);
    /* Campos de formulario preenchidos: a aparencia das anotacoes. */
    const anots = this.pdf.resolver(pagina.dic.get("/Annots"));
    for (const a of Array.isArray(anots) ? anots : []) {
      const d = this.pdf.dic(a);
      const ap = this.pdf.dic(d?.get("/AP"));
      const n = ap?.get("/N");
      const rect = this.pdf.resolver(d?.get("/Rect"));
      if (!ehRef(n) || !Array.isArray(rect)) continue;
      const xo = this.pdf.dic(n);
      if (xo === null || xo.get("/Subtype") !== "/Form") continue;
      const [x1, y1] = rect.map((r) => numero(this.pdf.resolver(r)));
      this.formulario(n.ref, xo, pagina.recursos, [1, 0, 0, 1, x1 ?? 0, y1 ?? 0], out, 1);
    }
    return out;
  }

  private formulario(num: number, xo: Map<string, Valor>, recursosPai: Map<string, Valor> | null, ctm: Matriz, out: GlifoNaPagina[], prof: number): void {
    if (prof > 8) return;
    const dados = this.pdf.dadosDoStream(num);
    if (dados === null) return;
    const m = this.pdf.resolver(xo.get("/Matrix"));
    const matriz: Matriz = Array.isArray(m) && m.length === 6 ? (m.map((x) => numero(this.pdf.resolver(x))) as Matriz) : IDENT;
    const recursos = this.pdf.dic(xo.get("/Resources")) ?? recursosPai;
    this.executar(dados, recursos, mult(matriz, ctm), out, prof);
  }

  private executar(conteudo: string, recursos: Map<string, Valor> | null, ctmInicial: Matriz, out: GlifoNaPagina[], prof: number): void {
    const pilha: EstadoGrafico[] = [];
    let g: EstadoGrafico = { ctm: ctmInicial, fonte: null, tamanho: 0, tc: 0, tw: 0, th: 1, tl: 0, ts: 0 };
    let tm: Matriz = IDENT;
    let tlm: Matriz = IDENT;
    const ops: Valor[] = [];
    const l = new Leitor(conteudo);

    const mostrar = (t: Valor | undefined) => {
      if (!ehTexto(t) || g.fonte === null) return;
      const id = this.op++;
      for (const gl of g.fonte.glifos(t.bytes)) {
        const w0 = (gl.largura / 1000) * g.tamanho;
        const trm = mult(mult([g.tamanho * g.th, 0, 0, g.tamanho, 0, g.ts], tm), g.ctm);
        const ini = mult(mult([1, 0, 0, 1, 0, g.ts], tm), g.ctm);
        const finalG = mult(mult([1, 0, 0, 1, w0 * g.th, g.ts], tm), g.ctm);
        const norma = Math.hypot(trm[0], trm[1]) || 1;
        const tamanho = Math.hypot(trm[2], trm[3]);
        if (gl.texto.length > 0) {
          out.push({
            x: ini[4],
            y: ini[5],
            xf: finalG[4],
            yf: finalG[5],
            texto: gl.texto,
            tamanho: tamanho > 0 ? tamanho : Math.abs(g.tamanho),
            dx: trm[0] / norma,
            dy: trm[1] / norma,
            op: id,
          });
        }
        const tx = (w0 + g.tc + (gl.umByte && gl.codigo === 32 ? g.tw : 0)) * g.th;
        tm = mult([1, 0, 0, 1, tx, 0], tm);
      }
    };
    const proximaLinha = (tx: number, ty: number) => {
      tlm = mult([1, 0, 0, 1, tx, ty], tlm);
      tm = tlm;
    };

    for (;;) {
      const v = l.valor();
      if (v === undefined) {
        if (l.i >= conteudo.length) break;
        l.i++;
        continue;
      }
      const ehOperador = typeof v === "string" && !v.startsWith("/");
      if (!ehOperador) {
        ops.push(v);
        if (ops.length > 64) ops.shift();
        continue;
      }
      const a = ops.splice(0, ops.length);
      const n = (k: number) => numero(a[a.length - k]);
      try {
        switch (v) {
          case "q":
            pilha.push({ ...g });
            break;
          case "Q":
            g = pilha.pop() ?? g;
            break;
          case "cm":
            g.ctm = mult([n(6), n(5), n(4), n(3), n(2), n(1)], g.ctm);
            break;
          case "BT":
            tm = IDENT;
            tlm = IDENT;
            break;
          case "Tf":
            g.fonte = typeof a[a.length - 2] === "string" ? this.fonteDe(recursos, a[a.length - 2] as string) : null;
            g.tamanho = n(1);
            break;
          case "Tc":
            g.tc = n(1);
            break;
          case "Tw":
            g.tw = n(1);
            break;
          case "Tz":
            g.th = n(1) / 100;
            break;
          case "TL":
            g.tl = n(1);
            break;
          case "Ts":
            g.ts = n(1);
            break;
          case "Td":
            proximaLinha(n(2), n(1));
            break;
          case "TD":
            g.tl = -n(1);
            proximaLinha(n(2), n(1));
            break;
          case "Tm":
            tlm = [n(6), n(5), n(4), n(3), n(2), n(1)];
            tm = tlm;
            break;
          case "T*":
            proximaLinha(0, -g.tl);
            break;
          case "Tj":
            mostrar(a[a.length - 1]);
            break;
          case "'":
            proximaLinha(0, -g.tl);
            mostrar(a[a.length - 1]);
            break;
          case '"':
            g.tw = n(3);
            g.tc = n(2);
            proximaLinha(0, -g.tl);
            mostrar(a[a.length - 1]);
            break;
          case "TJ": {
            const lista = a[a.length - 1];
            if (!Array.isArray(lista)) break;
            for (const item of lista) {
              if (typeof item === "number") {
                tm = mult([1, 0, 0, 1, (-item / 1000) * g.tamanho * g.th, 0], tm);
              } else {
                mostrar(item);
              }
            }
            break;
          }
          case "Do": {
            const nome = a[a.length - 1];
            if (typeof nome !== "string") break;
            const ref = this.pdf.dic(recursos?.get("/XObject"))?.get(nome);
            const xo = this.pdf.dic(ref);
            if (ehRef(ref) && xo !== null && xo.get("/Subtype") === "/Form") this.formulario(ref.ref, xo, recursos, g.ctm, out, prof + 1);
            break;
          }
          case "BI": {
            /* Imagem embutida: pula ate "EI" (os dados sao binarios). */
            const id = conteudo.indexOf("ID", l.i);
            const ei = id < 0 ? -1 : conteudo.slice(id + 3).search(/\sEI(?:\s|$)/);
            l.i = ei < 0 ? conteudo.length : id + 3 + ei + 3;
            break;
          }
          default:
            break;
        }
      } catch {
        /* operador malformado: ignora */
      }
    }
  }
}

/* ------------------------------------------------------ montar linhas */

interface GlifoNoQuadro extends GlifoNaPagina {
  u: number;
  uf: number;
  v: number;
}

/** Uma palavra com a posicao horizontal (no sentido do texto) de inicio e fim. */
export interface PalavraPosicionada {
  texto: string;
  x: number;
  xf: number;
}

/** Uma linha com as palavras posicionadas: para ler quadros "rotulos em cima, valores embaixo". */
export interface LinhaPosicionada {
  texto: string;
  /** Altura da linha de base (no sentido do texto; maior = mais acima). */
  y: number;
  tamanho: number;
  palavras: PalavraPosicionada[];
  pagina: number;
}

/** Junta glifos de uma linha (ja ordenados) em palavras, com espaco pela geometria. */
function palavrasDaLinha(gs: readonly GlifoNoQuadro[]): PalavraPosicionada[] {
  const out: PalavraPosicionada[] = [];
  let atual: PalavraPosicionada | null = null;
  let ant: GlifoNoQuadro | null = null;
  for (const gl of gs) {
    const espacoDesenhado = /^\s+$/.test(gl.texto);
    let quebra = espacoDesenhado;
    if (ant !== null && !espacoDesenhado) {
      const vao = gl.u - ant.uf;
      const tam = Math.max(1e-6, Math.min(ant.tamanho, gl.tamanho));
      if (vao > 0.17 * tam) quebra = true;
    }
    if (quebra && atual !== null) {
      out.push(atual);
      atual = null;
    }
    if (!espacoDesenhado) {
      const partes = gl.texto.split(/\s+/);
      partes.forEach((p, k) => {
        if (k > 0 && atual !== null) {
          out.push(atual);
          atual = null;
        }
        if (p.length === 0) return;
        if (atual === null) atual = { texto: p, x: gl.u, xf: gl.uf };
        else {
          atual.texto += p;
          atual.xf = gl.uf;
        }
      });
    }
    ant = espacoDesenhado ? ant : gl;
  }
  if (atual !== null) out.push(atual);
  return out;
}

function textoDaLinha(gs: readonly GlifoNoQuadro[]): string {
  return palavrasDaLinha(gs)
    .map((p) => p.texto)
    .join(" ")
    .trim();
}

/** Agrupa glifos de mesma direcao em linhas (de cima para baixo). */
function linhasDoQuadro(gs: GlifoNoQuadro[]): GlifoNoQuadro[][] {
  const ordem = [...gs].sort((a, b) => b.v - a.v || a.u - b.u);
  const linhas: Array<{ v: number; tam: number; gs: GlifoNoQuadro[] }> = [];
  for (const gl of ordem) {
    const atual = linhas[linhas.length - 1];
    if (atual !== undefined && atual.v - gl.v <= 0.45 * Math.max(Math.min(atual.tam, gl.tamanho), 1e-6)) {
      atual.gs.push(gl);
      continue;
    }
    linhas.push({ v: gl.v, tam: gl.tamanho, gs: [gl] });
  }
  return linhas.map((l) => {
    /*
     * Ordem: por TRECHO desenhado (um operador de texto), pelo inicio de cada
     * um; dentro do trecho, na ordem em que foi desenhado. Ordenar letra a
     * letra intercala textos sobrepostos ("Segurad:o" na HDI, onde os dois-
     * pontos sao desenhados por cima do rotulo).
     */
    const porOp = new Map<number, GlifoNoQuadro[]>();
    for (const g of l.gs) {
      const lista = porOp.get(g.op) ?? [];
      lista.push(g);
      porOp.set(g.op, lista);
    }
    /* Um operador pode desenhar fora de ordem (TJ que volta para tras): corta onde o desenho recua ou salta longe. */
    const trechos: Array<{ gs: GlifoNoQuadro[]; ini: number }> = [];
    for (const gs of porOp.values()) {
      let atual: GlifoNoQuadro[] = [];
      for (const g of gs) {
        const ant = atual[atual.length - 1];
        if (ant !== undefined && (g.u < ant.u - 0.1 * g.tamanho || g.u - ant.uf > 1.5 * g.tamanho)) {
          trechos.push({ gs: atual, ini: atual[0]?.u ?? 0 });
          atual = [];
        }
        atual.push(g);
      }
      if (atual.length > 0) trechos.push({ gs: atual, ini: atual[0]?.u ?? 0 });
    }
    trechos.sort((a, b) => a.ini - b.ini);
    const porU = trechos.flatMap((t) => t.gs);
    /* Falso negrito: o mesmo glifo desenhado de novo quase no mesmo lugar. */
    const unicos: GlifoNoQuadro[] = [];
    for (const gl of porU) {
      /* So e repeticao quando vem de OUTRO operador quase no mesmo ponto ("ll" legitimo fica a ~0,2 em). */
      const dup = unicos.some(
        (o) => o.op !== gl.op && o.texto === gl.texto && Math.abs(o.u - gl.u) < 0.08 * gl.tamanho && Math.abs(o.v - gl.v) < 0.08 * gl.tamanho,
      );
      if (!dup) unicos.push(gl);
    }
    return unicos;
  });
}

/** As linhas de texto de uma pagina: horizontal primeiro, depois cada direcao girada. */
export function linhasDosGlifos(glifos: readonly GlifoNaPagina[]): string[] {
  return linhasPosicionadas(glifos, 0).map((l) => l.texto);
}

/** As linhas com as palavras posicionadas (horizontal primeiro, depois texto girado). */
export function linhasPosicionadas(glifos: readonly GlifoNaPagina[], pagina: number): LinhaPosicionada[] {
  const porDirecao = new Map<number, GlifoNoQuadro[]>();
  for (const gl of glifos) {
    const angulo = Math.round((Math.atan2(gl.dy, gl.dx) * 180) / Math.PI / 5) * 5;
    const rad = (angulo * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    const q: GlifoNoQuadro = { ...gl, u: gl.x * c + gl.y * s, uf: gl.xf * c + gl.yf * s, v: -gl.x * s + gl.y * c };
    const lista = porDirecao.get(angulo) ?? [];
    lista.push(q);
    porDirecao.set(angulo, lista);
  }
  const direcoes = [...porDirecao.keys()].sort((a, b) => (a === 0 ? -1 : b === 0 ? 1 : a - b));
  const out: LinhaPosicionada[] = [];
  for (const d of direcoes) {
    for (const linha of linhasDoQuadro(porDirecao.get(d) as GlifoNoQuadro[])) {
      const palavras = palavrasDaLinha(linha);
      const texto = palavras.map((p) => p.texto).join(" ").trim();
      if (texto.length === 0) continue;
      const tamanhos = linha.map((g) => g.tamanho).sort((a, b) => a - b);
      out.push({ texto, y: (linha[0] as GlifoNoQuadro).v, tamanho: tamanhos[Math.floor(tamanhos.length / 2)] ?? 0, palavras, pagina });
    }
  }
  return out;
}

/** Os pedacos (um por operador de texto), na ordem do conteudo. */
export function pedacosDosGlifos(glifos: readonly GlifoNaPagina[]): Array<{ x: number; y: number; texto: string }> {
  const porOp = new Map<number, GlifoNaPagina[]>();
  for (const gl of glifos) {
    const l = porOp.get(gl.op) ?? [];
    l.push(gl);
    porOp.set(gl.op, l);
  }
  const out: Array<{ x: number; y: number; texto: string }> = [];
  for (const gs of [...porOp.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1])) {
    const primeiro = gs[0] as GlifoNaPagina;
    const quadro = gs.map((gl) => ({ ...gl, u: gl.x * gl.dx + gl.y * gl.dy, uf: gl.xf * gl.dx + gl.yf * gl.dy, v: 0 }));
    const texto = textoDaLinha(quadro);
    if (texto.length > 0) out.push({ x: primeiro.x, y: primeiro.y, texto });
  }
  return out;
}

/** Todas as paginas: glifos por pagina. */
export function glifosDoPdf(bytes: Uint8Array): GlifoNaPagina[][] {
  const pdf = new DocumentoPdf(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  const motor = new Motor(pdf);
  return pdf.paginas().map((p) => {
    try {
      return motor.glifosDaPagina(p);
    } catch {
      return [];
    }
  });
}

export { ehDic };
