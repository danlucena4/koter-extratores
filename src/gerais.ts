/**
 * DADOS GERAIS das apolices de RESIDENCIAL e VIDA: o que os leitores de
 * `residencial.ts`, `allianz-residencial.ts` e `vida.ts` nao leem (vigencia
 * inteira, proposta, emissao, produto, tipo do seguro, apolice renovada,
 * premios, pagamento, franquias, contatos do segurado) e os campos proprios
 * do ramo (construcao, bem segurado, plano de assistencia, LMG, valor de
 * novo, questionario; periodicidade do premio e beneficiarios em vida).
 *
 * Amostra de 2026-10-20 (cobranca): residencial MAPFRE 8, HDI 8, Porto 8,
 * Tokio 1, Allianz 7; vida MAPFRE 1, Allianz 1, Yelum 1. So o que esta
 * IMPRESSO; o que a cia nao imprime (ou imprime de um jeito que nao da para
 * separar sem chute) fica nulo.
 */
import {
  achar,
  cpfOuCnpj,
  data,
  datas,
  digitos,
  dinheiro,
  email,
  quadroPorColuna,
  ruaNumeroComplemento,
  semAcento,
  secao,
  simNao,
  vazio,
  camposDaLinha,
  cep,
  enderecoOuNulo,
} from "./leitura.js";
import type { BeneficiarioExtraido, DocumentoExtraido, FranquiaExtraida, PessoaExtraida, ResidencialExtraido, VidaExtraida } from "./modelo.js";
import type { LinhaPosicionada } from "./pdf/motor.js";
import type { DataCia, Dinheiro } from "./tipos.js";

export interface DadosGerais {
  produto: string | null;
  emissao: DataCia | null;
  renovacao_de: DocumentoExtraido["renovacao_de"];
  tipo_seguro: string | null;
  proposta: string | null;
  item: string | null;
  vigencia_inicio: DataCia | null;
  vigencia_fim: DataCia | null;
  premio_liquido: Dinheiro | null;
  premio_total: Dinheiro | null;
  pagamento: DocumentoExtraido["pagamento"];
  franquias: FranquiaExtraida[];
  clausulas: string[];
  assistencias: string[];
  segurado: Partial<PessoaExtraida>;
  residencial: Partial<ResidencialExtraido>;
  vida: Partial<VidaExtraida>;
}

export const geraisVazios = (): DadosGerais => ({
  produto: null,
  emissao: null,
  renovacao_de: null,
  tipo_seguro: null,
  proposta: null,
  item: null,
  vigencia_inicio: null,
  vigencia_fim: null,
  premio_liquido: null,
  premio_total: null,
  pagamento: null,
  franquias: [],
  clausulas: [],
  assistencias: [],
  segurado: {},
  residencial: {},
  vida: {},
});

/* ------------------------------------------------------------- pecas */

const MESES: Readonly<Record<string, string>> = {
  JANEIRO: "01", FEVEREIRO: "02", MARCO: "03", ABRIL: "04", MAIO: "05", JUNHO: "06",
  JULHO: "07", AGOSTO: "08", SETEMBRO: "09", OUTUBRO: "10", NOVEMBRO: "11", DEZEMBRO: "12",
};

/** "15 de Julho de 2026" (local e data da assinatura) -> DataCia. */
export function dataPorExtenso(v: string | null | undefined): DataCia | null {
  const m = /(\d{1,2})\s+de\s+([A-Za-zÀ-ú]+)\s+de\s+(\d{4})/.exec(v ?? "");
  if (m === null) return null;
  const mes = MESES[semAcento(m[2] as string).toUpperCase()];
  const dia = Number(m[1]);
  if (mes === undefined || dia < 1 || dia > 31) return null;
  return { iso: `${m[3]}-${mes}-${String(dia).padStart(2, "0")}`, original: m[0] };
}

/** Um telefone so ("(0071)992211473", "5571991980989", "71 21059154"): digitos com DDD. */
export function telefone(v: string | null | undefined): string | null {
  let d = digitos(v);
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  d = d.replace(/^0+/, "");
  return (d.length === 10 || d.length === 11) && !/^(\d)\1+$/.test(d) ? d : null;
}
const fones = (...vs: Array<string | null | undefined>): string[] => [...new Set(vs.map(telefone).filter((t): t is string => t !== null))];

