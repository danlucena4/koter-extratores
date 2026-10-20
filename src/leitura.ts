/**
 * Pecas comuns aos leitores (sobre o texto limpo do motor de `pdf/`):
 * normalizar data, dinheiro, CPF, CEP, placa, chassi e FIPE; ler "Rotulo:
 * valor" de linhas com varios rotulos; recortar secoes; e ler quadros de
 * "rotulos numa linha, valores na de baixo" pela COLUNA (posicao x).
 */
import type { LinhaPosicionada } from "./pdf/motor.js";
import type { DataCia, Dinheiro, EnderecoLido } from "./tipos.js";

export const vazio = (v: string | null | undefined): string | null => {
  const s = (v ?? "").replace(/\s+/g, " ").trim();
  return s.length > 0 ? s : null;
};
export const digitos = (v: string | null | undefined): string => (v ?? "").replace(/\D/g, "");
export const semAcento = (v: string): string => v.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** "dd/mm/aaaa" (tambem "dd/mm/aa" com seculo 19/20 pelo valor) -> DataCia. */
export function data(v: string | null | undefined): DataCia | null {
  const m = /(\d{2})\/(\d{2})\/(\d{4}|\d{2})\b/.exec(v ?? "");
  if (m === null) return null;
  const [, d, mes, a] = m as unknown as [string, string, string, string];
  if (Number(mes) < 1 || Number(mes) > 12 || Number(d) < 1 || Number(d) > 31) return null;
  const ano = a.length === 2 ? (Number(a) > 50 ? `19${a}` : `20${a}`) : a;
  return { iso: `${ano}-${mes}-${d}`, original: m[0] };
}

/** Todas as datas de um texto, na ordem. */
export function datas(v: string | null | undefined): DataCia[] {
  return [...(v ?? "").matchAll(/\d{2}\/\d{2}\/\d{4}/g)].map((m) => data(m[0])).filter((x): x is DataCia => x !== null);
}

/** "R$ 1.234,56" / "1.234,56" -> centavos. `null` fora do formato pt-BR. */
export function dinheiro(v: string | null | undefined): Dinheiro | null {
  /* Percentual ("100,00% tab. FIPE") nao e dinheiro. */
  const m = /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})(?!\d|\s*%)/.exec(v ?? "");
  if (m === null) return null;
  const [inteiro, cent] = (m[1] as string).replace(/\./g, "").split(",");
  return { centavos: Number(inteiro) * 100 + Number(cent), moeda: "BRL", original: m[1] as string };
}

export function cpfOuCnpj(v: string | null | undefined): string | null {
  const d = digitos(v);
  return d.length === 11 || d.length === 14 ? d : null;
}

export function cep(v: string | null | undefined): string | null {
  const m = /\b(\d{5})-?(\d{3})\b/.exec(v ?? "");
  return m === null ? null : `${m[1]}${m[2]}`;
}

