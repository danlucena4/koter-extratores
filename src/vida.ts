/**
 * APOLICES DE VIDA (PDF): MAPFRE (Vida Você Multiflex), Allianz (Vida
 * Individual) e Yelum (Vida Mais Tranquila). Um PDF de cada na amostra de
 * 2026-10-20 (cobranca); os rotulos sao fixos do modelo de cada cia.
 *
 * Saida: o segurado (nascimento, sexo, estado civil, profissao, renda como a
 * cia escreve), as coberturas (descricao + capital) e o capital de MORTE.
 */
import { dinheiroPtBr, tabelaDeCoberturas, type ItemDeCobertura } from "./tabela.js";
import type { DataCia, Dinheiro, EnderecoLido } from "./tipos.js";

export interface VidaLida {
  numero: string;
  segurado_nome: string | null;
  segurado_documento: string | null;
  /** So as partes que a cia separa; o que vem misturado fica nulo. */
  segurado_endereco: EnderecoLido | null;
  vigencia_fim: DataCia | null;
  segurado_nascimento: DataCia | null;
  segurado_sexo: string | null;
  segurado_estado_civil: string | null;
  profissao: string | null;
  /** Renda como a cia escreve (faixa, "DE R$ 5.000,00 A R$ 10.000,00"). */
  renda: string | null;
  coberturas: ItemDeCobertura[];
  capital_morte: Dinheiro | null;
  assistencias: string[];
}

const vazio = (v: string | null | undefined): string | null => {
  const s = (v ?? "").replace(/\s+/g, " ").trim();
  return s.length > 0 ? s : null;
};
const digitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
const achar = (linhas: readonly string[], re: RegExp): string | null => {
  for (const l of linhas) {
    const m = re.exec(l);
    if (m !== null) return vazio(m[1]);
  }
  return null;
};
const data = (v: string | null): DataCia | null => {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(v ?? "");
  return m === null ? null : { iso: `${m[3]}-${m[2]}-${m[1]}`, original: m[0] };
};
const doc = (v: string | null) => {
  const d = digitos(v);
  return d.length === 11 || d.length === 14 ? d : null;
};
const cep = (v: string | null) => {
  const d = digitos(v);
  return d.length === 8 ? d : null;
};
const endereco = (e: EnderecoLido): EnderecoLido | null => (Object.values(e).every((v) => v === null) ? null : e);
/** "RUA X, 12, APTO 3" / "RUA X , 12": so quando o numero vem isolado entre virgulas. */
const ruaNumeroComplemento = (v: string | null): Pick<EnderecoLido, "logradouro" | "numero" | "complemento"> => {
  const m = /^(.+?)\s*,\s*(\d+[A-Za-z]?|S\/?N)\s*(?:,\s*(.+))?$/i.exec(v ?? "");
  return m === null ? { logradouro: null, numero: null, complemento: null } : { logradouro: vazio(m[1]), numero: vazio(m[2]), complemento: vazio(m[3]) };
};

const UF_POR_ESTADO: Readonly<Record<string, string>> = {
  ACRE: "AC", ALAGOAS: "AL", AMAPA: "AP", AMAZONAS: "AM", BAHIA: "BA", CEARA: "CE", "DISTRITO FEDERAL": "DF",
  "ESPIRITO SANTO": "ES", GOIAS: "GO", MARANHAO: "MA", "MATO GROSSO": "MT", "MATO GROSSO DO SUL": "MS",
  "MINAS GERAIS": "MG", PARA: "PA", PARAIBA: "PB", PARANA: "PR", PERNAMBUCO: "PE", PIAUI: "PI",
  "RIO DE JANEIRO": "RJ", "RIO GRANDE DO NORTE": "RN", "RIO GRANDE DO SUL": "RS", RONDONIA: "RO",
  RORAIMA: "RR", "SANTA CATARINA": "SC", "SAO PAULO": "SP", SERGIPE: "SE", TOCANTINS: "TO",
};
/** "BA" ou "Bahia" -> "BA"; o resto, null. */
const ufDe = (v: string): string | null => {
  const t = v.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  if (/^[A-Z]{2}$/.test(t)) return Object.values(UF_POR_ESTADO).includes(t) ? t : null;
  return UF_POR_ESTADO[t] ?? null;
};

