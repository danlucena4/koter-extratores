/**
 * Pecas comuns aos leitores: dinheiro pt-BR e a TABELA DE COBERTURAS, que tem
 * a mesma forma em todas as seguradoras vistas (residencial e vida):
 *
 *   DESCRICAO DA COBERTURA (PODE QUEBRAR   123.456,78   123,45
 *   NA LINHA DE BAIXO)
 *
 * A linha com valores fecha um item; a linha sem valor logo depois e a
 * continuacao da descricao dele.
 */
import type { Dinheiro } from "./tipos.js";

const VALOR = /(?:^|\s)(?:R\$\s*)?((?:\d{1,3}(?:\.\d{3})+|\d+),\d{2})(?=\s|$)/g;

/** "123.456,78" -> centavos, com o texto cru. */
export function dinheiroPtBr(v: string | null | undefined): Dinheiro | null {
  const m = /^\s*(?:R\$\s*)?((?:\d{1,3}(?:\.\d{3})+|\d+),\d{2})\s*$/.exec(v ?? "");
  if (m === null) return null;
  const [inteiro, centavos] = (m[1] as string).replace(/\./g, "").split(",");
  return { centavos: Number(inteiro) * 100 + Number(centavos), moeda: "BRL", original: m[1] as string };
}

export interface ItemDeCobertura {
  descricao: string;
  /** O primeiro valor da linha (LMI ou capital). */
  valor: Dinheiro;
  /** Os demais valores da linha (premio, quando ha), crus. */
  outros_valores: string[];
}

export interface OpcoesDaTabela {
  /** Quantos valores uma linha precisa ter para ser item (2 = LMI + premio; 1 = so capital). */
  minimoDeValores: 1 | 2;
  /** Linha que nao e cobertura nem continuacao (paginacao, cabecalho repetido). */
  ignorar?: RegExp;
}

/**
 * Os itens entre a linha `inicio` (exclusive) e a primeira `fim` depois dela.
 * Sem `inicio`, `[]`.
 */
export function tabelaDeCoberturas(
  linhas: readonly string[],
  inicio: RegExp,
  fim: RegExp,
  opcoes: OpcoesDaTabela,
): ItemDeCobertura[] {
  const i = linhas.findIndex((l) => inicio.test(l));
  if (i < 0) return [];
  const itens: ItemDeCobertura[] = [];
  let ultimoFoiItem = false;
  for (const bruta of linhas.slice(i + 1)) {
    const l = bruta.trim();
    if (fim.test(l)) break;
    if (l.length === 0 || /^\d+\s*\/\s*\d+$/.test(l) || (opcoes.ignorar?.test(l) ?? false)) continue;
    const valores = [...l.matchAll(VALOR)].map((m) => m[1] as string);
    if (valores.length >= opcoes.minimoDeValores) {
      const primeiro = l.search(VALOR);
      const descricao = l.slice(0, primeiro).replace(/\s+(?:R\$|Até)\s*$/i, "").trim();
      const valor = dinheiroPtBr(valores[0]);
      if (descricao.length > 0 && valor !== null) {
        itens.push({ descricao, valor, outros_valores: valores.slice(1) });
        ultimoFoiItem = true;
        continue;
      }
    }
    /* Sem valor (ou valores de menos): continuacao da descricao do item de cima. */
    const ultimo = itens[itens.length - 1];
    /* Rodape de pagina (codigo de barras, so numeros) nao e continuacao: exige palavra. */
    if (ultimoFoiItem && ultimo !== undefined && valores.length === 0 && !/:/.test(l) && /[A-Za-zÀ-ú]{3,}/.test(l)) {
      ultimo.descricao = `${ultimo.descricao} ${l}`.replace(/\s+/g, " ").trim();
    } else {
      ultimoFoiItem = false;
    }
  }
  return itens;
}
