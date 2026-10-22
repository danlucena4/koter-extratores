/**
 * HDI RESIDENCIAL (Lar Essencial, HDI Duo, HDI Em Casa; ramo 0114
 * Compreensivo Residencial). Amostra de 2026-10-20 (cobranca LAR_EM_CASA): 8
 * PDFs. O leitor do risco e os DADOS GERAIS se juntam em
 * `documentoResidencialHdi`.
 */
import { achar, cep, cpfOuCnpj, data, datas, digitos, dinheiro, email, enderecoOuNulo, ruaNumeroComplemento, secao, vazio } from "./leitura.js";
import { deResidencial, ehBasica, type ResidencialLido } from "./residencial.js";
import { comGerais, geraisVazios, fones, pagamento, quadro, resposta, type DadosGerais } from "./gerais.js";
import { tabelaDeCoberturas } from "./tabela.js";
import type { DocumentoExtraido, FranquiaExtraida } from "./modelo.js";
import type { EnderecoLido } from "./tipos.js";
import type { LinhaPosicionada } from "./pdf/motor.js";

/**
 * HDI (LAR ESSENCIAL / EM CASA): "Apólice 00.000.000.000000", "CPF :",
 * "Localização" + "<cod> - <endereco> - <cidade> - <UF> - <CEP>" e
 * "Número: 99 - Bairro: X", "OCUPAÇÃO : Residencia Habitual Apartamento
 * (00000)", a tabela "Coberturas (Valores em R$) L.M.I. Prêmio Líquido" e
 * "Coberturas de Assistencias <plano>".
 *
 * O PDF vem do documento da propria apolice (sem numero para comparar no
 * pedido); a trava e ser o ramo Compreensivo Residencial da HDI.
 */
export function lerResidencialHdi(linhas: readonly string[]): ResidencialLido | null {
  if (!linhas.some((l) => /Compreensivo Residencial/i.test(l)) || !linhas.some((l) => /^HDI SEGUROS/i.test(l))) return null;
  const numero = digitos(achar(linhas, /^Apólice\s+([\d.]+)/));

  const iLoc = linhas.findIndex((l) => /^Localização$/i.test(l.trim()));
  const loc = iLoc < 0 ? null : (linhas[iLoc + 1] ?? null);
  const partes = loc === null ? [] : loc.split(/\s+-\s+/);
  const cep = digitos(partes[partes.length - 1] ?? null);
  const uf = vazio(partes[partes.length - 2] ?? null)?.toUpperCase() ?? null;
  const cidade = vazio(partes[partes.length - 3] ?? null);
  const rua = vazio(partes.slice(1, -3).join(" - "));
  const numeroImovel = iLoc < 0 ? null : achar(linhas.slice(iLoc, iLoc + 4), /^Número:\s*(\S+)/i);
  const bairro = iLoc < 0 ? null : achar(linhas.slice(iLoc, iLoc + 4), /Bairro:\s*(.+)$/i);
  const [antes, ...comp] = (rua ?? "").split(/\s+\/\s+/);
  const logradouro = vazio(numeroImovel !== null ? (antes ?? "").replace(new RegExp(`\\s+${numeroImovel}$`), "") : antes);
  const imovel: EnderecoLido = {
    cep: cep.length === 8 ? cep : null,
    logradouro,
    numero: numeroImovel,
    complemento: vazio(comp.join(" / ")),
    bairro,
    cidade: cidade === null ? null : cidade.replace(/\b\w/g, (c) => c),
    uf: uf !== null && /^[A-Z]{2}$/.test(uf) ? uf : null,
  };

  /* "Residencia Habitual Apartamento (00000)" -> ocupacao Habitual, tipo Apartamento. */
  const ocup = achar(linhas, /^OCUPAÇÃO\s*:\s*(.+?)\s*\(\d+\)\s*$/i);
  const mOcup = ocup === null ? null : /^Residencia\s+(Habitual|Veraneio|Desocupad\S*)\s+(.+)$/i.exec(ocup);

  const itens = tabelaDeCoberturas(linhas, /^Coberturas \(Valores em R\$\s*\)/i, /^(Franquias\b|\(PI\)|.*Período Indenitário)/i, {
    minimoDeValores: 2,
  });
  const assist = itens.find((i) => /Assistencias/i.test(i.descricao));
  const coberturas = itens.filter((i) => !/Assistencias/i.test(i.descricao));
  return {
    numero,
    segurado_nome: null,
    segurado_documento: cpfOuCnpj(achar(linhas, /^CPF\s*:\s*([\d.\-/]+)/)),
    segurado_endereco: null,
    imovel: Object.values(imovel).every((v) => v === null) ? null : imovel,
    tipo_imovel: vazio(mOcup?.[2] ?? null),
    ocupacao: vazio(mOcup?.[1] ?? null),
    condominio_fechado: null,
    coberturas,
    lmi_basica: coberturas.find((c) => ehBasica(c.descricao))?.valor ?? null,
    assistencia: assist === undefined ? null : vazio(assist.descricao.replace(/^Coberturas de Assistencias\s*/i, "")),
  };
}