/** A cobertura basica de morte (natural ou acidental), nao a morte ACIDENTAL sozinha. */
const ehMorte = (d: string) => /^Morte\b/i.test(d.trim()) && !/acidental\s*$/i.test(d.trim());
const morteDe = (itens: ItemDeCobertura[]) => itens.find((i) => ehMorte(i.descricao))?.valor ?? null;

/* ---------------------------------------------------------------- MAPFRE */

/**
 * "Nº da Apólice: 0000000000000", "Estado Civil: SOLTEIRO Sexo: FEMININO",
 * "Data de Nascimento: dd/mm/aaaa", "Profissão: ADVOGADO Faixa de Renda: DE R$
 * ... A R$ ...", e a tabela "Coberturas Capital Segurado Prêmio Líquido
 * Carência/Franquia" ("Morte (M) 100.000,00 30,00 24 / Não").
 */
export function lerVidaMapfre(linhas: readonly string[], numeroApolice: string): VidaLida | null {
  const impresso = digitos(achar(linhas, /N[ºo°] da Apólice:\s*(\d+)/i));
  const pedido = digitos(numeroApolice);
  if (impresso.length < 8 || pedido.length < 8 || !impresso.endsWith(pedido.slice(-10))) return null;
  if (!linhas.some((l) => /MAPFRE VIDA/i.test(l))) return null;
  const itens = tabelaDeCoberturas(linhas, /^Coberturas Capital Segurado/i, /^(Para todas as Coberturas|Benef[íi]cios\b)/i, { minimoDeValores: 2 }).map((i) => ({
    ...i,
    descricao: i.descricao.replace(/\s*\((?:M|IPA|MA|DG)\)\s*/gi, " ").replace(/\s+/g, " ").trim(),
  }));
  const iEnd = linhas.findIndex((l) => /^ENDEREÇO RESIDENCIAL DO SEGURADO/i.test(l));
  const end = iEnd < 0 ? [] : linhas.slice(iEnd + 1, iEnd + 6);
  return {
    numero: impresso,
    segurado_nome: achar(linhas, /^Nome Completo:\s*(.+?)\s+CPF:/i),
    segurado_documento: doc(achar(linhas, /^Nome Completo:.*\bCPF:\s*([\d.\-/]+)/i)),
    segurado_endereco: endereco({
      cep: cep(achar(end, /^Bairro:.*\bCEP:\s*([\d-]{8,9})/i)),
      logradouro: achar(end, /^Logradouro:\s*(.+?)\s+N(?:[ºo°]|úmero):/i),
      numero: achar(end, /^Logradouro:.*\sN(?:[ºo°]|úmero):\s*(\S+)/i),
      complemento: achar(end, /^Complemento:\s*(.+)$/i),
      bairro: achar(end, /^Bairro:\s*(.+?)\s+CEP:/i),
      cidade: achar(end, /^Cidade:\s*(.+?)\s+UF:/i),
      uf: achar(end, /^Cidade:.*\bUF:\s*([A-Z]{2})\b/),
    }),
    vigencia_fim: data(achar(linhas, /T[ée]rmino de Vig[êe]ncia.*?(\d{2}\/\d{2}\/\d{4})/i)),
    segurado_nascimento: data(achar(linhas, /^Data de Nascimento:\s*(\d{2}\/\d{2}\/\d{4})/i)),
    segurado_sexo: achar(linhas, /\bSexo:\s*(MASCULINO|FEMININO)\b/i),
    segurado_estado_civil: achar(linhas, /^Estado Civil:\s*(.+?)\s+Sexo:/i),
    profissao: achar(linhas, /^Profissão:\s*(.+?)\s+Faixa de Renda:/i),
    renda: achar(linhas, /Faixa de Renda:\s*(.+)$/i),
    coberturas: itens,
    capital_morte: morteDe(itens),
    assistencias: [],
  };
}

