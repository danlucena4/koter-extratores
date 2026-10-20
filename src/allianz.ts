/**
 * A APOLICE DA ALLIANZ EM PDF -> dados para renovar (auto).
 *
 * Por que o PDF: o detalhe da carteira da Allianz sai da tela de
 * inadimplencia, que so acha apolice com parcela em atraso, e o painel
 * "Apolices a renovar" nao traz o bem nem o endereco. O PDF da apolice
 * (modelo 9241, o mesmo que "Documentos" ja baixa) traz o quadro inteiro.
 *
 * Evidencia: `capture/captures/allianz/019_session_resume` seq 0976
 * (`getDetail` tipoDoc "I", 2.427.185 bytes, OpenText Exstream, 8 paginas).
 * Os rotulos do quadro de dados, na ordem da pagina 1:
 *   Nº Apolice | Segurado | CPF/CNPJ, Tel, E-mail | Endereco
 *   (condutor principal) Nome, CPF | Idade | Estado Civil
 *   Vigencia, Apolice Nº. | Tipo de Seguro, Proposta Nº. | Veiculo
 *   Cod. FIPE, Ramo | Placa, Produto | Chassi, Versao | Zero Km
 *   Ano/Modelo, Classe Bonus | Categoria de Risco | Finalidade de Uso, Cod. CI
 *   CEP Pernoite | Kit gas | Nº. Apolice Anterior | Seguradora Anterior
 * Formas medidas (valores trocados por classe de caractere):
 *   Endereco: "a. aaaaaaaa, 000, aa 000 aa aaaaaa - aaaaaa - aaaaaaaa/aa - 00000000"
 *   Cod. FIPE: "000000-0"; Ramo: "00 - aaaaaaaaa"; Placa: "aaa0a00"
 *   Ano/Modelo: "0000"; CEP Pernoite: "00000-000"; Cod. CI: 14 digitos.
 * O PDF NAO traz data de nascimento (so a idade do condutor).
 *
 * Leitura por ROTULO: cada linha e partida nos rotulos conhecidos, e o valor
 * de um rotulo vai ate o proximo. Rotulo que aparece duas vezes (CPF do
 * segurado e do condutor, Cod. CI) e lido pela ordem.
 */

import type { DataCia } from "./tipos.js";
import type { EnderecoLido as EnderecoParaRenovar } from "./tipos.js";

/** Os rotulos do quadro, o mais longo primeiro (para "CPF/CNPJ" ganhar de "CPF"). */
export const ROTULOS_DA_APOLICE = [
  "Fim da vigência anterior",
  "Veículo Igual ao Anterior",
  "Nº. Apólice Anterior",
  "Seguradora Anterior",
  "Finalidade de Uso",
  "Categoria de Risco",
  "Condições Gerais",
  "Tipo de Seguro",
  "Estado Civil",
  "Classe Bônus",
  "CEP Pernoite",
  "Apólice Nº.",
  "Proposta Nº.",
  "Nº Apólice",
  "Emissão",
  "Ano/Modelo",
  "Cód. FIPE",
  "CPF/CNPJ",
  "Segurado",
  "Endereço",
  "Vigência",
  "Cód. CI",
  "Zero Km",
  "Kit gás",
  "Veículo",
  "Produto",
  "Chassi",
  "Versão",
  "E-mail",
  "Idade",
  "Grupo",
  "Placa",
  "Nome",
  "Ramo",
  "CPF",
  "Tel",
] as const;
export type RotuloDaApolice = (typeof ROTULOS_DA_APOLICE)[number];

function escapar(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

const PADRAO_ROTULO = new RegExp(`(?:^|\\s)(${ROTULOS_DA_APOLICE.map(escapar).join("|")})\\s*:`, "g");

/**
 * Os valores de cada rotulo, na ordem em que aparecem. So a PRIMEIRA pagina
 * tem o quadro; as outras (condicoes, coberturas) repetem palavras soltas,
 * entao a leitura para no primeiro "Seguradora Anterior" ou depois de 120 linhas.
 */
export function camposDoQuadro(linhas: readonly string[]): Map<RotuloDaApolice, string[]> {
  const campos = new Map<RotuloDaApolice, string[]>();
  const limite = Math.min(linhas.length, 120);
  for (let i = 0; i < limite; i++) {
    const linha = linhas[i] as string;
    const achados: Array<{ rotulo: RotuloDaApolice; ini: number; fim: number }> = [];
    PADRAO_ROTULO.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PADRAO_ROTULO.exec(linha)) !== null) {
      const rotulo = m[1] as RotuloDaApolice;
      achados.push({ rotulo, ini: m.index, fim: m.index + m[0].length });
    }
    for (const [k, a] of achados.entries()) {
      const prox = achados[k + 1];
      const valor = linha.slice(a.fim, prox === undefined ? undefined : prox.ini).trim();
      if (valor.length === 0) continue;
      campos.set(a.rotulo, [...(campos.get(a.rotulo) ?? []), valor]);
    }
  }
  return campos;
}

