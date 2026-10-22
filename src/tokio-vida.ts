/**
 * TOKIO MARINE VIDA (Vida Individual, Vida Homem, Vida Mulher; ramo 13.91).
 * Amostra de 2026-10-22 (cobranca): 3 PDFs. O leitor do segurado e das
 * coberturas e os DADOS GERAIS (premio anual, beneficiarios) se juntam em
 * `documentoVidaTokio`.
 */
import { achar, cep, cpfOuCnpj, data, datas, digitos, dinheiro, email, enderecoOuNulo, ruaNumeroComplemento, secao, vazio } from "./leitura.js";
import { deVida, morteDe, type VidaLida } from "./vida.js";
import { comGerais, fones, geraisVazios, pagamento, quadro, type DadosGerais } from "./gerais.js";
import { tabelaDeCoberturas } from "./tabela.js";
import type { BeneficiarioExtraido, DocumentoExtraido } from "./modelo.js";
import type { LinhaPosicionada } from "./pdf/motor.js";

/** E Tokio Marine Vida? O titulo do quadro ("Tokio Marine Vida Individual|Homem|Mulher"). */
export const ehApoliceVidaTokio = (linhas: readonly string[]): boolean => linhas.some((l) => /^Tokio Marine Vida\b/i.test(l.trim()));

/**
 * "Tokio Marine Vida Individual" / "Vigência: a partir das 24 horas do dia
 * dd/mm/aaaa até ... dd/mm/aaaa." / "Ramo: 13.91 Apólice: 0001659085 Plano: 1
 * Proposta: 9292530" (a TRAVA), o segurado ("Segurado:", "CPF:", "Endereço:
 * RUA X, 12", "Bairro:", "CEP: ... Cidade: ... UF: ..") e a tabela
 * "Descrição das Coberturas | Capitais Segurados | Carências | Franquias |
 * Prêmios Anuais" ("BÁSICA (MORTE) 300.000,00 Não há Não há 603,86", a
 * descricao quebra nas linhas de baixo).
 */
export function lerVidaTokio(linhas: readonly string[], numeroApolice: string): VidaLida | null {
  if (!ehApoliceVidaTokio(linhas)) return null;
  const impresso = digitos(achar(linhas, /\bApólice:\s*(\d{5,})\b/));
  const pedido = digitos(numeroApolice);
  if (impresso.length < 5 || impresso.replace(/^0+/, "") !== pedido.replace(/^0+/, "")) return null;
  const iSeg = linhas.findIndex((l) => /^Segurado:/i.test(l));
  const seg = iSeg < 0 ? [] : linhas.slice(iSeg, iSeg + 7);
  const mCep = /^CEP:\s*(\d{5}-?\d{3})\s+Cidade:\s*(.+?)\s+UF:\s*([A-Z]{2})\b/.exec(seg.find((l) => /^CEP:/.test(l)) ?? "");
  const vig = datas(linhas.find((l) => /^Vigência:/i.test(l)));
  const coberturas = tabelaDeCoberturas(linhas, /^\(R\$\)\s*\(\*\)\s*Anuais/i, /^-\s*O Prêmio acima/i, { minimoDeValores: 2 });
  return {
    numero: impresso,
    segurado_nome: achar(seg, /^Segurado:\s*(.+)$/i),
    segurado_documento: cpfOuCnpj(achar(seg, /^CPF:\s*([\d.\-/]+)/i)),
    segurado_endereco: enderecoOuNulo({
      cep: cep(mCep?.[1]),
      ...ruaNumeroComplemento(achar(seg, /^Endereço:\s*(.+)$/i)),
      bairro: achar(seg, /^Bairro:\s*(.+)$/i),
      cidade: vazio(mCep?.[2]),
      uf: mCep?.[3] ?? null,
    }),
    vigencia_fim: vig[1] ?? null,
    segurado_nascimento: null,
    segurado_sexo: null,
    segurado_estado_civil: null,
    profissao: null,
    renda: null,
    coberturas,
    capital_morte: morteDe(coberturas.map((c) => ({ ...c, descricao: c.descricao.replace(/^BÁSICA\s*\((MORTE)\)/i, "$1") }))),
    assistencias: [],
  };
}

