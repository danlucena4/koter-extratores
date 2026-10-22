/**
 * ALLIANZ VIDA INDIVIDUAL (apolice ou endosso em PDF). Amostra de 2026-10-20
 * (cobranca): 1 PDF. O leitor das coberturas e os DADOS GERAIS (vigencia
 * anual, premio anual, beneficiarios pela coluna) se juntam em
 * `documentoVidaAllianz`.
 */
import { achar, cep, cpfOuCnpj, data, datas, digitos, dinheiro, email, enderecoOuNulo, ruaNumeroComplemento, secao, ufDe, vazio } from "./leitura.js";
import { deVida, morteDe, type VidaLida } from "./vida.js";
import { comGerais, geraisVazios, dataPorExtenso, fones, pagamento, parcelasDaGrade, type DadosGerais } from "./gerais.js";
import { tabelaDeCoberturas } from "./tabela.js";
import type { BeneficiarioExtraido, DocumentoExtraido } from "./modelo.js";
import type { LinhaPosicionada } from "./pdf/motor.js";

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
    /* "Prêmio Líquido 865,97" (o total da tabela) nao e cobertura. */
    ignorar: /^(CAPITAL|PRÊMIO|Prêmio Líquido|R\$\s*[\d.,]+)$|^Prêmio Líquido\b/i,
  });
  const assistencias = tabelaDeCoberturas(linhas, /^ASSISTÊNCIAS \(R\$\)/i, /^(Prêmio Líquido:|INFORMAÇÕES DE PAGAMENTO)/i, { minimoDeValores: 1 }).map((a) => a.descricao);
  const iSeg = linhas.findIndex((l) => /^SEGURADO\s*:/i.test(l));
  const seg = iSeg < 0 ? [] : linhas.slice(iSeg, iSeg + 9);
  /* "CIDADE : Salvador/Bahia": a UF por extenso vira sigla pela tabela dos estados. */
  const cidadeUf = /^(.+?)\s*\/\s*(.+)$/.exec(achar(seg, /^CIDADE\s*:\s*(.+)$/i) ?? "");
  return {
    numero: impresso,
    segurado_nome: achar(seg, /^SEGURADO\s*:\s*(.+)$/i),
    segurado_documento: cpfOuCnpj(achar(seg, /^CPF\s*:\s*([\d.\-/]+)/i)),
    segurado_endereco: enderecoOuNulo({
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

/* ---------------------------------------------------------- dados gerais */

/**
 * Allianz Vida Individual: "Nº. da Proposta", "TIPO DE SEGURO: X RAMO:",
 * "PRODUTO:", "VIGÊNCIA ANUAL", E-MAIL e TELEFONE do segurado, a coluna
 * "PRÊMIO ANUAL" das coberturas, ASSISTÊNCIAS (com e sem valor),
 * INFORMAÇÕES DE PAGAMENTO (forma, grade de parcelas, "Total a Pagar"),
 * BENEFICIÁRIOS (NOME | PARENTESCO | PARTICIPAÇÃO, o parentesco pela coluna)
 * e "SALVADOR, 14 de Janeiro de 2026" (local e data de emissao).
 */
export function geraisVidaAllianz(pos: readonly LinhaPosicionada[]): DadosGerais {
  const g = geraisVazios();
  const linhas = pos.map((l) => l.texto);
  const iSeg = linhas.findIndex((l) => /^SEGURADO\s*:/i.test(l));
  const seg = iSeg < 0 ? [] : linhas.slice(iSeg, iSeg + 9);
  const vig = datas(linhas.find((l) => /^VIGÊNCIA ANUAL:/i.test(l)));
  const assist = secao(linhas, /^ASSISTÊNCIAS \(R\$\)/i, /^(Prêmio Líquido:|INFORMAÇÕES DE PAGAMENTO)/i, 20)
    .slice(1)
    .map((l) => vazio(l.replace(/\s*R\$\s*[\d.]+,\d{2}.*$/, "")))
    .filter((a): a is string => a !== null);
  const iPag = linhas.findIndex((l) => /^INFORMAÇÕES DE PAGAMENTO/i.test(l));
  const grade = iPag < 0 ? [] : secao(linhas.slice(iPag), /^INFORMAÇÕES DE PAGAMENTO/i, /^Total a Pagar:/i, 20).filter((l) => !/:/.test(l));
  const emissao = linhas.map((l) => /^[A-ZÀ-Ú][A-ZÀ-Ú ]+,\s*(\d{1,2} de [A-Za-zç]+ de \d{4})\b/.exec(l)?.[1]).filter((x) => x !== undefined).pop();
  g.produto = achar(linhas, /^PRODUTO:\s*(.+)$/i);
  g.tipo_seguro = achar(linhas, /^TIPO DE SEGURO:\s*(.+?)\s+RAMO:/i);
  g.proposta = digitos(achar(linhas.slice(0, 15), /N[ºo°]\.?\s*da Proposta:\s*(\d+)/i)) || null;
  g.vigencia_inicio = vig[0] ?? null;
  g.vigencia_fim = vig[1] ?? null;
  g.emissao = dataPorExtenso(emissao);
  g.premio_liquido = dinheiro(achar(linhas, /^Prêmio Líquido:\s*(R\$\s*[\d.]+,\d{2})/i));
  g.premio_total = dinheiro(achar(linhas, /^Total a Pagar:\s*(R\$\s*[\d.]+,\d{2})/i));
  g.pagamento = pagamento(achar(linhas, /^Forma de Pagamento:\s*(.+)$/i), parcelasDaGrade(grade));
  g.assistencias = assist;
  g.segurado = {
    email: email(achar(seg, /^E-MAIL:\s*(\S+)/i)),
    telefones: fones(achar(seg, /\bTELEFONE:\s*(.+)$/i)),
  };
  g.vida = {
    periodicidade_premio: linhas.some((l) => /^CAPITAL PRÊMIO ANUAL$/i.test(l.trim())) ? "ANUAL" : null,
    beneficiarios: beneficiariosAllianz(pos),
  };
  return g;
}

/**
 * BENEFICIÁRIOS da Allianz: o nome (pode quebrar em linhas) vem ANTES da linha
 * "NOME SOCIAL DO BENEFICIÁRIO: <parentesco> <participação>" e o nome social
 * DEPOIS. O parentesco e o texto na coluna PARENTESCO. Do segundo em diante,
 * as linhas entre duas linhas de dados sao o nome social do anterior + o nome
 * deste: so quando o nome social repete o nome anterior da para separar.
 */
function beneficiariosAllianz(pos: readonly LinhaPosicionada[]): BeneficiarioExtraido[] {
  const iCab = pos.findIndex((l) => /^NOME PARENTESCO PARTICIPA/i.test(l.texto.trim()));
  if (iCab < 0) return [];
  const cab = pos[iCab] as LinhaPosicionada;
  const xDe = (re: RegExp) => cab.palavras.find((w) => re.test(w.texto))?.x ?? null;
  const xPar = xDe(/^PARENTESCO$/i);
  const xPart = xDe(/^PARTICIPA/i);
  if (xPar === null || xPart === null) return [];
  const out: BeneficiarioExtraido[] = [];
  let pendentes: string[] = [];
  let anterior: string | null = null;
  for (const l of pos.slice(iCab + 1)) {
    const t = l.texto.trim();
    if (/^(Página \d|CLÁUSULAS)/i.test(t)) break;
    if (/^\(%\)$/.test(t)) continue;
    const m = /^NOME SOCIAL DO BENEFICI[ÁA]RIO:.*?\s(\d{1,3},\d{2})$/i.exec(t);
    if (m === null) {
      pendentes.push(t);
      continue;
    }
    /* A coluna e centralizada: o texto comeca antes do rotulo PARENTESCO (ate 3 letras de folga), sempre depois do rotulo do nome social. */
    const tol = cab.tamanho;
    const iRot = l.palavras.findIndex((w) => /BENEFICI[ÁA]RIO:$/i.test(w.texto));
    const parentesco = vazio(
      l.palavras
        .filter((w, k) => k > iRot && w.x >= xPar - 3 * tol && w.x < xPart - tol)
        .map((w) => w.texto)
        .join(" "),
    );
    let nomeLinhas = pendentes;
    if (anterior !== null) {
      const junto = pendentes.join(" ");
      nomeLinhas = junto.startsWith(`${anterior} `) ? [junto.slice(anterior.length + 1)] : [];
    }
    const nome = vazio(nomeLinhas.join(" "));
    out.push({ nome, documento: null, nascimento: null, parentesco, percentual: Number((m[1] as string).replace(",", ".")) });
    anterior = nome;
    pendentes = [];
    if (nome === null) break;
  }
  return out;
}

/* ------------------------------------------------------- modelo unico */

/** A apolice no modelo unico; `null` quando nao e a pedida. */
export function documentoVidaAllianz(doc: DocumentoExtraido, pos: readonly LinhaPosicionada[], numero: string): DocumentoExtraido | null {
  const v = lerVidaAllianz(pos.map((l) => l.texto), numero);
  return v === null ? null : comGerais(deVida(doc, v), geraisVidaAllianz(pos));
}
