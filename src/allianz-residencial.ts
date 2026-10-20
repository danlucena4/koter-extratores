/**
 * A APOLICE RESIDENCIAL da Allianz em PDF (o mesmo documento "Apólice (PDF)"
 * do auto, produto "ALLIANZ RESIDÊNCIA"). Sonda ao vivo 2026-10-15, 2 apolices
 * (so a forma das linhas foi lida). O quadro e "Rótulo: valor":
 *
 *   Nome: ... / CPF/CNPJ: ... Tel: ... / Endereço: R. X, 123, apto - BAIRRO - CIDADE/UF - 00000000
 *   Endereço do local segurado: RUA X, 123 - apto - BAIRRO - 00000-000 - CIDADE/UF
 *   Produto | Ramo: 14 - Residência Digital Tipo de residência: Apartamento Habitual
 *   Tipo de contratação: Prédio+Conteúdo Limite máximo de garantia da Apólice: R$ ...
 *   Proposta Nº: ... Apólice Nº: <19 digitos>          (a TRAVA)
 *   Vigência: das 24h de dd/mm/aaaa às 24h de dd/mm/aaaa
 *   OFERTA ESCOLHIDA: a tabela "<cobertura> R$ <LMI> R$ <preço> ..." (a
 *   descricao pode quebrar em duas linhas em volta dos valores) e a assistencia
 *   ("Assistência 24h VIP R$ 0,00").
 */

import type { DataCia, Dinheiro, EnderecoLido as EnderecoParaRenovar } from "./tipos.js";
import { enderecoDaApolice } from "./allianz.js";

const vazio = (v: string | null | undefined): string | null => {
  const s = (v ?? "").replace(/\s+/g, " ").trim();
  return s.length > 0 ? s : null;
};

/** O valor de `Rotulo:` numa linha, ate o proximo rotulo conhecido da mesma linha. */
function rotulo(linhas: readonly string[], re: RegExp, ate: RegExp | null = null): string | null {
  for (const l of linhas) {
    const m = re.exec(l);
    if (m === null) continue;
    let v = l.slice((m.index ?? 0) + m[0].length);
    if (ate !== null) {
      const corte = ate.exec(v);
      if (corte !== null) v = v.slice(0, corte.index);
    }
    return vazio(v);
  }
  return null;
}

export function dinheiroDoTexto(v: string | null | undefined): Dinheiro | null {
  const m = /R\$\s*([\d.]+,\d{2})/.exec(v ?? "");
  if (m === null) return null;
  const centavos = Number((m[1] as string).replace(/\./g, "").replace(",", ""));
  return Number.isFinite(centavos) && centavos > 0 ? { centavos, moeda: "BRL", original: `R$ ${m[1]}` } : null;
}

/** "RUA X, 123 - apto - BAIRRO - 00000-000 - CIDADE/UF" -> endereco. */
export function enderecoDoLocalSegurado(v: string | null): EnderecoParaRenovar | null {
  if (v === null) return null;
  const partes = v.split(/\s+-\s+/).map((p) => p.trim()).filter(Boolean);
  const iCep = partes.findIndex((p) => /^\d{5}-?\d{3}$/.test(p));
  const iCidade = partes.findIndex((p) => /\/[A-Z]{2}$/.test(p));
  const [rua, numero] = (() => {
    const m = /^(.*),\s*(\S+)$/.exec(partes[0] ?? "");
    return m === null ? [partes[0] ?? null, null] : [m[1] ?? null, m[2] ?? null];
  })();
  const meio = partes.slice(1, iCep >= 0 ? iCep : iCidade >= 0 ? iCidade : partes.length);
  const cidadeUf = iCidade >= 0 ? (partes[iCidade] as string) : null;
  const e: EnderecoParaRenovar = {
    cep: iCep >= 0 ? (partes[iCep] as string).replace(/\D/g, "") : null,
    logradouro: vazio(rua),
    numero: vazio(numero),
    complemento: meio.length >= 2 ? vazio(meio.slice(0, -1).join(" - ")) : null,
    bairro: meio.length >= 1 ? vazio(meio[meio.length - 1]) : null,
    cidade: cidadeUf === null ? null : vazio(cidadeUf.replace(/\/[A-Z]{2}$/, "")),
    uf: cidadeUf === null ? null : (/\/([A-Z]{2})$/.exec(cidadeUf)?.[1] ?? null),
  };
  return Object.values(e).every((x) => x === null) ? null : e;
}

export interface CoberturaResidencialLida {
  descricao: string;
  lmi: Dinheiro | null;
  /** O "Preço por Cobertura" (segundo valor da linha). */
  premio: Dinheiro | null;
  /** A "Participação Obrigatória" como impressa ("10% dos prejuízos com mínimo de R$ 600,00"). */
  franquia: string | null;
}

