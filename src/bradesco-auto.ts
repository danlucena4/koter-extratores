/**
 * BRADESCO AUTO, lida inteira sobre o texto do motor novo (o texto antigo
 * saia em 12 linhas gigantes, uma por secao). 15 PDFs da A vencer,
 * 2026-10-20. Cada secao ("Dados do segurado ____") e um quadro de rotulos
 * numa linha e valores na de baixo, lido pela COLUNA:
 *
 *   Dados da sua apólice  Número da apólice | Item | Proposta | Data da Emissão ;
 *                         Renovação da apólice | Cod. | Bônus | CI ; Cobertura ; Vigência
 *   Dados do segurado     Nome | Nascimento | Sexo ; CPF/CNPJ | Tipo de Pessoa ;
 *                         Endereço de Pernoite | Complemento ; Bairro | CEP |
 *                         Municipio | UF ; Telefones ; E-mail
 *   principal condutor    Nome ; Nascimento | CPF | Sexo | Estado Civil
 *   proprietário          Nome | CPF/CNPJ
 *   veículo               Marca/Tipo | Ano Fab/Modelo ; Chassi | Remarcado | FIPE ;
 *                         Placa | Uso | Isenção Fiscal ; Tipo | Portas ; Eixos | Lotação
 *   Coberturas            nome ; "LMI R$ x / Prêmio Líq. R$ y"
 *   Serviços / Cláusulas  planos e clausulas
 *   Franquia / Participação do Segurado (vidros)
 *   Demonstrativo de Prêmio / Formas de pagamento
 *   Questionário de Risco pergunta ; resposta
 */
import {
  ano,
  cep,
  chassi,
  cpfOuCnpj,
  data,
  datas,
  digitos,
  dinheiro,
  email,
  enderecoOuNulo,
  fipe,
  gradeDeRotulos,
  marcaEModelo,
  quadroPorColuna,
  perguntasERespostas,
  placa,
  simNao,
  telefones,
  vazio,
} from "./leitura.js";
import { autoVazio, condutor, pessoaCom, type CoberturaExtraida, type DocumentoExtraido, type FranquiaExtraida } from "./modelo.js";
import type { LinhaPosicionada } from "./pdf/motor.js";

const TITULO = /^(Dados da sua apólice|Dados do segurado|Dados do principal condutor|Dados do proprietário|Dados do veículo|Coberturas|Serviços Complementares|Cláusulas do Seguro|Franquia|Participação do Segurado|Demonstrativo de Prêmio|Formas de pagamento|Questionário de Risco|Corretor|Observações)\b/i;

/** As linhas de cada secao, pelo titulo (sem os "____" do fim). */
function secoes(pos: readonly LinhaPosicionada[]): Map<string, LinhaPosicionada[]> {
  const out = new Map<string, LinhaPosicionada[]>();
  let atual: string | null = null;
  for (const l of pos) {
    const m = TITULO.exec(l.texto);
    /* Titulo: com a linha "____" (um layout) ou sozinho na linha (o outro). */
    const so = l.texto.replace(/_{3,}/g, "").trim();
    if (m !== null && (/_{3,}/.test(l.texto) || so.toLowerCase() === (m[1] as string).toLowerCase())) {
      atual = (m[1] as string).toLowerCase();
      if (!out.has(atual)) out.set(atual, []);
      continue;
    }
    if (atual !== null) (out.get(atual) as LinhaPosicionada[]).push(l);
  }
  return out;
}

/** Linha de valores: nao e uma linha so de rotulos conhecidos. */
const ROTULOS = /^(Número da apólice|Renovação da apólice|Nome|CPF\/CNPJ|Endereço de Pernoite|Bairro|Telefone|E-mail|Data de Nascimento|Marca\/Tipo|Chassi|Placa|Tipo|Nº de Eixos|Código\/Descrição|Equipamento|Para-brisa|Faróis|Farol|Lanterna|Prêmio Auto|Adicional|Prêmio Total|Tipo de Cobrança|Nº de Prestações|Vencimento|Banco|Cobertura$|Vigência$|Ramo)/i;
const ehValor = (l: LinhaPosicionada) => !ROTULOS.test(l.texto);
const PARADA = new RegExp(`${ROTULOS.source}|${TITULO.source}`, "i");

