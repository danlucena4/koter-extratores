/**
 * MAPFRE VIDA (Vida Você Multiflex). Amostra de 2026-10-20 (cobranca): 1
 * PDF. O leitor do segurado e das coberturas e os DADOS GERAIS (premio
 * mensal, prazo, beneficiarios) se juntam em `documentoVidaMapfre`.
 */
import { achar, cep, cpfOuCnpj, data, digitos, dinheiro, enderecoOuNulo, secao, vazio } from "./leitura.js";
import { deVida, morteDe, type VidaLida } from "./vida.js";
import { comGerais, geraisVazios, fones, pagamento, type DadosGerais } from "./gerais.js";
import { tabelaDeCoberturas } from "./tabela.js";
import type { BeneficiarioExtraido, DocumentoExtraido } from "./modelo.js";
import type { LinhaPosicionada } from "./pdf/motor.js";

/**
 * "Nº da Apólice: 0000000000000", "Estado Civil: SOLTEIRO Sexo: FEMININO",
 * "Data de Nascimento: dd/mm/aaaa", "Profissão: ADVOGADO Faixa de Renda: DE R$
 * ... A R$ ...", e a tabela "Coberturas Capital Segurado Prêmio Líquido
 * Carência/Franquia" ("Morte (M) 100.000,00 30,00 24 / Não").
 */
export function lerVidaMapfre(linhas: readonly string[], numeroApolice: string): VidaLida | null {
  const impresso = digitos(achar(linhas, /N[ºo°] da Apólice:\s*(\d+)/i));
  const pedido = digitos(numeroApolice);
  if (impresso.length < 8 || pedido.length < 8 || !impresso.endsWith(pedido.slice(-10))) return null;
  if (!linhas.some((l) => /MAPFRE VIDA/i.test(l))) return null;
  const itens = tabelaDeCoberturas(linhas, /^Coberturas Capital Segurado/i, /^(Para todas as Coberturas|Benef[íi]cios\b)/i, { minimoDeValores: 2 }).map((i) => ({
    ...i,
    descricao: i.descricao.replace(/\s*\((?:M|IPA|MA|DG)\)\s*/gi, " ").replace(/\s+/g, " ").trim(),
  }));
  const iEnd = linhas.findIndex((l) => /^ENDEREÇO RESIDENCIAL DO SEGURADO/i.test(l));
  const end = iEnd < 0 ? [] : linhas.slice(iEnd + 1, iEnd + 6);
  return {
    numero: impresso,
    segurado_nome: achar(linhas, /^Nome Completo:\s*(.+?)\s+CPF:/i),
    segurado_documento: cpfOuCnpj(achar(linhas, /^Nome Completo:.*\bCPF:\s*([\d.\-/]+)/i)),
    segurado_endereco: enderecoOuNulo({
      cep: cep(achar(end, /^Bairro:.*\bCEP:\s*([\d-]{8,9})/i)),
      logradouro: achar(end, /^Logradouro:\s*(.+?)\s+N(?:[ºo°]|úmero):/i),
      numero: achar(end, /^Logradouro:.*\sN(?:[ºo°]|úmero):\s*(\S+)/i),
      complemento: achar(end, /^Complemento:\s*(.+)$/i),
      bairro: achar(end, /^Bairro:\s*(.+?)\s+CEP:/i),
      cidade: achar(end, /^Cidade:\s*(.+?)\s+UF:/i),
      uf: achar(end, /^Cidade:.*\bUF:\s*([A-Z]{2})\b/),
    }),
    vigencia_fim: data(achar(linhas, /T[ée]rmino de Vig[êe]ncia.*?(\d{2}\/\d{2}\/\d{4})/i)),
    segurado_nascimento: data(achar(linhas, /^Data de Nascimento:\s*(\d{2}\/\d{2}\/\d{4})/i)),
    segurado_sexo: achar(linhas, /\bSexo:\s*(MASCULINO|FEMININO)\b/i),
    segurado_estado_civil: achar(linhas, /^Estado Civil:\s*(.+?)\s+Sexo:/i),
    profissao: achar(linhas, /^Profissão:\s*(.+?)\s+Faixa de Renda:/i),
    renda: achar(linhas, /Faixa de Renda:\s*(.+)$/i),
    coberturas: itens,
    capital_morte: morteDe(itens),
    assistencias: [],
  };
}

