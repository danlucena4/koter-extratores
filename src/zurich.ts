/**
 * O PDF da APOLICE de auto da Zurich. A pagina tem varias colunas na mesma
 * altura, entao as LINHAS saem embaralhadas; os PEDACOS de texto (um `Tj`
 * cada) vem inteiros e na ordem do questionario (9 PDFs, 2026-10-20):
 *
 *   Questionário Perfil Condutor Principal
 *   Nasc: dd/mm/aaaa | Sexo: Masculino | Estado Civil: Casado(a)
 *   Qual o tipo de residência do condutor principal? Casa em condomínio fechado
 *   Deseja cobertura do seguro para outros condutores habilitados com menos de 25 anos? Não
 *   O veículo fica guardado em garagem ... para ir ao | trabalho? Sim
 *   O veículo fica guardado em garagem ... para ir à escola, | faculdade ou pós-graduação? O veículo não é utilizado ...
 *   O veículo fica guardado em garagem ... no seu local de pernoite? Sim, com | portão automático ou porteiro
 *
 * O leitor junta os pedacos do bloco do questionario e le cada pergunta ate a
 * proxima. TRAVA: o pedaco "Apólice: 0000000" tem que ser a apolice pedida.
 */
import { pedacosDoPdf, type PedacoDeTexto } from "./pdf-texto.js";
import type { DataCia } from "./tipos.js";

export interface ApoliceZurichLida {
  numero: string;
  condutor_nascimento: DataCia | null;
  condutor_sexo: string | null;
  condutor_estado_civil: string | null;
  tipo_residencia: string | null;
  cobertura_menores_25: string | null;
  garagem_trabalho: string | null;
  garagem_estudo: string | null;
  garagem_residencia: string | null;
}

/** O texto do questionario: os pedacos de "Questionário Perfil" ate o quadro seguinte. */
export function questionarioDosPedacosZurich(grupos: readonly (readonly PedacoDeTexto[])[]): string | null {
  for (const g of grupos) {
    const i = g.findIndex((p) => /Questionário Perfil Condutor Principal/i.test(p.texto));
    if (i < 0) continue;
    const bloco: string[] = [];
    for (const p of g.slice(i + 1)) {
      if (/^(Coberturas|Descrição|Cláusulas)\b/.test(p.texto.trim()) || /^[A-Za-z0-9]{6,}-[A-Za-z0-9]+$/.test(p.texto.trim())) break;
      bloco.push(p.texto);
    }
    return bloco.join(" ").replace(/\s+/g, " ").trim();
  }
  return null;
}

/** A resposta de uma pergunta: do "?" ate o inicio da proxima pergunta conhecida. */
function resposta(q: string, pergunta: RegExp): string | null {
  const PROXIMAS = /\s(?:Deseja cobertura|O\s+veículo fica guardado|Qual o tipo de residência|Nome Completo:|Nasc:|Sexo:|Estado Civil:)/;
  const m = pergunta.exec(q);
  if (m === null) return null;
  const resto = q.slice(m.index + m[0].length);
  const fim = resto.search(PROXIMAS);
  const v = (fim < 0 ? resto : resto.slice(0, fim)).trim();
  return v.length > 0 ? v : null;
}

export function lerApoliceZurichDosPedacos(grupos: readonly (readonly PedacoDeTexto[])[], numeroApolice: string): ApoliceZurichLida | null {
  const pedido = numeroApolice.replace(/\D/g, "").replace(/^0+/, "");
  const impresso = grupos
    .flat()
    .map((p) => /^Apólice:\s*(\d+)\s*$/.exec(p.texto.trim())?.[1])
    .find((x) => x !== undefined);
  if (pedido.length < 4 || impresso === undefined || impresso.replace(/^0+/, "") !== pedido) return null;

  const q = questionarioDosPedacosZurich(grupos) ?? "";
  const nasc = /Nasc:\s*(\d{2})\/(\d{2})\/(\d{4})/.exec(q);
  return {
    numero: impresso,
    condutor_nascimento: nasc === null ? null : { iso: `${nasc[3]}-${nasc[2]}-${nasc[1]}`, original: `${nasc[1]}/${nasc[2]}/${nasc[3]}` },
    condutor_sexo: /Sexo:\s*(Masculino|Feminino)\b/i.exec(q)?.[1] ?? null,
    condutor_estado_civil: resposta(q, /Estado Civil:/),
    tipo_residencia: resposta(q, /tipo de residência do condutor principal\?/i),
    cobertura_menores_25: resposta(q, /com menos de \d+ anos\?/i),
    garagem_trabalho: resposta(q, /para ir ao\s+trabalho\?/i),
    garagem_estudo: resposta(q, /faculdade ou pós-graduação\?/i),
    garagem_residencia: resposta(q, /no seu local de pernoite\?/i),
  };
}

/** Le o PDF (bytes); `null` quando o numero impresso nao e o da apolice pedida. */
export function lerApoliceZurichLegado(bytes: Uint8Array, numeroApolice: string): ApoliceZurichLida | null {
  return lerApoliceZurichDosPedacos(pedacosDoPdf(bytes), numeroApolice);
}
