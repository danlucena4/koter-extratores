/**
 * HDI AUTO pelo PDF da apólice (15 PDFs da A vencer, 2026-10-20). O mesmo
 * quadro do documento HTML do portal (`lerDocumentoAutoHdi`), com rotulos
 * "Rotulo : valor":
 *
 *   Apólice 00.000.000.000000 ; segurado (nome, e-mail, CPF, RG, endereço,
 *   celular, bairro, cidade - UF, CEP) ; Proposta, Vigência ; prêmios ;
 *   cobrança (tipo, parcelas) ; veículo (Modelo, FIPE, Ano Fabr./Modelo,
 *   combustível, placa, chassi, categoria, cobertura, franquia, CEP de
 *   pernoite e de circulação, proteção, CI, cia e apólice anterior, sinistros,
 *   bônus) ; coberturas (L.M.I. | Prêmio | Prêmio Anual | Franquia) e as
 *   notas "(*1) X com franquia de R$ y" ; condutor ; guarda e utilização.
 */
import { garagensDaGuardaHdi, semCodigoHdi } from "./hdi.js";
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
  marcaEModelo,
  placa,
  ruaNumeroComplemento,
  secao,
  tabelaPorColunas,
  telefones,
  vazio,
} from "./leitura.js";
import { autoVazio, condutor, pessoaCom, type CoberturaExtraida, type DocumentoExtraido, type FranquiaExtraida } from "./modelo.js";
import type { LinhaPosicionada } from "./pdf/motor.js";

const ROT_SEGURADO = ["Nome Social do Segurado", "Nome de Registro do Segurado", "Email", "CPF", "RG", "Órgão Emissor", "Emissão do R.G.", "Endereço", "Celular", "Bairro", "Cidade", "CEP"];
const ROT_SEGURO = ["Moeda", "Proposta", "Cotação Base", "Vigência", "Ramo"];
const ROT_PREMIO = ["Prêmio Líquido", "Adicional de parcelamento", "Custo de Apólice", "I.O.F.", "Prêmio Total"];
const ROT_COBRANCA = ["Banco", "Tipo de Cobrança", "Parcela", "Forma de Pagamento", "Juros parcelamento"];
const ROT_VEICULO = [
  "Nome Social Segurado", "Nome de Registro Segurado", "CPF", "Beneficiário", "Modelo", "Renavam", "Código FIPE", "Ano Fabr./Modelo", "Combustível", "Placa/UF",
  "Chassi", "Categoria", "Passageiros", "Cobertura", "Região", "Franquia", "CEP Pernoite", "CEP Circulação", "Sist.Proteção", "Código CI", "Cia Anterior",
  "Apólice Anterior", "Fim Vigência Anterior", "CI Doc. Anterior", "Qtde Sinistros", "Classe de Bônus", "Solicitação de Vistoria",
];
const ROT_CONDUTOR = ["Condutor", "CPF", "Data de Nasc.", "Faixa Etaria do Condutor", "Sexo", "Estado Civil", "Guarda do Veiculo", "Utilizacao do Veiculo"];

function quadro(linhas: readonly string[], rotulos: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const l of linhas) for (const [k, v] of camposDaLinha(l, rotulos)) if (!out.has(k) && v.trim().length > 0) out.set(k, v.trim());
  return out;
}

