/**
 * Tipos de saida dos extratores. Iguais, campo a campo, aos do dominio da
 * carteira (`DataCia`, `Dinheiro`, `EnderecoParaRenovar`), para quem consome
 * usar o resultado direto; aqui sao so tipos, sem validacao.
 */

/** Uma data como a cia escreveu, e o ISO (aaaa-mm-dd). */
export interface DataCia {
  iso: string;
  original: string;
}

/** Dinheiro em centavos + o texto cru da cia. */
export interface Dinheiro {
  centavos: number;
  moeda: "BRL";
  original: string;
}

/** Endereco lido do documento; CEP so com digitos, UF com duas letras. */
export interface EnderecoLido {
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
}
