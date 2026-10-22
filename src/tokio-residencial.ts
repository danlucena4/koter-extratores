/**
 * TOKIO MARINE RESIDENCIAL (PDF da apolice). Amostra de 2026-10-20
 * (cobranca): 1 PDF. O leitor do risco e os DADOS GERAIS se juntam em
 * `documentoResidencialTokio`.
 */
import { achar, cpfOuCnpj, data, datas, digitos, dinheiro, email, secao, vazio } from "./leitura.js";
import { deResidencial, ehBasica, type ResidencialLido } from "./residencial.js";
import { comGerais, geraisVazios, fones, franquiasEntremeadas, pagamento, parcelasDaGrade, quadro, type DadosGerais } from "./gerais.js";
import { tabelaDeCoberturas } from "./tabela.js";
import type { EnderecoLido } from "./tipos.js";
import type { DocumentoExtraido } from "./modelo.js";
import type { LinhaPosicionada } from "./pdf/motor.js";

/**
 * Tokio Marine Residencial: "Apólice nº 00000000 - RESIDENCIAL", "Tipo de
 * Imóvel:", "Ocupação:", "Local do Risco: ... Número Logradouro: 99",
 * "Complemento: ... Bairro: ...", "Cidade: ... CEP: ... UF: ..", e a tabela
 * "Coberturas Contratadas" ate "Prêmio Líquido Total".
 */
export function lerResidencialTokio(linhas: readonly string[], numeroApolice: string): ResidencialLido | null {
  if (!linhas.some((l) => /Tokio Marine Residencial/i.test(l))) return null;
  const impresso = achar(linhas, /Apólice\s*n[ºo°]\s*(\d{5,})\s*-\s*RESIDENCIAL/i) ?? achar(linhas, /\bApólice:\s*(\d{5,})/);
  if (impresso === null || impresso.replace(/^0+/, "") !== numeroApolice.replace(/\D/g, "").replace(/^0+/, "")) return null;

  const iLocal = linhas.findIndex((l) => /^Local do Risco:/i.test(l));
  const local = iLocal < 0 ? [] : linhas.slice(iLocal, iLocal + 4);
  const cep = digitos(achar(local, /CEP:\s*([\d-]{8,9})/i));
  const imovel: EnderecoLido = {
    cep: cep.length === 8 ? cep : null,
    logradouro: achar(local, /^Local do Risco:\s*(.+?)\s+Número Logradouro:/i),
    numero: achar(local, /Número Logradouro:\s*(\S+)/i),
    complemento: achar(local, /^Complemento:\s*(.+?)\s+Bairro:/i),
    bairro: achar(local, /Bairro:\s*(.+)$/i),
    cidade: achar(local, /^Cidade:\s*(.+?)\s+CEP:/i),
    uf: achar(local, /UF:\s*([A-Z]{2})\b/),
  };
  /* Segurado: "Endereço: RUA X , 99 - COMPL" / "Bairro: X" / "CEP: 00000-000 Cidade: X UF: BA" logo abaixo do CPF. */
  const iSeg = linhas.findIndex((l) => /^Segurado:/.test(l));
  const seg = iSeg < 0 ? [] : linhas.slice(iSeg, iSeg + 6);
  const mRua = /^(.*?)\s*,\s*(\d+\S*)\s*(?:-\s*(.*))?$/.exec(achar(seg, /^Endereço:\s*(.+)$/) ?? "");
  const mCep = /^CEP:\s*(\d{5}-\d{3})\s+Cidade:\s*(.+?)\s+UF:\s*([A-Z]{2})\b/.exec(seg.find((l) => /^CEP:/.test(l)) ?? "");
  const segEnd: EnderecoLido = {
    cep: mCep === null ? null : digitos(mCep[1]),
    logradouro: vazio(mRua?.[1]),
    numero: vazio(mRua?.[2]),
    complemento: vazio(mRua?.[3]),
    bairro: achar(seg, /^Bairro:\s*(.+)$/),
    cidade: vazio(mCep?.[2]),
    uf: mCep?.[3] ?? null,
  };
  const tipo = achar(linhas, /Tipo de Imóvel:\s*(.+)$/i);
  const itens = tabelaDeCoberturas(linhas, /^Coberturas Contratadas/i, /^Prêmio Líquido Total/i, { minimoDeValores: 2 });
  const assistLinha = achar(linhas, /^(Assistência\s+\d+\s+horas.*?)\s+[\d.]+,\d{2}\s*$/i);
  return {
    numero: impresso,
    segurado_nome: achar(linhas, /^Segurado:\s*(.+?)(?:\s+Nome Social:.*)?$/),
    segurado_documento: cpfOuCnpj(achar(linhas, /^CPF\s*:\s*([\d.\-/]+)/)),
    segurado_endereco: Object.values(segEnd).every((v) => v === null) ? null : segEnd,
    imovel: Object.values(imovel).every((v) => v === null) ? null : imovel,
    tipo_imovel: tipo,
    ocupacao: achar(linhas, /^Ocupação:\s*(.+)$/i),
    condominio_fechado: tipo === null ? null : /Condom[íi]nio/i.test(tipo),
    coberturas: itens,
    lmi_basica: itens.find((c) => ehBasica(c.descricao))?.valor ?? null,
    assistencia: assistLinha,
  };
}

