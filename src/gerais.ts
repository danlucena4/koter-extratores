/**
 * DADOS GERAIS de RESIDENCIAL e VIDA: as pecas comuns aos leitores de cada
 * cia (`<cia>-residencial.ts`, `<cia>-vida.ts`), que leem o que o quadro do
 * leitor nao le (vigencia inteira, proposta, emissao, produto, tipo do
 * seguro, apolice renovada, premios, pagamento, franquias, contatos do
 * segurado, campos proprios do ramo), e a JUNCAO disso com o que o leitor
 * leu (`comGerais`: o do leitor vence campo a campo).
 *
 * So o que esta IMPRESSO; o que a cia nao imprime (ou imprime de um jeito
 * que nao da para separar sem chute) fica nulo.
 */
import { camposDaLinha, chaveDeTexto, digitos, dinheiro, semAcento, vazio } from "./leitura.js";
import {
  cobertura,
  pessoaCom,
  pessoaVazia,
  residencialVazio,
  vidaVazia,
  type CoberturaExtraida,
  type DocumentoExtraido,
  type FranquiaExtraida,
  type PessoaExtraida,
  type ResidencialExtraido,
  type VidaExtraida,
} from "./modelo.js";
import { dinheiroPtBr, type ItemDeCobertura } from "./tabela.js";
import type { DataCia, Dinheiro } from "./tipos.js";

export interface DadosGerais {
  produto: string | null;
  emissao: DataCia | null;
  renovacao_de: DocumentoExtraido["renovacao_de"];
  tipo_seguro: string | null;
  proposta: string | null;
  item: string | null;
  vigencia_inicio: DataCia | null;
  vigencia_fim: DataCia | null;
  premio_liquido: Dinheiro | null;
  premio_total: Dinheiro | null;
  pagamento: DocumentoExtraido["pagamento"];
  franquias: FranquiaExtraida[];
  clausulas: string[];
  assistencias: string[];
  segurado: Partial<PessoaExtraida>;
  residencial: Partial<ResidencialExtraido>;
  vida: Partial<VidaExtraida>;
}

export const geraisVazios = (): DadosGerais => ({
  produto: null,
  emissao: null,
  renovacao_de: null,
  tipo_seguro: null,
  proposta: null,
  item: null,
  vigencia_inicio: null,
  vigencia_fim: null,
  premio_liquido: null,
  premio_total: null,
  pagamento: null,
  franquias: [],
  clausulas: [],
  assistencias: [],
  segurado: {},
  residencial: {},
  vida: {},
});

/* ------------------------------------------------------------- pecas */

const MESES: Readonly<Record<string, string>> = {
  JANEIRO: "01", FEVEREIRO: "02", MARCO: "03", ABRIL: "04", MAIO: "05", JUNHO: "06",
  JULHO: "07", AGOSTO: "08", SETEMBRO: "09", OUTUBRO: "10", NOVEMBRO: "11", DEZEMBRO: "12",
};

/** "15 de Julho de 2026" (local e data da assinatura) -> DataCia. */
export function dataPorExtenso(v: string | null | undefined): DataCia | null {
  const m = /(\d{1,2})\s+de\s+([A-Za-zÀ-ú]+)\s+de\s+(\d{4})/.exec(v ?? "");
  if (m === null) return null;
  const mes = MESES[semAcento(m[2] as string).toUpperCase()];
  const dia = Number(m[1]);
  if (mes === undefined || dia < 1 || dia > 31) return null;
  return { iso: `${m[3]}-${mes}-${String(dia).padStart(2, "0")}`, original: m[0] };
}

/** Um telefone so ("(0071)992211473", "5571991980989", "71 21059154"): digitos com DDD. */
export function telefone(v: string | null | undefined): string | null {
  let d = digitos(v);
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  d = d.replace(/^0+/, "");
  return (d.length === 10 || d.length === 11) && !/^(\d)\1+$/.test(d) ? d : null;
}
export const fones = (...vs: Array<string | null | undefined>): string[] => [...new Set(vs.map(telefone).filter((t): t is string => t !== null))];

export const pagamento = (forma: string | null, parcelas: number | null): DocumentoExtraido["pagamento"] =>
  forma === null && parcelas === null ? null : { forma, parcelas };

/**
 * O numero de parcelas pela GRADE de parcelas ("01 R$ 70,39 20/07/2026 03 R$ ...",
 * "01ª 520,02 15/10/2026", "1 14/02/2026 86,91 5 ..."): a maior parcela, so
 * quando todas de 1 ate ela aparecem.
 */
