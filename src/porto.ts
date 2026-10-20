/**
 * O PDF da APOLICE de auto da Porto (produtos Porto, Azul e Itau), lido como
 * texto, para COMPLETAR o Renovar: so preenche o que o resumo da apolice e a
 * busca de cliente deixaram vazio, nunca troca um valor que ja veio.
 *
 * Evidencia: 8 PDFs da "A vencer" baixados so com leitura em 2026-10-19
 * (docs/renovacao-pdf/LAYOUTS.md). O PDF usa fonte composta com ToUnicode
 * (ver `pdf-texto.ts`). Linhas lidas, todas com rotulo:
 *
 *   Apólice: 0000 31 00000000 Item: 01               (a TRAVA: o numero)
 *   Renova nº: ... Classe de bônus: 5
 *   Segurado(a): <nome>
 *   Data de nascimento: dd/mm/aaaa Sexo: Masculino   (do SEGURADO)
 *   Portas: Combustível:  /  4 Gasolina/Alcool        (valor na linha de baixo)
 *   Uso: Particular Câmbio automático: Não
 *   Nome do motorista principal: <nome>
 *   Sexo: Masculino Data de nascimento: dd/mm/aaaa CPF: 000.000.000-00
 *   Cep do local onde o veiculo pernoita? 00000000
 *
 * O "Ano:" do veiculo NAO e lido: o PDF nao diz se e o de fabricacao ou o do
 * modelo, e um palpite errado mudaria a tarifa.
 */

import type { DataCia } from "./tipos.js";
import type { EnderecoLido as EnderecoParaRenovar } from "./tipos.js";


export interface ApolicePortoLida {
  numero: string;
  classe_bonus: number | null;
  segurado_nascimento: DataCia | null;
  segurado_sexo: string | null;
  combustivel: string | null;
  uso: string | null;
  condutor_sexo: string | null;
  condutor_nascimento: DataCia | null;
  condutor_cpf: string | null;
  cep_pernoite: string | null;
  /** Endereco do segurado (colunas misturadas no PDF: leitura nossa, vai "a conferir"). */
  endereco: EnderecoParaRenovar | null;
}

/**
 * O endereco do bloco do segurado (entre "Segurado(a):" e "Tel. residencial").
 * O PDF tem duas colunas e o CEP troca de lugar com o Estado (formas vistas):
 *   Endereço: R NOME DA RUA 123 Casa
 *   Bairro: CENTRO Estado: BA        |  Bairro: CENTRO CEP: 40000-000
 *   40000-000                        |  Cidade: SALVADOR Estado: BA
 *   Cidade: SALVADOR CEP:
 */
export function enderecoDaApolicePorto(linhas: readonly string[]): EnderecoParaRenovar | null {
  const ini = linhas.findIndex((l) => /^Segurado\(a\):/i.test(l));
  if (ini < 0) return null;
  const fimRel = linhas.slice(ini).findIndex((l) => /^Tel\. residencial:/i.test(l));
  const bloco = linhas.slice(ini, fimRel < 0 ? ini + 12 : ini + fimRel);
  const achar = (re: RegExp) => bloco.map((l) => re.exec(l)?.[1]?.trim()).find((x) => x !== undefined && x.length > 0) ?? null;

  const cep = achar(/\b(\d{5}-\d{3})\b/)?.replace(/\D/g, "") ?? null;
  const uf = achar(/Estado:\s*([A-Z]{2})\b/);
  const bairro = achar(/^Bairro:\s*(.+?)\s+(?:Estado|CEP):/i);
  const cidadeCrua = achar(/^Cidade:\s*(.+?)\s+(?:CEP|Estado):/i);
  /* "Cidade: Sao Paulo - SP - CEP:" e outras formas com traco: nao lemos. */
  const cidade = cidadeCrua !== null && !cidadeCrua.includes(" - ") ? cidadeCrua : null;
  const rua = achar(/^Endereço:\s*(.+)$/i);
  const partes = rua === null ? null : /^(.*?\D)\s+(\d+)\b\s*(.*)$/.exec(rua);
  const endereco: EnderecoParaRenovar = {
    cep: cep !== null && cep.length === 8 ? cep : null,
    logradouro: (partes ? partes[1]! : (rua ?? "")).trim().replace(/,\s*$/, "") || null,
    numero: partes ? partes[2]! : null,
    complemento: partes && partes[3]!.trim().length > 0 ? partes[3]!.trim() : null,
    bairro,
    cidade,
    uf,
  };
  return Object.values(endereco).every((v) => v === null) ? null : endereco;
}

const data = (v: string | undefined): DataCia | null => {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(v ?? "");
  return m === null ? null : { iso: `${m[3]}-${m[2]}-${m[1]}`, original: m[0] };
};

