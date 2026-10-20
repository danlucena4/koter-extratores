/**
 * MAPFRE AUTO: a apolice do "kit" (APÓLICE DE SEGURO AUTO), lida inteira
 * sobre o texto do motor novo. 15 PDFs da A vencer, 2026-10-20. Quadros:
 *
 *   DADOS GERAIS        Produto / Nº Apólice / Vigência início ... Término ...
 *                       Nº Proposta / Data de emissão / CI / Renova apólice Nº
 *   DADOS DO SEGURADO   Nome / CPF / Endereço / Bairro CEP / Cidade UF / Telefones
 *   QUESTIONÁRIO ...    principal condutor (CPF, nascimento, sexo, estado civil),
 *                       residentes de 18 a 25 (SIM/NÃO, na mesma linha ou na de
 *                       baixo), CEP de pernoite
 *   DADOS DO VEÍCULO    Marca/Modelo, Ano do modelo, Placa, 0 KM, Chassi,
 *                       Categoria, Uso, isenção, Blindagem, código FIPE
 *   COBERTURAS ...      Cobertura | Valor | Prêmio líquido (tabela por coluna)
 *   FRANQUIA            Descrição | Tipo | Valor (R$)
 *   DEMONSTRATIVO       Prêmio líquido / total; Forma de pagamento e parcelas
 *
 * O que a apolice NAO imprime (nascimento/sexo do segurado) vem da PROPOSTA
 * (`lerPropostaMapfre`).
 */
import {
  ano,
  camposDaLinha,
  cep,
  chassi,
  cpfOuCnpj,
  data,
  datas,
  digitos,
  dinheiro,
  enderecoOuNulo,
  fipe,
  placa,
  ruaPeloPrimeiroNumero,
  secao,
  simNao,
  tabelaPorColunas,
  telefones,
  vazio,
} from "./leitura.js";
import { autoVazio, condutor, pessoaCom, type CoberturaExtraida, type DocumentoExtraido, type FranquiaExtraida } from "./modelo.js";
import type { LinhaPosicionada } from "./pdf/motor.js";

const ROT_GERAIS = ["Processo SUSEP Automóvel Nº", "Produto", "Nº Apólice", "Endosso", "Itens", "Nº Via", "Data e hora da proposta", "Nº Proposta", "Data de emissão da apólice", "Versão de cálculo", "CI", "Renova apólice Nº", "Da seguradora"];
const ROT_SEGURADO = ["Nome", "Nome Social", "Tipo de pessoa", "CPF/CNPJ", "CPF", "CNPJ", "Endereço", "Bairro", "CEP", "Cidade", "UF", "Telefone residencial", "Telefone comercial", "Telefone celular", "Telefone", "E-mail"];
const ROT_CONDUTOR = ["Nome do principal condutor", "CPF", "Data de nascimento", "Sexo", "Estado Civil", "CEP do local onde o veículo pernoita", "Cidade", "UF"];
const ROT_VEICULO = ["Marca/Modelo", "Ano do modelo", "Placa", "0 KM", "Nº Chassi", "Capacidade/passageiros", "Categoria tarifária", "Uso", "Tipo de isenção", "Blindagem", "Código na Tabela de Referência", "Código na MAPFRE", "Tabela de Referência"];

/** Todos os valores dos rotulos num bloco (o primeiro de cada rotulo vence). */
function quadro(linhas: readonly string[], rotulos: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const l of linhas) for (const [k, v] of camposDaLinha(l, rotulos)) if (!out.has(k) && v.length > 0) out.set(k, v);
  return out;
}

/** O valor que quebra na linha de baixo ("CASADO OU RESIDE COM" / "COMPANHEIRO(A)"). */
function comContinuacao(linhas: readonly string[], rotuloRe: RegExp, valor: string | null): string | null {
  if (valor === null) return null;
  const i = linhas.findIndex((l) => rotuloRe.test(l));
  const prox = i < 0 ? "" : (linhas[i + 1] ?? "").trim();
  if (/\b(COM|OU|E|DE|DA|DO)$/i.test(valor) && prox.length > 0 && prox.length < 40 && !prox.includes(":")) return `${valor} ${prox}`;
  return valor;
}

