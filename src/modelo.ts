/**
 * O MODELO UNICO de documento extraido (qualquer seguradora, qualquer ramo) e
 * os construtores de valores vazios. Valores crus, como a cia escreve; a
 * traducao para as opcoes da cotacao e de quem consome.
 */
import type { ItemDeCobertura } from "./tabela.js";
import type { DataCia, Dinheiro, EnderecoLido } from "./tipos.js";

export type Seguradora = "mapfre" | "porto" | "azul" | "itau" | "allianz" | "hdi" | "yelum" | "aliro" | "tokio" | "bradesco" | "zurich";
export type RamoDoDocumento = "auto" | "residencial" | "vida";
export type TipoDoDocumento = "apolice" | "proposta" | "endosso";

export interface Identificacao {
  seguradora: Seguradora;
  ramo: RamoDoDocumento | null;
  tipo: TipoDoDocumento | null;
  /** O numero da apolice como impresso (so digitos), quando achado. */
  numero_apolice: string | null;
  /** O numero da PROPOSTA, quando o documento e uma proposta. */
  numero_proposta?: string | null;
  /** Por que se chegou a essa seguradora/ramo (para conferencia). */
  sinais: string[];
}

/** Uma pessoa como o documento imprime (valores crus da cia). */
export interface PessoaExtraida {
  nome: string | null;
  documento: string | null;
  nascimento: DataCia | null;
  sexo: string | null;
  estado_civil: string | null;
  profissao: string | null;
  /** Renda como a cia escreve (faixa, "ATE R$ 10.000,00"). */
  renda: string | null;
  email: string | null;
  telefones: string[];
  endereco: EnderecoLido | null;
}

export interface CoberturaExtraida {
  descricao: string;
  /** LMI (danos) ou capital (vida). */
  valor: Dinheiro | null;
  /** O limite como impresso quando nao e dinheiro ("100% FIPE", "Conf. Cond. Gerais"). */
  limite: string | null;
  premio: Dinheiro | null;
  /** A franquia como a cia escreve, quando a linha traz. */
  franquia: string | null;
}

export interface FranquiaExtraida {
  descricao: string;
  /** "REDUZIDA 50%", "NORMAL", "OBRIGATORIA"... como a cia escreve. */
  tipo: string | null;
  valor: Dinheiro | null;
}

export interface VeiculoExtraido {
  descricao: string | null;
  marca: string | null;
  modelo: string | null;
  ano_fabricacao: number | null;
  ano_modelo: number | null;
  placa: string | null;
  chassi: string | null;
  codigo_fipe: string | null;
  /** O codigo FIPE como impresso quando vem sem o digito ("025319"). */
  codigo_fipe_impresso: string | null;
  combustivel: string | null;
  zero_km: boolean | null;
  categoria: string | null;
  blindado: boolean | null;
  kit_gas: boolean | null;
  alienado: boolean | null;
}

export interface CondutorExtraido extends PessoaExtraida {
  /** Vinculo com o segurado como a cia escreve ("Próprio Segurado", "Cônjuge"). */
  vinculo: string | null;
}

/** Perguntas do questionario de perfil, respostas cruas da cia. */
export interface QuestionarioExtraido {
  /** Todas as perguntas e respostas do questionario, como impressas (inclusive as sem campo proprio). */
  respostas: Array<{ pergunta: string; resposta: string }>;
  tipo_residencia: string | null;
  garagem_residencia: string | null;
  garagem_trabalho: string | null;
  garagem_estudo: string | null;
  residentes_18_25: string | null;
  cobertura_18_25: string | null;
  uso_comercial: string | null;
  km_mensal: string | null;
  isencao_fiscal: string | null;
}

export interface AutoExtraido {
  veiculo: VeiculoExtraido;
  /** "VMR"/"Valor de Mercado Referenciado", "Valor Determinado". */
  modalidade_casco: string | null;
  /** Fator de ajuste sobre a FIPE (100 = 100%). */
  percentual_fipe: number | null;
  uso: string | null;
  cep_pernoite: string | null;
  /** Endereco de pernoite, quando a cia imprime (Bradesco). */
  endereco_pernoite: EnderecoLido | null;
  /** So o prefixo de 5 digitos quando a cia so imprime a regiao. */
  cep_pernoite_prefixo: string | null;
  classe_bonus: number | null;
  ci: string | null;
  sinistros: number | null;
  /** Dispositivo antifurto como a cia escreve. */
  antifurto: string | null;
  condutor: CondutorExtraido | null;
  questionario: QuestionarioExtraido;
}