const pagamento = (forma: string | null, parcelas: number | null): DocumentoExtraido["pagamento"] =>
  forma === null && parcelas === null ? null : { forma, parcelas };

/**
 * O numero de parcelas pela GRADE de parcelas ("01 R$ 70,39 20/07/2026 03 R$ ...",
 * "01ª 520,02 15/10/2026", "1 14/02/2026 86,91 5 ..."): a maior parcela, so
 * quando todas de 1 ate ela aparecem.
 */
export function parcelasDaGrade(linhas: readonly string[]): number | null {
  const vistos = new Set<number>();
  for (const l of linhas) {
    for (const m of l.matchAll(/(?:^|\s)(\d{1,2})ª?\s+(?:\d{2}\/\d{2}\/\d{4}\s+)?(?:R\$\s*)?\d[\d.]*,\d{2}\b/g)) vistos.add(Number(m[1]));
  }
  const maior = Math.max(0, ...vistos);
  if (maior === 0) return null;
  for (let k = 1; k <= maior; k++) if (!vistos.has(k)) return null;
  return maior;
}

const norma = (s: string) => semAcento(s).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

/**
 * Participacoes obrigatorias impressas ENTREMEADAS com o nome da cobertura (o
 * nome quebra em volta do texto da franquia, Porto e Tokio):
 *
 *   INCÊNDIO, EXPLOSÃO, IMPLOSÃO, FUMAÇA E / Não há / QUEDA DE AERONAVE
 *   10% das indenizações com mínimo de / VAZAMENTO DE TANQUES / R$1.000,00.
 *
 * Os nomes (o texto sem as franquias) tem de formar, em sequencia, coberturas
 * conhecidas da tabela; cada franquia e da cobertura da ultima palavra de
 * nome lida ate o FIM dela. Se algum trecho nao casa com cobertura, `[]`.
 */
export function franquiasEntremeadas(bloco: readonly string[], coberturas: readonly string[], valor: RegExp): FranquiaExtraida[] {
  const texto = bloco.map((l) => l.trim()).filter((l) => l.length > 0).join(" ");
  const achadas = [...texto.matchAll(new RegExp(valor.source, "gid"))];
  if (achadas.length === 0) return [];
  /* Palavras de nome, cada uma com a posicao no texto. */
  const nomes: Array<{ palavra: string; fim: number }> = [];
  let corte = 0;
  const lerNomes = (de: string, base: number) => {
    for (const w of de.matchAll(/\S+/g)) {
      const p = norma(w[0]);
      if (p.length > 0) for (const parte of p.split(" ")) nomes.push({ palavra: parte, fim: base + (w.index ?? 0) + w[0].length });
    }
  };
  const valores: Array<{ texto: string; fim: number; minimo: Dinheiro | null }> = [];
  for (const m of achadas) {
    const ini = m.index ?? 0;
    lerNomes(texto.slice(corte, ini), corte);
    /* O "vao" e nome de cobertura que caiu no meio do texto da franquia. */
    const vao = m.groups?.["vao"] ?? "";
    const iVao = vao.length === 0 ? -1 : (m.indices?.groups?.["vao"]?.[0] ?? ini) - ini;
    if (iVao >= 0) lerNomes(vao, ini + iVao);
    const textoFranquia = vazio((iVao >= 0 ? m[0].slice(0, iVao) + m[0].slice(iVao + vao.length) : m[0]).replace(/\.\s*$/, ""));
    valores.push({ texto: textoFranquia ?? m[0], fim: ini + m[0].length, minimo: dinheiro(m.groups?.["minimo"]) });
    corte = ini + m[0].length;
  }
  lerNomes(texto.slice(corte), corte);

  /* Segmenta as palavras de nome em coberturas conhecidas (a mais longa que casa). */
  const conhecidas = coberturas.map((c) => ({ descricao: c, palavras: norma(c).split(" ").filter((w) => w.length > 0) }));
  const dona: number[] = [];
  for (let i = 0; i < nomes.length; ) {
    let melhor = -1;
    let tam = 0;
    conhecidas.forEach((c, k) => {
      const n = c.palavras.length;
      if (n > tam && c.palavras.every((w, j) => nomes[i + j]?.palavra === w)) {
        melhor = k;
        tam = n;
      }
    });
    if (melhor < 0) return [];
    for (let j = 0; j < tam; j++) dona.push(melhor);
    i += tam;
  }
  const out: FranquiaExtraida[] = [];
  const usadas = new Set<number>();
  for (const v of valores) {
    let k = -1;
    nomes.forEach((n, i) => {
      if (n.fim <= v.fim) k = dona[i] ?? -1;
    });
    if (k < 0 || usadas.has(k)) return [];
    usadas.add(k);
    out.push({ descricao: (conhecidas[k] as { descricao: string }).descricao, tipo: v.texto, valor: v.minimo });
  }
  return out;
}

