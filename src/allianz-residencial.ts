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
import { achar, data, datas, digitos, dinheiro, email, secao, vazio } from "./leitura.js";
import { comGerais, fones, geraisVazios, pagamento, quadro, type DadosGerais } from "./gerais.js";
import { pessoaCom, residencialVazio, type DocumentoExtraido } from "./modelo.js";
import type { LinhaPosicionada } from "./pdf/motor.js";

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

/**
 * O primeiro "R$ 1.234,56" do texto (a conversao e a de `dinheiro`, leitura.ts).
 * 0,00 vira nulo (preco nao cobrado); o `original` leva o "R$", como sempre levou.
 */
export function dinheiroDoTexto(v: string | null | undefined): Dinheiro | null {
  const m = /R\$\s*([\d.]+,\d{2})/.exec(v ?? "");
  const d = m === null ? null : dinheiro(m[1]);
  return m === null || d === null || d.centavos === 0 ? null : { ...d, original: `R$ ${m[1]}` };
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

/* ---------------------------------------------------------- dados gerais */

/**
 * Allianz Residência: "Produto | Ramo: 14 - Residência Digital Tipo de
 * residência: Casa Habitual Alvenaria", "Tipo de Seguro:", "Tipo de
 * contratação: X Limite máximo de garantia da Apólice: R$ Y", "Há Telhado de
 * Isopainel?: Não", Proposta, Data de emissão, Vigência, Tel/E-mail do
 * segurado, INFORMAÇÕES DE PAGAMENTO ("Cartão de Crédito Preço líquido: R$ X"
 * / "em 10 parcelas" / "Total a pagar" + "R$ Y") e as CLÁUSULAS.
 */
export function geraisResidencialAllianz(linhas: readonly string[]): DadosGerais {
  const g = geraisVazios();
  const iSeu = linhas.findIndex((l) => /^SUAS INFORMA/i.test(l.trim()));
  const contato = quadro(iSeu < 0 ? [] : linhas.slice(iSeu, iSeu + 6), ["CPF/CNPJ", "Tel", "E-mail"]);
  const vig = datas(linhas.find((l) => /^Vigência:/i.test(l)));
  const iForma = linhas.findIndex((l) => /^Forma de pagamento\b/i.test(l.trim()));
  const formaLinha = iForma < 0 ? "" : (linhas[iForma + 1] ?? "");
  /* "Selecione" e o campo do formulario sem escolha: nao e forma de pagamento. */
  const forma = vazio(formaLinha.replace(/\s*Preço líquido:.*$/i, "").replace(/^Selecione$/i, ""));
  const parcelas = Number(achar(linhas, /^em (\d{1,2}) parcelas?\b/i));
  const iTotal = linhas.findIndex((l) => /^Total a pagar$/i.test(l.trim()));
  const tipo = achar(linhas, /Tipo de resid[eê]ncia:\s*(.+)$/i);
  const clausulas = secao(linhas, /^CLÁUSULAS$/, /^Página \d/i, 40)
    .map((l) => /^(Cláusula\b.*?):?$/.exec(l.trim())?.[1])
    .filter((c): c is string => c !== undefined);
  const respostas = linhas
    .map((l) => /^(Há .+?\?):\s*(\S.*)$/.exec(l.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ pergunta: m[1] as string, resposta: (m[2] as string).trim() }));
  /* O preco 0,00 (endosso sem cobranca) nao e o premio da apolice. */
  const naoZero = (d: Dinheiro | null) => (d === null || d.centavos === 0 ? null : d);

  g.produto = achar(linhas, /^Produto \| Ramo:\s*(.+?)\s+Tipo de resid/i);
  g.tipo_seguro = achar(linhas, /^Tipo de Seguro:\s*(\S.*)$/i);
  g.proposta = digitos(achar(linhas, /Proposta Nº:\s*(\d+)/i)) || null;
  g.emissao = data(achar(linhas, /^Data de emissão:\s*(\d{2}\/\d{2}\/\d{4})/i));
  g.vigencia_inicio = vig[0] ?? null;
  g.vigencia_fim = vig[1] ?? null;
  g.premio_liquido = naoZero(dinheiro(achar([formaLinha], /Preço líquido:\s*(R\$\s*[\d.]+,\d{2})/i)));
  g.premio_total = iTotal < 0 ? null : naoZero(dinheiro(linhas[iTotal + 1]));
  g.pagamento = pagamento(forma, Number.isFinite(parcelas) && parcelas > 0 ? parcelas : null);
  g.clausulas = clausulas;
  g.segurado = { telefones: fones(contato.get("Tel")), email: email(contato.get("E-mail")) };
  g.residencial = {
    bem_segurado: achar(linhas, /^Tipo de contratação:\s*(.+?)\s+Limite máximo/i),
    lmg: dinheiro(achar(linhas, /Limite máximo de garantia da Apólice:\s*(R\$\s*[\d.]+,\d{2})/i)),
    tipo_construcao: tipo === null ? null : vazio(/\b(Alvenaria|Madeira|Mista)\b/i.exec(tipo)?.[1]),
    /* "Casa Condomínio ..." e casa em condominio; "Casa ..." sem a palavra nao e; apartamento a Allianz nao diz. */
    condominio_fechado: tipo === null ? null : /Condom[íi]nio/i.test(tipo) ? true : /^Casa\b/i.test(tipo) ? false : null,
    valor_de_novo: clausulas.some((c) => /valor de novo/i.test(c)) ? true : null,
    plano_assistencia: achar(linhas, /^Assist[eê]ncia 24h\s+(.+?)\s+R\$\s*[\d.]+,\d{2}\s*$/i),
    respostas,
  };
  return g;
}
/* ------------------------------------------------------- modelo unico */

/** A apolice no modelo unico: o quadro e a OFERTA ESCOLHIDA (com preco e participacao por cobertura) + os dados gerais. */
export function documentoResidencialAllianz(doc: DocumentoExtraido, pos: readonly LinhaPosicionada[], numero: string): DocumentoExtraido | null {
  const linhas = pos.map((l) => l.texto);
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
