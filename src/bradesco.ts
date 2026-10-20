/**
 * O PDF da APOLICE de auto da Bradesco ("Apolice / Endosso", 15 PDFs da "A
 * vencer", 2026-10-19). O gerador escreve cada SECAO numa linha so, com os
 * rotulos colados nos valores:
 *
 *   Dados da sua apólice Número da apólice 0000.000.0000.000000 Item 0001
 *     Proposta ... Bônus 05 CI 00.000.000.000.000 Cobertura COMPREENSIVA ...
 *   Dados do segurado ___ Nome <nome> Data de Nascimento dd/mm/aaaa Sexo
 *     MASCULINO CPF/CNPJ ... Endereço de Pernoite RUA ... Complemento ...
 *     Bairro ... CEP 00000-000 Municipio SALVADOR UF BA Telefone ...
 *   Dados do principal condutor ___ Nome <nome> Data de Nascimento ...
 *     CPF/CNPJ ... Sexo MASCULINO Estado Civil Casado / União Estável
 *   Dados do veículo ___ Marca/Tipo Veículo ... Ano de Fabricação/Modelo
 *     2019/2020 Chassi ... Código FIPE 0000.0 Placa ... Uso do Veículo
 *     Particular Veículo com Isenção Fiscal NÃO Tipo Passeio ...
 *   Questionário de Risco ___ O segurado é proprietário do veículo? SIM
 *     O segurado é principal condutor do veículo? SIM Não considerando ...
 *     entre 18 e 25 anos? Não Qual quilometragem média rodada em condições
 *     habituais? Até 30 km/dia ou até 900 km/mês Corretor ___
 *
 * O texto inteiro e partido por SECAO; dentro dela, o valor de um rotulo e o
 * que vem ate o PROXIMO rotulo conhecido da secao.
 *
 * TRAVA: o ultimo bloco do "Número da apólice" tem que ser a apolice pedida.
 */
import type { DataCia, EnderecoLido } from "./tipos.js";

const SECOES = [
  "Dados da sua apólice",
  "Dados do segurado",
  "Dados do principal condutor",
  "Dados do proprietário",
  "Dados do veículo",
  "Coberturas",
  "Serviços Complementares",
  "Cláusulas do Seguro",
  "Franquia",
  "Participação do Segurado",
  "Demonstrativo de Prêmio",
  "Formas de pagamento",
  "Questionário de Risco",
  "Corretor",
  "Observações",
] as const;
type Secao = (typeof SECOES)[number];

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** O texto de cada secao (a primeira ocorrencia), sem os sublinhados de titulo. */
export function secoesDoPdfBradesco(linhas: readonly string[]): Map<Secao, string> {
  const texto = linhas.join(" ").replace(/_{3,}/g, " ").replace(/\s+/g, " ");
  const achadas = SECOES.map((s) => ({ s, i: texto.search(new RegExp(escapar(s))) }))
    .filter((x) => x.i >= 0)
    .sort((a, b) => a.i - b.i);
  const out = new Map<Secao, string>();
  achadas.forEach((x, k) => {
    if (out.has(x.s)) return;
    const fim = achadas[k + 1]?.i ?? texto.length;
    out.set(x.s, texto.slice(x.i + x.s.length, fim).trim());
  });
  return out;
}

/** O valor de `rotulo` ate o proximo dos `rotulos` (todos da mesma secao). */
function valor(secao: string | undefined, rotulo: string, rotulos: readonly string[]): string | null {
  if (secao === undefined) return null;
  const m = new RegExp(`(?:^|\\s)${escapar(rotulo)}\\s+`).exec(secao);
  if (m === null) return null;
  const resto = secao.slice(m.index + m[0].length);
  const outros = rotulos.filter((r) => r !== rotulo).map((r) => new RegExp(`(?:^|\\s)${escapar(r)}(?:\\s|$)`));
  const corte = Math.min(...outros.map((re) => resto.search(re)).filter((i) => i >= 0), resto.length);
  const v = resto.slice(0, corte).trim();
  return v.length > 0 ? v : null;
}

const data = (v: string | null): DataCia | null => {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(v ?? "");
  return m === null ? null : { iso: `${m[3]}-${m[2]}-${m[1]}`, original: m[0] };
};
const digitos = (v: string | null) => (v ?? "").replace(/\D/g, "");

const ROTULOS_APOLICE = ["Número da apólice", "Item", "Proposta", "Data da Emissão", "Renovação da apólice", "Cod.", "Bônus", "CI", "Cobertura", "Vigência", "Ramo", "Cosseguro"];
const ROTULOS_SEGURADO = ["Nome", "Data de Nascimento", "Sexo", "CPF/CNPJ", "Tipo de Pessoa", "Endereço de Pernoite", "Complemento", "Bairro", "CEP", "Municipio", "UF", "Telefone Residencial", "Telefone Celular", "Telefone Comercial", "E-mail"];
const ROTULOS_CONDUTOR = ["Nome", "Data de Nascimento", "CPF/CNPJ", "Sexo", "Estado Civil"];
const ROTULOS_VEICULO = ["Marca/Tipo Veículo", "Ano de Fabricação/Modelo", "Chassi", "Chassi Remarcado", "Código FIPE", "Placa", "Uso do Veículo", "Veículo com Isenção Fiscal", "Veículo c/ Isenção Fiscal", "Tipo", "Nº de Portas", "Nº de Eixos", "Lotação", "Veículo Transformado"];

