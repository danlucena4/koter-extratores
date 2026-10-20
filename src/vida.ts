/**
 * APOLICES DE VIDA (PDF): MAPFRE (Vida Você Multiflex), Allianz (Vida
 * Individual) e Yelum (Vida Mais Tranquila). Um PDF de cada na amostra de
 * 2026-10-20 (cobranca); os rotulos sao fixos do modelo de cada cia.
 *
 * Saida: o segurado (nascimento, sexo, estado civil, profissao, renda como a
 * cia escreve), as coberturas (descricao + capital) e o capital de MORTE.
 */
import { dinheiroPtBr, tabelaDeCoberturas, type ItemDeCobertura } from "./tabela.js";
import type { DataCia, Dinheiro } from "./tipos.js";

export interface VidaLida {
  numero: string;
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
  return {
    numero: impresso,
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
  return {
    numero: impresso,
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
  return {
    numero: pedido,
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
