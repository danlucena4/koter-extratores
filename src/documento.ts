/**
 * ENTRADA UNICA: recebe o PDF (ou as linhas) de QUALQUER seguradora atendida,
 * reconhece de quem e, de que ramo e que documento e (apolice ou proposta), e
 * devolve tudo o que o documento imprime num formato so (`DocumentoExtraido`).
 *
 *   const doc = extrairDocumento(bytes);                  // reconhece sozinho
 *   const doc = extrairDocumento(bytes, { numero_apolice }); // com trava
 *
 * Reconhecer: a MARCA impressa no comeco do documento (as 40 primeiras linhas;
 * a Allianz cita a "seguradora anterior" mais abaixo e por isso o comeco pesa
 * mais) e a forma do documento de cada cia (rotulos fixos). Sem marca
 * reconhecida, `null`: nunca um palpite de seguradora.
 *
 * Trava: com `numero_apolice`, o documento so e lido quando o numero impresso
 * e esse; sem ela, a trava e o proprio numero impresso (o leitor de cada cia
 * confere que o documento e dele). O que cada leitor nao acha sai nulo.
 */
import { ehApoliceResidencialAllianz, lerApoliceResidencialAllianz } from "./allianz-residencial.js";
import { numeroDoKit } from "./mapfre.js";
import { linhasDoPdf, paginasDoPdf, pedacosDoPdf, type PedacoDeTexto } from "./pdf-texto.js";
import { lerResidencialHdi, lerResidencialMapfre, lerResidencialPorto, lerResidencialTokio, type ResidencialLido } from "./residencial.js";
import { lerVidaAllianz, lerVidaMapfre, lerVidaYelum, type VidaLida } from "./vida.js";
import {
  geraisResidencialAllianz,
  geraisResidencialHdi,
  geraisResidencialMapfre,
  geraisResidencialPorto,
  geraisResidencialTokio,
  geraisVidaAllianz,
  geraisVidaMapfre,
  geraisVidaYelum,
  type DadosGerais,
} from "./gerais.js";
import { dinheiroPtBr, type ItemDeCobertura } from "./tabela.js";

export * from "./modelo.js";
import { achar, digitos, dinheiro, posicionarTexto } from "./leitura.js";
import { lerAutoAllianz, lerEndossoAllianz } from "./allianz-auto.js";
import { lerAutoBradesco } from "./bradesco-auto.js";
import { lerAutoHdi } from "./hdi-auto.js";
import { lerAutoMapfre } from "./mapfre-auto.js";
import { lerPropostaAutoMapfre } from "./mapfre-proposta.js";
import { lerAutoPorto } from "./porto-auto.js";
import { lerAutoTokio } from "./tokio-auto.js";
import { lerAutoYelum } from "./yelum-auto.js";
import { lerAutoZurich } from "./zurich-auto.js";
import type { LinhaPosicionada } from "./pdf/motor.js";
import {
  autoVazio,
  cobertura,
  condutor,
  documentoBase,
  pessoaCom,
  pessoaVazia,
  residencialVazio,
  vidaVazia,
  type CoberturaExtraida,
  type DocumentoExtraido,
  type Identificacao,
  type OpcoesDeExtracao,
  type PessoaExtraida,
  type RamoDoDocumento,
  type Seguradora,
  type TipoDoDocumento,
} from "./modelo.js";

const semZeros = (v: string | null | undefined) => digitos(v).replace(/^0+/, "");

/* ---------------------------------------------------------- reconhecer */

const MARCAS: ReadonlyArray<[Seguradora, RegExp]> = [
  ["aliro", /\bAliro\b|\bALIRO\b/],
  ["yelum", /\bYelum\b|\bYELUM\b/],
  ["mapfre", /MAPFRE/i],
  ["itau", /Ita[uú] Seguros|ITA[UÚ] SEGUROS|Ita[uú] Seguro Auto|Prote[çc][ãa]o Combinada Ita[uú]/i],
  ["azul", /Azul Seguros|AZUL SEGUROS|Azul Companhia/i],
  ["porto", /Porto Seguro|PORTO SEGURO|Porto Resid[êe]ncia|\bPorto\b.*\bapólice\b/],
  ["allianz", /Allianz/i],
  ["hdi", /HDI SEGUROS|HDI Seguros/],
  ["tokio", /Tokio Marine|TOKIO MARINE/i],
  ["bradesco", /Bradesco (?:Auto|Seguro|Seguros)|BRADESCO (?:AUTO|SEGUROS)/i],
  ["zurich", /Zurich|ZURICH/],
];