const primeiro = (c: Map<RotuloDaApolice, string[]>, r: RotuloDaApolice): string | null => c.get(r)?.[0] ?? null;
const digitos = (v: string | null): string => (v ?? "").replace(/\D/g, "");

/** `dd/MM/yyyy` dentro de um texto, na ordem. */
export function datasDoTexto(v: string | null): DataCia[] {
  if (v === null) return [];
  return [...v.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)].map((m) => ({ iso: `${m[3]}-${m[2]}-${m[1]}`, original: m[0] }));
}

/**
 * `"R. FULANO, 123, AP 101 - BAIRRO - CIDADE/UF - 01234567"`.
 * Partes separadas por " - "; a primeira e "logradouro, numero[, complemento]".
 */
export function enderecoDaApolice(v: string | null): EnderecoParaRenovar | null {
  if (v === null) return null;
  const partes = v.split(/\s+-\s+/).map((p) => p.trim()).filter(Boolean);
  if (partes.length === 0) return null;
  const cepBruto = digitos(partes[partes.length - 1] ?? "");
  const cep = cepBruto.length === 8 ? cepBruto : null;
  const semCep = cep === null ? partes : partes.slice(0, -1);
  const [rua = "", bairro = null, cidadeUf = null] = semCep;
  const pedacosRua = rua.split(/\s*,\s*/).filter(Boolean);
  const logradouro = pedacosRua[0] ?? null;
  const numero = pedacosRua[1] ?? null;
  const complemento = pedacosRua.slice(2).join(", ") || null;
  const mUf = cidadeUf === null ? null : /^(.*?)\s*\/\s*([A-Za-z]{2})$/.exec(cidadeUf);
  return {
    cep,
    logradouro: logradouro && logradouro.length > 0 ? logradouro : null,
    numero: numero && numero.length > 0 ? numero : null,
    complemento,
    bairro: bairro && bairro.length > 0 ? bairro : null,
    cidade: mUf ? mUf[1]!.trim() || null : cidadeUf,
    uf: mUf ? mUf[2]!.toUpperCase() : null,
  };
}

/** `"VW - GOL 1.0 FLEX"` ou `"VW GOL 1.0"` -> marca e modelo (leitura nossa). */
export function marcaEModelo(v: string | null): { marca: string | null; modelo: string | null } {
  if (v === null) return { marca: null, modelo: null };
  const comTraco = /^([^-]+?)\s+-\s+(.+)$/.exec(v);
  if (comTraco) return { marca: comTraco[1]!.trim(), modelo: comTraco[2]!.trim() };
  const [marca, ...resto] = v.split(/\s+/);
  return { marca: marca ?? null, modelo: resto.join(" ") || null };
}

/** `"2021"` ou `"2020/2021"` -> fabricacao e modelo. Um ano so = ano modelo. */
export function anosDaApolice(v: string | null): { fabricacao: number | null; modelo: number | null } {
  const anos = [...(v ?? "").matchAll(/\b(19|20)\d{2}\b/g)].map((m) => Number(m[0]));
  if (anos.length >= 2) return { fabricacao: anos[0]!, modelo: anos[1]! };
  if (anos.length === 1) return { fabricacao: null, modelo: anos[0]! };
  return { fabricacao: null, modelo: null };
}

/** O que o quadro da apolice da Allianz diz, ja separado (texto da cia cru). */
export interface ApoliceAllianzLida {
  numero_apolice: string | null;
  proposta: string | null;
  emissao: DataCia | null;
  vigencia_inicio: DataCia | null;
  vigencia_fim: DataCia | null;
  ramo: { codigo: string; descricao: string | null } | null;
  produto: string | null;
  segurado_nome: string | null;
  segurado_documento: string | null;
  endereco: EnderecoParaRenovar | null;
  condutor_nome: string | null;
  condutor_cpf: string | null;
  condutor_estado_civil: string | null;
  veiculo_descricao: string | null;
  placa: string | null;
  chassi: string | null;
  codigo_fipe: string | null;
  ano: { fabricacao: number | null; modelo: number | null };
  zero_km: boolean | null;
  categoria_uso: string | null;
  cep_pernoite: string | null;
  classe_bonus: number | null;
  ci: string | null;
  /** "Tipo de Seguro: Renovação Allianz sem sinistro" (texto da cia). */
  tipo_seguro: string | null;
  questionario: QuestionarioAllianzLido;
}

/**
 * As respostas do QUESTIONARIO impressas na apolice (PDFs da A vencer,
 * 2026-10-19; docs/renovacao-pdf/LAYOUTS.md). Carro: onde o condutor reside e
 * a extensao para 18 a 25 anos. Moto e caminhao: as garagens. Texto da cia,
 * cru; a traducao e do rascunho.
 */
export interface QuestionarioAllianzLido {
  tipo_residencia: string | null;
  cobertura_18_25: string | null;
  garagem_residencia: string | null;
  garagem_trabalho: string | null;
  garagem_estudo: string | null;
}