/* ---------------------------------------------------------- dados gerais */

const ROT_HDI_SEGURADO = ["Nome Social do Segurado", "Nome de Registro do Segurado", "Segurado", "Email", "CPF", "RG", "Órgão Emissor", "Emissão do R.G.", "Endereço", "Telefone", "Celular", "Bairro", "Cidade", "CEP", "Código CI"];
const ROT_HDI_PREMIO = ["Prêmio Líquido", "Adicional de parcelamento", "Custo de Apólice", "I.O.F.", "Prêmio Total"];

/**
 * HDI (Lar Essencial / HDI Duo / HDI Em Casa): o cabecalho "HDI Duo -
 * SALVADOR" (produto - sucursal), "Novo Negócio|Renovação Versão:", o quadro
 * do segurado ("Segurado :" ou "Nome de Registro do Segurado :", Email, CPF,
 * Endereço ... Telefone, Bairro, Cidade - UF CEP), Proposta e Vigência,
 * prêmios, cobrança ("Tipo de Cobrança", "Forma de Pagamento: 12 x"),
 * "emitido as hh:mm:ss, do dia dd/mm/aaaa", LMG, o quadro do risco (TIPO DE
 * CONSTRUÇÃO, BEM SEGURADO, ANOS DE BÔNUS ...) e as Franquias (nome da
 * cobertura numa linha, o texto na de baixo).
 */
