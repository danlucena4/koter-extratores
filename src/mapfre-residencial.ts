/**
 * MAPFRE RESIDENCIAL (PDF da apolice, "Seguro Residencial Multiflex"). Amostra
 * de 2026-10-20 (cobranca): 8 PDFs. O leitor do quadro (segurado, risco,
 * coberturas) e os DADOS GERAIS (vigencia, premios, pagamento, franquias,
 * questionario) se juntam em `documentoResidencialMapfre`.
 */
import { achar, cpfOuCnpj, datas, digitos, dinheiro, email, secao, simNao, vazio } from "./leitura.js";
import { deResidencial, ehBasica, separarAssistencia, type ResidencialLido } from "./residencial.js";
import { comGerais, geraisVazios, dataPorExtenso, fones, pagamento, perguntas, quadro, resposta, type DadosGerais } from "./gerais.js";
import { tabelaDeCoberturas } from "./tabela.js";
import type { DocumentoExtraido, FranquiaExtraida } from "./modelo.js";
import type { EnderecoLido } from "./tipos.js";
import type { LinhaPosicionada } from "./pdf/motor.js";

/**
 * MAPFRE RESIDENCIAL: "Nº Apólice : 0000000000000", "DADOS DO SEGURADO"
 * (Nome / CPF/CNPJ), "Descrição do Risco: CASA HABITUAL" e o endereco do
 * risco (Endereço do Risco / Nº: Complemento: / Bairro: CEP: / Cidade:
 * Estado:), a tabela "COBERTURAS CONTRATADAS E VALORES MÁXIMOS".
 */
export function lerResidencialMapfre(linhas: readonly string[], numeroApolice: string): ResidencialLido | null {
  const impresso = digitos(achar(linhas, /N[ºo°]\s*Apólice\s*:\s*([\d\s]+)/));
  const pedido = digitos(numeroApolice);
  if (pedido.length < 8 || !impresso.endsWith(pedido.slice(-10))) return null;
  if (!linhas.some((l) => /MAPFRE RESIDENCIAL/i.test(l))) return null;

  const iSeg = linhas.findIndex((l) => /^DADOS DO SEGURADO/i.test(l));
  const seg = iSeg < 0 ? [] : linhas.slice(iSeg, iSeg + 12);
  const cepSeg = digitos(achar(seg, /^Bairro:.*\bCEP:\s*([\d-]{8,9})/i));
  const segEnd: EnderecoLido = {
    cep: cepSeg.length === 8 ? cepSeg : null,
    logradouro: null,
    numero: null,
    complemento: null,
    bairro: achar(seg, /^Bairro:\s*(.+?)\s+CEP:/i),
    cidade: achar(seg, /^Cidade:\s*(.+?)\s+UF:/i),
    uf: achar(seg, /^Cidade:.*\bUF:\s*([A-Z]{2})\b/),
  };
  const iRisco = linhas.findIndex((l) => /^Descrição do Risco:/i.test(l));
  const risco = iRisco < 0 ? [] : linhas.slice(iRisco, iRisco + 8);

  const descricao = achar(risco, /^Descrição do Risco:\s*(.+)$/i);
  /* "CASA HABITUAL", "APARTAMENTO HABITUAL", "CASA HABITUAL - COND. FECHADO". */
  const mDesc = descricao === null ? null : /^(.*?)\s+(HABITUAL|VERANEIO|DESOCUPAD\S*)(?:\s*-\s*(.*))?$/i.exec(descricao);
  const cepRisco = digitos(achar(risco, /\bCEP:\s*([\d-]{8,9})/));
  const imovel: EnderecoLido = {
    cep: cepRisco.length === 8 ? cepRisco : null,
    logradouro: achar(risco, /^Endereço do Risco:\s*(.+)$/i),
    numero: achar(risco, /^N[ºo°]:\s*(\S+)/i),
    complemento: achar(risco, /Complemento:\s*(.+)$/i),
    bairro: achar(risco, /^Bairro:\s*(.+?)\s+CEP:/i),
    cidade: achar(risco, /^Cidade:\s*(.+?)\s+Estado:/i),
    uf: achar(risco, /Estado:\s*([A-Z]{2})\b/),
  };

  const itens = tabelaDeCoberturas(linhas, /COBERTURAS CONTRATADAS E VALORES M[ÁA]XIMOS/i, /^(Este seguro garante|RAMO E C[ÓO]DIGO)/i, {
    minimoDeValores: 2,
    ignorar: /^(Cobertura Valor|FRANQUIA\b)/i,
  });
  const { coberturas, assistencia } = separarAssistencia(itens);
  return {
    numero: impresso,
    segurado_nome: achar(seg, /^Nome:\s*(.+)$/i),
    segurado_documento: cpfOuCnpj(achar(seg, /CPF\/CNPJ:\s*([\d.\-/]+)/i)),
    segurado_endereco: Object.values(segEnd).every((v) => v === null) ? null : segEnd,
    imovel: Object.values(imovel).every((v) => v === null) ? null : imovel,
    tipo_imovel: vazio(mDesc?.[1] ?? null),
    ocupacao: vazio(mDesc?.[2] ?? null),
    condominio_fechado: descricao === null ? null : /COND\.?\s*FECHADO/i.test(descricao),
    coberturas,
    lmi_basica: coberturas.find((c) => ehBasica(c.descricao))?.valor ?? null,
    assistencia,
  };
}

