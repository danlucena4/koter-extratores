/**
 * APOLICES RESIDENCIAIS (PDF): MAPFRE, HDI, Tokio Marine e Porto. A Allianz tem
 * leitor proprio (`allianz-residencial.ts`). Amostra de 2026-10-20 (cobranca):
 * MAPFRE 8, HDI 8, Tokio 1 (docs/renovacao-pdf/LAYOUTS.md no multicalculo).
 *
 * Saida igual para as tres: o segurado, o IMOVEL (endereco do risco, tipo e
 * ocupacao como a cia escreve), a tabela de coberturas (descricao + LMI) e a
 * assistencia. A traducao para a cotacao e de quem consome.
 */
import { dinheiroPtBr, tabelaDeCoberturas, type ItemDeCobertura } from "./tabela.js";
import type { Dinheiro, EnderecoLido } from "./tipos.js";

export interface ResidencialLido {
  numero: string;
  segurado_nome: string | null;
  segurado_documento: string | null;
  /**
   * Endereco do SEGURADO, so as partes que a cia separa. A MAPFRE imprime rua,
   * numero e complemento numa linha so ("RUA X 123 APT 45"): dividir seria
   * chute, entao logradouro/numero/complemento ficam nulos.
   */
  segurado_endereco: EnderecoLido | null;
  imovel: EnderecoLido | null;
  /** Tipo do imovel como a cia escreve ("CASA", "Apartamento", "Casa em Condomínio"). */
  tipo_imovel: string | null;
  /** Ocupacao como a cia escreve ("HABITUAL", "Habitual"). */
  ocupacao: string | null;
  condominio_fechado: boolean | null;
  coberturas: ItemDeCobertura[];
  /** O LMI da cobertura basica (incendio). */
  lmi_basica: Dinheiro | null;
  assistencia: string | null;
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
const doc = (v: string | null) => {
  const d = digitos(v);
  return d.length === 11 || d.length === 14 ? d : null;
};
const ehBasica = (descricao: string) => /^(B[ÁA]SICA\b|INC[ÊE]NDIO)/i.test(descricao.trim());
const separarAssistencia = (itens: ItemDeCobertura[]) => {
  const assist = itens.find((i) => /ASSIST[ÊE]NCIA/i.test(i.descricao));
  return { coberturas: itens.filter((i) => !/ASSIST[ÊE]NCIA/i.test(i.descricao)), assistencia: assist?.descricao ?? null };
};

/* ---------------------------------------------------------------- MAPFRE */

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
    segurado_documento: doc(achar(seg, /CPF\/CNPJ:\s*([\d.\-/]+)/i)),
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

/* ---------------------------------------------------------------- HDI */

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
    segurado_documento: doc(achar(linhas, /^CPF\s*:\s*([\d.\-/]+)/)),
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

/* ---------------------------------------------------------------- Tokio */

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
    segurado_documento: doc(achar(linhas, /^CPF\s*:\s*([\d.\-/]+)/)),
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

/* ---------------------------------------------------------------- Porto */

const semAcento = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
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
    const prefixo = semAcento(`${segEnd.logradouro} ${segEnd.numero}`).split(" ");
    const palavras = ruaLocal.trim().split(/\s+/);
    if (semAcento(palavras.slice(0, prefixo.length).join(" ")) === prefixo.join(" ")) {
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
    segurado_documento: doc(achar(seg, /^CPF:\s*([\d.\-/]+)/i)),
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