export function parcelasDaGrade(linhas: readonly string[]): number | null {
  const vistos = new Set<number>();
  for (const l of linhas) {
    for (const m of l.matchAll(/(?:^|\s)(\d{1,2})ª?\s+(?:\d{2}\/\d{2}\/\d{4}\s+)?(?:R\$\s*)?\d[\d.]*,\d{2}\b/g)) vistos.add(Number(m[1]));
  }
  const maior = Math.max(0, ...vistos);
  if (maior === 0) return null;
  for (let k = 1; k <= maior; k++) if (!vistos.has(k)) return null;
  return maior;
}


/**
 * Participacoes obrigatorias impressas ENTREMEADAS com o nome da cobertura (o
 * nome quebra em volta do texto da franquia, Porto e Tokio):
 *
 *   INCÊNDIO, EXPLOSÃO, IMPLOSÃO, FUMAÇA E / Não há / QUEDA DE AERONAVE
 *   10% das indenizações com mínimo de / VAZAMENTO DE TANQUES / R$1.000,00.
 *
 * Os nomes (o texto sem as franquias) tem de formar, em sequencia, coberturas
 * conhecidas da tabela; cada franquia e da cobertura da ultima palavra de
 * nome lida ate o FIM dela. Se algum trecho nao casa com cobertura, `[]`.
 */
export function franquiasEntremeadas(bloco: readonly string[], coberturas: readonly string[], valor: RegExp): FranquiaExtraida[] {
  const texto = bloco.map((l) => l.trim()).filter((l) => l.length > 0).join(" ");
  const achadas = [...texto.matchAll(new RegExp(valor.source, "gid"))];
  if (achadas.length === 0) return [];
  /* Palavras de nome, cada uma com a posicao no texto. */
  const nomes: Array<{ palavra: string; fim: number }> = [];
  let corte = 0;
  const lerNomes = (de: string, base: number) => {
    for (const w of de.matchAll(/\S+/g)) {
      const p = chaveDeTexto(w[0]);
      if (p.length > 0) for (const parte of p.split(" ")) nomes.push({ palavra: parte, fim: base + (w.index ?? 0) + w[0].length });
    }
  };
  const valores: Array<{ texto: string; fim: number; minimo: Dinheiro | null }> = [];
  for (const m of achadas) {
    const ini = m.index ?? 0;
    lerNomes(texto.slice(corte, ini), corte);
    /* O "vao" e nome de cobertura que caiu no meio do texto da franquia. */
    const vao = m.groups?.["vao"] ?? "";
    const iVao = vao.length === 0 ? -1 : (m.indices?.groups?.["vao"]?.[0] ?? ini) - ini;
    if (iVao >= 0) lerNomes(vao, ini + iVao);
    const textoFranquia = vazio((iVao >= 0 ? m[0].slice(0, iVao) + m[0].slice(iVao + vao.length) : m[0]).replace(/\.\s*$/, ""));
    valores.push({ texto: textoFranquia ?? m[0], fim: ini + m[0].length, minimo: dinheiro(m.groups?.["minimo"]) });
    corte = ini + m[0].length;
  }
  lerNomes(texto.slice(corte), corte);

  /* Segmenta as palavras de nome em coberturas conhecidas (a mais longa que casa). */
  const conhecidas = coberturas.map((c) => ({ descricao: c, palavras: chaveDeTexto(c).split(" ").filter((w) => w.length > 0) }));
  const dona: number[] = [];
  for (let i = 0; i < nomes.length; ) {
    let melhor = -1;
    let tam = 0;
    conhecidas.forEach((c, k) => {
      const n = c.palavras.length;
      if (n > tam && c.palavras.every((w, j) => nomes[i + j]?.palavra === w)) {
        melhor = k;
        tam = n;
      }
    });
    if (melhor < 0) return [];
    for (let j = 0; j < tam; j++) dona.push(melhor);
    i += tam;
  }
  const out: FranquiaExtraida[] = [];
  const usadas = new Set<number>();
  for (const v of valores) {
    let k = -1;
    nomes.forEach((n, i) => {
      if (n.fim <= v.fim) k = dona[i] ?? -1;
    });
    if (k < 0 || usadas.has(k)) return [];
    usadas.add(k);
    out.push({ descricao: (conhecidas[k] as { descricao: string }).descricao, tipo: v.texto, valor: v.minimo });
  }
  return out;
}