/* ---------------------------------------------------------- dados gerais */

/**
 * MAPFRE Vida: "APÓLICE DE SEGURO - MAPFRE VIDA VOCE MULTIFLEX", "Nº da
 * Proposta", "Data/Hora Emissão da Apólice", "Data de Início de Vigência",
 * "Telefone Celular" do titular, PRÊMIOS ("Prêmio Mensal Líquido/Total",
 * "Forma de Pagamento: X Periodicidade: MENSAL", "Prazo de Pagamento: 60
 * parcelas") e BENEFICIÁRIO(S): a linha "FÍSICA <CPF> [nome] dd/mm/aaaa
 * <parentesco> 50%" com o nome QUEBRADO dentro da celula (ate no meio da
 * palavra), por isso o nome fica nulo.
 */
export function geraisVidaMapfre(linhas: readonly string[]): DadosGerais {
  const g = geraisVazios();
  const titular = secao(linhas, /^DADOS DO\(A\) SEGURADO TITULAR/i, /^ENDEREÇO RESIDENCIAL/i, 12);
  const beneficiarios: BeneficiarioExtraido[] = secao(linhas, /^BENEFICIÁRIO\(S\)/i, /^O\(s\) beneficiário/i, 40)
    .map((l) => /^(?:F[ÍI]SICA|JUR[ÍI]DICA)\s+([\d.\-/]{11,18})\b.*?\s(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(\d{1,3}(?:,\d+)?)%/.exec(l.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ nome: null, documento: cpfOuCnpj(m[1]), nascimento: data(m[2]), parentesco: vazio(m[3]), percentual: Number((m[4] as string).replace(",", ".")) }));
  g.produto = achar(linhas.slice(0, 3), /^APÓLICE DE SEGURO\s*-\s*(.+)$/i);
  g.proposta = digitos(achar(linhas, /^N[ºo°] da Proposta:\s*(\d+)/i)) || null;
  g.emissao = data(achar(linhas, /Emissão da Apólice:\s*(\d{2}\/\d{2}\/\d{4})/i));
  g.vigencia_inicio = data(achar(linhas, /Início de Vigência.*?(\d{2}\/\d{2}\/\d{4})/i));
  g.premio_liquido = dinheiro(achar(linhas, /Prêmio Mensal Líquido:\s*(R\$\s*[\d.]+,\d{2})/i));
  g.premio_total = dinheiro(achar(linhas, /Prêmio Mensal Total:\s*(R\$\s*[\d.]+,\d{2})/i));
  const parcelas = Number(achar(linhas, /^Prazo de Pagamento:\s*(\d+)\s+parcelas/i));
  g.pagamento = pagamento(achar(linhas, /^Forma de Pagamento:\s*(.+?)\s+Periodicidade:/i), Number.isFinite(parcelas) && parcelas > 0 ? parcelas : null);
  g.segurado = { telefones: fones(achar(titular, /^Telefone Celular:\s*(.+)$/i)) };
  /* "Benefícios Custo": as assistencias do plano ("MAPFRE Cuidando de Você Gratuito"); o sorteio nao e assistencia. */
  g.assistencias = secao(linhas, /^Benefícios Custo$/i, /^OBSERVAÇÕES$/i, 10)
    .slice(1)
    .map((l) => vazio(l.replace(/\s+(Gratuito|R\$\s*[\d.]+,\d{2}|[\d.]+,\d{2})$/i, "")))
    .filter((a): a is string => a !== null && !/^SORTEIO\b/i.test(a));
  g.vida = { periodicidade_premio: achar(linhas, /\bPeriodicidade:\s*(\S+)/i), beneficiarios };
  return g;
}

/* ------------------------------------------------------- modelo unico */

/** A apolice no modelo unico; `null` quando nao e a pedida. */
export function documentoVidaMapfre(doc: DocumentoExtraido, pos: readonly LinhaPosicionada[], numero: string): DocumentoExtraido | null {
  const linhas = pos.map((l) => l.texto);
  const v = lerVidaMapfre(linhas, numero);
  return v === null ? null : comGerais(deVida(doc, v), geraisVidaMapfre(linhas));
}
