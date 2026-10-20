/**
 * O PDF da APOLICE de auto da Yelum/Aliro (printdoc/getDocument, documento
 * "Apólice"), lido como texto. Sonda ao vivo 2026-10-15 (2 apolices Yelum Auto
 * Perfil, so a forma das linhas foi lida). O quadro e de CABECALHO numa linha e
 * VALORES na linha de baixo; as letras acentuadas do cabecalho saem como
 * espacos ("Ap   lice", "Ve   culo"), entao os cabecalhos casam de forma solta:
 *
 *   DADOS DA APOLICE / "Apólice Endosso Nº do Contrato Proposta"
 *     -> "31.19.2026.0000001 ..."                          (a TRAVA: o numero)
 *   "Código FIPE Marca/Tipo do Veículo Ano Fab/Mod"
 *     -> "000000-0 MARCA MODELO 2020/2021 ..."
 *   "Chassi Placa Capacidade Categoria"
 *     -> "<chassi> <placa> 005 PAS VEICULOS ..."
 *   "Utilização Reg. Tarif/CEP Pernoite Tipo Franquia CI Atual"
 *     -> "PARTICULAR 0000 / 00000 0,00 FACULTATIVA <CI 14 digitos>"
 *   "Classe Bônus Renovação da Apólice/Seguradora Término de Vigência" -> "5"
 *   "Nome do Principal Condutor Estado Civil Data de Nascimento Idade Sexo"
 *     -> "<NOME> Casado/Uniao Estavel dd/mm/aaaa 45 Masculino"
 *   "CPF Condutor Vinculo c/ Segurado Uso do Veiculo ..." -> "<cpf> <vinculo> NAO"
 *   "Residentes 18/25 Anos ..." -> "NAO NAO SE APLICA"
 *   proprietario "Data Nascimento Idade Sexo Vínculo c/ Segurado"
 *     -> "dd/mm/aaaa 45 PROPRIO SEGURADO" e o sexo na linha seguinte.
 */

import type { DataCia } from "./tipos.js";

export interface ApoliceYelumLida {
  numero: string;
  codigo_fipe: string | null;
  marca_modelo: string | null;
  ano_fabricacao: number | null;
  ano_modelo: number | null;
  chassi: string | null;
  placa: string | null;
  categoria: string | null;
  uso: string | null;
  cep_pernoite: string | null;
  /** Os 5 primeiros digitos do CEP de pernoite, que e o que a apolice costuma imprimir. */
  cep_pernoite_prefixo: string | null;
  ci: string | null;
  classe_bonus: number | null;
  condutor_nome: string | null;
  condutor_estado_civil: string | null;
  condutor_nascimento: DataCia | null;
  condutor_sexo: string | null;
  condutor_cpf: string | null;
  condutor_vinculo: string | null;
  residentes_18_25: string | null;
  /** "Uso do Veiculo para Prest. Serv. ou Visitas": SIM/NAO. */
  uso_comercial: string | null;
  /** "Deseja estender cobertura para residentes habilitados ... 18 a 25 anos?": SIM, NAO ou "NAO SE APLICA". */
  cobertura_18_25: string | null;
  /** "Isencao Fiscal" do quadro do veiculo (ultima coluna): SIM/NAO. */
  isencao_fiscal: string | null;
  proprietario_nascimento: DataCia | null;
  proprietario_sexo: string | null;
  proprietario_e_o_segurado: boolean;
}

const vazio = (v: string | null | undefined): string | null => {
  const s = (v ?? "").replace(/\s+/g, " ").trim();
  return s.length > 0 ? s : null;
};
const data = (v: string | null | undefined): DataCia | null => {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(v ?? "");
  return m === null ? null : { iso: `${m[3]}-${m[2]}-${m[1]}`, original: m[0] };
};