/** "Rotulo : valor" de uma lista de rotulos (o primeiro achado vence). */
export function quadro(linhas: readonly string[], rotulos: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const l of linhas) for (const [k, v] of camposDaLinha(l, rotulos)) if (!out.has(k) && v.trim().length > 0) out.set(k, v.trim());
  return out;
}

/** Linhas "Pergunta?: resposta" / "Pergunta? RESPOSTA" de um bloco. */
export function perguntas(bloco: readonly string[]): Array<{ pergunta: string; resposta: string }> {
  return bloco
    .map((l) => /^(.+\?)\s*:?\s*(\S.*)$/.exec(l.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ pergunta: (m[1] as string).replace(/\s+/g, " ").trim(), resposta: (m[2] as string).trim() }));
}
export const resposta = (rs: ReadonlyArray<{ pergunta: string; resposta: string }>, re: RegExp) => rs.find((r) => re.test(r.pergunta))?.resposta ?? null;

/* ------------------------------------------------------------- juncao */

/** Item da tabela de residencial/vida: o segundo valor da linha e o premio da cobertura. */
export const coberturaComPremio = (i: ItemDeCobertura): CoberturaExtraida => ({ ...cobertura(i), premio: dinheiroPtBr(i.outros_valores[0]) });

/** So os campos com valor (nulo e lista vazia saem), para o "o do leitor vence" campo a campo. */
const semNulos = <T extends object>(o: Partial<T> | null | undefined): Partial<T> =>
  Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0))) as Partial<T>;

/**
 * Junta os DADOS GERAIS ao que o leitor da cia ja leu: o do leitor vence
 * (campo a campo, inclusive no endereco); os gerais preenchem o que ficou
 * nulo. A franquia de cada cobertura vem da lista de franquias pelo nome.
 */
export function comGerais(doc: DocumentoExtraido, g: DadosGerais): DocumentoExtraido {
  const seg = doc.segurado ?? pessoaVazia();
  const gs = g.segurado;
  const juntos = { ...semNulos(gs.endereco ?? {}), ...semNulos(seg.endereco ?? {}) };
  const segurado = pessoaCom({
    ...semNulos(gs),
    ...semNulos(seg),
    telefones: [...seg.telefones, ...(gs.telefones ?? [])],
    endereco: Object.keys(juntos).length === 0 ? null : { cep: null, logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, uf: null, ...juntos },
  });
  const franquias = doc.franquias.length > 0 ? doc.franquias : g.franquias;
  const daCobertura = (c: CoberturaExtraida) => {
    const f = franquias.find((x) => chaveDeTexto(x.descricao) === chaveDeTexto(c.descricao));
    if (f === undefined) return null;
    /* Texto que ja traz o minimo ("10% ... minimo de R$ 600,00") vai como esta; valor + percentual (MAPFRE) vai "500,00 (10%)". */
    if (f.valor !== null && f.tipo !== null && !f.tipo.includes(f.valor.original)) return `${f.valor.original} (${f.tipo})`;
    return f.tipo ?? f.valor?.original ?? null;
  };
  return {
    ...doc,
    produto: doc.produto ?? g.produto,
    emissao: doc.emissao ?? g.emissao,
    renovacao_de: doc.renovacao_de ?? g.renovacao_de,
    tipo_seguro: doc.tipo_seguro ?? g.tipo_seguro,
    proposta: doc.proposta ?? g.proposta,
    item: doc.item ?? g.item,
    vigencia_inicio: doc.vigencia_inicio ?? g.vigencia_inicio,
    vigencia_fim: doc.vigencia_fim ?? g.vigencia_fim,
    premio_liquido: doc.premio_liquido ?? g.premio_liquido,
    premio_total: doc.premio_total ?? g.premio_total,
    pagamento: doc.pagamento ?? g.pagamento,
    franquias,
    clausulas: [...doc.clausulas, ...g.clausulas],
    assistencias: [...doc.assistencias, ...g.assistencias],
    segurado,
    coberturas: doc.coberturas.map((c) => (c.franquia === null ? { ...c, franquia: daCobertura(c) } : c)),
    residencial: doc.residencial === null ? null : { ...residencialVazio(), ...semNulos(g.residencial), ...semNulos(doc.residencial) },
    vida: doc.vida === null ? null : { ...vidaVazia(), ...semNulos(g.vida), ...semNulos(doc.vida) },
  };
}