/** A tabela da OFERTA ESCOLHIDA. A descricao que quebra em volta dos valores e juntada. */
export function coberturasDaOferta(linhas: readonly string[]): { coberturas: CoberturaResidencialLida[]; assistencia: string | null } {
  const ini = linhas.findIndex((l) => /^OFERTA ESCOLHIDA/i.test(l.trim()));
  if (ini < 0) return { coberturas: [], assistencia: null };
  const CABECALHO = /^(Limite|Preço por|Coberturas Máximo|Cobertura|Indenização|Personalizado|Página|A tabela|Indeniza|sinistro)/i;
  /* Caixa importa: "ASSISTÊNCIA 24H PLANO" fecha a tabela; "Assistência 24h VIP R$ ..." e linha dela. */
  const fim = linhas.findIndex((l, i) => i > ini && (/^\*As coberturas/i.test(l.trim()) || /^ASSIST[EÊ]NCIA 24H PLANO/.test(l.trim())));
  const bloco = linhas.slice(ini + 1, fim < 0 ? undefined : fim).map((l) => l.trim());
  const coberturas: CoberturaResidencialLida[] = [];
  let assistencia: string | null = null;
  for (let i = 0; i < bloco.length; i++) {
    const l = bloco[i] as string;
    if (!/R\$/.test(l) || CABECALHO.test(l)) continue;
    const antes = vazio(l.slice(0, l.indexOf("R$")));
    let descricao = antes;
    if (descricao === null) {
      /* "Incend / Raio / ... /" + "R$ x R$ y" + "Q.Aero": a descricao abraca os valores. */
      const ant = bloco[i - 1] ?? "";
      const prox = bloco[i + 1] ?? "";
      const pedacos = [!/R\$/.test(ant) && !CABECALHO.test(ant) ? ant : "", !/R\$/.test(prox) && !CABECALHO.test(prox) ? prox : ""];
      descricao = vazio(pedacos.join(" ").replace(/\/\s*$/, ""));
    } else if (/,\s*$/.test(descricao) || /,$/.test(descricao)) {
      descricao = vazio(`${descricao} ${bloco[i + 1] ?? ""}`);
    }
    if (descricao === null) continue;
    const valores = [...l.matchAll(/R\$\s*[\d.]+,\d{2}/g)];
    if (/^Assist[eê]ncia/i.test(descricao) && valores.length <= 1) {
      assistencia = descricao;
      continue;
    }
    /* Depois do LMI e do preco, a participacao obrigatoria ("10% dos prejuízos com mínimo de R$ 600,00"). */
    const depois = valores[1] === undefined ? "" : l.slice((valores[1].index ?? 0) + valores[1][0].length).trim();
    coberturas.push({
      descricao,
      lmi: dinheiroDoTexto(valores[0]?.[0]),
      premio: dinheiroDoTexto(valores[1]?.[0]),
      franquia: /^\d+\s*%/.test(depois) ? vazio(depois) : null,
    });
  }
  return { coberturas, assistencia };
}

export interface ApoliceResidencialAllianzLida {
  numero: string;
  segurado_nome: string | null;
  segurado_documento: string | null;
  segurado_endereco: EnderecoParaRenovar | null;
  imovel: EnderecoParaRenovar | null;
  tipo_residencia: string | null;
  ocupacao: string | null;
  vigencia_fim: DataCia | null;
  coberturas: CoberturaResidencialLida[];
  lmi_basica: Dinheiro | null;
  assistencia: string | null;
}

/** E residencial? O PDF diz: o local segurado e o ramo de residencia. */
export function ehApoliceResidencialAllianz(linhas: readonly string[]): boolean {
  return linhas.some((l) => /Endere[cç]o do local segurado:/i.test(l)) && linhas.some((l) => /Resid[eê]ncia/i.test(l));
}

export function lerApoliceResidencialAllianz(linhas: readonly string[], numeroSusep: string): ApoliceResidencialAllianzLida | null {
  const pedido = numeroSusep.replace(/\D/g, "");
  const numero = rotulo(linhas, /Ap[oó]lice\s*N[º°o]?\s*:\s*/i)?.replace(/\D/g, "").slice(0, 19) ?? null;
  if (pedido.length < 10 || numero !== pedido) return null;

  /* O quadro do CORRETOR vem antes e repete "ENDEREÇO:"/"CPF": o segurado e o bloco "SUAS INFORMAÇÕES". */
  const iSeu = linhas.findIndex((l) => /^SUAS INFORMA/i.test(l.trim()));
  const doSegurado = iSeu >= 0 ? linhas.slice(iSeu) : linhas;
  /* O endereco do local segurado pode quebrar a linha depois do CEP ("... - 00000-000 -" + "CIDADE/UF"). */
  const juntas = linhas.map((l, i) => (/\s-\s*$/.test(l) && i + 1 < linhas.length ? `${l} ${linhas[i + 1]}` : l));
  const doc = (rotulo(doSegurado, /CPF\/CNPJ:\s*/i, /\s+Tel:/i) ?? "").replace(/\D/g, "");
  const tipoBruto = rotulo(linhas, /Tipo de resid[eê]ncia:\s*/i);
  const mOcup = tipoBruto === null ? null : /\b(Habitual|Veraneio|Desocupad[oa])\b/i.exec(tipoBruto);
  const vig = rotulo(linhas, /^Vig[eê]ncia:\s*/i) ?? "";
  const datas = [...vig.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)];
  const fim = datas[1];
  const { coberturas, assistencia } = coberturasDaOferta(linhas);
  const basica = coberturas.find((c) => /Incend|Inc[eê]ndio/i.test(c.descricao)) ?? null;

  return {
    numero,
    segurado_nome: rotulo(doSegurado, /^Nome:\s*/i),
    segurado_documento: doc.length === 11 || doc.length === 14 ? doc : null,
    segurado_endereco: enderecoDaApolice(rotulo(doSegurado, /^Endere[cç]o:\s*/)),
    imovel: enderecoDoLocalSegurado(rotulo(juntas, /Endere[cç]o do local segurado:\s*/i)),
    tipo_residencia: vazio(mOcup === null ? tipoBruto : (tipoBruto as string).replace(mOcup[0], " ")),
    ocupacao: vazio(mOcup?.[1]),
    vigencia_fim: fim === undefined ? null : { iso: `${fim[3]}-${fim[2]}-${fim[1]}`, original: fim[0] },
    coberturas,
    lmi_basica: basica?.lmi ?? null,
    assistencia,
  };
}
