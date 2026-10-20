/**
 * COMPATIBILIDADE: as funcoes de leitura de antes (com a mesma assinatura e o
 * mesmo formato de saida), agora sobre os leitores novos do documento
 * unificado. Quem ja usava `lerApoliceBradesco(linhasDoPdf(bytes), numero)`
 * continua igual e passa a ganhar a leitura nova; a implementacao antiga fica
 * de reserva (`...Legado`) para linhas que nao vieram do PDF (testes, texto).
 *
 * As posicoes reais das palavras chegam pelas proprias linhas (`posicoesDe`);
 * sem elas, os leitores por coluna nao rodam e vale o legado.
 */
import { lerAutoBradesco } from "./bradesco-auto.js";
import { lerApoliceBradescoLegado, type ApoliceBradescoLida } from "./bradesco.js";
import { simNao } from "./leitura.js";
import { lerAutoMapfre } from "./mapfre-auto.js";
import { lerApoliceMapfreQualquerLegado, type ApoliceMapfreLida } from "./mapfre.js";
import { documentoBase, type DocumentoExtraido, type Seguradora } from "./modelo.js";
import { paginasDoPdf, posicoesDe } from "./pdf-texto.js";
import { lerAutoZurich } from "./zurich-auto.js";
import { lerApoliceZurichLegado, type ApoliceZurichLida } from "./zurich.js";

const base = (seguradora: Seguradora, numero: string): DocumentoExtraido =>
  documentoBase({ seguradora, ramo: "auto", tipo: "apolice", numero_apolice: numero, sinais: ["compat"] });

/* ---------------------------------------------------------------- MAPFRE */

/** A apolice de auto da MAPFRE (kit). `null` quando nao e a apolice pedida. */
export function lerApoliceMapfreQualquer(linhas: readonly string[], numeroApolice: string): ApoliceMapfreLida | null {
  const pos = posicoesDe(linhas);
  const d = pos === null ? null : lerAutoMapfre(base("mapfre", numeroApolice), pos, numeroApolice);
  if (d === null || d.auto === null) return lerApoliceMapfreQualquerLegado(linhas, numeroApolice);
  const a = d.auto;
  const c = a.condutor;
  const menores = a.questionario.residentes_18_25;
  return {
    segurado_nome: d.segurado?.nome ?? null,
    segurado_documento: d.segurado?.documento ?? null,
    segurado_nascimento: d.segurado?.nascimento ?? null,
    segurado_sexo: d.segurado?.sexo ?? null,
    segurado_estado_civil: d.segurado?.estado_civil ?? null,
    endereco: d.segurado?.endereco ?? null,
    marca: a.veiculo.marca,
    modelo: a.veiculo.modelo,
    combustivel: a.veiculo.combustivel,
    ano_modelo: a.veiculo.ano_modelo,
    zero_km: a.veiculo.zero_km,
    chassi: a.veiculo.chassi,
    placa: a.veiculo.placa,
    uso: a.uso,
    classe_bonus: a.classe_bonus,
    codigo_fipe: a.veiculo.codigo_fipe,
    condutor_nome: c?.nome ?? null,
    condutor_cpf: c?.documento ?? null,
    condutor_nascimento: c?.nascimento ?? null,
    condutor_sexo: c?.sexo ?? null,
    condutor_estado_civil: c?.estado_civil ?? null,
    cep_pernoite: a.cep_pernoite,
    /* O formato de antes: "SIM"/"NAO", sem acento. */
    menores_25: menores === null ? null : simNao(menores) === true ? "SIM" : simNao(menores) === false ? "NAO" : menores,
    ci: a.ci,
    isencao_fiscal: a.questionario.isencao_fiscal,
  };
}

/* -------------------------------------------------------------- Bradesco */

/** A apolice de auto da Bradesco. `null` quando nao e a apolice pedida. */
export function lerApoliceBradesco(linhas: readonly string[], apolice: string): ApoliceBradescoLida | null {
  const pos = posicoesDe(linhas);
  const d = pos === null ? null : lerAutoBradesco(base("bradesco", apolice), pos, apolice);
  if (d === null || d.auto === null) return lerApoliceBradescoLegado(linhas, apolice);
  const a = d.auto;
  const c = a.condutor;
  const resp = (re: RegExp) => a.questionario.respostas.find((r) => re.test(r.pergunta))?.resposta ?? null;
  return {
    /* O formato de antes: o numero inteiro impresso (sucursal.ramo.cia.apolice), so digitos. */
    numero: numeroBradescoImpresso(linhas) ?? d.numero_apolice ?? apolice,
    item: d.item,
    classe_bonus: a.classe_bonus,
    ci: a.ci,
    segurado_nascimento: d.segurado?.nascimento ?? null,
    segurado_sexo: d.segurado?.sexo ?? null,
    segurado_documento: d.segurado?.documento ?? null,
    endereco_pernoite: a.endereco_pernoite,
    condutor_nascimento: c?.nascimento ?? null,
    condutor_cpf: c?.documento ?? null,
    condutor_sexo: c?.sexo ?? null,
    condutor_estado_civil: c?.estado_civil ?? null,
    veiculo_descricao: a.veiculo.descricao,
    ano_fabricacao: a.veiculo.ano_fabricacao,
    ano_modelo: a.veiculo.ano_modelo,
    chassi: a.veiculo.chassi,
    placa: a.veiculo.placa,
    uso: a.uso,
    isencao_fiscal: a.questionario.isencao_fiscal,
    segurado_e_proprietario: resp(/segurado é proprietário/i),
    segurado_e_principal_condutor: resp(/segurado é principal condutor/i),
    cobertura_outro_condutor_18_25: a.questionario.cobertura_18_25,
    km_media: a.questionario.km_mensal,
  };
}

/* ---------------------------------------------------------------- Zurich */

/** A apolice de auto da Zurich (pelos bytes do PDF). `null` quando nao e a pedida. */
export function lerApoliceZurich(bytes: Uint8Array, numeroApolice: string): ApoliceZurichLida | null {
  const d = lerAutoZurich(base("zurich", numeroApolice), paginasDoPdf(bytes).flat(), numeroApolice);
  if (d === null || d.auto === null) return lerApoliceZurichLegado(bytes, numeroApolice);
  const a = d.auto;
  const q = a.questionario;
  return {
    numero: d.numero_apolice ?? numeroApolice,
    condutor_nascimento: a.condutor?.nascimento ?? null,
    condutor_sexo: a.condutor?.sexo ?? null,
    condutor_estado_civil: a.condutor?.estado_civil ?? null,
    tipo_residencia: q.tipo_residencia,
    cobertura_menores_25: q.cobertura_18_25,
    garagem_trabalho: q.garagem_trabalho,
    garagem_estudo: q.garagem_estudo,
    garagem_residencia: q.garagem_residencia,
  };
}

/** "0000.000.0000.000000" do quadro "Dados da sua apólice" (rotulo numa linha, valor na de baixo ou ao lado). */
function numeroBradescoImpresso(linhas: readonly string[]): string | null {
  const i = linhas.findIndex((l) => /N[úu]mero da ap[óo]lice\b/i.test(l) && !/sua ap[óo]lice/i.test(l));
  if (i < 0) return null;
  const m = /(\d+\s*\.\s*\d+\s*\.\s*\d+\s*\.\s*\d+)/.exec(`${linhas[i]} ${linhas[i + 1] ?? ""}`)?.[1];
  return m === undefined ? null : m.replace(/\D/g, "");
}