/** CNPJs das seguradoras vistos impressos nos PDFs (amostra 2026-10-20). */
const CNPJS: ReadonlyArray<[Seguradora, string]> = [
  ["mapfre", "61.074.175/0001-38"],
  ["porto", "61.198.164/0001-60"],
  ["bradesco", "92.682.038/0001-00"],
  ["zurich", "17.197.385/0001-21"],
  ["yelum", "61.550.141/0001-72"],
  ["hdi", "29.980.158/0051-16"],
];

/** A seguradora pela marca (comeco do documento pesa 3x) e pelo CNPJ. */
export function seguradoraDoDocumento(linhas: readonly string[]): { seguradora: Seguradora; sinais: string[] } | null {
  const pontos = new Map<Seguradora, number>();
  const sinais = new Map<Seguradora, string[]>();
  const somar = (s: Seguradora, p: number, sinal: string) => {
    pontos.set(s, (pontos.get(s) ?? 0) + p);
    sinais.set(s, [...(sinais.get(s) ?? []), sinal]);
  };
  const primeira = new Map<Seguradora, number>();
  for (const [s, re] of MARCAS) {
    const idx = linhas.findIndex((l) => re.test(l));
    const emTodo = linhas.filter((l) => re.test(l)).length;
    if (idx < 0) continue;
    primeira.set(s, idx);
    /* A marca no cabecalho (primeiras linhas) pesa mais que a citada depois ("Cia Anterior: YELUM"). */
    if (idx < 8) somar(s, 40, "marca no cabecalho");
    else if (idx < 40) somar(s, 20, "marca no comeco");
    somar(s, Math.min(emTodo, 10), `marca em ${emTodo} linha(s)`);
  }
  for (const [s, cnpj] of CNPJS) if (linhas.some((l) => l.includes(cnpj))) somar(s, 20, `CNPJ ${cnpj}`);
  /* Aliro e marca da Yelum (mesmo CNPJ): com "Aliro" impresso, e Aliro. */
  if ((pontos.get("aliro") ?? 0) >= 20) pontos.delete("yelum");
  /* Itau e Azul saem da Porto e citam a Porto: a marca propria vence. */
  for (const marca of ["itau", "azul"] as const) if ((pontos.get(marca) ?? 0) >= 20) pontos.delete("porto");
  /* Empate: vence a marca que aparece primeiro no documento. */
  const [melhor, segundo] = [...pontos].sort((a, b) => b[1] - a[1] || (primeira.get(a[0]) ?? 1e9) - (primeira.get(b[0]) ?? 1e9));
  /* Sem marca no comeco (Porto Residencial abre so com o nome do produto), basta a marca repetida ou o CNPJ, sem rival. */
  if (melhor === undefined || melhor[1] < 8) return null;
  if (segundo !== undefined && segundo[1] > melhor[1]) return null;
  return { seguradora: melhor[0], sinais: sinais.get(melhor[0]) ?? [] };
}