/** O gerador do Itau separa as letras acentuadas ("Combust í vel"): junta para casar os rotulos. */
const juntarAcentos = (l: string): string => l.replace(/\s([À-ÿ])\s/g, "$1");

/** Le o PDF; `null` quando o numero impresso nao e o da apolice pedida. */
export function lerApolicePorto(linhasCruas: readonly string[], apolice: string): ApolicePortoLida | null {
  const linhas = linhasCruas.map(juntarAcentos);
  const pedido = apolice.replace(/\D/g, "").replace(/^0+/, "");
  /*
   * TRAVA, tres formas vistas (sondagem 2026-10-19):
   *  - "Apólice: 0001 31 12345678 Item: 01" (a de sempre);
   *  - "01 31 0001 12345678 Item: 01", com o rotulo "Apólice:" noutra linha;
   *  - o PDF de ENDOSSO ("Endosso nº: ..."), sem linha de Item: vale o numero
   *    da apolice aparecer INTEIRO em alguma linha.
   */
  const impresso = linhas
    .map((l) => /(?:Ap[oó]lice:\s*)?((?:\d+\s+)+\d+)\s+Item:/i.exec(l)?.[1])
    .find((x) => x !== undefined);
  const ultimo = (impresso ?? "").trim().split(/\s+/).pop()?.replace(/^0+/, "") ?? "";
  if (pedido.length < 5) return null;
  const inteiro = new RegExp(`(^|\\D)0*${pedido}(\\D|$)`);
  if (impresso !== undefined ? ultimo !== pedido : !linhas.some((l) => inteiro.test(l))) return null;

  const bonus = linhas.map((l) => /Classe de b[ôo]nus:\s*(\d{1,2})\s*$/i.exec(l)?.[1]).find((x) => x !== undefined);

  /* Segurado: "Data de nascimento: ... Sexo: ..." (nesta ordem), antes do motorista principal. */
  const iMotorista = linhas.findIndex((l) => /^Nome do motorista principal:/i.test(l));
  const fimSegurado = iMotorista < 0 ? linhas.length : iMotorista;
  const doSegurado = linhas
    .slice(0, fimSegurado)
    .map((l) => /^Data de nascimento:\s*(\d{2}\/\d{2}\/\d{4})\s+Sexo:\s*(Masculino|Feminino)\s*$/i.exec(l))
    .find((m) => m !== null);

  /* Motorista principal: "Sexo: ... Data de nascimento: ... CPF: ..." (outra ordem), depois do nome. */
  const doCondutor =
    iMotorista < 0
      ? undefined
      : linhas
          .slice(iMotorista, iMotorista + 4)
          .map((l) => /^Sexo:\s*(Masculino|Feminino)\s+Data de nascimento:\s*(\d{2}\/\d{2}\/\d{4})\s+CPF:\s*([\d.\-]+)/i.exec(l))
          .find((m) => m !== null);
  const cpf = (doCondutor?.[3] ?? "").replace(/\D/g, "");

  const pernoite = linhas
    .map((l) => /Cep do local onde o ve[íi]culo pernoita\?\s*(\d{5}-?\d{3})\b/i.exec(l)?.[1]?.replace(/\D/g, ""))
    .find((x) => x !== undefined);

  /* Combustivel: na mesma linha (Itau) ou na de baixo, depois do numero de portas. */
  let combustivel: string | null = null;
  const iComb = linhas.findIndex((l) => /Combust[íi]vel:/i.test(l));
  if (iComb >= 0) {
    const mesma = /Combust[íi]vel:\s*(\S.*)$/i.exec(linhas[iComb] as string)?.[1] ?? null;
    const baixo = /^\d+\s+(\S.*)$/.exec(linhas[iComb + 1] ?? "")?.[1] ?? null;
    combustivel = (mesma ?? baixo)?.trim() || null;
  }

  const uso = linhas.map((l) => /^Uso:\s*(.+?)\s+C[âa]mbio autom[áa]tico:/i.exec(l)?.[1]).find((x) => x !== undefined) ?? null;

  return {
    numero: impresso !== undefined ? impresso.replace(/\D/g, "") : pedido,
    classe_bonus: bonus === undefined ? null : Number(bonus),
    segurado_nascimento: data(doSegurado?.[1]),
    segurado_sexo: doSegurado?.[2] ?? null,
    combustivel,
    uso,
    condutor_sexo: doCondutor?.[1] ?? null,
    condutor_nascimento: data(doCondutor?.[2]),
    condutor_cpf: cpf.length === 11 ? cpf : null,
    cep_pernoite: pernoite !== undefined && pernoite.length === 8 ? pernoite : null,
    endereco: enderecoDaApolicePorto(linhas),
  };
}
