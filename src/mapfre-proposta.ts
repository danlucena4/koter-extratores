/**
 * PROPOSTA DE SEGURO MAPFRE AUTO (o "kit digital" da proposta), lida inteira
 * sobre o texto do motor novo. 7 PDFs, 2026-10-20. Traz o que a apolice NAO
 * imprime do segurado (nascimento, sexo, estado civil, atividade, renda,
 * e-mail) e repete veiculo, condutor, coberturas, franquias e premio.
 *
 *   Proposta:0000000000000 / Cotação nº / Vigência
 *   Dados do Segurado     Nome / Tipo Pessoa / CPF ; Data Nasc. / Sexo /
 *                         Est.Civil ; E-mail / Atividade ; telefones ; Renda
 *                         Mensal ; Endereço ... Nº .. Compl. ; Bairro Cidade UF CEP
 *   Dados do Veículo      Veículo, Ano Modelo, 0Km, Chassi, Placa, Uso,
 *                         Categoria, Isenção, Tipo de Seguro, Bônus,
 *                         Modalidade, Fator de Ajuste, FIPE
 *   Questionário          "- Rotulo: valor" (condutor, CEP de pernoite...)
 *   Coberturas | Lim. Máx. Indenização | Prêmio ; Franquia(s) ; Prêmios ;
 *   Formas de Pagamento
 *
 * TRAVA: o numero da proposta ou o CPF do segurado impresso.
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
  email,
  enderecoOuNulo,
  fipe,
  placa,
  quadroPorColuna,
  secao,
  simNao,
  tabelaPorColunas,
  telefones,
  vazio,
} from "./leitura.js";
import { autoVazio, condutor, pessoaCom, type CoberturaExtraida, type DocumentoExtraido, type FranquiaExtraida } from "./modelo.js";
import type { LinhaPosicionada } from "./pdf/motor.js";

const ROT_SEGURADO = [
  "Nome do Segurado", "Tipo Pessoa", "CPF", "CNPJ", "Tipo de Documento", "Nr. do Documento", "Orgão Expedidor", "Data de Expedição", "Data Nasc.", "Sexo",
  "Est.Civil", "E-mail", "Atividade", "Tel.Celular", "Tel.Res.", "Tel.Outros", "País de Nascimento", "Renda Mensal", "Endereço", "Compl.", "Bairro", "Cidade", "UF", "CEP",
];
const ROT_VEICULO = ["Veículo", "Ano Modelo", "0Km", "Qtde Passageiros", "Chassi", "Placa", "Uso", "Categoria Tarifária", "Tipo Isenção Imposto", "Tipo de Seguro", "Classe de Bônus", "Modalidade**", "Fator de Ajuste", "Tabela de Referência", "Tabela Substituta"];

function quadro(linhas: readonly string[], rotulos: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const l of linhas) for (const [k, v] of camposDaLinha(l, rotulos)) if (!out.has(k) && v.trim().length > 0) out.set(k, v.trim());
  return out;
}
const semCodigo = (v: string | null | undefined) => vazio((v ?? "").replace(/^\s*\w{1,3}\s*-\s*/, ""));