export function lerAutoHdi(doc: DocumentoExtraido, pos: readonly LinhaPosicionada[], numero: string): DocumentoExtraido | null {
  const linhas = pos.map((l) => l.texto);
  const bruto = linhas.map((l) => /^(?:Apólice|Endosso)\s+([\d.]+)$/.exec(l.trim())?.[1]).find((x) => x !== undefined) ?? "";
  const impresso = digitos(bruto.split(".").slice(0, 4).join(""));
  if (impresso.length < 8 || impresso.replace(/^0+/, "") !== digitos(numero).replace(/^0+/, "")) return null;

  const seg = quadro(linhas.slice(0, 20), ROT_SEGURADO);
  const seguro = quadro(secao(linhas, /^Informações do Seguro/i, /^Prêmio da Apólice/i, 6), ROT_SEGURO);
  const vig = datas(seguro.get("Vigência") ?? linhas.find((l) => /^Das\s+\d+h do dia/i.test(l)));
  const premio = quadro(secao(linhas, /^Prêmio da Apólice/i, /^Parcelamento do Prêmio/i, 8), ROT_PREMIO);
  const cob = quadro(secao(linhas, /^Dados de Cobrança/i, /^Multa de Mora/i, 6), ROT_COBRANCA);
  const blocoV = secao(linhas, /^Dados do Veículo/i, /^Coberturas Auto/i, 30);
  const v = quadro(blocoV, ROT_VEICULO);
  const cond = quadro(secao(linhas, /^Nome Social do Condutor/i, /^Este documento/i, 15), ROT_CONDUTOR);
  const respostaDemais = linhas.map((l) => /^Cob Demais Condutores Resid entre \d+ Até \d+ Anos\s*:\s*(.+)$/i.exec(l)?.[1]).find((x) => x !== undefined) ?? null;

  /* Coberturas e as franquias das notas "(*1)". */
  const tabela = tabelaPorColunas(pos, ["Coberturas Auto(Valores em R$)", "L.M.I.", "Prêmio", "Prêmio Anual", "Franquia"], /^(Cobertura de Morte|Impressão dos Textos)/i, {
    ignorar: /^[\d.,]+$/,
  });
  const coberturas: CoberturaExtraida[] = tabela.map((t) => {
    const lmi = vazio(t.get("L.M.I."));
    return {
      descricao: (vazio(t.get("Coberturas Auto(Valores em R$)")) ?? "").replace(/\(\*\d+\)$/, "").trim(),
      valor: dinheiro(lmi),
      limite: dinheiro(lmi) === null ? lmi : null,
      premio: dinheiro(t.get("Prêmio Anual") ?? t.get("Prêmio")),
      franquia: vazio(t.get("Franquia")),
    };
  });
  const notas = secao(linhas, /^Impressão dos Textos Explicativos/i, /^Nome Social do Condutor/i, 20).join(" ");
  const franquias: FranquiaExtraida[] = [...notas.matchAll(/([A-Za-zÀ-ú][A-Za-zÀ-ú ]+?) com franquia de R\$\s*([\d.,]+\d)/g)].map((m) => ({
    descricao: (m[1] as string).replace(/^.*\.\s*/, "").trim(),
    tipo: null,
    valor: dinheiro(m[2]),
  }));
  const fr = vazio(v.get("Franquia"));
  if (fr !== null) franquias.unshift({ descricao: "Casco", tipo: semCodigoHdi(fr), valor: dinheiro(coberturas.find((c) => /^Casco/i.test(c.descricao))?.franquia) });

  const anos = /(\d{4})\s*\/\s*(\d{4})/.exec(v.get("Ano Fabr./Modelo") ?? "");
  const modelo = vazio((v.get("Modelo") ?? "").replace(/^\d+\s*-\s*/, ""));
  const guarda = garagensDaGuardaHdi(vazio(cond.get("Guarda do Veiculo")));
  const bonus = /^(\d{1,2})\b/.exec(v.get("Classe de Bônus") ?? "")?.[1];
  const percentual = Number(/(\d{2,3})(?:,\d+)?%\s*tab\.?\s*FIPE/i.exec(coberturas.find((c) => /^Casco/i.test(c.descricao))?.limite ?? "")?.[1]);
  const condM = /^(.*?)\s+CPF:\s*([\d.\-/]+)/.exec(cond.get("Condutor") ?? "");
  const end = ruaNumeroComplemento((seg.get("Endereço") ?? "").replace(/\s*\/\s*/, ", "));
  const cidadeUf = /^(.*?)\s*-\s*([A-Z]{2})$/.exec(seg.get("Cidade") ?? "");

  const a = autoVazio();
  Object.assign(a.veiculo, {
    descricao: modelo,
    ...marcaEModelo(modelo),
    ano_fabricacao: anos === null ? null : ano(anos[1]),
    ano_modelo: anos === null ? null : ano(anos[2]),
    placa: placa((v.get("Placa/UF") ?? "").split("-")[0]),
    chassi: chassi(v.get("Chassi")),
    codigo_fipe: fipe(v.get("Código FIPE")),
    combustivel: semCodigoHdi(vazio(v.get("Combustível"))),
    categoria: semCodigoHdi(vazio(v.get("Categoria"))),
  });
  a.uso = vazio(cond.get("Utilizacao do Veiculo"));
  a.modalidade_casco = semCodigoHdi(vazio(v.get("Cobertura")));
  a.percentual_fipe = Number.isFinite(percentual) && percentual > 0 ? percentual : null;
  a.cep_pernoite = cep(v.get("CEP Pernoite"));
  a.classe_bonus = bonus === undefined ? null : Number(bonus);
  a.ci = digitos(v.get("Código CI")).length >= 8 ? digitos(v.get("Código CI")) : null;
  a.sinistros = /^\d+$/.test(v.get("Qtde Sinistros") ?? "") ? Number(v.get("Qtde Sinistros")) : null;
  a.antifurto = vazio((v.get("Sist.Proteção") ?? "").replace(/\s+H-.*$/, ""));
  a.questionario.garagem_residencia = guarda.residencia;
  a.questionario.garagem_trabalho = guarda.trabalho;
  a.questionario.residentes_18_25 = respostaDemais;
  a.questionario.respostas = [
    ...(cond.has("Guarda do Veiculo") ? [{ pergunta: "Guarda do Veiculo", resposta: cond.get("Guarda do Veiculo") as string }] : []),
    ...(cond.has("Utilizacao do Veiculo") ? [{ pergunta: "Utilizacao do Veiculo", resposta: cond.get("Utilizacao do Veiculo") as string }] : []),
    ...(respostaDemais !== null ? [{ pergunta: "Cob Demais Condutores Resid entre 18 Até 25 Anos", resposta: respostaDemais }] : []),
  ];
  a.condutor = condutor({
    nome: vazio(condM?.[1] ?? cond.get("Condutor")),
    documento: cpfOuCnpj(condM?.[2] ?? cond.get("CPF")),
    nascimento: data(cond.get("Data de Nasc.")),
    sexo: vazio(cond.get("Sexo")),
    estado_civil: vazio(cond.get("Estado Civil")),
  });

  const parcelas = Number(/^(\d{1,2})\s*x/i.exec(cob.get("Forma de Pagamento") ?? "")?.[1]);
  return {
    ...doc,
    proposta: digitos(seguro.get("Proposta")) || null,
    vigencia_inicio: vig[0] ?? null,
    vigencia_fim: vig[1] ?? null,
    renovacao_de: v.has("Apólice Anterior") ? { numero: digitos(v.get("Apólice Anterior")) || null, seguradora: semCodigoHdi(vazio(v.get("Cia Anterior"))) } : null,
    segurado: pessoaCom({
      nome: vazio(seg.get("Nome de Registro do Segurado") ?? seg.get("Nome Social do Segurado")),
      documento: cpfOuCnpj(seg.get("CPF")),
      email: email(seg.get("Email")),
      telefones: telefones(seg.get("Celular")),
      endereco: enderecoOuNulo({
        cep: cep(seg.get("CEP")),
        ...end,
        bairro: vazio(seg.get("Bairro")),
        cidade: vazio(cidadeUf?.[1] ?? seg.get("Cidade")),
        uf: cidadeUf?.[2] ?? null,
      }),
    }),
    coberturas,
    assistencias: coberturas.filter((c) => /assist|vip auto|km/i.test(c.descricao)).map((c) => c.descricao),
    franquias,
    premio_liquido: dinheiro(premio.get("Prêmio Líquido")),
    premio_total: dinheiro(premio.get("Prêmio Total")),
    pagamento: { forma: vazio(cob.get("Tipo de Cobrança")), parcelas: Number.isFinite(parcelas) ? parcelas : null },
    auto: a,
  };
}
