/**
 * PORTO VIDA (Vida Individual, ramos 1381 e 1391; inclui o Acidentes Pessoais
 * Individual - Plus, que sai no mesmo modelo). Amostra de 2026-10-22
 * (cobranca do ultimo ano, 11 PDFs). Dois layouts, ambos com a mesma
 * informacao:
 *
 *  - LEGADO (10 PDFs), o da tela "Vida Individual - Consulta Dados Apolice":
 *    tudo em maiusculas e SEM dois-pontos ("NOME X", "DATA NASCIMENTO
 *    dd/mm/aaaa CPF/CNPJ ..."), numero "APÓLICE Nº 4.1381.0000000";
 *  - NOVO (1 PDF), "Apólice Individual de Seguros de Pessoas" / "Seguro de
 *    Pessoas Individual": rotulos com dois-pontos ("Nome:", "CPF/CNPJ:"),
 *    numero "APÓLICE N°: 000000000", validade por cobertura.
 *
 * Nos dois o premio total e o ANUAL (as parcelas vem a parte), o capital de
 * morte e o da cobertura "Morte" (no Acidentes Pessoais so ha Morte
 * Acidental: fica nulo, nunca o acidental no lugar).
 */
import { achar, cep, cpfOuCnpj, data, datas, digitos, dinheiro, email, enderecoOuNulo, ruaNumeroComplemento, secao, ufDe, vazio } from "./leitura.js";
import { deVida, morteDe, type VidaLida } from "./vida.js";
import { comGerais, fones, geraisVazios, pagamento, quadro, type DadosGerais } from "./gerais.js";
import { dinheiroPtBr, type ItemDeCobertura } from "./tabela.js";
import type { BeneficiarioExtraido, DocumentoExtraido } from "./modelo.js";
import type { LinhaPosicionada } from "./pdf/motor.js";

const ehLegado = (linhas: readonly string[]) => linhas.some((l) => /^APÓLICE DE (?:RENOVAÇÃO )?SEGURO DE VIDA INDIVIDUAL\b/i.test(l.trim()));
const ehNovo = (linhas: readonly string[]) =>
  linhas.slice(0, 12).some((l) => /^Apólice Individual de Seguros de Pessoas\b/i.test(l.trim()) || /^Seguro de Pessoas Individual$/i.test(l.trim()));

/** E Porto Vida? O titulo da apolice (os dois layouts). */
export const ehApoliceVidaPorto = (linhas: readonly string[]): boolean => ehLegado(linhas) || ehNovo(linhas);

/**
 * O numero da apolice como impresso: no legado "APÓLICE Nº 4.1381.0000000
 * PROPOSTA Nº ..." (sucursal.ramo.apolice; vale o ultimo grupo), no novo
 * "APÓLICE N°: 000000000".
 */
export function numeroDaApoliceVidaPorto(linhas: readonly string[]): string | null {
  const legado = achar(linhas, /^APÓLICE N[º°o]\s*\d+\.\d+\.(\d{5,})\b/i);
  return legado ?? achar(linhas, /^APÓLICE N[º°o]:\s*(\d{5,})\b/i);
}

/** "R$ 1.234,56" / "-" na ordem da linha (a coluna vazia sai `null`). */
const valoresDaLinha = (l: string | undefined): Array<string | null> =>
  [...(l ?? "").matchAll(/R\$\s*((?:\d{1,3}(?:\.\d{3})+|\d+),\d{1,2})|(?:^|\s)(-)(?=\s|$)/g)].map((m) => m[1] ?? null);

/** A nota no fim ("até(***)", "Plus*") remete as condicoes gerais, nao e do nome da cobertura. */
const limparDescricao = (d: string) =>
  d.replace(/\s*até\s*\(\*+\)\s*$/i, "").replace(/\s*\(\*+\)\s*$/, "").replace(/\*+$/, "").replace(/\s+/g, " ").trim();

/**
 * Coberturas do LEGADO: "1381 Morte R$ 100.000,00 R$ 123,45", entre "RAMO
 * GARANTIAS ..." e "CARÊNCIAS E FRANQUIAS". A descricao que quebra ("Invalidez
 * Permanente Total ou" / "Parcial por Acidente até(***)") continua SO quando
 * a de cima termina num conectivo: o texto corrido que a cia poe embaixo da
 * tabela (ambito territorial) nao vira parte da cobertura.
 */