/** Ramo e tipo pela forma do documento de cada cia. */
function ramoETipo(s: Seguradora, linhas: readonly string[]): { ramo: RamoDoDocumento | null; tipo: TipoDoDocumento | null; sinal: string } {
  const tem = (re: RegExp) => linhas.some((l) => re.test(l));
  const res = (sinal: string) => ({ ramo: "residencial" as const, tipo: "apolice" as const, sinal });
  const vida = (sinal: string) => ({ ramo: "vida" as const, tipo: "apolice" as const, sinal });
  const auto = (sinal: string) => ({ ramo: "auto" as const, tipo: "apolice" as const, sinal });
  switch (s) {
    case "mapfre":
      if (tem(/Proposta de Seguro MAPFRE Auto/i) || (tem(/^Nome do Segurado:.*\bCPF:/i) && tem(/PROPOSTA/))) {
        return { ramo: "auto", tipo: "proposta", sinal: "Proposta de Seguro MAPFRE Auto" };
      }
      if (tem(/MAPFRE RESIDENCIAL/i)) return res("MAPFRE RESIDENCIAL");
      if (tem(/MAPFRE VIDA/i) && tem(/N[ºo°] da Apólice:/i)) return vida("MAPFRE VIDA");
      return auto("apolice MAPFRE (auto)");
    case "allianz":
      if (tem(/Allianz Vida/i)) return vida("Allianz Vida");
      if (ehApoliceResidencialAllianz(linhas)) return res("local segurado + residencia");
      if (tem(/^PROPOSTA\b|Proposta de Seguro/i) && !tem(/N[ºo]\s*Apólice:\s*\d/i)) return { ramo: "auto", tipo: "proposta", sinal: "proposta Allianz" };
      if (tem(/N[ºo]\.?\s*da Apólice Endossada/i)) return { ramo: "auto", tipo: "endosso", sinal: "endosso Allianz" };
      return auto("apolice Allianz (auto)");
    case "porto":
    case "itau":
    case "azul":
      /* A "Proteção Combinada Itaú" tem residência E veículo: e auto (com o bloco residencial junto). */
      if (tem(/^Tipo de resid[êe]ncia:/i) && !tem(/^(Descrição|Dados) do veículo segurado/i)) return res("Tipo de residência");
      return auto("apolice Porto/Itau/Azul (auto)");
    case "hdi":
      if (tem(/Compreensivo Residencial/i)) return res("Compreensivo Residencial");
      if (linhas.slice(0, 6).some((l) => /^Endosso\s+[\d.]+$/.test(l.trim()))) return { ramo: "auto", tipo: "endosso", sinal: "endosso HDI" };
      return auto("apolice HDI (auto)");
    case "tokio":
      if (tem(/Tokio Marine Residencial/i)) return res("Tokio Marine Residencial");
      return auto("Tokio Marine Auto");
    case "yelum":
    case "aliro":
      if (tem(/Apólice - Ramo \d+ Vida/i)) return vida("Ramo Vida");
      return auto("apolice Yelum/Aliro (auto)");
    case "bradesco":
      return auto("Bradesco Seguro Auto");
    case "zurich":
      return auto("Zurich auto");
  }
}

/** O numero da apolice como impresso, por cia e ramo (so digitos). */
export function numeroImpresso(s: Seguradora, ramo: RamoDoDocumento | null, linhas: readonly string[]): string | null {
  const d = (v: string | null) => {
    const x = digitos(v);
    return x.length >= 5 ? x : null;
  };
  switch (s) {
    case "mapfre":
      if (ramo === "residencial") return d(achar(linhas, /N[ºo°]\s*Apólice\s*:\s*([\d\s]+)/));
      if (ramo === "vida") return d(achar(linhas, /N[ºo°] da Apólice:\s*(\d+)/i));
      return numeroDoKit(linhas) ?? d(achar(linhas.slice(0, 40), /N[ºo°]\s*Apólice:\s*([\d ]+?)(?:\s+[A-Za-z].*)?$/i));
    case "allianz": {
      /* Endosso: "Nº. da Apólice Endossada:" com o numero na mesma linha ou na de baixo. */
      const i = linhas.findIndex((l) => /N[ºo°]\.?\s*da Apólice Endossada/i.test(l));
      const endossada = i < 0 ? null : (/(\d{10,})/.exec(`${linhas[i]} ${linhas[i + 1] ?? ""}`)?.[1] ?? null);
      return d(endossada ?? achar(linhas, /N[ºo°]\.?\s*(?:da\s+)?Apólice\s*(?:N[ºo°]\.?)?\s*:\s*(\d{10,})/i));
    }
    case "porto":
    case "itau":
    case "azul": {
      const m = linhas.map((l) => /(?:Ap[oó]lice:\s*)?((?:\d+\s+)+\d+)\s+Item:/i.exec(l)?.[1]).find((x) => x !== undefined);
      if (m !== undefined) return d(m.trim().split(/\s+/).pop() ?? null);
      const r = achar(linhas, /N[uú]mero da ap[oó]lice:\s*([\d ]+?)(?:\s+(?:Ramo|N[uú]mero)\b.*)?$/i);
      return d((r ?? "").trim().split(/\s+/).pop() ?? null);
    }
    case "hdi":
      /* "Apólice 00.000.000.000000"; endosso "Endosso 00.000.000.000000.000000" (a apolice sao os 4 primeiros grupos). */
      return d((achar(linhas, /^(?:Apólice|Endosso)\s+([\d.]+)$/) ?? "").split(".").slice(0, 4).join(""));
    case "tokio":
      return d(achar(linhas, /Apólice\s*n[ºo°]\s*(\d{5,})\s*-\s*RESIDENCIAL/i) ?? achar(linhas, /\bApólice:\s*(\d{5,})\b/));
    case "yelum":
    case "aliro": {
      const i = linhas.findIndex((l) => /Endosso\s+N\S*\s+do\s+Contrato/i.test(l));
      /* Auto: o numero na linha de baixo; vida: algumas linhas abaixo (depois do "Apólice" e do contrato). */
      const auto =
        i < 0 ? null : (linhas.slice(i + 1, i + 5).map((l) => /^(\d{2}\.\d{2}\.\d{4}\.\d{5,9})/.exec(l.trim())?.[1]).find((x) => x !== undefined) ?? null);
      if (auto !== null) return d(auto);
      return d(achar(linhas, /\bApólice:\s*([\d.]+)/));
    }
    case "bradesco": {
      /* "Dados da sua apólice Número da apólice 0000.000.0000.000000 Item ..." (sucursal.ramo.cia.apolice), rotulo e valor em linhas separadas. */
      const i = linhas.findIndex((l) => /^N[úu]mero da ap[óo]lice\b/i.test(l));
      const alvo = [linhas[i] ?? "", linhas[i + 1] ?? ""].join(" ");
      const m = /(\d+\s*\.\s*\d+\s*\.\s*\d+\s*\.\s*\d+)/.exec(alvo)?.[1] ?? null;
      const partes = (m ?? "").split(".").map((p) => p.trim());
      return d(partes.length >= 4 ? (partes[3] ?? null) : null);
    }
    case "zurich":
      return d(achar(linhas, /\bApólice:\s*(\d{5,})\b/));
  }
}

