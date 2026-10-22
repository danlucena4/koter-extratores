/**
 * PORTO RESIDENCIAL (Habitual, Veraneio e Premium; tambem Itau e Azul, que
 * saem da Porto). Amostra de 2026-10-20 (cobranca): 8 PDFs. O leitor do risco
 * e os DADOS GERAIS se juntam em `documentoResidencialPorto`.
 */
import { achar, chaveDeTexto, cpfOuCnpj, datas, digitos, dinheiro, email, secao, simNao, vazio } from "./leitura.js";
import { deResidencial, ehBasica, type ResidencialLido } from "./residencial.js";
import {
  comGerais,
  geraisVazios,
  dataPorExtenso,
  fones,
  franquiasEntremeadas,
  pagamento,
  parcelasDaGrade,
  quadro,
  resposta,
  type DadosGerais,
} from "./gerais.js";
import { dinheiroPtBr, type ItemDeCobertura } from "./tabela.js";
import type { EnderecoLido } from "./tipos.js";
import type { DocumentoExtraido } from "./modelo.js";
import type { LinhaPosicionada } from "./pdf/motor.js";

const VALOR_PORTO = /R\$\s*((?:\d{1,3}(?:\.\d{3})+|\d+),\d{2})/g;

/**
 * Tabela de coberturas da Porto: a descricao longa QUEBRA em volta da linha de
 * valores ("INCÊNDIO, EXPLOSÃO, IMPLOSÃO, FUMAÇA E" / "R$ 300.000,00 R$ 90,00" /
 * "QUEDA DE AERONAVE"); as curtas vem com os valores na mesma linha. Uma linha
 * sem valor depois da linha so de valores e continuacao, a menos que a linha
 * seguinte seja outra linha so de valores (ai e a descricao do proximo item).
 */
export function tabelaDeCoberturasPorto(bloco: readonly string[]): ItemDeCobertura[] {
  const linhas = bloco.map((l) => l.trim()).filter((l) => l.length > 0 && !/^\d+$/.test(l) && !/^(?:\d\s+)?(PREÇO \(R\$\)|NOME DA COBERTURA|L\.M\.I|Cobertura:|\(R\$\))/i.test(l));
  const valores = (l: string) => [...l.matchAll(VALOR_PORTO)].map((m) => m[1] as string);
  const soValores = (l: string) => valores(l).length >= 2 && l.replace(VALOR_PORTO, "").trim().length === 0;
  const itens: ItemDeCobertura[] = [];
  let pendente: string | null = null;
  let depoisDeSoValores = false;
  linhas.forEach((l, k) => {
    const v = valores(l);
    if (v.length >= 2) {
      const descricao = soValores(l) ? pendente : l.slice(0, l.search(VALOR_PORTO)).trim();
      const valor = dinheiroPtBr(v[0]);
      if (descricao !== null && descricao.length > 0 && valor !== null) itens.push({ descricao, valor, outros_valores: v.slice(1) });
      depoisDeSoValores = soValores(l) && pendente !== null;
      pendente = null;
      return;
    }
    if (v.length > 0 || !/[A-Za-zÀ-ú]{3,}/.test(l)) return;
    const ultimo = itens[itens.length - 1];
    if (depoisDeSoValores && ultimo !== undefined && !soValores(linhas[k + 1] ?? "")) {
      ultimo.descricao = `${ultimo.descricao} ${l}`;
      depoisDeSoValores = false;
      return;
    }
    depoisDeSoValores = false;
    pendente = pendente === null ? l : `${pendente} ${l}`;
  });
  return itens;
}