function coberturasLegado(linhas: readonly string[]): ItemDeCobertura[] {
  const bloco = secao(linhas, /^RAMO GARANTIAS\b/i, /^CARÊNCIAS E FRANQUIAS\b/i, 40).slice(1);
  const itens: ItemDeCobertura[] = [];
  for (const l of bloco.map((x) => x.trim())) {
    const m = /^(\d{3,4})\s+(.+?)\s+R\$\s*([\d.]+,\d{2})\s+R\$\s*([\d.]+,\d{1,2})$/.exec(l);
    const valor = dinheiroPtBr(m?.[3]);
    if (m !== null && valor !== null) {
      itens.push({ descricao: limparDescricao(m[2] as string), valor, outros_valores: [m[4] as string] });
      continue;
    }
    const ultimo = itens[itens.length - 1];
    if (ultimo !== undefined && /\b(?:ou|e|de|da|do|por|com)$/i.test(ultimo.descricao) && !/R\$/.test(l)) {
      ultimo.descricao = limparDescricao(`${ultimo.descricao} ${l}`);
    }
  }
  return itens;
}

/** Coberturas do NOVO: "1381 Morte dd/mm/aaaa-dd/mm/aaaa R$ 100.000,00 R$ 123,45" (uma linha cada). */
function coberturasNovo(linhas: readonly string[]): ItemDeCobertura[] {
  const bloco = secao(linhas, /^Ramo:\s*Cobertura\(s\):/i, /^CARÊNCIAS E FRANQUIAS\b/i, 30).slice(1);
  const itens: ItemDeCobertura[] = [];
  for (const l of bloco.map((x) => x.trim())) {
    const m = /^(\d{3,4})\s+(.+?)\s+\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4}\s+R\$\s*([\d.]+,\d{2})\s+R\$\s*([\d.]+,\d{1,2})$/.exec(l);
    const valor = dinheiroPtBr(m?.[3]);
    if (m !== null && valor !== null) itens.push({ descricao: limparDescricao(m[2] as string), valor, outros_valores: [m[4] as string] });
  }
  return itens;
}

/**
 * Le a apolice de vida da Porto, com a TRAVA no numero impresso. Endereco:
 * no legado a rua e o numero vem sem separador ("CEP ... ENDEREÇO R X 12
 * CASA"), entao so se dividem com virgula; senao rua/numero ficam nulos e o
 * resto (CEP, bairro, cidade, UF) entra. No novo cada parte tem rotulo.
 */