export function identificarDocumento(linhas: readonly string[]): Identificacao | null {
  const s = seguradoraDoDocumento(linhas);
  if (s === null) return null;
  const rt = ramoETipo(s.seguradora, linhas);
  const proposta = rt.tipo === "proposta" ? numeroDaProposta(s.seguradora, linhas) : null;
  return {
    seguradora: s.seguradora,
    ramo: rt.ramo,
    tipo: rt.tipo,
    numero_apolice: rt.tipo === "proposta" ? null : numeroImpresso(s.seguradora, rt.ramo, linhas),
    numero_proposta: proposta,
    sinais: [...s.sinais, rt.sinal],
  };
}

/** O numero da PROPOSTA impresso ("Proposta:000", "Nº da Proposta: 000"). */
function numeroDaProposta(s: Seguradora, linhas: readonly string[]): string | null {
  const re = s === "mapfre" ? /^Proposta:\s*(\d{6,})/ : /N[ºo°]\.?\s*(?:da\s+)?Proposta\s*:\s*(\d{6,})/i;
  const n = linhas.map((l) => re.exec(l)?.[1]).find((x) => x !== undefined);
  return n === undefined ? null : n;
}

/* ------------------------------------------------------------ extrair */

/** Item da tabela de residencial/vida: o segundo valor da linha e o premio da cobertura. */
const coberturaComPremio = (i: ItemDeCobertura): CoberturaExtraida => ({ ...cobertura(i), premio: dinheiroPtBr(i.outros_valores[0]) });

function deResidencial(doc: DocumentoExtraido, r: ResidencialLido): DocumentoExtraido {
  return {
    ...doc,
    segurado: pessoaCom({ nome: r.segurado_nome, documento: r.segurado_documento, endereco: r.segurado_endereco }),
    coberturas: r.coberturas.map(coberturaComPremio),
    assistencias: r.assistencia === null ? [] : [r.assistencia],
    residencial: {
      ...residencialVazio(),
      imovel: r.imovel,
      tipo_imovel: r.tipo_imovel,
      ocupacao: r.ocupacao,
      condominio_fechado: r.condominio_fechado,
      lmi_basica: r.lmi_basica,
    },
  };
}