/** A linha logo abaixo do primeiro cabecalho que casa. */
function abaixo(linhas: readonly string[], cabecalho: RegExp, desde = 0): { valor: string | null; indice: number } {
  for (let i = desde; i < linhas.length - 1; i++) {
    if (cabecalho.test(linhas[i] as string)) return { valor: vazio(linhas[i + 1]), indice: i + 1 };
  }
  return { valor: null, indice: -1 };
}

/**
 * SIM/NAO no fim do texto. O til some na extracao da Aliro ("N   o"), entao
 * "N", espacos e "o" tambem e NAO.
 */
export function simNaoNoFim(v: string | null | undefined): "SIM" | "NAO" | null {
  const m = /(?:^|\s)(SIM|N\s*[AÃ]?\s*O)\s*$/i.exec((v ?? "").trim());
  if (m === null) return null;
  return /^S/i.test(m[1] as string) ? "SIM" : "NAO";
}

/** SIM/NAO no comeco do texto ("NAO NAO SE APLICA", "Não Não se aplica"). */
function simNaoNoComeco(v: string | null | undefined): "SIM" | "NAO" | null {
  const t = (v ?? "").trim();
  /* Sem \b no fim: a Aliro cola as colunas ("NãoNão se aplica"). */
  if (/^SIM(?![a-zà-ú])/i.test(t)) return "SIM";
  return /^[Nn]\s*[AÃaã]?\s*[Oo](?![a-zà-ú])/.test(t) ? "NAO" : null;
}

const ESTADO_CIVIL = /(Solteir\S*|Casad\S*(?:\s+Est[aá]vel)?|Divorciad\S*|Vi[uú]v\S*|Separad\S*|Uni[aã]o\s+Est[aá]vel)$/i;