/* ---------------------------------------------------------- dados gerais */

/**
 * DADOS GERAIS (Produto, Vigência início/Término, Renova apólice Nº, Nº
 * Proposta), Telefone do segurado, o QUESTIONÁRIO ("Tipo de Seguro", "Tempo
 * de Experiência", "Cláusula Valor de Novo? SIM"), "Custo de Assistência ...
 * PERFIL: X", FRANQUIAS ("FRANQUIA <cobertura> 500,00 10", o nome quebra na
 * linha de baixo), DEMONSTRATIVO e PAGAMENTO, e "São Paulo, 15 de Julho de
 * 2026" (a data em que a apolice e emitida e assinada).
 */
export function geraisResidencialMapfre(linhas: readonly string[]): DadosGerais {
  const g = geraisVazios();
  const vig = datas(linhas.find((l) => /^Vigência início/i.test(l)));
  const renova = achar(linhas, /^Renova apólice Nº:\s*(\d+)/i);
  const forma = linhas.map((l) => /^Forma:\s*(.+?)\s+N[ºo°] de parcela:\s*(\d+)/i.exec(l)).find((m) => m !== null);
  const seg = secao(linhas, /^DADOS DO SEGURADO/i, /^QUESTIONÁRIO/i, 12);
  const q = secao(linhas, /^QUESTIONÁRIO DE AVALIAÇÃO DE RISCO/i, /^COBERTURAS CONTRATADAS/i, 30);
  const respostas = [
    ...q.map((l) => /^(Tempo de Experiência):\s*(.+)$/i.exec(l)).filter((m): m is RegExpExecArray => m !== null).map((m) => ({ pergunta: m[1] as string, resposta: (m[2] as string).trim() })),
    ...perguntas(q),
  ];

  /* FRANQUIAS: "FRANQUIA X 500,00 10" e a continuacao do nome sem valores; rodape (so digitos) fica de fora. */
  const franquias: FranquiaExtraida[] = [];
  let ultimo: FranquiaExtraida | null = null;
  for (const l of secao(linhas, /^FRANQUIAS$/, /^(FRANQUIA:|DEMONSTRATIVO)/i, 40).slice(1)) {
    const m = /^(FRANQUIA\s+.+?)\s+(\d[\d.]*,\d{2})\s+(\d{1,3})$/.exec(l.trim());
    if (m !== null) {
      ultimo = { descricao: (m[1] as string).replace(/^FRANQUIA\s+/, ""), tipo: `${m[3]}%`, valor: dinheiro(m[2]) };
      franquias.push(ultimo);
    } else if (ultimo !== null && /^[A-ZÀ-Ú][A-ZÀ-Ú\s,()/-]+$/.test(l.trim()) && !/^(Nome|Obrigat|Segurado)/i.test(l.trim())) {
      ultimo.descricao = `${ultimo.descricao} ${l.trim()}`;
    } else ultimo = null;
  }

  g.produto = achar(linhas.slice(0, 15), /\bProduto:\s*(\d+)/);
  g.proposta = digitos(achar(linhas, /^Nº Proposta:\s*(\d+)/)) || null;
  g.tipo_seguro = achar(q, /^Tipo de Seguro:\s*(.+)$/i);
  g.renovacao_de = renova === null ? null : { numero: renova, seguradora: null };
  g.vigencia_inicio = vig[0] ?? null;
  g.vigencia_fim = vig[1] ?? null;
  g.emissao = dataPorExtenso(linhas.find((l) => /^São Paulo,\s*\d{1,2} de /i.test(l)));
  g.premio_liquido = dinheiro(achar(linhas, /^Prêmio líquido:\s*([\d.]+,\d{2})/i));
  g.premio_total = dinheiro(achar(linhas, /^IOF:.*\bPrêmio:\s*([\d.]+,\d{2})/i));
  g.pagamento = forma === undefined || forma === null ? null : pagamento(vazio(forma[1]), Number(forma[2]));
  g.franquias = franquias;
  const contato = quadro(seg, ["Telefone residencial", "Telefone comercial", "Telefone celular", "E-mail"]);
  g.segurado = {
    telefones: fones(contato.get("Telefone residencial"), contato.get("Telefone comercial"), contato.get("Telefone celular")),
    email: email(contato.get("E-mail")),
  };
  g.residencial = {
    plano_assistencia: achar(linhas, /^Custo de Assistência:.*\bPERFIL:\s*(.+)$/i),
    valor_de_novo: simNao(resposta(respostas, /Valor de Novo/i)),
    respostas,
  };
  return g;
}

/* ------------------------------------------------------- modelo unico */

/** A apolice no modelo unico; `null` quando nao e a pedida. */
export function documentoResidencialMapfre(doc: DocumentoExtraido, pos: readonly LinhaPosicionada[], numero: string): DocumentoExtraido | null {
  const linhas = pos.map((l) => l.texto);
  const r = lerResidencialMapfre(linhas, numero);
  return r === null ? null : comGerais(deResidencial(doc, r), geraisResidencialMapfre(linhas));
}