const COMBUSTIVEL = /\((FLEX|FLE|GASOLINA|GASOL|DIESEL|[AÁ]LCOOL|ETANOL|EL[EÉ]TRICO|H[IÍ]BRIDO)\b/i;

/** `null` quando o documento nao e a apolice pedida (o "Nº Apólice" impresso). */
export function lerAutoMapfre(doc: DocumentoExtraido, pos: readonly LinhaPosicionada[], numero: string): DocumentoExtraido | null {
  const linhas = pos.map((l) => l.texto);
  const gerais = quadro(secao(linhas, /^APÓLICE DE SEGURO AUTO|^DADOS GERAIS/i, /^DADOS DA SEGURADORA/i, 20), ROT_GERAIS);
  const impresso = digitos(gerais.get("Nº Apólice"));
  if (impresso.length < 8 || impresso.replace(/^0+/, "") !== digitos(numero).replace(/^0+/, "")) return null;

  const vig = datas(linhas.find((l) => /^Vigência início/i.test(l)));
  const renova = gerais.get("Renova apólice Nº") ?? null;

  /* Segurado. */
  const blocoSeg = secao(linhas, /^DADOS DO SEGURADO/i, /^QUESTIONÁRIO/i, 15);
  const seg = quadro(blocoSeg, ROT_SEGURADO);
  const rua = ruaPeloPrimeiroNumero(seg.get("Endereço"));
  const ufSeg = vazio(seg.get("UF"))?.toUpperCase() ?? null;
  const fones = blocoSeg.filter((l) => /Telefone/i.test(l)).flatMap((l) => telefones(l.replace(/^[^:]*:/, "")));

  /* Condutor e questionario. */
  const blocoQ = secao(linhas, /^QUESTIONÁRIO DE AVALIAÇÃO DE RISCO/i, /^DADOS DO VEÍCULO/i, 30);
  const cond = quadro(blocoQ, ROT_CONDUTOR);
  const iMenores = blocoQ.findIndex((l) => /residentes\s+entre\s+\d+\s+e\s+\d+\s+anos/i.test(l));
  const respMenores =
    iMenores < 0
      ? null
      : (/anos\?\s*(SIM|N[ÃA]O)\s*$/i.exec(blocoQ[iMenores] as string)?.[1] ?? /^(SIM|N[ÃA]O)$/i.exec((blocoQ[iMenores + 1] ?? "").trim())?.[1] ?? null);

  /* Veiculo. */
  const blocoV = secao(linhas, /^DADOS DO VEÍCULO/i, /^COBERTURAS CONTRATADAS/i, 30);
  const vei = quadro(blocoV, ROT_VEICULO);
  const marcaModelo = vazio(vei.get("Marca/Modelo"));
  const [marca, ...resto] = (marcaModelo ?? "").split(" ");
  const comb = COMBUSTIVEL.exec(marcaModelo ?? "")?.[1]?.toUpperCase() ?? null;

  /* Coberturas: "Cobertura | Valor | Prêmio líquido". */
  const tabela = tabelaPorColunas(pos, ["Cobertura", "Valor", "Prêmio líquido"], /^(RAMO E CÓDIGO|Classe de bônus|Os direitos|FRANQUIA|DEMONSTRATIVO|ASSISTÊNCIAS)/i, {
    ignorar: /^[\d\s/#]+$/,
  });
  const coberturas: CoberturaExtraida[] = tabela
    .map((t) => {
      const desc = vazio(t.get("Cobertura")) ?? "";
      const valor = vazio(t.get("Valor"));
      const premio = vazio(t.get("Prêmio líquido"));
      return {
        descricao: desc.replace(/\s*-\s*$/, ""),
        valor: dinheiro(valor),
        limite: dinheiro(valor) === null ? valor : null,
        premio: dinheiro(premio),
        franquia: null,
      };
    })
    .filter((c) => c.descricao.length > 0);
  const assistencias = coberturas.filter((c) => /assist/i.test(c.descricao) || /Conforme Manual/i.test(c.limite ?? "")).map((c) => c.descricao);
  const basica = coberturas.find((c) => /^B[áa]sica/i.test(c.descricao));
  const percentual = Number(/(\d{2,3})\s*%\s*FIPE/i.exec(basica?.limite ?? "")?.[1]);

  /* Franquias: "Descrição | Tipo | Valor (R$)". */
  const tabFranquia = tabelaPorColunas(pos, ["Descrição", "Tipo", "Valor (R$)"], /^(DEMONSTRATIVO|PAGAMENTO|OBSERVAÇÕES)/i, { ignorar: /^[\d\s/#]+$/ });
  const franquias: FranquiaExtraida[] = tabFranquia
    .map((t) => {
      /* O tipo da franquia do casco vem colado: "CASCO DEDUTÍVEL REDUZIDA 50%". */
      const desc = vazio(t.get("Descrição")) ?? "";
      const mTipo = /^(.*?)\s+(REDUZIDA|NORMAL|OBRIGAT[ÓO]RIA|MAJORADA|FACULTATIVA)\b\s*(.*)$/i.exec(desc);
      return {
        descricao: mTipo === null ? desc : (mTipo[1] as string),
        tipo: vazio(t.get("Tipo")) ?? (mTipo === null ? null : vazio(`${mTipo[2]} ${mTipo[3]}`)),
        valor: dinheiro(t.get("Valor (R$)")),
      };
    })
    .filter((f) => f.descricao.length > 0);

  const bonus = linhas.map((l) => /^Classe de b[ôo]nus\s*:?\s*(\d{1,2})\s*$/i.exec(l)?.[1]).find((x) => x !== undefined);
  const forma = linhas.map((l) => /^Forma:\s*(.+?)\s+N[ºo°] de parcela:\s*(\d+)/i.exec(l)).find((m) => m !== null);

  const a = autoVazio();
  Object.assign(a.veiculo, {
    descricao: marcaModelo,
    marca: vazio(marca),
    modelo: vazio(resto.join(" ")),
    ano_modelo: ano(vei.get("Ano do modelo")),
    placa: placa(vei.get("Placa")),
    chassi: chassi(vei.get("Nº Chassi")),
    codigo_fipe: fipe(vei.get("Código na Tabela de Referência")),
    combustivel: comb === "FLE" ? "FLEX" : comb === "GASOL" ? "GASOLINA" : comb,
    zero_km: simNao(vei.get("0 KM")),
    categoria: vazio(vei.get("Categoria tarifária")),
    blindado: vei.has("Blindagem") ? !/N[ÃA]O/i.test(vei.get("Blindagem") ?? "") : null,
  });
  a.uso = vazio(vei.get("Uso"));
  a.modalidade_casco = linhas.some((l) => /^VALOR DE MERCADO REFERENCIADO$/i.test(l)) ? "VALOR DE MERCADO REFERENCIADO" : null;
  a.percentual_fipe = Number.isFinite(percentual) && percentual > 0 ? percentual : null;
  a.cep_pernoite = cep(cond.get("CEP do local onde o veículo pernoita"));
  a.classe_bonus = bonus === undefined ? null : Number(bonus);
  a.ci = digitos(gerais.get("CI")).length >= 8 ? digitos(gerais.get("CI")) : null;
  a.questionario.residentes_18_25 = respMenores === null ? null : respMenores.toUpperCase().replace("NAO", "NÃO");
  a.questionario.isencao_fiscal = vazio(vei.get("Tipo de isenção"));
  a.condutor = condutor({
    nome: vazio(cond.get("Nome do principal condutor")),
    documento: cpfOuCnpj(cond.get("CPF")),
    nascimento: data(cond.get("Data de nascimento")),
    sexo: vazio(cond.get("Sexo")),
    estado_civil: comContinuacao(blocoQ, /^Estado Civil:/i, vazio(cond.get("Estado Civil"))),
  });

  return {
    ...doc,
    produto: vazio(gerais.get("Produto")),
    proposta: digitos(gerais.get("Nº Proposta")) || null,
    emissao: data(gerais.get("Data de emissão da apólice")),
    vigencia_inicio: vig[0] ?? null,
    vigencia_fim: vig[1] ?? null,
    renovacao_de: renova === null ? null : { numero: digitos(renova) || null, seguradora: vazio(gerais.get("Da seguradora")) },
    segurado: pessoaCom({
      nome: vazio(seg.get("Nome")),
      documento: cpfOuCnpj(seg.get("CPF") ?? seg.get("CPF/CNPJ") ?? seg.get("CNPJ")),
      telefones: fones,
      endereco: enderecoOuNulo({
        cep: cep(seg.get("CEP")),
        ...rua,
        bairro: vazio(seg.get("Bairro")),
        cidade: vazio(seg.get("Cidade")),
        uf: ufSeg !== null && /^[A-Z]{2}$/.test(ufSeg) ? ufSeg : null,
      }),
    }),
    coberturas,
    assistencias,
    franquias,
    premio_liquido: dinheiro(linhas.find((l) => /^Prêmio líquido:/i.test(l))),
    premio_total: dinheiro(/Prêmio total:\s*(.+)$/i.exec(linhas.find((l) => /Prêmio total:/i.test(l)) ?? "")?.[1]),
    pagamento: forma === undefined || forma === null ? null : { forma: vazio(forma[1]), parcelas: Number(forma[2]) },
    auto: a,
  };
}