/** Le o quadro; `null` quando o numero impresso nao e o da apolice pedida. */
export function lerApoliceYelum(linhas: readonly string[], policyNumber: string): ApoliceYelumLida | null {
  const pedido = policyNumber.replace(/\D/g, "");
  const cab = abaixo(linhas, /Endosso\s+N\S*\s+do\s+Contrato/i);
  const impresso = /^(\d{2}\.\d{2}\.\d{4}\.\d{5,9})/.exec(cab.valor ?? "")?.[1]?.replace(/\D/g, "") ?? null;
  if (pedido.length < 8 || impresso !== pedido) return null;

  const veic = abaixo(linhas, /FIPE.*Ano\s+Fab\/Mod/i).valor;
  const mv = veic === null ? null : /^(\d{6}-\d)\s+(.*?)\s+(\d{4})\s*\/\s*(\d{4})\b/.exec(veic);

  const chassiLinha = abaixo(linhas, /^Chassi\s+Placa\s+Capacidade/i).valor;
  const mc = chassiLinha === null ? null : /^(\S{17})\s+(\S+)\s+\d+\s+(.*)$/.exec(chassiLinha);
  const placaBruta = (mc?.[2] ?? "").replace(/[^A-Z0-9]/gi, "").toUpperCase();

  const usoLinha = abaixo(linhas, /CEP\s+Pernoite/i).valor;
  const mu = usoLinha === null ? null : /^(.*?)\s+\d+\s*\/\s*(\d{5,8})\b.*?(\d{14})?\s*$/.exec(usoLinha);
  const cepPernoite = (mu?.[2] ?? "").length === 8 ? (mu?.[2] as string) : null;
  /* O normal e so o PREFIXO de 5 digitos ("0000 / 40000", regiao tarifaria / CEP). */
  const prefixoPernoite = (mu?.[2] ?? "").length === 5 ? (mu?.[2] as string) : null;
  const ci = /(\d{14})\s*$/.exec(usoLinha ?? "")?.[1] ?? null;

  const bonus = /^(\d{1,2})\b/.exec(abaixo(linhas, /^Classe\s.*nus/i).valor ?? "")?.[1];

  const cond = abaixo(linhas, /Nome do Principal Condutor/i).valor;
  let condutorNome: string | null = null;
  let condutorEstado: string | null = null;
  let condutorNasc: DataCia | null = null;
  let condutorSexo: string | null = null;
  if (cond !== null) {
    const m = /^(.*)\s+(\d{2}\/\d{2}\/\d{4})\s+\d{1,3}\s+(\S+)\s*$/.exec(cond);
    if (m !== null) {
      condutorNasc = data(m[2]);
      condutorSexo = vazio(m[3]);
      const antes = m[1] as string;
      const ec = ESTADO_CIVIL.exec(antes);
      condutorEstado = ec === null ? null : vazio(ec[1]);
      condutorNome = vazio(ec === null ? antes : antes.slice(0, ec.index));
    }
  }
  const cpfLinha = abaixo(linhas, /^CPF\s+Condutor/i).valor;
  const mcpf = cpfLinha === null ? null : /^(\d{3}\.\d{3}\.\d{3}-\d{2})\s+(.*?)\s+(SIM|N\s*[AÃ]?\s*O)\s*$/i.exec(cpfLinha);

  /* "Residentes 18/25 Anos" (Yelum) / "Residente 18/25 Anos" (Aliro): a 1a palavra e a resposta. */
  const residentes = simNaoNoComeco(abaixo(linhas, /^Residentes?\s+\d{2}\/\d{2}/i).valor);
  const cobertura = vazio(abaixo(linhas, /Deseja estender cobertura para residentes/i).valor);
  const isencao = simNaoNoFim(abaixo(linhas, /Gravame.*Isen/i).valor);

  /* Yelum "Data Nascimento ...", Aliro "Data de Nascimento ...". */
  const prop = abaixo(linhas, /^Data (?:de )?Nascimento Idade Sexo/i);
  const propLinha = prop.valor ?? "";
  const propNasc = data(propLinha);
  const propEhSegurado = /PROPRIO\s+SEGURADO/i.test(propLinha);
  /* O sexo vem na mesma linha ("dd/mm/aaaa 40 Masculino PROPRIO SEGURADO") ou, no texto antigo, na de baixo. */
  const propSexo =
    prop.indice < 0
      ? null
      : (/\b(Masculino|Feminino)\b/i.exec(propLinha)?.[1] ?? /^(Masculino|Feminino)\b/i.exec(vazio(linhas[prop.indice + 1]) ?? "")?.[1] ?? null);

  return {
    numero: impresso,
    codigo_fipe: mv?.[1] ?? null,
    marca_modelo: vazio(mv?.[2]),
    ano_fabricacao: mv ? Number(mv[3]) : null,
    ano_modelo: mv ? Number(mv[4]) : null,
    chassi: vazio(mc?.[1])?.toUpperCase() ?? null,
    placa: /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(placaBruta) ? placaBruta : null,
    categoria: vazio(mc?.[3]),
    uso: vazio(mu?.[1]),
    cep_pernoite: cepPernoite,
    cep_pernoite_prefixo: prefixoPernoite,
    ci,
    classe_bonus: bonus === undefined ? null : Number(bonus),
    condutor_nome: condutorNome,
    condutor_estado_civil: condutorEstado,
    condutor_nascimento: condutorNasc,
    condutor_sexo: condutorSexo,
    condutor_cpf: mcpf?.[1] ? mcpf[1].replace(/\D/g, "") : null,
    condutor_vinculo: vazio(mcpf?.[2]),
    residentes_18_25: residentes,
    uso_comercial: simNaoNoFim(mcpf?.[3]),
    cobertura_18_25: cobertura === null ? null : /SE\s+APLICA/i.test(cobertura) ? "NAO SE APLICA" : simNaoNoFim(cobertura),
    isencao_fiscal: isencao,
    proprietario_nascimento: propNasc,
    proprietario_sexo: propSexo,
    proprietario_e_o_segurado: propEhSegurado,
  };
}