export function lerVidaPorto(linhas: readonly string[], numeroApolice: string): VidaLida | null {
  if (!ehApoliceVidaPorto(linhas)) return null;
  const impresso = digitos(numeroDaApoliceVidaPorto(linhas));
  const pedido = digitos(numeroApolice);
  if (impresso.length < 5 || impresso.replace(/^0+/, "") !== pedido.replace(/^0+/, "")) return null;
  const base = { segurado_sexo: null, segurado_estado_civil: null, profissao: null, renda: null, assistencias: [] as string[] };

  if (ehLegado(linhas)) {
    const seg = secao(linhas, /^DADOS DO SEGURADO$/i, /^DADOS DO (?:DESTINATÁRIO|CORRETOR)\b/i, 12).map((l) => l.trim());
    const mNasc = /^DATA NASCIMENTO\s+(\d{2}\/\d{2}\/\d{4})\s+CPF\/CNPJ\s+([\d.\-/]+)/i.exec(seg.find((l) => /^DATA NASCIMENTO\b/i.test(l)) ?? "");
    const mEnd = /^CEP\s+(\d{5}-?\d{3})\s+ENDEREÇO\s+(.+)$/i.exec(seg.find((l) => /^CEP\s+\d/i.test(l)) ?? "");
    const mBairro = /^BAIRRO\s+(.+?)\s+CIDADE\s+(.+?)\s+ESTADO\s+([A-Z]{2})$/i.exec(seg.find((l) => /^BAIRRO\b/i.test(l)) ?? "");
    const coberturas = coberturasLegado(linhas);
    return {
      ...base,
      numero: impresso,
      segurado_nome: achar(seg, /^NOME\s+(?!SOCIAL\b)(.+)$/i),
      segurado_documento: cpfOuCnpj(mNasc?.[2]),
      segurado_endereco: enderecoOuNulo({
        cep: cep(mEnd?.[1]),
        ...ruaNumeroComplemento(mEnd?.[2]),
        bairro: vazio(mBairro?.[1]),
        cidade: vazio(mBairro?.[2]),
        uf: ufDe(mBairro?.[3]),
      }),
      vigencia_fim: datas(linhas.find((l) => /^VIGÊNCIA DO SEGURO:/i.test(l)))[1] ?? null,
      segurado_nascimento: data(mNasc?.[1]),
      coberturas,
      capital_morte: morteDe(coberturas),
    };
  }

  const seg = secao(linhas, /^DADOS DO SEGURADO$/i, /^DADOS DO CORRETOR\b/i, 10);
  const q = quadro(seg, ["Nome", "Nome Social", "Data de nascimento", "CPF/CNPJ", "E-mail", "Endereço", "Número", "Complemento", "Bairro", "Cidade", "Estado", "CEP"]);
  const coberturas = coberturasNovo(linhas);
  return {
    ...base,
    numero: impresso,
    segurado_nome: vazio(q.get("Nome")),
    segurado_documento: cpfOuCnpj(q.get("CPF/CNPJ")),
    segurado_endereco: enderecoOuNulo({
      cep: cep(q.get("CEP")),
      logradouro: vazio(q.get("Endereço")),
      numero: vazio(q.get("Número")),
      complemento: vazio(q.get("Complemento")),
      bairro: vazio(q.get("Bairro")),
      cidade: vazio(q.get("Cidade")),
      uf: ufDe(q.get("Estado")),
    }),
    vigencia_fim: datasDoNovo(linhas)[1] ?? null,
    segurado_nascimento: data(q.get("Data de nascimento")),
    coberturas,
    capital_morte: morteDe(coberturas),
    assistencias: secao(linhas, /^Assistência\(s\) e Benefício/i, /^BENEFICIÁRIO/i, 12)
      .slice(1)
      .map((l) => vazio(/^(.+?)\s+\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4}\b/.exec(l.trim())?.[1]))
      .filter((x): x is string => x !== null),
  };
}

/** Novo: "INICIO DE VIGÊNCIA DO SEGURO: FIM DE ... DATA DE EMISSÃO DA APÓLICE:" e, embaixo, as tres datas nessa ordem. */
function datasDoNovo(linhas: readonly string[]) {
  const i = linhas.findIndex((l) => /^IN[ÍI]CIO DE VIGÊNCIA DO SEGURO:.*DATA DE EMISSÃO/i.test(l.trim()));
  return i < 0 ? [] : datas(linhas[i + 1]);
}

/* ---------------------------------------------------------- dados gerais */

/**
 * Produto (o titulo), proposta, tipo (o legado imprime "APÓLICE DE
 * RENOVAÇÃO"), vigencia, emissao (so o novo), os premios (legado:
 * "PRÊMIO LIQUIDO ... VALOR TOTAL" e os cinco valores embaixo; novo: "Valor
 * Liquido Total: ... Valor Total:" e os quatro embaixo, "-" na coluna vazia),
 * o pagamento (a primeira linha da grade: quantidade de parcelas e a forma) e
 * os BENEFICIARIOS ("NOME dd/mm/aaaa Parentesco CPF 50.00" no legado, "NOME
 * dd/mm/aaaa Parentesco 50.00%" no novo).
 */