/** A resposta depois de uma pergunta que termina em "?" ou ":" na mesma linha. */
function respostaDe(linhas: readonly string[], pergunta: RegExp): string | null {
  for (const l of linhas) {
    const m = pergunta.exec(l);
    if (m !== null) {
      const v = l.slice(m.index + m[0].length).trim();
      return v.length > 0 ? v : null;
    }
  }
  return null;
}

export function questionarioDaApoliceAllianz(linhas: readonly string[]): QuestionarioAllianzLido {
  /* "...idade entre 18 a 25 anos: Não. Estou ciente que..." -> so o Sim/Não da frente. */
  const ampliar = respostaDe(linhas, /Deseja ampliar a cobertura do seguro para condutores.*?anos\s*:/i);
  const sn = ampliar === null ? null : (/^(Sim|N[aã]o)\b/i.exec(ampliar)?.[1] ?? null);
  return {
    tipo_residencia: respostaDe(linhas, /O principal condutor reside em\s*:/i),
    cobertura_18_25: sn,
    garagem_residencia: respostaDe(linhas, /Mant[eé]m o ve[ií]culo em garagem na resid[eê]ncia\?/i),
    garagem_trabalho: respostaDe(linhas, /Mant[eé]m o ve[ií]culo em garagem no trabalho\?/i),
    garagem_estudo: respostaDe(linhas, /Mant[eé]m o ve[ií]culo em garagem na faculdade.*?\?/i),
  };
}

export function lerApoliceAllianz(linhas: readonly string[]): ApoliceAllianzLida {
  const c = camposDoQuadro(linhas);
  const cpfs = c.get("CPF") ?? [];
  const vigencia = datasDoTexto(primeiro(c, "Vigência"));
  const ramoBruto = primeiro(c, "Ramo");
  const mRamo = ramoBruto === null ? null : /^(\d+)\s*(?:-\s*(.+))?$/.exec(ramoBruto);
  const fipe = primeiro(c, "Cód. FIPE");
  const mFipe = fipe === null ? null : /\b(\d{6}-\d)\b/.exec(fipe);
  const placa = primeiro(c, "Placa");
  const mPlaca = placa === null ? null : /\b([A-Z]{3}-?\d[A-Z0-9]\d{2})\b/i.exec(placa);
  const chassi = primeiro(c, "Chassi");
  const mChassi = chassi === null ? null : /\b([A-HJ-NPR-Z0-9]{17})\b/i.exec(chassi);
  const zero = primeiro(c, "Zero Km");
  const cepPernoite = digitos(primeiro(c, "CEP Pernoite"));
  const bonus = /\b(\d{1,2})\b/.exec(primeiro(c, "Classe Bônus") ?? "");
  const ci = digitos((c.get("Cód. CI") ?? []).find((v) => digitos(v).length >= 8) ?? null);
  const docSegurado = digitos(primeiro(c, "CPF/CNPJ"));
  const cpfCondutor = digitos(cpfs[0] ?? null);
  const numero = digitos(primeiro(c, "Apólice Nº.") ?? primeiro(c, "Nº Apólice"));
  const proposta = digitos(primeiro(c, "Proposta Nº."));
  return {
    numero_apolice: numero.length > 0 ? numero : null,
    proposta: proposta.length > 0 ? proposta : null,
    emissao: datasDoTexto(primeiro(c, "Emissão"))[0] ?? null,
    vigencia_inicio: vigencia[0] ?? null,
    vigencia_fim: vigencia.length > 1 ? vigencia[vigencia.length - 1]! : null,
    ramo: mRamo ? { codigo: mRamo[1]!, descricao: mRamo[2]?.trim() || null } : null,
    produto: primeiro(c, "Produto"),
    segurado_nome: primeiro(c, "Segurado"),
    segurado_documento: docSegurado.length === 11 || docSegurado.length === 14 ? docSegurado : null,
    endereco: enderecoDaApolice(primeiro(c, "Endereço")),
    condutor_nome: primeiro(c, "Nome"),
    condutor_cpf: cpfCondutor.length === 11 ? cpfCondutor : null,
    condutor_estado_civil: primeiro(c, "Estado Civil"),
    veiculo_descricao: primeiro(c, "Veículo"),
    placa: mPlaca ? mPlaca[1]!.toUpperCase().replace("-", "") : null,
    chassi: mChassi ? mChassi[1]!.toUpperCase() : null,
    codigo_fipe: mFipe ? mFipe[1]! : null,
    ano: anosDaApolice(primeiro(c, "Ano/Modelo")),
    zero_km: zero === null ? null : /^n[aã]o/i.test(zero) ? false : /^sim/i.test(zero) ? true : null,
    categoria_uso: primeiro(c, "Finalidade de Uso"),
    cep_pernoite: cepPernoite.length === 8 ? cepPernoite : null,
    classe_bonus: bonus ? Number(bonus[1]) : null,
    ci: ci.length > 0 ? ci : null,
    tipo_seguro: primeiro(c, "Tipo de Seguro"),
    questionario: questionarioDaApoliceAllianz(linhas),
  };
}
