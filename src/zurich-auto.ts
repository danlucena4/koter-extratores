/**
 * ZURICH AUTO, lida inteira sobre as LINHAS do motor novo (antes a pagina em
 * colunas embaralhava as linhas e so os pedacos serviam). 9 PDFs, 2026-10-20.
 *
 *   Proposta / Grupo / Ramo / Apólice / Endosso
 *   Início: 24hs do dia 12 de Setembro de 2025 Término: ... (data por extenso)
 *   Dados do Segurado     Nome Completo, CPF, nascimento, sexo, Estado Civil,
 *                         Endereço, Número, Complemento, Bairro, Cidade, UF, CEP
 *   Dados do Risco        Código Marca, Chassi, Proprietário, Veículo, Ano /
 *                         Modelo, Placa, Combustível, Categoria, Uso, CEP de
 *                         pernoite, Antifurto, Modalidade, Fator de Ajuste,
 *                         Código FIPE, Classe de Bônus, CI
 *   Questionário Perfil   perguntas e respostas (quebram de linha)
 *   Coberturas            Descrição | LMG (R$) | Franquia (R$) | Prêmio (R$)
 *   Cláusulas             planos de vidros, assistência, carro reserva
 *   Conta do Prêmio       prêmio líquido / total; Forma de Pagamento
 */
import {
  ano,
  camposDaLinha,
  cep,
  chassi,
  cpfOuCnpj,
  data,
  digitos,
  dinheiro,
  enderecoOuNulo,
  fipe,
  placa,
  secao,
  tabelaPorColunas,
  vazio,
} from "./leitura.js";
import { autoVazio, condutor, pessoaCom, type CoberturaExtraida, type DocumentoExtraido } from "./modelo.js";
import type { LinhaPosicionada } from "./pdf/motor.js";
import type { DataCia } from "./tipos.js";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "12 de Setembro de 2025" -> DataCia. */
export function dataPorExtenso(v: string | null | undefined): DataCia | null {
  const m = /(\d{1,2})\s+de\s+([A-Za-zçÇ]+)\s+de\s+(\d{4})/i.exec(v ?? "");
  if (m === null) return null;
  const mes = MESES.indexOf((m[2] as string).toLowerCase().replace("marco", "março")) + 1;
  if (mes === 0) return null;
  const d = (m[1] as string).padStart(2, "0");
  const mm = String(mes).padStart(2, "0");
  return { iso: `${m[3]}-${mm}-${d}`, original: m[0] };
}

const ROT_SEGURADO = ["Nome Completo", "CPF", "Data de nascimento", "Sexo", "Documento de identificação", "Natureza", "Data de expedição", "Estado Civil", "Endereço", "Número", "Complemento", "Bairro", "Cidade", "UF", "CEP"];
const ROT_RISCO = [
  "Código Marca", "Chassi", "Chassi Remarcado", "Proprietário", "Renavam", "Veículo", "Ano / Modelo", "Placa", "Combustível", "Categoria", "Uso do Veículo",
  "CEP do local de pernoite do veículo", "Modalidade", "Fator de Ajuste", "Tabela de Referência", "Código", "Tabela Substituta", "Classe de Bônus", "CI do Bônus",
];

function quadro(linhas: readonly string[], rotulos: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const l of linhas) for (const [k, v] of camposDaLinha(l, rotulos)) if (!out.has(k) && v.trim().length > 0) out.set(k, v.trim());
  return out;
}

const PERGUNTAS: ReadonlyArray<[keyof ReturnType<typeof autoVazio>["questionario"], RegExp]> = [
  ["tipo_residencia", /Qual o tipo de residência do condutor principal\?/i],
  ["cobertura_18_25", /Deseja cobertura do seguro para outros condutores habilitados com menos de \d+ anos\?/i],
  ["garagem_trabalho", /O veículo fica guardado em garagem ou estacionamento fechados quando utilizado para ir ao trabalho\?/i],
  ["garagem_estudo", /O veículo fica guardado em garagem ou estacionamento fechados quando utilizado para ir à escola, faculdade ou pós-graduação\?/i],
  ["garagem_residencia", /O veículo fica guardado em garagem ou estacionamento fechados no seu local de pernoite\?/i],
];