/** Placa antiga (ABC1234) ou Mercosul (ABC1D23). */
export function placa(v: string | null | undefined): string | null {
  const s = (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(s) ? s : null;
}

/** Chassi de 17 caracteres (sem I, O, Q). */
export function chassi(v: string | null | undefined): string | null {
  const s = (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(s) ? s : null;
}

export function fipe(v: string | null | undefined): string | null {
  const m = /\b(\d{6})-?(\d)\b/.exec(v ?? "");
  return m === null ? null : `${m[1]}-${m[2]}`;
}

export function ano(v: string | null | undefined): number | null {
  const n = Number(/\b(19[5-9]\d|20\d\d)\b/.exec(v ?? "")?.[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** "Sim"/"Não" no comeco do valor -> booleano. */
export function simNao(v: string | null | undefined): boolean | null {
  const s = semAcento(v ?? "").trim().toUpperCase();
  if (/^(SIM|S)\b/.test(s)) return true;
  if (/^(NAO|N)\b/.test(s)) return false;
  return null;
}

export function email(v: string | null | undefined): string | null {
  const m = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.exec(v ?? "");
  return m === null ? null : m[0].toLowerCase();
}

/** Telefones de um texto ("(71) 99999-9999", "71 999999999"), so digitos, com DDD. */
export function telefones(v: string | null | undefined): string[] {
  const out: string[] = [];
  for (const m of (v ?? "").matchAll(/\(?\s*(\d{2})\s*\)?\s*(9?\d{4})[\s-]?(\d{4})\b/g)) {
    const t = `${m[1]}${m[2]}${m[3]}`;
    if ((t.length === 10 || t.length === 11) && !/^(\d)\1+$/.test(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

export const escapar = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * "Rotulo: valor Outro: valor" -> valores pelos ROTULOS conhecidos da linha.
 * O valor vai ate o proximo rotulo conhecido (ou o fim da linha). Rotulo e
 * comparado sem diferenca de maiuscula; o primeiro que aparece vence.
 */
export function camposDaLinha(linha: string, rotulos: readonly string[]): Map<string, string> {
  const achados: Array<{ rotulo: string; ini: number; fim: number }> = [];
  for (const r of rotulos) {
    const re = new RegExp(`(?:^|\\s)(${escapar(r)})\\s*:`, "gi");
    for (const m of linha.matchAll(re)) {
      const ini = (m.index ?? 0) + m[0].length - m[0].trimStart().length;
      achados.push({ rotulo: r, ini, fim: (m.index ?? 0) + m[0].length });
    }
  }
  /* Rotulo contido noutro mais longo na mesma posicao ("CPF" dentro de "CPF/CNPJ"): fica o mais longo. */
  achados.sort((a, b) => a.ini - b.ini || b.fim - a.fim);
  const limpos: typeof achados = [];
  for (const a of achados) {
    const ult = limpos[limpos.length - 1];
    if (ult !== undefined && a.ini < ult.fim) continue;
    limpos.push(a);
  }
  const out = new Map<string, string>();
  limpos.forEach((a, k) => {
    const prox = limpos[k + 1];
    const valor = linha.slice(a.fim, prox === undefined ? linha.length : prox.ini).trim();
    if (!out.has(a.rotulo)) out.set(a.rotulo, valor);
  });
  return out;
}

/** O valor do rotulo na primeira linha (do bloco) que o tem. */
export function rotulo(linhas: readonly string[], r: string, rotulos: readonly string[] = [r]): string | null {
  const todos = rotulos.includes(r) ? rotulos : [...rotulos, r];
  for (const l of linhas) {
    const v = camposDaLinha(l, todos).get(r);
    if (v !== undefined) return vazio(v);
  }
  return null;
}

/** As linhas de `inicio` (inclusive) ate a primeira `fim` depois dela (exclusive). */
export function secao(linhas: readonly string[], inicio: RegExp, fim: RegExp | null, max = 200): string[] {
  const i = linhas.findIndex((l) => inicio.test(l));
  if (i < 0) return [];
  const j = fim === null ? -1 : linhas.findIndex((l, k) => k > i && fim.test(l));
  return linhas.slice(i, j < 0 ? Math.min(linhas.length, i + max) : j);
}

/** O primeiro grupo da primeira linha que casa. */
export function achar(linhas: readonly string[], re: RegExp): string | null {
  for (const l of linhas) {
    const m = re.exec(l);
    if (m !== null) return vazio(m[1] ?? m[0]);
  }
  return null;
}

/** O texto da linha seguinte a que casa com `re` (pulando linhas vazias). */
export function linhaAbaixo(linhas: readonly string[], re: RegExp, distancia = 1): string | null {
  const i = linhas.findIndex((l) => re.test(l));
  return i < 0 ? null : vazio(linhas[i + distancia]);
}

/* ------------------------------------------------- quadros por coluna */

/**
 * Quadro "rotulos em cima, valores embaixo": acha a linha de CABECALHO que tem
 * todos os `rotulos` (na ordem), e da linha de valores logo abaixo devolve,
 * para cada rotulo, as palavras cuja posicao cai na COLUNA dele (do inicio do
 * rotulo ate o inicio do proximo). Sem posicoes (texto puro), `null`.
 */
export function quadroPorColuna(
  linhas: readonly LinhaPosicionada[],
  rotulos: readonly string[],
  opcoes: { aPartirDe?: number; linhasDeValor?: number; ate?: RegExp } = {},
): Map<string, string> | null {
  const norma = (s: string) => semAcento(s).toUpperCase().replace(/\s+/g, " ").trim();
  for (let i = opcoes.aPartirDe ?? 0; i < linhas.length; i++) {
    const cab = linhas[i] as LinhaPosicionada;
    const texto = norma(cab.texto);
    let pos = 0;
    const inicios: number[] = [];
    let ok = true;
    for (const r of rotulos) {
      const alvo = norma(r);
      const k = texto.indexOf(alvo, pos);
      if (k < 0) {
        ok = false;
        break;
      }
      /* posicao x do rotulo: a palavra do cabecalho onde ele comeca. */
      const antes = texto.slice(0, k).split(" ").filter((w) => w.length > 0).length;
      const palavra = cab.palavras[antes];
      if (palavra === undefined) {
        ok = false;
        break;
      }
      inicios.push(palavra.x);
      pos = k + alvo.length;
    }
    if (!ok) continue;
    /* Valores: a linha de baixo, ou (com \`ate\`) todas ate a proxima linha de rotulos (valor que quebra). */
    let valores = linhas.slice(i + 1, i + 1 + (opcoes.linhasDeValor ?? 1)).filter((l) => l.pagina === cab.pagina);
    if (opcoes.ate !== undefined) {
      valores = [];
      let anterior = cab;
      for (const l of linhas.slice(i + 1, i + 6)) {
        if (l.pagina !== cab.pagina || opcoes.ate.test(l.texto)) break;
        /* A continuacao fica colada na linha de cima (espaco de uma linha); mais longe ja e outro bloco. */
        if (valores.length > 0 && Math.abs(anterior.y - l.y) > 1.6 * Math.max(l.tamanho, anterior.tamanho, 1)) break;
        valores.push(l);
        anterior = l;
      }
    }
    const out = new Map<string, string>();
    rotulos.forEach((r, k) => {
      const ini = (inicios[k] as number) - cab.tamanho * 0.6;
      const fim = k + 1 < inicios.length ? (inicios[k + 1] as number) - cab.tamanho * 0.6 : Number.POSITIVE_INFINITY;
      const partes: string[] = [];
      for (const l of valores) {
        for (const w of l.palavras) {
          const meio = w.x;
          if (meio >= ini && meio < fim) partes.push(w.texto);
        }
      }
      out.set(r, partes.join(" ").trim());
    });
    return out;
  }
  return null;
}

/** Endereco vazio? (todos os campos nulos) */
export const enderecoOuNulo = (e: EnderecoLido): EnderecoLido | null => (Object.values(e).every((v) => v === null) ? null : e);

/**
 * "RUA X, 123 - APTO 4" / "RUA X 123 APTO 4" / "RUA X N 123": separa rua,
 * numero e complemento SO quando o numero esta isolado (depois de virgula,
 * de "Nº"/"N" ou como primeira palavra so de digitos depois do nome da rua).
 */
export function ruaNumeroComplemento(v: string | null | undefined): Pick<EnderecoLido, "logradouro" | "numero" | "complemento"> {
  const s = vazio(v);
  const nada = { logradouro: null, numero: null, complemento: null };
  if (s === null) return { logradouro: null, numero: null, complemento: null };
  const virgula = /^(.+?)\s*,\s*(?:N[º°o.]?\s*)?(\d+[A-Za-z]?|S\/?N)\b\s*[,-]?\s*(.*)$/i.exec(s);
  if (virgula !== null) return { logradouro: vazio(virgula[1]), numero: vazio(virgula[2]), complemento: vazio(virgula[3]) };
  const comN = /^(.+?)\s+N[º°o.]\s*(\d+[A-Za-z]?|S\/?N)\b\s*[,-]?\s*(.*)$/i.exec(s);
  if (comN !== null) return { logradouro: vazio(comN[1]), numero: vazio(comN[2]), complemento: vazio(comN[3]) };
  return nada;
}

/**
 * "RUA X 123 LT 4": o primeiro numero solto depois de um nome sem digitos vira
 * o numero (forma da MAPFRE, que nao separa). Rua com numero no nome ("RUA 2
 * DE JULHO 45") nao e dividida: fica tudo no logradouro? Nao: fica nulo, para
 * nao gravar o numero errado.
 */
export function ruaPeloPrimeiroNumero(v: string | null | undefined): Pick<EnderecoLido, "logradouro" | "numero" | "complemento"> {
  const s = vazio(v);
  if (s === null) return { logradouro: null, numero: null, complemento: null };
  const separado = ruaNumeroComplemento(s);
  if (separado.numero !== null) return separado;
  const m = /^(\D+?)\s+(\d+[A-Za-z]?)\b\s*[,-]?\s*(.*)$/.exec(s);
  if (m === null) return { logradouro: null, numero: null, complemento: null };
  return { logradouro: vazio(m[1]), numero: vazio(m[2]), complemento: vazio(m[3]) };
}

/* ------------------------------------------------ tabela por colunas */

/** Uma linha da tabela: o texto de cada coluna (pelo nome do cabecalho). */
export type LinhaDeTabela = Map<string, string>;

const PARECE_VALOR = /^(R\$|\d[\d.,]*%?|-|%|FIPE)$/i;

/**
 * Le uma TABELA pela posicao das palavras: o cabecalho (`colunas`, na ordem,
 * todos na mesma linha) define as colunas; cada linha seguinte, ate `fim`,
 * vira uma linha da tabela. Palavra de texto a esquerda da primeira coluna de
 * valor e da DESCRICAO (1a coluna); valor (dinheiro, %, "-") vai para a coluna
 * de cabecalho mais proxima. Linha so com descricao continua a anterior
 * (descricao quebrada), a menos que a seguinte traga os valores dela.
 */
export function tabelaPorColunas(
  linhas: readonly LinhaPosicionada[],
  colunas: readonly string[],
  fim: RegExp,
  opcoes: { ignorar?: RegExp; aPartirDe?: number } = {},
): LinhaDeTabela[] {
  const norma = (s: string) => semAcento(s).toUpperCase().replace(/\s+/g, " ").trim();
  let iCab = -1;
  let centros: number[] = [];
  let inicios: number[] = [];
  for (let i = opcoes.aPartirDe ?? 0; i < linhas.length && iCab < 0; i++) {
    const cab = linhas[i] as LinhaPosicionada;
    const texto = norma(cab.texto);
    let pos = 0;
    const cs: number[] = [];
    const is: number[] = [];
    let ok = true;
    for (const c of colunas) {
      const alvo = norma(c);
      const k = texto.indexOf(alvo, pos);
      if (k < 0) {
        ok = false;
        break;
      }
      const antes = texto.slice(0, k).split(" ").filter((w) => w.length > 0).length;
      const n = alvo.split(" ").length;
      const p0 = cab.palavras[antes];
      const p1 = cab.palavras[antes + n - 1];
      if (p0 === undefined || p1 === undefined) {
        ok = false;
        break;
      }
      is.push(p0.x);
      cs.push((p0.x + p1.xf) / 2);
      pos = k + alvo.length;
    }
    if (ok) {
      iCab = i;
      centros = cs;
      inicios = is;
    }
  }
  if (iCab < 0) return [];
  const cab = linhas[iCab] as LinhaPosicionada;
  const inicioDosValores = (inicios[1] ?? Number.POSITIVE_INFINITY) - cab.tamanho * 1.5;

  const brutas: Array<{ cols: string[][]; soDescricao: boolean; soValores: boolean }> = [];
  for (const l of linhas.slice(iCab + 1)) {
    if (fim.test(l.texto)) break;
    if (opcoes.ignorar?.test(l.texto) || /^\d+$/.test(l.texto.trim())) continue;
    /* Cabecalho repetido (troca de pagina). */
    if (norma(l.texto).startsWith(norma(colunas[0] as string)) && colunas.slice(1).every((c) => norma(l.texto).includes(norma(c)))) continue;
    const cols: string[][] = colunas.map(() => []);
    /* Trechos: palavras separadas por vao largo (fronteira de coluna). */
    const tam = l.tamanho > 0 ? l.tamanho : cab.tamanho;
    const trechos: Array<{ texto: string[]; x: number; xf: number }> = [];
    for (const w of l.palavras) {
      const ult = trechos[trechos.length - 1];
      if (ult !== undefined && w.x - ult.xf < 0.9 * tam) {
        ult.texto.push(w.texto);
        ult.xf = w.xf;
      } else trechos.push({ texto: [w.texto], x: w.x, xf: w.xf });
    }
    trechos.forEach((t, k) => {
      /* O trecho que comeca antes da 1a coluna de valor e descricao (numero ou nao). */
      /* Primeiro trecho perto do inicio da descricao (mais perto dela que de qualquer coluna de valor) e descricao. */
      const pertoDaDescricao = (centros.slice(1) as number[]).every((c) => Math.abs(t.x - (inicios[0] as number)) < Math.abs((t.x + t.xf) / 2 - c));
      if ((k === 0 && pertoDaDescricao) || t.xf < inicioDosValores) {
        (cols[0] as string[]).push(...t.texto);
        return;
      }
      const centro = (t.x + t.xf) / 2;
      let melhor = 1;
      let dist = Number.POSITIVE_INFINITY;
      for (let c = 1; c < centros.length; c++) {
        const d = Math.abs(centro - (centros[c] as number));
        if (d < dist) {
          dist = d;
          melhor = c;
        }
      }
      /* Trecho largo com varios valores ("100.000,00 1.326,66" colados): um por coluna, da esquerda. */
      const soValores = t.texto.every((p) => /^\d[\d.]*,\d{2}$/.test(p) || p === "R$" || p === "-");
      if (soValores && t.texto.length > 1 && melhor + t.texto.length - 1 < colunas.length) {
        const valores = t.texto.filter((p) => p !== "R$");
        if (valores.length > 1) {
          valores.forEach((p, i) => (cols[Math.min(colunas.length - 1, melhor + i)] as string[]).push(p));
          return;
        }
      }
      (cols[melhor] as string[]).push(...t.texto);
    });
    const temValor = cols.slice(1).some((c) => c.length > 0);
    brutas.push({ cols, soDescricao: !temValor, soValores: temValor && (cols[0] as string[]).length === 0 });
  }

  const out: LinhaDeTabela[] = [];
  let pendente: string[] | null = null;
  /* Depois de um item, as linhas so de descricao seguem nele (descricao quebrada, inclusive na troca de pagina). */
  let continuando = false;
  brutas.forEach((b, k) => {
    if (b.soDescricao) {
      const ultima = out[out.length - 1];
      const proximaSoValores = (brutas[k + 1]?.soValores ?? false) === true;
      /* A proxima comeca com "(": ela continua ESTA linha, que entao abre um item novo. */
      const proximaEParenteses = /^\(/.test((brutas[k + 1]?.cols[0] as string[] | undefined)?.[0] ?? "");
      if (ultima !== undefined && continuando && !proximaSoValores && !proximaEParenteses && pendente === null) {
        ultima.set(colunas[0] as string, `${ultima.get(colunas[0] as string) ?? ""} ${(b.cols[0] as string[]).join(" ")}`.trim());
      } else {
        continuando = false;
        pendente = [...(pendente ?? []), ...(b.cols[0] as string[])];
      }
      return;
    }
    const linha: LinhaDeTabela = new Map();
    colunas.forEach((c, i) => linha.set(c, (b.cols[i] as string[]).join(" ").trim()));
    if (pendente !== null) {
      linha.set(colunas[0] as string, `${pendente.join(" ")} ${linha.get(colunas[0] as string) ?? ""}`.trim());
      pendente = null;
    }
    out.push(linha);
    continuando = true;
  });
  return out;
}

/** Linhas posicionadas aproximadas a partir de texto puro (testes): cada caractere ocupa 0,5 do tamanho. */
export function posicionarTexto(linhas: readonly string[], tamanho = 10): LinhaPosicionada[] {
  return linhas.map((texto, i) => {
    const palavras: LinhaPosicionada["palavras"] = [];
    for (const m of texto.matchAll(/\S+/g)) {
      const x = (m.index ?? 0) * tamanho * 0.5;
      palavras.push({ texto: m[0], x, xf: x + m[0].length * tamanho * 0.5 });
    }
    return { texto: texto.replace(/\s+/g, " ").trim(), y: -i * tamanho * 1.2, tamanho, palavras, pagina: 0 };
  });
}

/** Uma linha de tabela lida pelos valores no FIM da linha. */
export interface LinhaPorValores {
  descricao: string;
  valores: string[];
}

const VALOR_PADRAO =
  /^(?:R\$\s*\d[\d.]*,\d{2}|\d[\d.]*,\d{2}%?|\d{1,3}(?:,\d+)?\s*%(?:\s*FIPE)?|N[ãa]o contratad[oa]|GRATUIT[OA]|Gratuit[oa]|Contratad[oa]|Conf\.? Cond\.? Gerais|Conforme Manual|Inclus[oa]|-)$/i;

/**
 * Tabela em que cada linha e "DESCRICAO valor [valor ...]": os valores sao
 * reconhecidos do FIM da linha para o comeco (dinheiro, %, "Não contratado",
 * "GRATUITA", "Conf. Cond. Gerais"...). Linha so de descricao continua o item
 * de cima (descricao quebrada, inclusive antes/depois de uma linha so de
 * valores), igual a `tabelaPorColunas`.
 */
export function tabelaPorValores(
  linhas: readonly string[],
  opcoes: { ignorar?: RegExp; valor?: RegExp; maxDescricao?: number } = {},
): LinhaPorValores[] {
  const reValor = opcoes.valor ?? VALOR_PADRAO;
  const brutas: Array<{ descricao: string; valores: string[]; prosa?: boolean }> = [];
  for (const bruta of linhas) {
    const l = bruta.replace(/\s+/g, " ").trim();
    if (l.length === 0 || (opcoes.ignorar?.test(l) ?? false)) continue;
    /* Prosa (nota de rodape, texto corrido): nao e cobertura e corta a continuacao. */
    if (!/(\d,\d{2}%?|GRATUIT[OA]|contratad[oa]|Gerais|Manual)$/i.test(l) && (l.length > (opcoes.maxDescricao ?? 70) || /www\.|https?:/i.test(l))) {
      brutas.push({ descricao: "", valores: [], prosa: true });
      continue;
    }
    /* Do fim para o comeco: junta palavras enquanto o trecho final for um valor. */
    const palavras = l.split(" ");
    const valores: string[] = [];
    let fim = palavras.length;
    while (fim > 0) {
      let achou = false;
      for (let n = Math.min(4, fim); n >= 1; n--) {
        const trecho = palavras.slice(fim - n, fim).join(" ");
        if (reValor.test(trecho)) {
          valores.unshift(trecho);
          fim -= n;
          achou = true;
          break;
        }
      }
      if (!achou) break;
    }
    brutas.push({ descricao: palavras.slice(0, fim).join(" "), valores });
  }
  const out: LinhaPorValores[] = [];
  let pendente: string[] = [];
  let continuando = false;
  brutas.forEach((b, k) => {
    if (b.prosa === true) {
      continuando = false;
      pendente = [];
      return;
    }
    if (b.valores.length === 0) {
      const ultima = out[out.length - 1];
      const prox = brutas[k + 1];
      const proximaSoValores = prox !== undefined && prox.valores.length > 0 && prox.descricao.length === 0;
      if (ultima !== undefined && continuando && !proximaSoValores && pendente.length === 0) ultima.descricao = `${ultima.descricao} ${b.descricao}`.trim();
      else {
        continuando = false;
        pendente.push(b.descricao);
      }
      return;
    }
    out.push({ descricao: [...pendente, b.descricao].join(" ").trim(), valores: b.valores });
    pendente = [];
    continuando = true;
  });
  return out;
}

/** Marcas de mais de uma palavra (o resto: a primeira palavra e a marca). */
const MARCAS_COMPOSTAS = ["LAND ROVER", "ALFA ROMEO", "ASTON MARTIN", "ROLLS ROYCE", "GREAT WALL", "CAOA CHERY", "MERCEDES BENZ", "HARLEY DAVIDSON", "ROYAL ENFIELD", "LYNK & CO"];

/** "Volkswagen T-Cross 1.0" -> marca "Volkswagen", modelo "T-Cross 1.0". */
export function marcaEModelo(descricao: string | null | undefined): { marca: string | null; modelo: string | null } {
  const d = vazio(descricao);
  if (d === null) return { marca: null, modelo: null };
  const normal = semAcento(d).toUpperCase().replace(/-/g, " ");
  const composta = MARCAS_COMPOSTAS.find((m) => normal.startsWith(`${m} `));
  const n = composta === undefined ? 1 : composta.split(" ").length;
  const palavras = d.split(" ");
  return { marca: vazio(palavras.slice(0, n).join(" ")), modelo: vazio(palavras.slice(n).join(" ")) };
}

/**
 * Perguntas e respostas de um questionario: "Pergunta? Resposta" na mesma
 * linha (ou a resposta na linha de baixo), e "Rotulo: valor" quando o rotulo
 * e uma frase. A pergunta pode quebrar em duas linhas ("... na" / "residência?").
 */
export function perguntasERespostas(linhas: readonly string[]): Array<{ pergunta: string; resposta: string }> {
  const out: Array<{ pergunta: string; resposta: string }> = [];
  let acumulada = "";
  for (let i = 0; i < linhas.length; i++) {
    const l = (linhas[i] as string).trim();
    const k = l.indexOf("?");
    if (k < 0) {
      /* Comeco de pergunta que quebra (sem "?" e sem ":"), so se a proxima tem "?". */
      if (!l.includes(":") && /\?/.test(linhas[i + 1] ?? "") && l.length > 10) acumulada = `${acumulada} ${l}`.trim();
      else acumulada = "";
      continue;
    }
    const pergunta = `${acumulada} ${l.slice(0, k + 1)}`.replace(/\s+/g, " ").trim();
    acumulada = "";
    let resposta = l.slice(k + 1).trim();
    if (resposta.length === 0) {
      const prox = (linhas[i + 1] ?? "").trim();
      if (prox.length > 0 && !prox.includes("?") && prox.length < 80) {
        resposta = prox;
        i++;
      }
    }
    if (resposta.length > 0) out.push({ pergunta, resposta });
  }
  return out;
}

/** Os trechos de uma linha (palavras separadas por vao largo = colunas). */
export function trechosDaLinha(l: LinhaPosicionada, vao = 0.9): Array<{ texto: string; x: number; xf: number }> {
  const out: Array<{ texto: string; x: number; xf: number }> = [];
  const tam = l.tamanho > 0 ? l.tamanho : 8;
  for (const w of l.palavras) {
    const ult = out[out.length - 1];
    if (ult !== undefined && w.x - ult.xf < vao * tam) {
      ult.texto += ` ${w.texto}`;
      ult.xf = w.xf;
    } else out.push({ texto: w.texto, x: w.x, xf: w.xf });
  }
  return out;
}

/**
 * Quadro de pares em grade: uma linha de ROTULOS e a de baixo com os VALORES,
 * casados pela coluna (trecho de rotulo com o trecho de valor mais proximo
 * pelo inicio). Varre `linhas` e devolve rotulo -> valor de todas as grades.
 */
export function gradeDeRotulos(linhas: readonly LinhaPosicionada[], ehValor: (l: LinhaPosicionada) => boolean): Map<string, string> {
  const out = new Map<string, string>();
  for (let i = 0; i + 1 < linhas.length; i++) {
    const cab = linhas[i] as LinhaPosicionada;
    const val = linhas[i + 1] as LinhaPosicionada;
    if (!ehValor(val) || ehValor(cab)) continue;
    const rs = trechosDaLinha(cab);
    const vs = trechosDaLinha(val);
    for (const v of vs) {
      let melhor: (typeof rs)[number] | null = null;
      for (const r of rs) if (r.x <= v.x + cab.tamanho * 2 && (melhor === null || r.x > melhor.x)) melhor = r;
      if (melhor !== null && !out.has(melhor.texto)) out.set(melhor.texto, v.texto);
    }
  }
  return out;
}