/* ---------------------------------------------------------- dados gerais */

const FRANQUIA_TOKIO = /\d+%\s+dos preju[íi]zos indeniz[áa]veis com m[íi]nimo de\s*(?<vao>(?:(?!R\$).)*?)\s*R\$\s*(?<minimo>[\d.]+,\d{2})/;

/**
 * Tokio Marine Residencial: "Vigência: a partir ... até ...", "Ramo: 01.14
 * Apólice: X Negócio: Y Item: Z", "Tipo de Seguro: ... Classe de Bônus: N",
 * "Data da Emissão:", E-mail/Celular/Telefone, "Tipo de Construção: ... Tipo
 * de Imóvel:", "Tipo de Cobertura:", "Tipo de Indenização: Valor de Novo",
 * "Assistência 24 horas Plano Vip 515,79", "Limite Máximo de Garantia:", a
 * tabela "Cobertura P.O.S" (nome entremeado) e prêmios/parcelas.
 */
export function geraisResidencialTokio(linhas: readonly string[], coberturas: readonly string[]): DadosGerais {
  const g = geraisVazios();
  const vig = datas(linhas.find((l) => /^Vigência:\s*a partir/i.test(l)));
  const contato = quadro(linhas.slice(0, 60), ["Celular", "Telefone", "E-mail"]);
  const indenizacao = achar(linhas, /^Tipo de Indenização:\s*(.+)$/i);
  g.produto = achar(linhas, /^(Tokio Marine Residencial)\s+-\s+Apólice/i);
  g.item = achar(linhas, /\bItem:\s*(\d+)/);
  g.tipo_seguro = achar(linhas, /^Tipo de Seguro:\s*(.+?)(?:\s+Classe de Bônus:.*)?$/i);
  g.emissao = data(achar(linhas, /Data da Emissão:\s*(\d{2}\/\d{2}\/\d{4})/i));
  g.vigencia_inicio = vig[0] ?? null;
  g.vigencia_fim = vig[1] ?? null;
  g.premio_liquido = dinheiro(achar(linhas, /^Prêmio Líquido Total:\s*(?:R\$\s*)?([\d.]+,\d{2})/i));
  g.premio_total = dinheiro(achar(linhas, /^Prêmio Total:\s*R\$\s*([\d.]+,\d{2})/i));
  g.pagamento = pagamento(achar(linhas, /\bCobrança:\s*(.+)$/), parcelasDaGrade(secao(linhas, /^Parcela Valor \(R\$\) Vencimento/i, /^Após o vencimento/i, 20)));
  g.franquias = franquiasEntremeadas(secao(linhas, /^Cobertura P\.O\.S$/i, /^Esta Apólice/i, 30).slice(1), coberturas, FRANQUIA_TOKIO);
  g.segurado = { email: email(contato.get("E-mail")), telefones: fones(contato.get("Celular"), contato.get("Telefone")) };
  g.residencial = {
    tipo_construcao: achar(linhas, /^Tipo de Construção:\s*(.+?)\s+Tipo de Imóvel:/i),
    bem_segurado: achar(linhas, /^Tipo de Cobertura:\s*(.+)$/i),
    plano_assistencia: achar(linhas, /^Assistência 24 horas\s+(.+?)\s+[\d.]+,\d{2}\s*$/i),
    lmg: dinheiro(achar(linhas, /^Limite Máximo de Garantia:\s*(R\$\s*[\d.]+,\d{2})/i)),
    valor_de_novo: indenizacao === null ? null : /Valor de Novo/i.test(indenizacao) ? true : /Valor Atual|Deprecia/i.test(indenizacao) ? false : null,
    bonus: achar(linhas, /Classe de Bônus:\s*(\d+)/i),
  };
  return g;
}

/* ------------------------------------------------------- modelo unico */

/** A apolice no modelo unico; `null` quando nao e a pedida. */
export function documentoResidencialTokio(doc: DocumentoExtraido, pos: readonly LinhaPosicionada[], numero: string): DocumentoExtraido | null {
  const linhas = pos.map((l) => l.texto);
  const r = lerResidencialTokio(linhas, numero);
  return r === null ? null : comGerais(deResidencial(doc, r), geraisResidencialTokio(linhas, r.coberturas.map((c) => c.descricao)));
}