export function lerAutoZurich(doc: DocumentoExtraido, pos: readonly LinhaPosicionada[], numero: string): DocumentoExtraido | null {
  const linhas = pos.map((l) => l.texto);
  const impresso = digitos(linhas.map((l) => /\bApólice:\s*(\d{5,})\b/.exec(l)?.[1]).find((x) => x !== undefined));
  if (impresso.length < 5 || impresso.replace(/^0+/, "") !== digitos(numero).replace(/^0+/, "")) return null;

  const linhaVig = linhas.find((l) => /^Início:/i.test(l)) ?? "";
  const [ini, fim] = linhaVig.split(/Término:/i);
  const proposta = digitos(linhas.map((l) => /\bProposta:\s*(\d+)/.exec(l)?.[1]).find((x) => x !== undefined));

  const seg = quadro(secao(linhas, /^Dados do Segurado/i, /^Dados do Risco/i, 14), ROT_SEGURADO);
  const blocoRisco = secao(linhas, /^Dados do Risco/i, /^(Questionário Perfil|Coberturas$)/i, 25);
  const r = quadro(blocoRisco, ROT_RISCO);
  const iAnti = blocoRisco.findIndex((l) => /^Dispositivo\(s\) Antifurto:/i.test(l));
  const antifurto = iAnti < 0 ? null : vazio((blocoRisco[iAnti] as string).replace(/^[^:]*:/, "") || blocoRisco[iAnti + 1]);

  /* Questionario: o bloco inteiro numa linha so, cada resposta ate a proxima pergunta conhecida. */
  const blocoQ = secao(linhas, /^Questionário Perfil Condutor Principal/i, /^Coberturas$/i, 30).slice(1);
  const q = blocoQ.filter((l) => !/^\d{2}-\d-\d-Motor|^Grupo \/ Ramo:/i.test(l)).join(" ").replace(/\s+/g, " ");
  const marcas = PERGUNTAS.map(([, re]) => re.exec(q)).filter((m): m is RegExpExecArray => m !== null).sort((a, b) => a.index - b.index);
  const respostas: Array<{ pergunta: string; resposta: string }> = [];
  for (const [campo, re] of PERGUNTAS) {
    const m = re.exec(q);
    if (m === null) continue;
    const depois = q.slice(m.index + m[0].length);
    const prox = marcas.find((x) => x.index > m.index);
    const resto = prox === undefined ? depois : q.slice(m.index + m[0].length, prox.index);
    const resposta = vazio(resto.replace(/\s*(Nome Completo|Nasc):.*$/i, ""));
    if (resposta !== null) respostas.push({ pergunta: m[0], resposta });
    void campo;
  }
  const condQ = /Nasc:\s*(\d{2}\/\d{2}\/\d{4})\s+Sexo:\s*(\S+)\s+Estado Civil:\s*(\S+)/i.exec(q);

  /* Coberturas. */
  const tabela = tabelaPorColunas(pos, ["Descrição", "LMG (R$)", "Franquia (R$)", "Prêmio (R$)"], /^(Cláusulas|Conta do Prêmio)/i, {
    ignorar: /^(\d{2}-\d-\d-Motor|Grupo \/ Ramo:|Coberturas$)/i,
  });
  const coberturas: CoberturaExtraida[] = tabela.map((t) => {
    const lmg = vazio(t.get("LMG (R$)"));
    return {
      descricao: vazio(t.get("Descrição")) ?? "",
      valor: dinheiro(lmg),
      limite: dinheiro(lmg) === null ? lmg : null,
      premio: dinheiro(t.get("Prêmio (R$)")),
      franquia: vazio(t.get("Franquia (R$)")),
    };
  });
  const clausulas = secao(linhas, /^Cláusulas$/i, /^Conta do Prêmio/i, 20)
    .filter((l) => !/Motor-PL|OnBase/i.test(l))
    .map((l) => /^\d+\s*-\s*(.+)$/.exec(l)?.[1])
    .filter((x): x is string => x !== undefined);

  const conta = quadro(secao(linhas, /^Conta do Prêmio/i, /^Plano de Pagamento/i, 10), ["Prêmio Auto", "Prêmio líquido", "Prêmio RCV", "Custo de Emissão", "Prêmio APP", "Juros", "Coberturas Adicionais", "IOF", "Equipamentos e Acessórios", "Prêmio Total"]);
  const forma = linhas.map((l) => /^Forma de Pagamento:\s*(.+)$/i.exec(l)?.[1]).find((x) => x !== undefined) ?? null;
  const nParc = Number(secao(linhas, /^NP Vencimento Valor/i, /^Titular|^Corretor/i, 15).slice(1).map((l) => /^(\d{1,2})\b/.exec(l)?.[1]).filter(Boolean).pop());
  const fator = Number(/^(\d{2,3})\s*%/.exec(r.get("Fator de Ajuste") ?? "")?.[1]);

  const a = autoVazio();
  Object.assign(a.veiculo, {
    descricao: vazio(r.get("Veículo")),
    modelo: vazio(r.get("Veículo")),
    ano_modelo: ano(r.get("Ano / Modelo")),
    placa: placa(r.get("Placa")),
    chassi: chassi(r.get("Chassi")),
    codigo_fipe: fipe(r.get("Código")),
    combustivel: vazio(r.get("Combustível")),
    categoria: vazio(r.get("Categoria")),
  });
  a.uso = vazio(r.get("Uso do Veículo"));
  a.modalidade_casco = vazio(r.get("Modalidade"));
  a.percentual_fipe = Number.isFinite(fator) && fator > 0 ? fator : null;
  a.cep_pernoite = cep(r.get("CEP do local de pernoite do veículo"));
  a.classe_bonus = /^\d{1,2}$/.test(r.get("Classe de Bônus") ?? "") ? Number(r.get("Classe de Bônus")) : null;
  a.ci = digitos(r.get("CI do Bônus")).length >= 8 ? digitos(r.get("CI do Bônus")) : null;
  a.antifurto = antifurto?.replace(/;$/, "") ?? null;
  a.questionario.respostas = respostas;
  for (const [campo, re] of PERGUNTAS) {
    const resp = respostas.find((x) => re.test(x.pergunta))?.resposta ?? null;
    (a.questionario as unknown as Record<string, unknown>)[campo] = resp;
  }
  const nomeCond = vazio(/Nome Completo:\s*(.+?)\s+Nasc:/i.exec(q)?.[1]);
  a.condutor = condutor({ nome: nomeCond, nascimento: data(condQ?.[1]), sexo: vazio(condQ?.[2]), estado_civil: vazio(condQ?.[3]) });

  return {
    ...doc,
    numero_apolice: impresso,
    proposta: proposta || null,
    vigencia_inicio: dataPorExtenso(ini),
    vigencia_fim: dataPorExtenso(fim),
    segurado: pessoaCom({
      nome: vazio(seg.get("Nome Completo")),
      documento: cpfOuCnpj(seg.get("CPF")),
      nascimento: data(seg.get("Data de nascimento")),
      sexo: vazio(seg.get("Sexo")),
      estado_civil: vazio(seg.get("Estado Civil")),
      endereco: enderecoOuNulo({
        cep: cep(seg.get("CEP")),
        logradouro: vazio(seg.get("Endereço")),
        numero: vazio(seg.get("Número")),
        complemento: vazio(seg.get("Complemento")),
        bairro: vazio(seg.get("Bairro")),
        cidade: vazio(seg.get("Cidade")),
        uf: /^[A-Z]{2}$/.test(seg.get("UF") ?? "") ? (seg.get("UF") as string) : null,
      }),
    }),
    coberturas,
    assistencias: [...coberturas.filter((c) => /assist|reboque/i.test(c.descricao)).map((c) => c.descricao), ...clausulas.filter((c) => /ASSIST/i.test(c))],
    clausulas,
    /* "Prêmio Auto R$ x Prêmio líquido R$ y" sem dois-pontos: pelo texto. */
    premio_liquido: dinheiro(conta.get("Prêmio líquido") ?? /Prêmio líquido\s+R\$\s*([\d.,]+)/i.exec(linhas.join(" "))?.[1]),
    premio_total: dinheiro(conta.get("Prêmio Total") ?? /Prêmio Total\s+R\$\s*([\d.,]+)/i.exec(linhas.join(" "))?.[1]),
    pagamento: forma === null && !Number.isFinite(nParc) ? null : { forma: vazio(forma), parcelas: Number.isFinite(nParc) ? nParc : null },
    auto: a,
  };
}
