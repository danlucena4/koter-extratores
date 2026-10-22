/**
 * RESIDENCIAL: o que e comum aos leitores de cada cia (um arquivo por cia,
 * como no auto: `mapfre-residencial.ts`, `hdi-residencial.ts`,
 * `tokio-residencial.ts`, `porto-residencial.ts`, `allianz-residencial.ts`).
 *
 * Cada leitor devolve o `ResidencialLido` (o quadro como a cia imprime: o
 * segurado, o IMOVEL com tipo e ocupacao crus, a tabela de coberturas e a
 * assistencia), que continua exportado para quem ja o usa; o
 * `documentoResidencial<Cia>` de cada arquivo o leva ao modelo unico e junta
 * os dados gerais (`gerais.ts`).
 */
import { coberturaComPremio } from "./gerais.js";
import { pessoaCom, residencialVazio, type DocumentoExtraido } from "./modelo.js";
import type { ItemDeCobertura } from "./tabela.js";
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

/** A cobertura basica (incendio). */
export const ehBasica = (descricao: string): boolean => /^(B[ÁA]SICA\b|INC[ÊE]NDIO)/i.test(descricao.trim());

/** A assistencia que vem na tabela de coberturas sai da lista e vira a assistencia. */
export const separarAssistencia = (itens: ItemDeCobertura[]): { coberturas: ItemDeCobertura[]; assistencia: string | null } => {
  const assist = itens.find((i) => /ASSIST[ÊE]NCIA/i.test(i.descricao));
  return { coberturas: itens.filter((i) => !/ASSIST[ÊE]NCIA/i.test(i.descricao)), assistencia: assist?.descricao ?? null };
};

/** O quadro lido no modelo unico (sem os dados gerais, que `comGerais` junta). */
export function deResidencial(doc: DocumentoExtraido, r: ResidencialLido): DocumentoExtraido {
  return {
    ...doc,
    segurado: pessoaCom({ nome: r.segurado_nome, documento: r.segurado_documento, endereco: r.segurado_endereco }),
    coberturas: r.coberturas.map(coberturaComPremio),
    assistencias: r.assistencia === null ? [] : [r.assistencia],
    residencial: {
      ...residencialVazio(),
      imovel: r.imovel,
      tipo_imovel: r.tipo_imovel,
      ocupacao: r.ocupacao,
      condominio_fechado: r.condominio_fechado,
      lmi_basica: r.lmi_basica,
    },
  };
}