export function geraisResidencialHdi(linhas: readonly string[]): DadosGerais {
  const g = geraisVazios();
  /* O complemento pode vir colado no rotulo seguinte ("... / Apt 202Telefone : ..."). */
  const seg = quadro(linhas.slice(0, 16).map((l) => l.replace(/(\S)(Telefone\s*:)/, "$1 $2")), ROT_HDI_SEGURADO);
  const premio = quadro(secao(linhas, /^Prêmio da Apólice/i, /^Parcelamento do Prêmio/i, 8), ROT_HDI_PREMIO);
  const cob = quadro(secao(linhas, /^Dados de Cobrança/i, /^Multa de Mora/i, 6), ["Banco", "Tipo de Cobrança", "Parcela", "Forma de Pagamento", "Juros parcelamento"]);
  const end = ruaNumeroComplemento((seg.get("Endereço") ?? "").replace(/\s*\/\s*/, ", "));
  const cidadeUf = /^(.*?)\s*-\s*([A-Z]{2})$/.exec(seg.get("Cidade") ?? "");
  const parcelas = Number(/^(\d{1,2})\s*x/i.exec(cob.get("Forma de Pagamento") ?? "")?.[1]);

  /* Quadro do risco: "ROTULO : valor (codigo)". */
  const iRisco = linhas.findIndex((l) => /^OCUPAÇÃO\s*:/i.test(l));
  const risco = iRisco < 0 ? [] : secao(linhas.slice(iRisco), /^OCUPAÇÃO/i, /^Coberturas \(/i, 12);
  const respostas = risco
    .map((l) => /^([A-ZÀ-Ú][A-ZÀ-Ú ]+?)\s*:\s*(.+)$/.exec(l.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ pergunta: m[1] as string, resposta: (m[2] as string).trim() }));
  const doRisco = (re: RegExp) => vazio(resposta(respostas, re)?.replace(/\s*\(\d+\)\s*$/, ""));

  /* Franquias: "<cobertura>" / "10% Sobre os Prejuizos ..., com o Minimo de R$ 350,00" | "Sem Franquia". */
  const franquias: FranquiaExtraida[] = [];
  const blocoF = secao(linhas, /^Franquias$/, /^Se previsto/i, 40).slice(1).map((l) => l.trim());
  blocoF.forEach((l, k) => {
    if (k === 0 || !/^(Sem Franquia|\d+%)/i.test(l)) return;
    const nome = blocoF[k - 1] as string;
    if (/^(Sem Franquia|\d+%)/i.test(nome)) return;
    franquias.push({ descricao: nome, tipo: vazio(l.replace(/\.\s*$/, "")), valor: dinheiro(/R\$\s*([\d.]+,\d{2})/.exec(l)?.[1]) });
  });

  const lmg = /Limite máximo de garantia da apolice\s*\(\s*R\$\s*([\d.]+,\d{2})/i.exec(linhas.find((l) => /^LMG\b/.test(l)) ?? "")?.[1];
  const valorNovo = linhas.some((l) => /^Clausula Especifica de Valor Novo\b/i.test(l.trim()));
  g.produto = achar(linhas.slice(1, 3), /^(HDI\s+(?!SEGUROS).+?)\s+-\s+\S.*$/i);
  g.tipo_seguro = achar(linhas.slice(0, 6), /^(Novo Negócio|Renovação|Endosso)\s+Versão:/i);
  g.proposta = digitos(achar(linhas, /\bProposta:\s*(\d+)/)) || null;
  const vig = datas(linhas.find((l) => /Vigência:\s*das/i.test(l)));
  g.vigencia_inicio = vig[0] ?? null;
  g.vigencia_fim = vig[1] ?? null;
  g.emissao = data(achar(linhas, /emitido as [\d:]+, do dia (\d{2}\/\d{2}\/\d{4})/i));
  g.premio_liquido = dinheiro(premio.get("Prêmio Líquido"));
  g.premio_total = dinheiro(premio.get("Prêmio Total"));
  g.pagamento = pagamento(vazio(cob.get("Tipo de Cobrança")), Number.isFinite(parcelas) ? parcelas : null);
  g.franquias = franquias;
  g.segurado = {
    nome: vazio(seg.get("Nome de Registro do Segurado") ?? seg.get("Segurado") ?? seg.get("Nome Social do Segurado")),
    documento: cpfOuCnpj(seg.get("CPF")),
    email: email(seg.get("Email")),
    telefones: fones(seg.get("Telefone"), seg.get("Celular")),
    endereco: enderecoOuNulo({
      cep: cep(seg.get("CEP")),
      ...end,
      bairro: vazio(seg.get("Bairro")),
      cidade: vazio(cidadeUf?.[1] ?? null),
      uf: cidadeUf?.[2] ?? null,
    }),
  };
  g.residencial = {
    tipo_construcao: doRisco(/^TIPO DE CONSTRU/),
    bem_segurado: doRisco(/^BEM SEGURADO/),
    bonus: doRisco(/^ANOS DE B[ÔO]NUS/),
    plano_assistencia: achar(linhas, /^Coberturas de Assistencias\s+(.+?)\s+[\d.]+,\d{2}\s+[\d.]+,\d{2}\s*$/i),
    lmg: dinheiro(lmg),
    valor_de_novo: valorNovo ? true : null,
    respostas,
  };
  return g;
}

/* ------------------------------------------------------- modelo unico */

/** A apolice no modelo unico. O PDF vem do documento da propria apolice: a trava e o ramo. */
export function documentoResidencialHdi(doc: DocumentoExtraido, pos: readonly LinhaPosicionada[]): DocumentoExtraido | null {
  const linhas = pos.map((l) => l.texto);
  const r = lerResidencialHdi(linhas);
  return r === null ? null : comGerais(deResidencial(doc, r), geraisResidencialHdi(linhas));
}
