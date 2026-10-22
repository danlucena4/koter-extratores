/**
 * YELUM VIDA (Vida Mais Tranquila; tambem Aliro, mesma cia). Amostra de
 * 2026-10-20 (cobranca): 1 PDF. O leitor e os DADOS GERAIS (quadros lidos
 * pela coluna) se juntam em `documentoVidaYelum`.
 */
import {
  achar,
  cep,
  cpfOuCnpj,
  data,
  datas,
  digitos,
  dinheiro,
  email,
  enderecoOuNulo,
  quadroPorColuna,
  ruaNumeroComplemento,
  secao,
  tabelaPorValores,
  ufDe,
  vazio,
} from "./leitura.js";
import { deVida, morteDe, type VidaLida } from "./vida.js";
import { comGerais, geraisVazios, fones, pagamento, type DadosGerais } from "./gerais.js";
import { dinheiroPtBr, type ItemDeCobertura } from "./tabela.js";
import type { DocumentoExtraido } from "./modelo.js";
import type { LinhaPosicionada } from "./pdf/motor.js";

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

  /*
   * Coberturas: de "Cap.Segurado(R$)" (sozinho ou no fim do cabecalho) ate os
   * servicos complementares. A linha traz os valores no fim ("Morte 100.000,00
   * 30,00 - -") ou na linha de baixo; a descricao pode quebrar em volta.
   */
  const i = linhas.findIndex((l) => /Cap\.Segurado\(R\$\)/i.test(l));
  const fim = linhas.findIndex((l, k) => k > i && /^SERVIÇOS COMPLEMENTARES/i.test(l));
  const bloco = i < 0 ? [] : linhas.slice(i + 1, fim < 0 ? i + 20 : fim);
  const itens: ItemDeCobertura[] = tabelaPorValores(bloco, { valor: /^(?:\d[\d.]*,\d{2}|-)$/ })
    .map((t) => {
      const [capital, ...outros] = t.valores.filter((x) => /\d,\d{2}/.test(x));
      const valor = dinheiroPtBr(capital);
      return valor === null ? null : { descricao: t.descricao, valor, outros_valores: outros };
    })
    .filter((x): x is ItemDeCobertura => x !== null && x.descricao.length > 0);
  /* "Data de Nascimento" sozinho ou com outros rotulos na linha ("... Renova Apólice Nº Seguradora"): a data vem embaixo. */
  const iNasc = linhas.findIndex((l) => /^Data de Nascimento\b/i.test(l.trim()));
  const nasc = iNasc < 0 ? null : (linhas.slice(iNasc + 1, iNasc + 4).map((l) => /^(\d{2}\/\d{2}\/\d{4})\b/.exec(l.trim())?.[1]).find((x) => x !== undefined) ?? null);
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
    segurado_documento: iSeg < 0 ? null : cpfOuCnpj(mSeg?.[2] ?? null),
    /* Bairro e cidade vem colados na mesma linha, sem separador: so o CEP. */
    segurado_endereco: enderecoOuNulo({
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

/* ---------------------------------------------------------- dados gerais */

/**
 * Yelum Vida: quadros de CABECALHO numa linha e VALOR na de baixo (lidos pela
 * coluna): "Apólice | Endosso | Nº do Contrato | Proposta", "Vigência do
 * Seguro | Data de Emissão | Data da 1ª Contratação do Seguro", prêmios,
 * "Tipo de Cobrança" + "Nº Parcelas", "Data de Nascimento | Renova Apólice Nº
 * | Seguradora", "Telefone 1 | Telefone 2 | E-mail", a UF antes do CEP e os
 * beneficiarios ("NOME 100% PAIS").
 */
export function geraisVidaYelum(pos: readonly LinhaPosicionada[]): DadosGerais {
  const g = geraisVazios();
  const linhas = pos.map((l) => l.texto);
  const q = (rotulos: string[]) => quadroPorColuna(pos, rotulos) ?? new Map<string, string>();
  const ap = q(["Apólice", "Endosso", "Nº do Contrato", "Proposta"]);
  const datasAp = q(["Vigência do Seguro", "Data de Emissão", "Data da 1ª Contratação do Seguro"]);
  const premio = q(["Prêmio Líquido (R$)", "Adic. Frac. (R$)", "Custo Apólice (R$)", "IOF (R$)", "Prêmio Total (R$)"]);
  const ren = q(["Data de Nascimento", "Renova Apólice Nº", "Seguradora"]);
  /* Um telefone ("Telefone | E-mail") ou dois ("Telefone 1 | Telefone 2 | E-mail"). */
  const contato = quadroPorColuna(pos, ["Telefone 1", "Telefone 2", "E-mail"]) ?? q(["Telefone", "E-mail"]);
  /*
   * FORMA DE PAGAMENTO: a grade de parcelas ("0001 26/09/2026 13,96", no debito
   * com banco/agencia/conta no meio) corre ao lado dos rotulos; a forma e o
   * texto antes da parcela numa das linhas ("CARTÃO DE CRÉDITO 0001 ...",
   * "DEBITO EM C/C 0002 ..."), as parcelas pela grade (todas de 1 ate a maior).
   */
  const grade = secao(linhas, /^Tipo de Cobrança\b/i, /^(ATENÇÃO|DADOS DO SEGURO)/i, 30).slice(1);
  const PARCELA = /(?:^|\s)(\d{4})\s+(?:\d+\s+\d+\s+[\d-]+\s+-\s+\d\s+)?\d{2}\/\d{2}\/\d{4}\s+[\d.]+,\d{2}\s*$/;
  const forma =
    grade.map((l) => /^([A-ZÀ-Ú][A-ZÀ-Ú/ ]*[A-ZÀ-Ú/])\s+\d{4}\s/.exec(l.trim())?.[1]).find((x) => x !== undefined && !/^N[ºo°] PARCELAS$/i.test(x)) ?? null;
  const numeros = new Set(grade.map((l) => Number(PARCELA.exec(l)?.[1] ?? 0)).filter((x) => x > 0));
  const maior = Math.max(0, ...numeros);
  const completa = maior > 0 && [...Array(maior).keys()].every((k) => numeros.has(k + 1));
  const iParc = linhas.findIndex((l) => /^N[ºo°] Parcelas\b/i.test(l));
  const impresso = iParc < 0 ? Number.NaN : Number(/^(\d{1,2})\b/.exec(linhas[iParc + 1] ?? "")?.[1] ?? Number.NaN);
  /* O "Nº Parcelas" impresso logo abaixo do rotulo vence; quando a grade o empurra para baixo, a grade conta. */
  const parcelas = Number.isFinite(impresso) ? impresso : completa ? maior : null;
  const iBairro = linhas.findIndex((l) => /^Bairro Cidade UF CEP$/i.test(l.trim()));
  const uf = iBairro < 0 ? null : ufDe(/\s([A-Z]{2})\s+\d{5}-\d{3}\s*$/.exec(linhas[iBairro + 1] ?? "")?.[1]);
  const vig = datas(datasAp.get("Vigência do Seguro"));
  const renova = digitos(ren.get("Renova Apólice Nº"));
  /* "Liberty Vida ..." e a marca antiga da Yelum (mesma cia, mesmo layout). */
  g.produto = achar(linhas.slice(0, 2), /^((?:Yelum|Liberty) Vida .+)$/i);
  g.proposta = digitos(ap.get("Proposta")) || null;
  g.vigencia_inicio = vig[0] ?? null;
  g.vigencia_fim = vig[1] ?? null;
  g.emissao = data(datasAp.get("Data de Emissão"));
  g.premio_liquido = dinheiro(premio.get("Prêmio Líquido (R$)"));
  g.premio_total = dinheiro(premio.get("Prêmio Total (R$)"));
  g.pagamento = pagamento(forma, parcelas);
  g.renovacao_de = renova.length >= 8 ? { numero: renova, seguradora: vazio(ren.get("Seguradora")) } : null;
  g.segurado = {
    email: email(contato.get("E-mail")),
    telefones: fones(contato.get("Telefone 1"), contato.get("Telefone 2"), contato.get("Telefone")),
    ...(uf !== null ? { endereco: { cep: null, logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, uf } } : {}),
  };
  g.vida = {
    beneficiarios: secao(linhas, /^DADOS DO\(S\) BENEFICIÁRIO\(S\)/i, /^DADOS DO CORRETOR/i, 15)
      .slice(1)
      .map((l) => /^(.+?)\s+(\d{1,3}(?:[.,]\d+)?)%\s+(.+)$/.exec(l.trim()))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => ({ nome: vazio(m[1]), documento: null, nascimento: null, parentesco: vazio(m[3]), percentual: Number((m[2] as string).replace(",", ".")) })),
  };
  return g;
}


/* ------------------------------------------------------- modelo unico */

/** A apolice no modelo unico; `null` quando nao e a pedida. */
export function documentoVidaYelum(doc: DocumentoExtraido, pos: readonly LinhaPosicionada[], numero: string): DocumentoExtraido | null {
  const v = lerVidaYelum(pos.map((l) => l.texto), numero);
  return v === null ? null : comGerais(deVida(doc, v), geraisVidaYelum(pos));
}