/** "Rotulo : valor" de uma lista de rotulos (o primeiro achado vence). */
function quadro(linhas: readonly string[], rotulos: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const l of linhas) for (const [k, v] of camposDaLinha(l, rotulos)) if (!out.has(k) && v.trim().length > 0) out.set(k, v.trim());
  return out;
}

/** Linhas "Pergunta?: resposta" / "Pergunta? RESPOSTA" de um bloco. */
function perguntas(bloco: readonly string[]): Array<{ pergunta: string; resposta: string }> {
  return bloco
    .map((l) => /^(.+\?)\s*:?\s*(\S.*)$/.exec(l.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ pergunta: (m[1] as string).replace(/\s+/g, " ").trim(), resposta: (m[2] as string).trim() }));
}
const resposta = (rs: ReadonlyArray<{ pergunta: string; resposta: string }>, re: RegExp) => rs.find((r) => re.test(r.pergunta))?.resposta ?? null;

/* ------------------------------------------------- residencial MAPFRE */

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

/* ---------------------------------------------------- residencial HDI */

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

/* -------------------------------------------------- residencial Porto */

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

/* -------------------------------------------------- residencial Tokio */

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

/* ------------------------------------------------ residencial Allianz */

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

/* --------------------------------------------------------- vida MAPFRE */

/**
 * MAPFRE Vida: "APÓLICE DE SEGURO - MAPFRE VIDA VOCE MULTIFLEX", "Nº da
 * Proposta", "Data/Hora Emissão da Apólice", "Data de Início de Vigência",
 * "Telefone Celular" do titular, PRÊMIOS ("Prêmio Mensal Líquido/Total",
 * "Forma de Pagamento: X Periodicidade: MENSAL", "Prazo de Pagamento: 60
 * parcelas") e BENEFICIÁRIO(S): a linha "FÍSICA <CPF> [nome] dd/mm/aaaa
 * <parentesco> 50%" com o nome QUEBRADO dentro da celula (ate no meio da
 * palavra), por isso o nome fica nulo.
 */