export function lerPropostaAutoMapfre(doc: DocumentoExtraido, pos: readonly LinhaPosicionada[], trava: { proposta: string | null; cpf: string | null }): DocumentoExtraido | null {
  const linhas = pos.map((l) => l.texto);
  const proposta = digitos(linhas.map((l) => /^Proposta:\s*(\d+)/.exec(l)?.[1]).find((x) => x !== undefined));
  const blocoSeg = secao(linhas, /^Dados do Segurado/i, /^Dados do Veículo/i, 16);
  const seg = quadro(blocoSeg, ROT_SEGURADO);
  const cpf = cpfOuCnpj(seg.get("CPF") ?? seg.get("CNPJ"));
  const okProposta = trava.proposta !== null && digitos(trava.proposta).replace(/^0+/, "") === proposta.replace(/^0+/, "") && proposta.length > 0;
  const okCpf = trava.cpf !== null && cpf !== null && digitos(trava.cpf) === cpf;
  if (!okProposta && !okCpf) return null;

  const vig = datas(linhas.find((l) => /Vigência:\s*das/i.test(l)));
  const v = quadro(secao(linhas, /^Dados do Veículo/i, /^Questionário de Avaliação/i, 16), ROT_VEICULO);
  const blocoQ = secao(linhas, /^Questionário de Avaliação de Risco/i, /^SUAS INFORMAÇÕES|^ESCLARECIMENTOS/i, 25).slice(1);
  const q = quadro(
    blocoQ.map((l) => l.replace(/^-\s*/, "")),
    ["Nome do Principal Condutor", "CPF", "Data de Nascimento Condutor", "Sexo do Condutor", "Estado Civil do Condutor", "CEP de pernoite do veículo", "Cidade", "UF"],
  );
  const respostas = blocoQ
    .map((l) => /^-\s*(.+?)\s*[:?]\s*(.+)$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ pergunta: (m[1] as string).trim(), resposta: (m[2] as string).trim() }));

  /* Endereco: "RUA X Nº 12" + "Compl.: ..." (o numero vem separado pelo "Nº"). */
  const mEnd = /^(.+?)\s+N[ºo°]\s*(\S+)\s*$/.exec(seg.get("Endereço") ?? "");

  const tabela = tabelaPorColunas(pos, ["Coberturas", "Lim. Máx. Indenização - R$", "Prêmio - R$"], /^Coberturas - ATENÇÃO|^Foram oferecidas/i);
  const coberturas: CoberturaExtraida[] = tabela.map((t) => {
    const lmi = vazio(t.get("Lim. Máx. Indenização - R$"));
    return {
      descricao: vazio(t.get("Coberturas")) ?? "",
      valor: dinheiro(lmi),
      limite: dinheiro(lmi) === null ? lmi : null,
      premio: dinheiro(t.get("Prêmio - R$")),
      franquia: null,
    };
  });
  const franquias: FranquiaExtraida[] = secao(linhas, /^Franquia\(s\)\s+Valor/i, /^Prêmios$/i, 25)
    .slice(1)
    .map((l) => /^(.+?)\s+(\d[\d.]*,\d{2})$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => {
      const [desc, tipo] = (m[1] as string).split(/:\s*/);
      return { descricao: (desc as string).trim(), tipo: vazio(tipo), valor: dinheiro(m[2]) };
    });
  const premios = quadroPorColuna(pos, ["Prêmio Líquido", "Encargos", "IOF", "Prêmio Total"]) ?? new Map<string, string>();
  const plano = linhas.map((l) => /Condições de Pagamento:\s*(.+?)\s+Valor da Primeira/i.exec(l)?.[1]).find((x) => x !== undefined) ?? null;
  const nParc = (plano ?? "").match(/(\d+)\s*(?:FCA|D[ée]bitos?|Parcelas?|Boletos?|Cart)/gi)?.reduce((s, x) => s + Number(/\d+/.exec(x)?.[0] ?? 0), 0) ?? 0;

  const veiculo = vazio((v.get("Veículo") ?? "").replace(/^[\d;\s]+[A-Z]{2}\d+\s+/, ""));
  const [marca, ...resto] = (veiculo ?? "").split(/\s+-\s+/);
  const a = autoVazio();
  Object.assign(a.veiculo, {
    descricao: veiculo,
    marca: vazio(marca),
    modelo: vazio(resto.join(" - ")),
    ano_modelo: ano(v.get("Ano Modelo")),
    zero_km: simNao(v.get("0Km")),
    chassi: chassi(v.get("Chassi")),
    placa: placa(v.get("Placa")),
    codigo_fipe: fipe(v.get("Tabela de Referência")),
    combustivel: /\((Flex|Gasolina|Diesel|[ÁA]lcool|El[ée]trico|H[íi]brido)\)/i.exec(veiculo ?? "")?.[1] ?? null,
    categoria: semCodigo(v.get("Categoria Tarifária")),
  });
  a.uso = semCodigo(v.get("Uso"));
  a.modalidade_casco = vazio(v.get("Modalidade**"));
  a.percentual_fipe = Number(/(\d{2,3})\s*%/.exec(v.get("Fator de Ajuste") ?? "")?.[1]) || null;
  a.cep_pernoite = cep(q.get("CEP de pernoite do veículo"));
  a.classe_bonus = /^\d{1,2}$/.test(v.get("Classe de Bônus") ?? "") ? Number(v.get("Classe de Bônus")) : null;
  a.questionario.respostas = respostas;
  a.questionario.isencao_fiscal = semCodigo(v.get("Tipo Isenção Imposto"));
  a.condutor = condutor({
    nome: vazio(q.get("Nome do Principal Condutor")),
    documento: cpfOuCnpj(q.get("CPF")),
    nascimento: data(q.get("Data de Nascimento Condutor")),
    sexo: semCodigo(q.get("Sexo do Condutor")),
    estado_civil: semCodigo(q.get("Estado Civil do Condutor")),
  });

  return {
    ...doc,
    numero_proposta: proposta || null,
    proposta: proposta || null,
    tipo_seguro: vazio(v.get("Tipo de Seguro")),
    vigencia_inicio: vig[0] ?? null,
    vigencia_fim: vig[1] ?? null,
    segurado: pessoaCom({
      nome: vazio(seg.get("Nome do Segurado")),
      documento: cpf,
      nascimento: data(seg.get("Data Nasc.")),
      sexo: vazio(seg.get("Sexo")),
      estado_civil: vazio(seg.get("Est.Civil")),
      profissao: vazio(seg.get("Atividade")),
      renda: vazio(seg.get("Renda Mensal")),
      email: email(seg.get("E-mail")),
      telefones: [...telefones(seg.get("Tel.Celular")), ...telefones(seg.get("Tel.Res.")), ...telefones(seg.get("Tel.Outros"))],
      endereco: enderecoOuNulo({
        cep: cep(seg.get("CEP")),
        logradouro: vazio(mEnd?.[1] ?? null),
        numero: vazio(mEnd?.[2] ?? null),
        complemento: vazio(seg.get("Compl.")),
        bairro: vazio(seg.get("Bairro")),
        cidade: vazio(seg.get("Cidade")),
        uf: /^[A-Z]{2}$/.test(seg.get("UF") ?? "") ? (seg.get("UF") as string) : null,
      }),
    }),
    coberturas,
    assistencias: coberturas.filter((c) => /assist/i.test(c.descricao)).map((c) => c.descricao),
    franquias,
    premio_liquido: dinheiro(premios.get("Prêmio Líquido")),
    premio_total: dinheiro(premios.get("Prêmio Total")),
    pagamento: plano === null ? null : { forma: plano, parcelas: nParc > 0 ? nParc : null },
    auto: a,
  };
}