export interface ApoliceBradescoLida {
  numero: string;
  item: string | null;
  classe_bonus: number | null;
  ci: string | null;
  segurado_nascimento: DataCia | null;
  segurado_sexo: string | null;
  segurado_documento: string | null;
  /** "Endereço de Pernoite" do segurado: o endereco E o CEP de pernoite. */
  endereco_pernoite: EnderecoLido | null;
  condutor_nascimento: DataCia | null;
  condutor_cpf: string | null;
  condutor_sexo: string | null;
  condutor_estado_civil: string | null;
  veiculo_descricao: string | null;
  ano_fabricacao: number | null;
  ano_modelo: number | null;
  chassi: string | null;
  placa: string | null;
  uso: string | null;
  isencao_fiscal: string | null;
  /** Questionario: as respostas, cruas. */
  segurado_e_proprietario: string | null;
  segurado_e_principal_condutor: string | null;
  cobertura_outro_condutor_18_25: string | null;
  km_media: string | null;
}

/** Le a apolice; `null` quando o numero impresso nao e o da apolice pedida. */
export function lerApoliceBradescoLegado(linhas: readonly string[], apolice: string): ApoliceBradescoLida | null {
  const s = secoesDoPdfBradesco(linhas);
  const ap = s.get("Dados da sua apólice");
  const numero = valor(ap, "Número da apólice", ROTULOS_APOLICE);
  const ultimo = (numero ?? "").split(".").pop()?.replace(/\D/g, "").replace(/^0+/, "") ?? "";
  const pedido = apolice.replace(/\D/g, "").replace(/^0+/, "");
  if (pedido.length < 3 || ultimo !== pedido) return null;

  const seg = s.get("Dados do segurado");
  const sv = (r: string) => valor(seg, r, ROTULOS_SEGURADO);
  const cond = s.get("Dados do principal condutor");
  const cv = (r: string) => valor(cond, r, ROTULOS_CONDUTOR);
  const vei = s.get("Dados do veículo");
  const vv = (r: string) => valor(vei, r, ROTULOS_VEICULO);
  const q = s.get("Questionário de Risco") ?? "";
  const resposta = (pergunta: RegExp): string | null => {
    const m = new RegExp(`${pergunta.source}\\s*(.*?)(?=\\s+(?:O segurado|Não considerando|Qual quilometragem|Corretor)\\b|$)`, "i").exec(q);
    const v = m?.[1]?.trim();
    return v ? v : null;
  };

  const doc = digitos(sv("CPF/CNPJ"));
  const cpfCond = digitos(cv("CPF/CNPJ"));
  const cep = digitos(sv("CEP"));
  const uf = sv("UF")?.slice(0, 2).toUpperCase() ?? null;
  const endereco: EnderecoLido = {
    cep: cep.length === 8 ? cep : null,
    logradouro: sv("Endereço de Pernoite"),
    numero: null,
    complemento: sv("Complemento"),
    bairro: sv("Bairro"),
    cidade: sv("Municipio"),
    uf: uf !== null && /^[A-Z]{2}$/.test(uf) ? uf : null,
  };
  const anos = /(\d{4})\s*\/\s*(\d{4})/.exec(vv("Ano de Fabricação/Modelo") ?? "");
  const bonus = /^(\d{1,2})\b/.exec(valor(ap, "Bônus", ROTULOS_APOLICE) ?? "")?.[1];
  const ci = digitos(valor(ap, "CI", ROTULOS_APOLICE));
  const sexo = (v: string | null) => /^(MASCULINO|FEMININO)\b/i.exec(v ?? "")?.[1] ?? null;

  return {
    numero: digitos(numero),
    item: digitos(valor(ap, "Item", ROTULOS_APOLICE)) || null,
    classe_bonus: bonus === undefined ? null : Number(bonus),
    ci: ci.length >= 8 ? ci : null,
    segurado_nascimento: data(sv("Data de Nascimento")),
    segurado_sexo: sexo(sv("Sexo")),
    segurado_documento: doc.length === 11 || doc.length === 14 ? doc : null,
    endereco_pernoite: Object.values(endereco).every((v) => v === null) ? null : endereco,
    condutor_nascimento: data(cv("Data de Nascimento")),
    condutor_cpf: cpfCond.length === 11 ? cpfCond : null,
    condutor_sexo: sexo(cv("Sexo")),
    condutor_estado_civil: cv("Estado Civil"),
    veiculo_descricao: vv("Marca/Tipo Veículo"),
    ano_fabricacao: anos === null ? null : Number(anos[1]),
    ano_modelo: anos === null ? null : Number(anos[2]),
    chassi: vv("Chassi")?.replace(/\s+/g, "").toUpperCase() ?? null,
    placa: vv("Placa")?.replace(/[^A-Z0-9]/gi, "").toUpperCase() || null,
    uso: vv("Uso do Veículo"),
    isencao_fiscal: vv("Veículo com Isenção Fiscal") ?? vv("Veículo c/ Isenção Fiscal"),
    segurado_e_proprietario: resposta(/O segurado é proprietário do veículo\?/),
    segurado_e_principal_condutor: resposta(/O segurado é principal condutor do veículo\?/),
    cobertura_outro_condutor_18_25: resposta(/entre \d+ e \d+ anos\?/),
    km_media: resposta(/Qual quilometragem média rodada em condições habituais\?/),
  };
}