export function geraisVidaMapfre(linhas: readonly string[]): DadosGerais {
  const g = geraisVazios();
  const titular = secao(linhas, /^DADOS DO\(A\) SEGURADO TITULAR/i, /^ENDEREÇO RESIDENCIAL/i, 12);
  const beneficiarios: BeneficiarioExtraido[] = secao(linhas, /^BENEFICIÁRIO\(S\)/i, /^O\(s\) beneficiário/i, 40)
    .map((l) => /^(?:F[ÍI]SICA|JUR[ÍI]DICA)\s+([\d.\-/]{11,18})\b.*?\s(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(\d{1,3}(?:,\d+)?)%/.exec(l.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ nome: null, documento: cpfOuCnpj(m[1]), nascimento: data(m[2]), parentesco: vazio(m[3]), percentual: Number((m[4] as string).replace(",", ".")) }));
  g.produto = achar(linhas.slice(0, 3), /^APÓLICE DE SEGURO\s*-\s*(.+)$/i);
  g.proposta = digitos(achar(linhas, /^N[ºo°] da Proposta:\s*(\d+)/i)) || null;
  g.emissao = data(achar(linhas, /Emissão da Apólice:\s*(\d{2}\/\d{2}\/\d{4})/i));
  g.vigencia_inicio = data(achar(linhas, /Início de Vigência.*?(\d{2}\/\d{2}\/\d{4})/i));
  g.premio_liquido = dinheiro(achar(linhas, /Prêmio Mensal Líquido:\s*(R\$\s*[\d.]+,\d{2})/i));
  g.premio_total = dinheiro(achar(linhas, /Prêmio Mensal Total:\s*(R\$\s*[\d.]+,\d{2})/i));
  const parcelas = Number(achar(linhas, /^Prazo de Pagamento:\s*(\d+)\s+parcelas/i));
  g.pagamento = pagamento(achar(linhas, /^Forma de Pagamento:\s*(.+?)\s+Periodicidade:/i), Number.isFinite(parcelas) && parcelas > 0 ? parcelas : null);
  g.segurado = { telefones: fones(achar(titular, /^Telefone Celular:\s*(.+)$/i)) };
  /* "Benefícios Custo": as assistencias do plano ("MAPFRE Cuidando de Você Gratuito"); o sorteio nao e assistencia. */
  g.assistencias = secao(linhas, /^Benefícios Custo$/i, /^OBSERVAÇÕES$/i, 10)
    .slice(1)
    .map((l) => vazio(l.replace(/\s+(Gratuito|R\$\s*[\d.]+,\d{2}|[\d.]+,\d{2})$/i, "")))
    .filter((a): a is string => a !== null && !/^SORTEIO\b/i.test(a));
  g.vida = { periodicidade_premio: achar(linhas, /\bPeriodicidade:\s*(\S+)/i), beneficiarios };
  return g;
}

/* -------------------------------------------------------- vida Allianz */

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

/* ---------------------------------------------------------- vida Yelum */

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
  const contato = q(["Telefone 1", "Telefone 2", "E-mail"]);
  const iCob = linhas.findIndex((l) => /^Tipo de Cobrança\b/i.test(l));
  const forma = iCob < 0 ? null : vazio((linhas[iCob + 1] ?? "").replace(/\s+\d{4}\s+\d{2}\/\d{2}\/\d{4}.*$/, ""));
  const iParc = linhas.findIndex((l) => /^N[ºo°] Parcelas\b/i.test(l));
  const parcelas = iParc < 0 ? null : Number(/^(\d{1,2})\b/.exec(linhas[iParc + 1] ?? "")?.[1] ?? Number.NaN);
  const iBairro = linhas.findIndex((l) => /^Bairro Cidade UF CEP$/i.test(l.trim()));
  const uf = iBairro < 0 ? null : (/\s([A-Z]{2})\s+\d{5}-\d{3}\s*$/.exec(linhas[iBairro + 1] ?? "")?.[1] ?? null);
  const vig = datas(datasAp.get("Vigência do Seguro"));
  const renova = digitos(ren.get("Renova Apólice Nº"));
  g.produto = achar(linhas.slice(0, 2), /^(Yelum Vida .+)$/i);
  g.proposta = digitos(ap.get("Proposta")) || null;
  g.vigencia_inicio = vig[0] ?? null;
  g.vigencia_fim = vig[1] ?? null;
  g.emissao = data(datasAp.get("Data de Emissão"));
  g.premio_liquido = dinheiro(premio.get("Prêmio Líquido (R$)"));
  g.premio_total = dinheiro(premio.get("Prêmio Total (R$)"));
  g.pagamento = pagamento(forma, parcelas !== null && Number.isFinite(parcelas) ? parcelas : null);
  g.renovacao_de = renova.length >= 8 ? { numero: renova, seguradora: vazio(ren.get("Seguradora")) } : null;
  g.segurado = {
    email: email(contato.get("E-mail")),
    telefones: fones(contato.get("Telefone 1"), contato.get("Telefone 2")),
    ...(uf !== null && UFS.has(uf) ? { endereco: { cep: null, logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, uf } } : {}),
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

const UFS = new Set(["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"]);
