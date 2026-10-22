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
import { documentoResidencialAllianz, ehApoliceResidencialAllianz } from "./allianz-residencial.js";
import { numeroDoKit } from "./mapfre.js";
import { linhasDoPdf, paginasDoPdf } from "./pdf-texto.js";
import { documentoResidencialHdi } from "./hdi-residencial.js";
import { documentoResidencialMapfre } from "./mapfre-residencial.js";
import { documentoResidencialPorto } from "./porto-residencial.js";
import { documentoResidencialTokio } from "./tokio-residencial.js";
import { documentoVidaAllianz } from "./allianz-vida.js";
import { documentoVidaMapfre } from "./mapfre-vida.js";
import { documentoVidaYelum } from "./yelum-vida.js";

export * from "./modelo.js";
import { achar, digitos, posicionarTexto } from "./leitura.js";
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
  documentoBase,
  type DocumentoExtraido,
  type Identificacao,
  type OpcoesDeExtracao,
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
/**
 * O numero do ENDOSSO impresso em residencial e vida: "Nº Endosso: 1" /
 * "Nº. do Endosso: 1" (Allianz, no rodape de cada pagina), "Endosso: 00000"
 * (MAPFRE, zero na apolice), "Endosso nº: 1" (Porto), "Endosso 00.000..." no
 * cabecalho (HDI). Sem rotulo, `null`.
 */
export function numeroDoEndosso(linhas: readonly string[]): number | null {
  for (const l of linhas) {
    const m = /(?:N[ºo°]\.?\s*(?:do\s+)?Endosso|^Endosso\s+n[ºo°]|\bEndosso)\s*:\s*(\d{1,6})\b/i.exec(l);
    if (m !== null) return Number(m[1]);
  }
  return linhas.slice(0, 6).some((l) => /^Endosso\s+[\d.]+$/.test(l.trim())) ? 1 : null;
}

function ramoETipo(s: Seguradora, linhas: readonly string[]): { ramo: RamoDoDocumento | null; tipo: TipoDoDocumento | null; sinal: string } {
  const tem = (re: RegExp) => linhas.some((l) => re.test(l));
  /* Residencial e vida: endosso quando o documento imprime o numero do endosso maior que zero. */
  const endosso = numeroDoEndosso(linhas);
  const tipoRv = endosso !== null && endosso > 0 ? ("endosso" as const) : ("apolice" as const);
  /* O titulo do endosso, quando impresso no cabecalho ("ENDOSSO DE CANCELAMENTO CANC.APO.FALTA DE PAGAMENTO"). */
  const titulo = linhas.slice(0, 5).map((l) => /^(ENDOSSO DE\s+.+)$/i.exec(l.trim())?.[1]).find((x) => x !== undefined);
  const comEndosso = (sinal: string) => (tipoRv === "endosso" ? `${sinal}; endosso ${endosso}${titulo === undefined ? "" : ` (${titulo})`}` : sinal);
  const res = (sinal: string) => ({ ramo: "residencial" as const, tipo: tipoRv, sinal: comEndosso(sinal) });
  const vida = (sinal: string) => ({ ramo: "vida" as const, tipo: tipoRv, sinal: comEndosso(sinal) });
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

/** O leitor da cia, ja com a trava (numero impresso ou o pedido). */
function lerPelaCia(doc: DocumentoExtraido, pos: readonly LinhaPosicionada[], numero: string): DocumentoExtraido | null {
  const linhas = pos.map((l) => l.texto);
  const s = doc.seguradora;
  if (doc.ramo === "residencial") {
    switch (s) {
      case "mapfre":
        return documentoResidencialMapfre(doc, pos, numero);
      case "hdi":
        return documentoResidencialHdi(doc, pos);
      case "tokio":
        return documentoResidencialTokio(doc, pos, numero);
      case "porto":
      case "itau":
      case "azul":
        return documentoResidencialPorto(doc, pos, numero);
      case "allianz":
        return documentoResidencialAllianz(doc, pos, numero);
      default:
        return null;
    }
  }
  if (doc.ramo === "vida") {
    switch (s) {
      case "mapfre":
        return documentoVidaMapfre(doc, pos, numero);
      case "allianz":
        return documentoVidaAllianz(doc, pos, numero);
      case "yelum":
      case "aliro":
        return documentoVidaYelum(doc, pos, numero);
      default:
        return null;
    }
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
  const lido = lerPelaCia(doc, pos.length > 0 ? pos : posicionarTexto(linhas), numero);
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