export function geraisVidaPorto(linhas: readonly string[]): DadosGerais {
  const g = geraisVazios();
  const t = linhas.map((l) => l.trim());
  const beneficiarios: BeneficiarioExtraido[] = [];
  const pct = (v: string | undefined) => (v === undefined ? null : Number(v.replace(",", ".")));
  if (ehLegado(t)) {
    g.produto = achar(t.slice(0, 3), /^((?:VIDA|ACIDENTES PESSOAIS)\b.*)$/i);
    g.tipo_seguro = achar(t, /^APÓLICE DE (RENOVAÇÃO)\b/i);
    g.proposta = digitos(achar(t, /\bPROPOSTA N[º°o]\s*\d+\s*-\s*(\d+)/i)) || null;
    const vig = datas(t.find((l) => /^VIGÊNCIA DO SEGURO:/i.test(l)));
    g.vigencia_inicio = vig[0] ?? null;
    g.vigencia_fim = vig[1] ?? null;
    const iCustos = t.findIndex((l) => /^PRÊMIO LIQUIDO\b.*\bVALOR TOTAL$/i.test(l));
    const custos = iCustos < 0 ? [] : valoresDaLinha(t[iCustos + 1]);
    if (custos.length === 5) {
      g.premio_liquido = dinheiro(custos[0]);
      g.premio_total = dinheiro(custos[4]);
    }
    const iPag = t.findIndex((l) => /^QTDE\.\s*PARC\.\s*FORMA DE PAGAMENTO\b/i.test(l));
    const mPag = /^(\d{1,2})\s+(.+?)\s+\d{1,2}\s+(?:\d{2}\/\d{2}\/\d{4}|FATURA CART[ÃA]O)\s+R\$/i.exec(iPag < 0 ? "" : (t[iPag + 1] ?? ""));
    g.pagamento = pagamento(vazio(mPag?.[2]), mPag === null ? null : Number(mPag[1]));
    for (const l of secao(t, /^NOME DATA DE NASCIMENTO PARENTESCO:/i, /^DADOS DO SEGURO$/i, 12).slice(1)) {
      const m = /^(.+?)\s+(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(\d{3}\.\d{3}\.\d{3}-\d{2}|-)\s+(\d{1,3}[.,]\d{2})$/.exec(l);
      if (m !== null) {
        beneficiarios.push({ nome: vazio(m[1]), documento: cpfOuCnpj(m[4]), nascimento: data(m[2]), parentesco: vazio(m[3]), percentual: pct(m[5]) });
      }
    }
  } else {
    g.produto = achar(t.slice(0, 8), /^(Seguro de Pessoas Individual)$/i);
    g.proposta = digitos(achar(t, /\bPROPOSTA N[º°o]:\s*(\d+)/i)) || null;
    const d = datasDoNovo(t);
    g.vigencia_inicio = d[0] ?? null;
    g.vigencia_fim = d[1] ?? null;
    g.emissao = d[2] ?? null;
    const iVal = t.findIndex((l) => /^Valor Liquido Total:.*Valor Total:$/i.test(l));
    const vals = iVal < 0 ? [] : valoresDaLinha(t[iVal + 1]);
    if (vals.length === 4) {
      g.premio_liquido = dinheiro(vals[0]);
      g.premio_total = dinheiro(vals[3]);
    }
    const iPag = t.findIndex((l) => /^Forma de Pagamento:\s*Quantidade de Parcelas:/i.test(l));
    const mPag = /^(.+?)\s+(\d{1,2})\s+R\$\s*[\d.]+,\d{2}\s+R\$\s*[\d.]+,\d{2}$/.exec(iPag < 0 ? "" : (t[iPag + 1] ?? ""));
    g.pagamento = pagamento(vazio(mPag?.[1]), mPag === null ? null : Number(mPag[2]));
    const contato = quadro(secao(t, /^DADOS DO SEGURADO$/i, /^DADOS DO CORRETOR\b/i, 10), ["E-mail", "Telefone", "Celular", "Endereço"]);
    g.segurado = { email: email(contato.get("E-mail")), telefones: fones(contato.get("Celular"), contato.get("Telefone")) };
    for (const l of secao(t, /^Nome do\(s\) Beneficiario\(s\):/i, /^VALORES E PAGAMENTOS$/i, 12).slice(1)) {
      const m = /^(.+?)\s+(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(\d{1,3}[.,]\d{2})%$/.exec(l);
      if (m !== null) beneficiarios.push({ nome: vazio(m[1]), documento: null, nascimento: data(m[2]), parentesco: vazio(m[3]), percentual: pct(m[4]) });
    }
  }
  g.vida = { periodicidade_premio: g.premio_total === null ? null : "ANUAL", beneficiarios };
  return g;
}

/* ------------------------------------------------------- modelo unico */

/** A apolice no modelo unico; `null` quando nao e a pedida. */
export function documentoVidaPorto(doc: DocumentoExtraido, pos: readonly LinhaPosicionada[], numero: string): DocumentoExtraido | null {
  const linhas = pos.map((l) => l.texto);
  const v = lerVidaPorto(linhas, numero);
  return v === null ? null : comGerais(deVida(doc, v), geraisVidaPorto(linhas));
}