/* ---------------------------------------------------------------- Allianz */

/**
 * "Nº Apólice: 0000000000000000000", "PACOTE CONTRATADO: ... PROFISSÃO:
 * Coordenador", a tabela "COBERTURAS (R$)" so com o CAPITAL ("Morte R$
 * 100.000,00") ate "ASSISTÊNCIAS (R$)", e as assistencias ate o premio.
 */
export function lerVidaAllianz(linhas: readonly string[], apoliceSusep: string): VidaLida | null {
  const impresso = digitos(achar(linhas, /N[ºo°]\.?\s*(?:da\s+)?Apólice:\s*(\d{10,})/i));
  if (impresso.length < 10 || impresso !== digitos(apoliceSusep)) return null;
  if (!linhas.some((l) => /Allianz Vida/i.test(l))) return null;
  const itens = tabelaDeCoberturas(linhas, /^COBERTURAS \(R\$\)/i, /^ASSISTÊNCIAS \(R\$\)/i, {
    minimoDeValores: 1,
    ignorar: /^(CAPITAL|PRÊMIO|Prêmio Líquido|R\$\s*[\d.,]+)$/i,
  });
  const assistencias = tabelaDeCoberturas(linhas, /^ASSISTÊNCIAS \(R\$\)/i, /^(Prêmio Líquido:|INFORMAÇÕES DE PAGAMENTO)/i, { minimoDeValores: 1 }).map((a) => a.descricao);
  const iSeg = linhas.findIndex((l) => /^SEGURADO\s*:/i.test(l));
  const seg = iSeg < 0 ? [] : linhas.slice(iSeg, iSeg + 9);
  /* "CIDADE : Salvador/Bahia": a UF por extenso vira sigla pela tabela dos estados. */
  const cidadeUf = /^(.+?)\s*\/\s*(.+)$/.exec(achar(seg, /^CIDADE\s*:\s*(.+)$/i) ?? "");
  return {
    numero: impresso,
    segurado_nome: achar(seg, /^SEGURADO\s*:\s*(.+)$/i),
    segurado_documento: doc(achar(seg, /^CPF\s*:\s*([\d.\-/]+)/i)),
    segurado_endereco: endereco({
      cep: cep(achar(seg, /\bCEP:\s*([\d-]{8,9})/i)),
      ...ruaNumeroComplemento(achar(seg, /^ENDEREÇO:\s*(.+)$/i)),
      bairro: achar(seg, /^BAIRRO:\s*(.+?)(?:\s+TELEFONE:.*)?$/i),
      cidade: cidadeUf === null ? achar(seg, /^CIDADE\s*:\s*([^/]+)$/i) : vazio(cidadeUf[1]),
      uf: cidadeUf === null ? null : ufDe(cidadeUf[2] as string),
    }),
    vigencia_fim: data(achar(linhas, /^VIGÊNCIA ANUAL:.*\sàs\s*\d+H\s*de\s*(\d{2}\/\d{2}\/\d{4})/i)),
    segurado_nascimento: null,
    segurado_sexo: null,
    segurado_estado_civil: null,
    profissao: achar(linhas, /PROFISSÃO:\s*(.+)$/i),
    renda: null,
    coberturas: itens,
    capital_morte: morteDe(itens),
    assistencias,
  };
}

/* ---------------------------------------------------------------- Yelum */

/**
 * Yelum Vida: o quadro e de CABECALHO numa linha e VALOR na de baixo. Na
 * tabela de coberturas, a descricao vem numa linha, os valores na seguinte
 * ("100.000,00 30,00 - -"), e a continuacao da descricao depois dos valores:
 *
 *   Morte
 *   100.000,00 30,00 - -
 *   Invalidez Permanente Total ou Parcial por
 *   100.000,00 5,00 - -
 *   Acidente
 */