function deVida(doc: DocumentoExtraido, v: VidaLida): DocumentoExtraido {
  return {
    ...doc,
    vigencia_fim: v.vigencia_fim,
    segurado: pessoaCom({
      nome: v.segurado_nome,
      documento: v.segurado_documento,
      nascimento: v.segurado_nascimento,
      sexo: v.segurado_sexo,
      estado_civil: v.segurado_estado_civil,
      profissao: v.profissao,
      renda: v.renda,
      endereco: v.segurado_endereco,
    }),
    coberturas: v.coberturas.map(coberturaComPremio),
    assistencias: v.assistencias,
    vida: { ...vidaVazia(), renda: v.renda, capital_morte: v.capital_morte },
  };
}

const semNulos = <T extends object>(o: Partial<T> | null | undefined): Partial<T> =>
  Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0))) as Partial<T>;
const normaNome = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

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
    const f = franquias.find((x) => normaNome(x.descricao) === normaNome(c.descricao));
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

/** O leitor da cia, ja com a trava (numero impresso ou o pedido). */
function lerPelaCia(
  doc: DocumentoExtraido,
  pos: readonly LinhaPosicionada[],
  pedacos: () => PedacoDeTexto[][],
  numero: string,
): DocumentoExtraido | null {
  const linhas = pos.map((l) => l.texto);
  const s = doc.seguradora;
  void pedacos;
  if (doc.ramo === "residencial") {
    const r =
      s === "mapfre" ? lerResidencialMapfre(linhas, numero)
      : s === "hdi" ? lerResidencialHdi(linhas)
      : s === "tokio" ? lerResidencialTokio(linhas, numero)
      : s === "porto" || s === "itau" || s === "azul" ? lerResidencialPorto(linhas, numero)
      : null;
    if (r !== null) {
      const nomes = r.coberturas.map((c) => c.descricao);
      const g =
        s === "mapfre" ? geraisResidencialMapfre(linhas)
        : s === "hdi" ? geraisResidencialHdi(linhas)
        : s === "tokio" ? geraisResidencialTokio(linhas, nomes)
        : geraisResidencialPorto(linhas, nomes);
      return comGerais(deResidencial(doc, r), g);
    }
    if (s === "allianz") {
      const a = lerApoliceResidencialAllianz(linhas, numero);
      if (a === null) return null;
      const lido: DocumentoExtraido = {
        ...doc,
        vigencia_fim: a.vigencia_fim,
        segurado: pessoaCom({ nome: a.segurado_nome, documento: a.segurado_documento, endereco: a.segurado_endereco }),
        coberturas: a.coberturas.map((c) => ({ descricao: c.descricao, valor: c.lmi, limite: null, premio: c.premio, franquia: c.franquia })),
        franquias: a.coberturas
          .filter((c) => c.franquia !== null)
          .map((c) => ({ descricao: c.descricao, tipo: c.franquia, valor: dinheiro(/R\$\s*([\d.]+,\d{2})/.exec(c.franquia ?? "")?.[1]) })),
        assistencias: a.assistencia === null ? [] : [a.assistencia],
        residencial: { ...residencialVazio(), imovel: a.imovel, tipo_imovel: a.tipo_residencia, ocupacao: a.ocupacao, lmi_basica: a.lmi_basica },
      };
      return comGerais(lido, geraisResidencialAllianz(linhas));
    }
    return null;
  }
  if (doc.ramo === "vida") {
    const v =
      s === "mapfre" ? lerVidaMapfre(linhas, numero)
      : s === "allianz" ? lerVidaAllianz(linhas, numero)
      : s === "yelum" || s === "aliro" ? lerVidaYelum(linhas, numero)
      : null;
    if (v === null) return null;
    const g = s === "mapfre" ? geraisVidaMapfre(linhas) : s === "allianz" ? geraisVidaAllianz(pos) : geraisVidaYelum(pos);
    return comGerais(deVida(doc, v), g);
  }
  if (doc.ramo !== "auto" || doc.tipo === "proposta") return null;
  if (doc.tipo === "endosso" && s === "allianz") return lerEndossoAllianz(doc, linhas, numero);

  switch (s) {
    case "mapfre":
      return lerAutoMapfre(doc, pos, numero);
    case "yelum":
    case "aliro":
      return lerAutoYelum(doc, pos, numero);
    case "allianz":
      return lerAutoAllianz(doc, linhas, numero);
    case "porto":
    case "itau":
    case "azul":
      return lerAutoPorto(doc, linhas, numero);
    case "bradesco":
      return lerAutoBradesco(doc, pos, numero);
    case "zurich":
      return lerAutoZurich(doc, pos, numero);
    case "tokio":
      return lerAutoTokio(doc, pos, numero);
    case "hdi":
      return lerAutoHdi(doc, pos, numero);
  }
}