export interface ResidencialExtraido {
  imovel: EnderecoLido | null;
  tipo_imovel: string | null;
  ocupacao: string | null;
  condominio_fechado: boolean | null;
  lmi_basica: Dinheiro | null;
}

export interface VidaExtraida {
  renda: string | null;
  capital_morte: Dinheiro | null;
}

export interface DocumentoExtraido extends Identificacao {
  produto: string | null;
  emissao: DataCia | null;
  /** A apolice que esta renovou (numero e seguradora como impressos). */
  renovacao_de: { numero: string | null; seguradora: string | null } | null;
  franquias: FranquiaExtraida[];
  /** Clausulas/planos listados a parte ("VIDROS VIP", "CARRO RESERVA 7 DIAS"), como impressos. */
  clausulas: string[];
  pagamento: { forma: string | null; parcelas: number | null } | null;
  tipo_seguro: string | null;
  item: string | null;
  proposta: string | null;
  vigencia_inicio: DataCia | null;
  vigencia_fim: DataCia | null;
  segurado: PessoaExtraida | null;
  coberturas: CoberturaExtraida[];
  assistencias: string[];
  premio_liquido: Dinheiro | null;
  premio_total: Dinheiro | null;
  auto: AutoExtraido | null;
  residencial: ResidencialExtraido | null;
  vida: VidaExtraida | null;
}

export interface OpcoesDeExtracao {
  /** Trava: so le se o numero impresso for este (comparado sem zeros a esquerda). */
  numero_apolice?: string | null;
  /** Trava de PROPOSTA: o numero da proposta ou o CPF/CNPJ do segurado impresso nela. */
  numero_proposta?: string | null;
  cpf_segurado?: string | null;
}

export function pessoaVazia(): PessoaExtraida {
  return { nome: null, documento: null, nascimento: null, sexo: null, estado_civil: null, profissao: null, renda: null, email: null, telefones: [], endereco: null };
}
export const veiculoVazio = (): VeiculoExtraido => ({
  descricao: null,
  marca: null,
  modelo: null,
  ano_fabricacao: null,
  ano_modelo: null,
  placa: null,
  chassi: null,
  codigo_fipe: null,
  codigo_fipe_impresso: null,
  combustivel: null,
  zero_km: null,
  categoria: null,
  blindado: null,
  kit_gas: null,
  alienado: null,
});
export const questionarioVazio = (): QuestionarioExtraido => ({
  respostas: [],
  tipo_residencia: null,
  garagem_residencia: null,
  garagem_trabalho: null,
  garagem_estudo: null,
  residentes_18_25: null,
  cobertura_18_25: null,
  uso_comercial: null,
  km_mensal: null,
  isencao_fiscal: null,
});
export const autoVazio = (): AutoExtraido => ({
  veiculo: veiculoVazio(),
  modalidade_casco: null,
  percentual_fipe: null,
  uso: null,
  cep_pernoite: null,
  endereco_pernoite: null,
  cep_pernoite_prefixo: null,
  classe_bonus: null,
  ci: null,
  sinistros: null,
  antifurto: null,
  condutor: null,
  questionario: questionarioVazio(),
});

export function documentoBase(id: Identificacao): DocumentoExtraido {
  return {
    ...id,
    produto: null,
    emissao: null,
    renovacao_de: null,
    franquias: [],
    clausulas: [],
    pagamento: null,
    tipo_seguro: null,
    item: null,
    proposta: null,
    vigencia_inicio: null,
    vigencia_fim: null,
    segurado: null,
    coberturas: [],
    assistencias: [],
    premio_liquido: null,
    premio_total: null,
    auto: null,
    residencial: null,
    vida: null,
  };
}

export const pessoaCom = (p: Partial<PessoaExtraida>): PessoaExtraida | null => {
  const r = { ...pessoaVazia(), ...p };
  const temAlgo = Object.entries(r).some(([k, v]) => (k === "telefones" ? (v as string[]).length > 0 : v !== null));
  return temAlgo ? r : null;
};
export const cobertura = (i: ItemDeCobertura): CoberturaExtraida => ({
  descricao: i.descricao,
  valor: i.valor,
  limite: null,
  premio: null,
  franquia: null,
});


export function condutor(p: Partial<PessoaExtraida>, vinculo: string | null = null): CondutorExtraido | null {
  const pessoa = pessoaCom(p);
  if (pessoa === null && vinculo === null) return null;
  return { ...(pessoa ?? pessoaVazia()), vinculo };
}