/**
 * Porto Residencial ("Seguro Residencial Habitual", "Porto Residência
 * Veraneio" e o layout Premium, com rotulos em caixa baixa). Amostra: 8 PDFs
 * da cobranca, 2026-10-20.
 *
 *   Número da apólice: 000 00 0000000 Ramo: 114     (a TRAVA: o ultimo grupo)
 *   DADOS DO SEGURADO / Nome: / CPF: / Endereço: RUA X, 123 - APTO 4
 *   Bairro: / Cidade: X Estado: BA CEP: 00000-000
 *   LOCAL SEGURADO / Endereço: RUA X 123 APTO 4      (rua e numero SEM separador)
 *   Bairro: [Cidade:] / [Cidade:] Estado: BA CEP:
 *   Tipo de residência: APARTAMENTO | CASAS DE ALVENARIA
 *   COBERTURAS CONTRATADAS ... PREÇO LÍQUIDO DAS COBERTURAS
 *   SERVIÇOS CONTRATADOS / PLANO ESSENCIAL - GRATUITO APARTAMENTO
 *
 * O endereco do RISCO vem sem virgula entre rua e numero: so e dividido quando
 * comeca com a rua e o numero do endereco do segurado (impressos separados);
 * senao rua/numero ficam nulos e o resto (CEP, bairro, cidade, UF) entra.
 */
export function lerResidencialPorto(linhas: readonly string[], numeroApolice: string): ResidencialLido | null {
  const impresso = achar(linhas, /N[uú]mero da ap[oó]lice:\s*([\d ]+?)(?:\s+(?:Ramo|N[uú]mero)\b.*)?$/i);
  const ultimo = (impresso ?? "").trim().split(/\s+/).pop()?.replace(/^0+/, "") ?? "";
  const pedido = digitos(numeroApolice).replace(/^0+/, "");
  if (pedido.length < 5 || ultimo !== pedido) return null;
  if (!linhas.some((l) => /Resid[êe]ncia|Residencial/i.test(l)) || !linhas.some((l) => /^Tipo de resid[êe]ncia:/i.test(l))) return null;

  const iSeg = linhas.findIndex((l) => /^Dados do segurado$/i.test(l.trim()));
  const seg = iSeg < 0 ? [] : linhas.slice(iSeg, iSeg + 8);
  const mRua = /^(.+?),\s*(\d+[A-Za-z]?)\s*(?:-\s*(.+))?$/.exec(achar(seg, /^Endereço:\s*(.+)$/i) ?? "");
  const cidadeLinha = (bloco: string[]) => achar(bloco, /Cidade:\s*(.+?)(?:\s+Estado:.*)?$/i);
  const cepDe = (bloco: string[]) => {
    const c = digitos(achar(bloco, /CEP:\s*(\d{5}-?\d{3})/i));
    return c.length === 8 ? c : null;
  };
  const segEnd: EnderecoLido = {
    cep: cepDe(seg),
    logradouro: vazio(mRua?.[1]),
    numero: vazio(mRua?.[2]),
    complemento: vazio(mRua?.[3]),
    bairro: achar(seg, /^Bairro:\s*(.+?)(?:\s+Cidade:.*)?$/i),
    cidade: cidadeLinha(seg),
    uf: achar(seg, /Estado:\s*([A-Z]{2})\b/),
  };

  const iLocal = linhas.findIndex((l) => /^Local segurado$/i.test(l.trim()));
  const local = iLocal < 0 ? [] : linhas.slice(iLocal, iLocal + 6).filter((l, k) => k === 0 || !/^Tipo de resid/i.test(l));
  const ruaLocal = achar(local, /^Endereço:\s*(.+)$/i);
  let logradouro: string | null = null;
  let numero: string | null = null;
  let complemento: string | null = null;
  if (ruaLocal !== null && segEnd.logradouro !== null && segEnd.numero !== null) {
    const prefixo = chaveDeTexto(`${segEnd.logradouro} ${segEnd.numero}`).split(" ");
    const palavras = ruaLocal.trim().split(/\s+/);
    if (chaveDeTexto(palavras.slice(0, prefixo.length).join(" ")) === prefixo.join(" ")) {
      logradouro = vazio(palavras.slice(0, prefixo.length - 1).join(" "));
      numero = vazio(palavras[prefixo.length - 1]);
      complemento = vazio(palavras.slice(prefixo.length).join(" "));
    }
  }
  const imovel: EnderecoLido = {
    cep: cepDe(local),
    logradouro,
    numero,
    complemento,
    bairro: achar(local, /^Bairro:\s*(.+?)(?:\s+Cidade:.*)?$/i),
    cidade: cidadeLinha(local),
    uf: achar(local, /Estado:\s*([A-Z]{2})\b/),
  };

  const iCob = linhas.findIndex((l) => /^COBERTURAS CONTRATADAS$/i.test(l.trim()));
  const iFim = linhas.findIndex((l, k) => k > iCob && /^(PREÇO|Prêmio) líquido das coberturas/i.test(l));
  const coberturas = iCob < 0 || iFim < 0 ? [] : tabelaDeCoberturasPorto(linhas.slice(iCob + 1, iFim));
  const iServ = linhas.findIndex((l) => /^SERVIÇOS CONTRATADOS$/i.test(l.trim()));
  const assistencia = iServ < 0 ? null : vazio((linhas[iServ + 1] ?? "").replace(/\s*\(\d+\)\s*$/, ""));
  const ocupacao = linhas.map((l) => /Resid[êe]ncia(?:l)?\s+(Habitual|Veraneio)\b/i.exec(l)?.[1]).find((x) => x !== undefined) ?? null;
  const tipo = achar(linhas, /^Tipo de resid[êe]ncia:\s*(.+)$/i);
  return {
    numero: (impresso ?? "").replace(/\s+/g, ""),
    segurado_nome: achar(seg, /^Nome:\s*(.+)$/i),
    segurado_documento: cpfOuCnpj(achar(seg, /^CPF:\s*([\d.\-/]+)/i)),
    segurado_endereco: Object.values(segEnd).every((v) => v === null) ? null : segEnd,
    imovel: Object.values(imovel).every((v) => v === null) ? null : imovel,
    tipo_imovel: tipo,
    ocupacao,
    condominio_fechado: null,
    coberturas,
    lmi_basica: coberturas.find((c) => ehBasica(c.descricao))?.valor ?? null,
    assistencia,
  };
}