/** Os quadros conhecidos (dos dois layouts), rotulos na ordem da linha. */
const CABECALHOS: readonly string[][] = [
  ["Número da apólice", "Item", "Proposta", "Data da Emissão"],
  ["Nome", "Data de Nascimento", "Sexo"],
  ["CPF/CNPJ", "Tipo de Pessoa"],
  ["Endereço de Pernoite", "Complemento"],
  ["Bairro", "CEP", "Municipio", "UF"],
  ["Telefone Residencial", "Telefone Celular", "Telefone Comercial"],
  ["Nome", "CPF/CNPJ"],
  ["Data de Nascimento", "CPF/CNPJ", "Sexo", "Estado Civil"],
  ["Data de Nascimento", "Sexo", "Estado Civil"],
  ["Marca/Tipo Veículo", "Ano de Fabricação/Modelo"],
  ["Chassi", "Chassi Remarcado", "Código FIPE"],
  ["Placa", "Uso do Veículo", "Veículo com Isenção Fiscal"],
  ["Placa", "Uso do Veículo", "Veículo c/ Isenção Fiscal"],
  ["Tipo", "Nº de Portas"],
  ["Código/Descrição", "Veículo", "Kit Gás"],
  ["Tipo de Cobrança", "Nº da CCB", "Data da CCB"],
  ["Nº de Prestações", "1ª Prestação", "Demais Prestações"],
];

