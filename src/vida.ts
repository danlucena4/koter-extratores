/**
 * VIDA: o que e comum aos leitores de cada cia (um arquivo por cia, como no
 * auto: `mapfre-vida.ts`, `allianz-vida.ts`, `yelum-vida.ts`).
 *
 * Cada leitor devolve o `VidaLida` (o segurado com nascimento, sexo, estado
 * civil, profissao e renda como a cia escreve, as coberturas com o capital e
 * o capital de MORTE), que continua exportado para quem ja o usa; o
 * `documentoVida<Cia>` de cada arquivo o leva ao modelo unico e junta os
 * dados gerais (`gerais.ts`).
 */
import { coberturaComPremio } from "./gerais.js";
import { pessoaCom, vidaVazia, type DocumentoExtraido } from "./modelo.js";
import type { ItemDeCobertura } from "./tabela.js";
import type { DataCia, Dinheiro, EnderecoLido } from "./tipos.js";

export interface VidaLida {
  numero: string;
  segurado_nome: string | null;
  segurado_documento: string | null;
  /** So as partes que a cia separa; o que vem misturado fica nulo. */
  segurado_endereco: EnderecoLido | null;
  vigencia_fim: DataCia | null;
  segurado_nascimento: DataCia | null;
  segurado_sexo: string | null;
  segurado_estado_civil: string | null;
  profissao: string | null;
  /** Renda como a cia escreve (faixa, "DE R$ 5.000,00 A R$ 10.000,00"). */
  renda: string | null;
  coberturas: ItemDeCobertura[];
  capital_morte: Dinheiro | null;
  assistencias: string[];
}

/** A cobertura basica de morte (natural ou acidental), nao a morte ACIDENTAL sozinha. */
const ehMorte = (d: string) => /^Morte\b/i.test(d.trim()) && !/acidental\s*$/i.test(d.trim());
export const morteDe = (itens: ItemDeCobertura[]): Dinheiro | null => itens.find((i) => ehMorte(i.descricao))?.valor ?? null;

/** O que o leitor leu no modelo unico (sem os dados gerais, que `comGerais` junta). */
export function deVida(doc: DocumentoExtraido, v: VidaLida): DocumentoExtraido {
  return {
    ...doc,
    vigencia_fim: v.vigencia_fim,
    segurado: pessoaCom({
      nome: v.segurado_nome,
      documento: v.segurado_documento,
      nascimento: v.segurado_nascimento,
      sexo: v.segurado_sexo,
      estado_civil: v.segurado_estado_civil,
      profissao: v.profissao,
      renda: v.renda,
      endereco: v.segurado_endereco,
    }),
    coberturas: v.coberturas.map(coberturaComPremio),
    assistencias: v.assistencias,
    vida: { ...vidaVazia(), renda: v.renda, capital_morte: v.capital_morte },
  };
}