/**
 * Le o documento de qualquer cia atendida. `null` quando a cia nao e
 * reconhecida, ou quando ha trava e o numero impresso nao e o pedido.
 */
export function extrairDocumento(entrada: Uint8Array | readonly string[], opcoes: OpcoesDeExtracao = {}): DocumentoExtraido | null {
  const bytes = entrada instanceof Uint8Array ? entrada : null;
  const pos = bytes !== null ? paginasDoPdf(bytes).flat() : posicionarTexto(entrada as readonly string[]);
  const linhas = pos.length > 0 ? pos.map((l) => l.texto) : bytes !== null ? linhasDoPdf(bytes) : [];
  const id = identificarDocumento(linhas);
  if (id === null) return null;
  if (id.tipo === "proposta") {
    /* Proposta: trava pelo numero da proposta ou pelo CPF do segurado; sem trava, o numero impresso. */
    const trava = {
      proposta: opcoes.numero_proposta ?? (opcoes.cpf_segurado ? null : (id.numero_proposta ?? null)),
      cpf: opcoes.cpf_segurado ?? null,
    };
    const doc = documentoBase(id);
    const p = bytes !== null || pos.length > 0 ? pos : posicionarTexto(linhas);
    if (id.seguradora === "mapfre") {
      const r = lerPropostaAutoMapfre(doc, p, trava);
      return r === null ? null : acabamento(r);
    }
    if (id.seguradora === "allianz") {
      if (trava.proposta === null) return null;
      const r = lerAutoAllianz(doc, p.map((l) => l.texto), trava.proposta);
      if (r === null) return null;
      if (trava.cpf !== null && r.segurado?.documento !== digitos(trava.cpf)) return null;
      return acabamento({ ...r, proposta: r.proposta ?? trava.proposta });
    }
    return doc;
  }
  const pedido = semZeros(opcoes.numero_apolice);
  if (pedido.length > 0 && id.numero_apolice !== null && semZeros(id.numero_apolice) !== pedido) return null;
  const numero = pedido.length > 0 ? digitos(opcoes.numero_apolice) : (id.numero_apolice ?? "");
  const doc = documentoBase(id);
  if (numero.length === 0 && id.seguradora !== "hdi") return doc;
  let cache: PedacoDeTexto[][] | null = null;
  const pedacos = () => (cache ??= bytes === null ? [] : pedacosDoPdf(bytes));
  const lido = lerPelaCia(doc, pos.length > 0 ? pos : posicionarTexto(linhas), pedacos, numero);
  return lido === null ? doc : acabamento(lido);
}

const COMBUSTIVEL_NA_DESCRICAO = /\b(FLEX|GASOLINA|DIESEL|[ÁA]LCOOL|ETANOL|EL[ÉE]TRICO|H[ÍI]BRIDO|BI-COMBUSTIVEL)\b/i;

/**
 * Acabamento comum a todas as cias, so com o que esta IMPRESSO: combustivel
 * pela descricao do veiculo ("... 1.0 Flex") quando o quadro nao traz, listas
 * sem repeticao.
 */
export function acabamento(doc: DocumentoExtraido): DocumentoExtraido {
  const unicos = (l: string[]) => [...new Set(l.map((x) => x.trim()).filter((x) => x.length > 0))];
  let auto = doc.auto;
  if (auto !== null && auto.veiculo.combustivel === null) {
    const c = COMBUSTIVEL_NA_DESCRICAO.exec(auto.veiculo.descricao ?? auto.veiculo.modelo ?? "")?.[1] ?? null;
    if (c !== null) auto = { ...auto, veiculo: { ...auto.veiculo, combustivel: c.toUpperCase() } };
  }
  return {
    ...doc,
    auto,
    assistencias: unicos(doc.assistencias),
    clausulas: unicos(doc.clausulas),
    segurado: doc.segurado === null ? null : { ...doc.segurado, telefones: unicos(doc.segurado.telefones) },
  };
}
