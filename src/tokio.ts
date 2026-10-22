/**
 * O PDF da APOLICE de auto da Tokio Marine ("Tokio Marine Auto", 9 PDFs de
 * apolices da cobranca, 2026-10-20). Linhas com rotulo; as respostas do
 * questionario vem na linha DE BAIXO da pergunta:
 *
 *   Ramo: 31.20 Apólice: 12345678 Negócio: ... Proposta: ...
 *   Tipo de Seguro: Renovação Tokio CI: 00000000000000 Classe de Bônus: 5
 *   Segurado: <nome> Nome Social: | CPF : 000.000.000-00
 *   Endereço de Correspondência: RUA X , 99 - APTO 1 | Bairro: ... | CEP: 00000-000 Cidade: X UF: BA
 *   É possível determinar o condutor: Próprio Segurado
 *   Estado Civil principal condutor: Casado(a) ou vive em união estável
 *   Deseja contratar cobertura ... de 18 a 25 anos que | residem com o Principal Condutor?
 *     Não e estou ciente que esta resposta reduz o prêmio pago
 *   Fabricante: VOLKSWAGEN Ano Modelo: 2020
 *   Tipo De Utilização: Particular - Lazer / ida e Chassi: ... | volta ao trabalho
 *   Placa: ... Combustível: Flex
 *   Zero Km: Não ... | Isenção Fiscal: Não
 *   CEP de pernoite: 00000-000
 *   O Principal condutor possui estacionamento ou garagem fechada ... na |
 *     residência habitual para o veículo segurado?  ->  Sim
 *
 * TRAVA: o numero de "Apólice:" tem que ser a apolice pedida. O PDF
 * RESIDENCIAL da Tokio tem outro quadro e nao passa (o leitor e de auto).
 */
import type { DataCia, EnderecoLido } from "./tipos.js";
import { achar, digitos, vazio } from "./leitura.js";

export interface ApoliceTokioLida {
  numero: string;
  tipo_seguro: string | null;
  ci: string | null;
  classe_bonus: number | null;
  segurado_nome: string | null;
  segurado_documento: string | null;
  endereco: EnderecoLido | null;
  /** "É possível determinar o condutor:" ("Próprio Segurado", "Não é o Próprio Segurado"). */
  condutor_determinado: string | null;
  condutor_estado_civil: string | null;
  /** Cobertura para condutores de 18 a 25 que RESIDEM com o principal: "Sim"/"Não". */
  cobertura_residentes_18_25: string | null;
  fabricante: string | null;
  ano_modelo: number | null;
  zero_km: boolean | null;
  uso: string | null;
  combustivel: string | null;
  isencao_fiscal: string | null;
  cep_pernoite: string | null;
  /** "possui estacionamento ou garagem fechada ... na residência habitual?": "Sim"/"Não". */
  garagem_residencia: string | null;
  codigo_fipe: string | null;
  placa: string | null;
  chassi: string | null;
  /** "Veículo: <descricao>" (o modelo como a Tokio escreve). */
  veiculo_descricao: string | null;
}

/** "Sim"/"Não" no comeco da linha logo abaixo da que casa com a pergunta. */
function simNaoAbaixo(linhas: readonly string[], pergunta: RegExp): string | null {
  const i = linhas.findIndex((l) => pergunta.test(l));
  if (i < 0) return null;
  const m = /^(Sim|Não)\b/i.exec((linhas[i + 1] ?? "").trim());
  return m === null ? null : m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1).toLowerCase();
}