/* ---------------------------------------------------------- dados gerais */

/**
 * Produto (o titulo), Plano, Proposta, Tipo de Seguro, Data da Emissão,
 * vigencia (5 anos, premio ANUAL), E-mail e Celular/Telefone, "Prêmio
 * Líquido Total" / "Prêmio Total/Anual ... Cobrança: Carnê" e os
 * BENEFICIARIOS ("NOME dd/mm/aaaa Parentesco 50,00", o nome que nao cabe
 * continua na linha de baixo).
 */
export function geraisVidaTokio(linhas: readonly string[]): DadosGerais {
  const g = geraisVazios();
  const vig = datas(linhas.find((l) => /^Vigência:/i.test(l)));
  const contato = quadro(linhas.slice(0, 60), ["E-mail", "Celular", "Telefone"]);
  const beneficiarios: BeneficiarioExtraido[] = [];
  for (const l of secao(linhas, /^Nome Data de Nascimento Parentesco %$/i, /^IMPORTANTE\b/i, 20).slice(1).map((x) => x.trim())) {
    const m = /^(.+?)\s+(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(\d{1,3},\d{2})$/.exec(l);
    const ultimo = beneficiarios[beneficiarios.length - 1];
    if (m !== null) beneficiarios.push({ nome: vazio(m[1]), documento: null, nascimento: data(m[2]), parentesco: vazio(m[3]), percentual: Number((m[4] as string).replace(",", ".")) });
    /* O nome que nao coube na celula segue na linha de baixo (so letras). */
    else if (ultimo !== undefined && ultimo.nome !== null && /^[A-ZÀ-Ú][A-ZÀ-Ú' ]+$/.test(l)) ultimo.nome = `${ultimo.nome} ${l}`;
  }
  g.produto = achar(linhas, /^(Tokio Marine Vida\b.*)$/i);
  g.proposta = digitos(achar(linhas, /\bProposta:\s*(\d+)/)) || null;
  g.tipo_seguro = achar(linhas, /^Tipo de Seguro:\s*(.+)$/i);
  g.emissao = data(achar(linhas, /Data da Emissão:\s*(\d{2}\/\d{2}\/\d{4})/i));
  g.vigencia_inicio = vig[0] ?? null;
  g.vigencia_fim = vig[1] ?? null;
  g.premio_liquido = dinheiro(achar(linhas, /^Prêmio Líquido Total:\s*(R\$\s*[\d.]+,\d{2})/i));
  g.premio_total = dinheiro(achar(linhas, /^Prêmio Total\/Anual:\s*(R\$\s*[\d.]+,\d{2})/i));
  g.pagamento = pagamento(achar(linhas, /^Prêmio Total\/Anual:.*\bCobrança:\s*(.+)$/i), null);
  g.segurado = { email: email(contato.get("E-mail")), telefones: fones(contato.get("Celular"), contato.get("Telefone")) };
  g.vida = { periodicidade_premio: linhas.some((l) => /^Prêmio Total\/Anual:/i.test(l)) ? "ANUAL" : null, beneficiarios };
  return g;
}

/* ------------------------------------------------------- modelo unico */

/** A apolice no modelo unico; `null` quando nao e a pedida. */
export function documentoVidaTokio(doc: DocumentoExtraido, pos: readonly LinhaPosicionada[], numero: string): DocumentoExtraido | null {
  const linhas = pos.map((l) => l.texto);
  const v = lerVidaTokio(linhas, numero);
  return v === null ? null : comGerais(deVida(doc, v), geraisVidaTokio(linhas));
}