/* ---------------------------------------------------------- dados gerais */

const FRANQUIA_PORTO = /N[ãa]o h[áa]|\d+%\s+das indeniza[çc][õo]es com m[íi]nimo de\s*(?<vao>(?:(?!R\$|N[ãa]o h[áa]).)*?)\s*R\$\s*(?<minimo>[\d.]+,\d{2})\.?/;

/**
 * Porto Residencial (Habitual, Veraneio e Premium): o produto no comeco
 * ("Seguro Residencial Habitual"), "Apólice: *Renovação*|*Nova*", "Número da
 * proposta", Vigência (o fim pode cair duas linhas abaixo no Premium),
 * Telefone/Celular e E-mail do segurado, PARTICIPAÇÃO OBRIGATÓRIA (nome
 * entremeado com o texto), QUESTIONÁRIO ("...condomínio horizontal?: Sim",
 * "...Valor de Novo...?: Sim"), VALORES DO SEGURO, FORMA DE PAGAMENTO e a
 * grade de parcelas, e "Bahia, 7 de julho de 2026" / "Local e data de emissão".
 */
export function geraisResidencialPorto(linhas: readonly string[], coberturas: readonly string[]): DadosGerais {
  const g = geraisVazios();
  const iVig = linhas.findIndex((l) => /^Vigência:\s*A partir/i.test(l));
  const vig = iVig < 0 ? [] : datas(linhas.slice(iVig, iVig + 3).join(" "));
  const seg = secao(linhas, /^Dados do segurado$/i, /^Dados do corretor$/i, 10);
  const contato = quadro(seg, ["Telefone", "Celular", "E-mail"]);
  const q = secao(linhas, /^QUESTIONÁRIO$/i, /^INFORMAÇÕES ADICIONAIS$/i, 30);
  const respostas = q
    .map((l) => /^(.+?\?|LMI Discriminada[^:]*)\s*:\s*(\S.*)$/.exec(l.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ pergunta: (m[1] as string).trim(), resposta: (m[2] as string).trim() }));
  const valores = secao(linhas, /^VALORES DO SEGURO$/i, /^DADOS DO PAGAMENTO$/i, 20);
  const iForma = linhas.findIndex((l) => /^FORMA DE PAGAMENTO$/i.test(l.trim()));
  const forma = iForma < 0 ? null : vazio((linhas[iForma + 1] ?? "").replace(/\s+Banco:.*$/i, ""));
  const iLocal = linhas.findIndex((l) => /^Local e data de emissão$/i.test(l.trim()));
  const tipo = achar(linhas, /^Tipo de resid[êe]ncia:\s*(.+)$/i);
  const iServ = linhas.findIndex((l) => /^SERVIÇOS CONTRATADOS$/i.test(l.trim()));

  g.produto = achar(linhas.slice(0, 12), /^((?:Seguro Residencial|Porto Resid[êe]ncia)\s+\S+?)\.?$/i);
  g.tipo_seguro = achar(linhas, /^Apólice:\s*\*(.+?)\*/);
  g.proposta = digitos(achar(linhas, /N[uú]mero (?:da )?proposta:\s*([\d ]+)/i)) || null;
  g.vigencia_inicio = vig[0] ?? null;
  g.vigencia_fim = vig[1] ?? null;
  g.emissao = iLocal < 1 ? null : dataPorExtenso(linhas[iLocal - 1]);
  /* O premio liquido e o das coberturas MAIS o do plano de servicos, quando o plano e pago (as duas linhas impressas). */
  const liqCob = dinheiro(achar(valores, /^Pre[çc]o líquido das coberturas\s+(R\$\s*[\d.]+,\d{2})/i));
  const liqServ = dinheiro(achar(valores, /^Pre[çc]o líquido do plano de serviços\s+(R\$\s*[\d.]+,\d{2})/i));
  g.premio_liquido =
    liqCob === null || liqServ === null || liqServ.centavos === 0
      ? liqCob
      : { centavos: liqCob.centavos + liqServ.centavos, moeda: "BRL", original: `${liqCob.original} + ${liqServ.original}` };
  g.premio_total = dinheiro(achar(valores, /^Pre[çc]o total do seguro\s+(R\$\s*[\d.]+,\d{2})/i));
  g.pagamento = pagamento(forma, parcelasDaGrade(secao(linhas, /^PARCELAMENTO DO SEGURO$/i, /^(O vencimento|INFORMAÇÕES|Informações)/i, 12)));
  g.franquias = franquiasEntremeadas(secao(linhas, /^PARTICIPAÇÃO OBRIGATÓRIA DO SEGURADO/i, /^SERVIÇOS CONTRATADOS$/i, 30).slice(1), coberturas, FRANQUIA_PORTO);
  g.segurado = {
    telefones: fones(contato.get("Telefone"), contato.get("Celular")),
    email: email(contato.get("E-mail")),
  };
  g.residencial = {
    condominio_fechado: simNao(resposta(respostas, /condom[íi]nio horizontal/i)),
    valor_de_novo: simNao(resposta(respostas, /Valor de Novo/i)),
    tipo_construcao: tipo === null ? null : vazio(/\b(ALVENARIA|MADEIRA)\b/i.exec(tipo)?.[1]),
    plano_assistencia: iServ < 0 ? null : vazio((linhas[iServ + 1] ?? "").replace(/\s*\(\d+\)\s*$/, "")),
    respostas,
  };
  return g;
}

/* ------------------------------------------------------- modelo unico */

/** A apolice no modelo unico; `null` quando nao e a pedida. */
export function documentoResidencialPorto(doc: DocumentoExtraido, pos: readonly LinhaPosicionada[], numero: string): DocumentoExtraido | null {
  const linhas = pos.map((l) => l.texto);
  const r = lerResidencialPorto(linhas, numero);
  return r === null ? null : comGerais(deResidencial(doc, r), geraisResidencialPorto(linhas, r.coberturas.map((c) => c.descricao)));
}