export function lerAutoBradesco(doc: DocumentoExtraido, pos: readonly LinhaPosicionada[], numero: string): DocumentoExtraido | null {
  const s = secoes(pos);
  /*
   * Cada quadro: pelos cabecalhos conhecidos (coluna do rotulo, valor que pode
   * quebrar em mais de uma linha); o que sobrar, pela grade de trechos.
   */
  const g = (secaoNome: string) => {
    const linhasDaSecao = s.get(secaoNome) ?? [];
    const out = gradeDeRotulos(linhasDaSecao, ehValor);
    for (const cab of CABECALHOS) {
      const r = quadroPorColuna(linhasDaSecao, cab, { ate: PARADA });
      if (r !== null) for (const [k, v] of r) if (v.length > 0) out.set(k, v);
    }
    return out;
  };
  const txt = (secaoNome: string) => (s.get(secaoNome) ?? []).map((l) => l.texto);

  const ap = g("dados da sua apólice");
  /* "Renovação da apólice | Cod. | Bônus | CI": valores curtos e colados, pela coluna do rotulo. */
  const ren =
    quadroPorColuna(s.get("dados da sua apólice") ?? [], ["Renovação da apólice", "Cod.", "Bônus", "CI"]) ??
    quadroPorColuna(s.get("dados da sua apólice") ?? [], ["Renovação da apólice", "Cód.", "Bônus", "CI"]) ??
    new Map<string, string>();
  const numeroImpresso = ap.get("Número da apólice") ?? "";
  const ultimo = numeroImpresso.split(".").pop()?.replace(/\D/g, "").replace(/^0+/, "") ?? "";
  if (ultimo.length < 3 || ultimo !== digitos(numero).replace(/^0+/, "")) return null;
  const apTxt = txt("dados da sua apólice");
  const vig = datas(apTxt.find((l) => /^das\s+[\d:]+\s+horas/i.test(l)));
  const cobertura = apTxt[apTxt.findIndex((l) => /^Cobertura$/i.test(l)) + 1] ?? null;

  const seg = g("dados do segurado");
  const cond = g("dados do principal condutor");
  const condTxt = txt("dados do principal condutor");
  const prop = g("dados do proprietário");
  const vei = g("dados do veículo");
  const anos = /(\d{4})\s*\/\s*(\d{4})/.exec(vei.get("Ano de Fabricação/Modelo") ?? "");

  /* Coberturas: o nome numa linha, "LMI R$ x / Prêmio Líq. R$ y" (ou "Cobertura não contratada") na de baixo. */
  const coberturas: CoberturaExtraida[] = [];
  let percentual: number | null = null;
  const cobTxt = txt("coberturas");
  for (let i = 0; i < cobTxt.length; i++) {
    const nome = cobTxt[i] as string;
    const prox = cobTxt[i + 1] ?? "";
    if (/^Fator de Ajuste/i.test(nome)) {
      percentual = Number(/(\d{2,3})\s*%/.exec(prox)?.[1]) || null;
      i++;
      continue;
    }
    if (/LMI|Prêmio Líq|não contratada|VALOR MERCADO/i.test(nome)) continue;
    if (/LMI|Prêmio Líq|não contratada|VALOR MERCADO|^R\$/i.test(prox)) {
      const lmi = /LMI\s+R\$\s*([\d.,]+)/i.exec(prox)?.[1] ?? null;
      const premio = /Prêmio Líq\.?\s+R\$\s*([\d.,]+)/i.exec(prox)?.[1] ?? null;
      const limite = /n[ãa]o contratada/i.test(prox) ? "Cobertura não contratada" : /VALOR MERCADO REFERENCIADO/i.test(prox) ? "VALOR MERCADO REFERENCIADO" : null;
      coberturas.push({ descricao: nome, valor: dinheiro(lmi), limite, premio: dinheiro(premio), franquia: null });
      i++;
      /* APP: "Morte por passageiro / LMI R$ x" logo abaixo. */
      while (i + 2 < cobTxt.length && /por passageiro$/i.test(cobTxt[i + 1] as string) && /^LMI/i.test(cobTxt[i + 2] as string)) {
        coberturas.push({ descricao: `${nome} - ${cobTxt[i + 1]}`, valor: dinheiro(cobTxt[i + 2]), limite: null, premio: null, franquia: null });
        i += 2;
      }
    }
  }
  const servicos = txt("serviços complementares").filter((l) => l.length > 0);
  const clausulas = txt("cláusulas do seguro")
    .map((l) => /^N[ºo°]\s*\d+\s*-\s*(.+)$/.exec(l)?.[1])
    .filter((x): x is string => x !== undefined);

  /* Franquias: a do casco ("Código/Descrição | Veículo | Kit Gás") e a participacao nos vidros. */
  const fr = g("franquia");
  const franquias: FranquiaExtraida[] = [];
  const casco = vazio(fr.get("Código/Descrição"));
  if (casco !== null || fr.has("Veículo")) franquias.push({ descricao: "Veículo", tipo: casco?.replace(/^\d+\s*-\s*/, "") ?? null, valor: dinheiro(fr.get("Veículo")) });
  for (const [k, v] of g("participação do segurado")) franquias.push({ descricao: k, tipo: null, valor: dinheiro(v) });

  const premio = g("demonstrativo de prêmio");
  const pag = g("formas de pagamento");
  const respostas = perguntasERespostas(txt("questionário de risco"));
  const resp = (re: RegExp) => respostas.find((r) => re.test(r.pergunta))?.resposta ?? null;

  const a = autoVazio();
  /* FIPE sem os zeros da esquerda e com ponto ("5132.8" = 005132-8). */
  const fipeBruto = /^(\d{1,6})\.(\d)$/.exec((vei.get("Código FIPE") ?? "").trim());
  Object.assign(a.veiculo, {
    ...marcaEModelo(vei.get("Marca/Tipo Veículo")),
    descricao: vazio(vei.get("Marca/Tipo Veículo")),
    ano_fabricacao: anos === null ? null : ano(anos[1]),
    ano_modelo: anos === null ? null : ano(anos[2]),
    chassi: chassi(vei.get("Chassi")),
    codigo_fipe: fipeBruto === null ? fipe(vei.get("Código FIPE")) : `${(fipeBruto[1] as string).padStart(6, "0")}-${fipeBruto[2]}`,
    codigo_fipe_impresso: digitos(vei.get("Código FIPE")) || null,
    placa: placa(vei.get("Placa")),
    categoria: vazio(vei.get("Tipo")),
    blindado: coberturas.some((c) => /^Blindagem$/i.test(c.descricao)) ? coberturas.some((c) => /^Blindagem$/i.test(c.descricao) && c.limite === null) : null,
  });
  a.uso = vazio(vei.get("Uso do Veículo"));
  a.modalidade_casco = coberturas.some((c) => /VALOR MERCADO/i.test(c.limite ?? "")) ? "VALOR MERCADO REFERENCIADO" : null;
  a.percentual_fipe = percentual;
  a.cep_pernoite = cep(seg.get("CEP"));
  const bonus = (ren.get("Bônus") ?? ap.get("Bônus") ?? "").trim();
  a.classe_bonus = /^\d{1,2}$/.test(bonus) ? Number(bonus) : null;
  const ci = digitos(ren.get("CI") ?? ap.get("CI"));
  a.ci = ci.length >= 8 ? ci : null;
  a.endereco_pernoite = enderecoOuNulo({
    cep: cep(seg.get("CEP")),
    logradouro: vazio(seg.get("Endereço de Pernoite")),
    numero: null,
    complemento: vazio(seg.get("Complemento")),
    bairro: vazio(seg.get("Bairro")),
    cidade: vazio(seg.get("Municipio")),
    uf: /^[A-Z]{2}$/.test(seg.get("UF") ?? "") ? (seg.get("UF") as string) : null,
  });
  a.questionario.respostas = respostas;
  a.questionario.isencao_fiscal = vazio(vei.get("Veículo com Isenção Fiscal") ?? vei.get("Veículo c/ Isenção Fiscal"));
  a.questionario.cobertura_18_25 = resp(/outro condutor entre \d+ e \d+ anos/i);
  a.questionario.km_mensal = resp(/quilometragem/i);
  const nomeCond = vazio(cond.get("Nome")) ?? vazio(condTxt[condTxt.findIndex((l) => /^Nome$/i.test(l)) + 1]);
  a.condutor = condutor(
    {
      nome: nomeCond,
      documento: cpfOuCnpj(cond.get("CPF/CNPJ")),
      nascimento: data(cond.get("Data de Nascimento")),
      sexo: vazio(cond.get("Sexo")),
      estado_civil: vazio(cond.get("Estado Civil")),
    },
    simNao(resp(/segurado é principal condutor/i)) === true ? "Próprio segurado" : null,
  );
  const proprietario = simNao(resp(/segurado é proprietário/i));
  void prop;

  const nParc = Number(/^(\d{1,2})$/.exec(pag.get("Nº de Prestações") ?? "")?.[1]);
  return {
    ...doc,
    item: digitos(ap.get("Item")) || null,
    proposta: digitos(ap.get("Proposta")) || null,
    emissao: data(ap.get("Data da Emissão")),
    produto: vazio(cobertura),
    vigencia_inicio: vig[0] ?? null,
    vigencia_fim: vig[1] ?? null,
    renovacao_de: ren.has("Renovação da apólice") || ap.has("Renovação da apólice") ? { numero: digitos(ren.get("Renovação da apólice") ?? ap.get("Renovação da apólice")) || null, seguradora: vazio(ren.get("Cod.") ?? ren.get("Cód.")) } : null,
    segurado: pessoaCom({
      nome: vazio(seg.get("Nome")),
      documento: cpfOuCnpj(seg.get("CPF/CNPJ")),
      nascimento: data(seg.get("Data de Nascimento")),
      sexo: vazio(seg.get("Sexo")),
      email: email(txt("dados do segurado")[txt("dados do segurado").findIndex((l) => /^E-mail$/i.test(l)) + 1]),
      telefones: [...telefones(seg.get("Telefone Celular")), ...telefones(seg.get("Telefone Residencial")), ...telefones(seg.get("Telefone Comercial"))],
      /* O endereco do quadro do segurado e o de PERNOITE (o rotulo diz): vai em auto.endereco_pernoite. */
      endereco: null,
    }),
    coberturas: [...coberturas, ...servicos.map((sv) => ({ descricao: sv, valor: null, limite: "Serviço complementar", premio: null, franquia: null }))],
    assistencias: servicos.filter((sv) => /assist/i.test(sv)),
    clausulas,
    franquias,
    premio_liquido: dinheiro(premio.get("Sub-Total:")),
    premio_total: dinheiro(premio.get("Prêmio Total:")),
    pagamento: { forma: vazio(pag.get("Tipo de Cobrança")), parcelas: Number.isFinite(nParc) ? nParc : null },
    auto: { ...a, veiculo: { ...a.veiculo }, ...(proprietario === null ? {} : {}) },
  };
}