export function lerVidaYelum(linhas: readonly string[], policyNumber: string): VidaLida | null {
  if (!linhas.some((l) => /Apólice - Ramo \d+ Vida/i.test(l))) return null;
  const pedido = digitos(policyNumber);
  if (pedido.length < 8 || !linhas.some((l) => digitos(l).includes(pedido))) return null;

  const i = linhas.findIndex((l) => /^Cap\.Segurado\(R\$\)/i.test(l));
  const fim = linhas.findIndex((l, k) => k > i && /^SERVIÇOS COMPLEMENTARES/i.test(l));
  const bloco = i < 0 ? [] : linhas.slice(i + 1, fim < 0 ? i + 20 : fim);
  const soValores = (l: string) => /^[\d.,\s-]+$/.test(l.trim()) && /\d,\d{2}/.test(l);
  const itens: ItemDeCobertura[] = [];
  bloco.forEach((l, k) => {
    if (soValores(l)) return;
    const prox = bloco[k + 1] ?? "";
    if (soValores(prox)) {
      const [capital, ...outros] = prox.trim().split(/\s+/).filter((x) => /\d,\d{2}/.test(x));
      const valor = dinheiroPtBr(capital);
      if (valor !== null) itens.push({ descricao: l.trim(), valor, outros_valores: outros });
      return;
    }
    const ultimo = itens[itens.length - 1];
    if (ultimo !== undefined && soValores(bloco[k - 1] ?? "")) ultimo.descricao = `${ultimo.descricao} ${l.trim()}`;
  });
  const iNasc = linhas.findIndex((l) => /^Data de Nascimento$/i.test(l.trim()));
  const nasc = iNasc < 0 ? null : (linhas.slice(iNasc + 1, iNasc + 4).find((l) => /^\d{2}\/\d{2}\/\d{4}$/.test(l.trim())) ?? null);
  /* Quadro do segurado: "Nome do(a) Segurado(a) CPF/CNPJ ..." e os valores na linha de baixo. */
  const iSeg = linhas.findIndex((l) => /^Nome do\(a\) Segurado\(a\)/i.test(l));
  const linhaSeg = iSeg < 0 ? "" : (linhas[iSeg + 1] ?? "");
  const mSeg = /^(.+?)\s+(\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/.exec(linhaSeg);
  const iEnd = linhas.findIndex((l, k) => k > iSeg && /^Endereço$/i.test(l.trim()));
  const iBairro = linhas.findIndex((l, k) => k > iSeg && /^Bairro Cidade UF CEP$/i.test(l.trim()));
  const iVig = linhas.findIndex((l) => /^Vigência do Seguro/i.test(l));
  return {
    numero: pedido,
    segurado_nome: iSeg < 0 ? null : vazio(mSeg?.[1]),
    segurado_documento: iSeg < 0 ? null : doc(mSeg?.[2] ?? null),
    /* Bairro e cidade vem colados na mesma linha, sem separador: so o CEP. */
    segurado_endereco: endereco({
      cep: iBairro < 0 ? null : cep(/(\d{5}-\d{3})\s*$/.exec(linhas[iBairro + 1] ?? "")?.[1] ?? null),
      ...ruaNumeroComplemento(iEnd < 0 ? null : (linhas[iEnd + 1] ?? null)),
      bairro: null,
      cidade: null,
      uf: null,
    }),
    vigencia_fim: iVig < 0 ? null : data(/\sàs\s*[\d:]+hs?\s*de\s*(\d{2}\/\d{2}\/\d{4})/i.exec(linhas[iVig + 1] ?? "")?.[1] ?? null),
    segurado_nascimento: data(nasc),
    segurado_sexo: null,
    segurado_estado_civil: null,
    profissao: null,
    renda: null,
    coberturas: itens.filter((c) => !/ASSIST/i.test(c.descricao)),
    capital_morte: morteDe(itens),
    assistencias: itens.filter((c) => /ASSIST/i.test(c.descricao)).map((c) => c.descricao),
  };
}