export function lerApoliceTokio(linhas: readonly string[], numeroApolice: string): ApoliceTokioLida | null {
  const pedido = numeroApolice.replace(/\D/g, "").replace(/^0+/, "");
  const impresso = achar(linhas, /\bApólice:\s*(\d{5,})\b/);
  if (pedido.length < 5 || impresso === null || impresso.replace(/^0+/, "") !== pedido) return null;
  /* So o quadro de AUTO: o residencial tem "Tokio Marine Residencial". */
  if (!linhas.some((l) => /Tokio Marine Auto|Fabricante:/.test(l))) return null;

  const tipo = /Tipo de Seguro:\s*(.+?)\s+(?:CI:|Classe de Bônus:)/.exec(linhas.find((l) => /^Tipo de Seguro:/.test(l)) ?? "");
  const ci = digitos(achar(linhas, /\bCI:\s*(\d{8,})/));
  const bonus = achar(linhas, /Classe de Bônus:\s*(\d{1,2})\s*$/);

  const cpf = digitos(achar(linhas, /^CPF\s*:\s*([\d.\-/]+)/));
  const rua = achar(linhas, /^Endereço de Correspondência:\s*(.+)$/);
  const mRua = rua === null ? null : /^(.*?)\s*,\s*(\d+\S*)\s*(?:-\s*(.*))?$/.exec(rua);
  const cepLinha = linhas.find((l) => /^CEP:\s*\d{5}-\d{3}\s+Cidade:/.test(l)) ?? "";
  const mCep = /^CEP:\s*(\d{5}-\d{3})\s+Cidade:\s*(.+?)\s+UF:\s*([A-Z]{2})\b/.exec(cepLinha);
  const endereco: EnderecoLido = {
    cep: mCep ? digitos(mCep[1]) : null,
    logradouro: vazio(mRua ? mRua[1] : rua),
    numero: vazio(mRua?.[2]),
    complemento: vazio(mRua?.[3]),
    bairro: achar(linhas, /^Bairro:\s*(.+)$/),
    cidade: vazio(mCep?.[2]),
    uf: mCep?.[3] ?? null,
  };

  /* "Tipo De Utilização: Particular - Lazer / ida e Chassi: ..." + "volta ao trabalho" na linha de baixo. */
  const iUso = linhas.findIndex((l) => /^Tipo De Utilização:/i.test(l));
  let uso: string | null = null;
  if (iUso >= 0) {
    const inicio = /^Tipo De Utilização:\s*(.+?)(?:\s+Chassi:.*)?$/i.exec(linhas[iUso] as string)?.[1] ?? "";
    const cont = linhas[iUso + 1] ?? "";
    uso = vazio(/^[a-zà-ú]/.test(cont.trim()) && !/:/.test(cont) ? `${inicio} ${cont}` : inicio);
  }

  const zero = achar(linhas, /Zero Km:\s*(Sim|Não)\b/);
  const ano = Number(achar(linhas, /Ano Modelo:\s*(\d{4})\b/) ?? NaN);
  const pernoite = digitos(achar(linhas, /^CEP de pernoite:\s*(\d{5}-?\d{3})/));

  return {
    numero: impresso,
    tipo_seguro: vazio(tipo?.[1]),
    ci: ci.length >= 8 ? ci : null,
    classe_bonus: bonus === null ? null : Number(bonus),
    segurado_nome: achar(linhas, /^Segurado:\s*(.+?)\s+Nome Social:/),
    segurado_documento: cpf.length === 11 || cpf.length === 14 ? cpf : null,
    endereco: Object.values(endereco).every((v) => v === null) ? null : endereco,
    condutor_determinado: achar(linhas, /^É possível determinar o condutor:\s*(.+)$/),
    condutor_estado_civil: achar(linhas, /^Estado Civil principal condutor:\s*(.+)$/),
    cobertura_residentes_18_25: simNaoAbaixo(linhas, /residem com o Principal Condutor\?/),
    fabricante: achar(linhas, /^Fabricante:\s*(.+?)\s+Ano Modelo:/),
    ano_modelo: Number.isInteger(ano) && ano > 1900 ? ano : null,
    zero_km: zero === null ? null : /^Sim/i.test(zero),
    uso,
    combustivel: achar(linhas, /Combustível:\s*(.+)$/),
    isencao_fiscal: achar(linhas, /Isenção Fiscal:\s*(Sim|Não)\b/),
    cep_pernoite: pernoite.length === 8 ? pernoite : null,
    garagem_residencia: simNaoAbaixo(linhas, /residência habitual para o veículo segurado\?/),
    codigo_fipe: achar(linhas, /Código Fipe:\s*(\d{6}-\d)/),
    placa: achar(linhas, /^Placa:\s*([A-Z]{3}-?\d[A-Z0-9]\d{2})\b/i)?.replace("-", "").toUpperCase() ?? null,
    chassi: achar(linhas, /\bChassi:\s*([A-HJ-NPR-Z0-9]{17})\b/i)?.toUpperCase() ?? null,
    veiculo_descricao: achar(linhas, /^Veículo:\s*(.+)$/),
  };
}

export type { DataCia };
