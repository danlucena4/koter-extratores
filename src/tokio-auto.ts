/**
 * TOKIO MARINE AUTO, lida inteira sobre o texto do motor novo (9 PDFs da
 * cobranca, 2026-10-20). O quadro do segurado, do condutor e do veiculo ja e
 * lido por `lerApoliceTokio`; aqui entra o resto:
 *
 *   Vigência: a partir das 24 horas do dia ... até às 24 horas do dia ...
 *   Ramo / Apólice / Negócio / Proposta ; Data da Emissão
 *   Celular / Telefone / E-mail
 *   Descrição | Limite Máximo Indenização R$ | Prêmio Líquido R$   (coberturas)
 *   Vidros / Carro Reserva / Martelinho / Lataria / Roda, pneu  (servicos)
 *   Casco: Indenização Parcial R$ (franquia) e as franquias de vidros
 *   Prêmio Líquido Total / Prêmio Total / Cobrança / parcelas
 */
import {
  camposDaLinha,
  datas,
  data,
  digitos,
  dinheiro,
  email,
  simNao,
  tabelaPorColunas,
  telefones,
  vazio,
} from "./leitura.js";
import { autoVazio, condutor, pessoaCom, type CoberturaExtraida, type DocumentoExtraido, type FranquiaExtraida } from "./modelo.js";
import type { LinhaPosicionada } from "./pdf/motor.js";
import { lerApoliceTokio } from "./tokio.js";

const SERVICOS = ["Vidros", "Logomarca (vidros)", "Carro Reserva", "Martelinho e para-choque", "Lataria e pintura", "Roda, pneu e suspensão", "Tipo de Oficina para Reparo", "Tipo de Peça para Reparo", "Km Adicional Reboque"];
const ROT_VEICULO = ["Chassi Remarcado", "Lotação", "Zero Km", "Veículo Blindado", "Veículo Com Kit Gás", "Código Fipe", "Dispositivo Em Comodato", "Condição Exclusiva", "Isenção Fiscal"];
const ASSISTENCIA = /assist|reboque|guincho/i;

function quadro(linhas: readonly string[], rotulos: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const l of linhas) for (const [k, v] of camposDaLinha(l, rotulos)) if (!out.has(k) && v.trim().length > 0) out.set(k, v.trim());
  return out;
}

export function lerAutoTokio(doc: DocumentoExtraido, pos: readonly LinhaPosicionada[], numero: string): DocumentoExtraido | null {
  const linhas = pos.map((l) => l.texto);
  const t = lerApoliceTokio(linhas, numero);
  if (t === null) return null;

  const vig = datas(linhas.find((l) => /^Vigência:/i.test(l)));
  const ap = quadro(linhas.slice(0, 60), ["Ramo", "Apólice", "Negócio", "Proposta", "Data da Emissão", "Data da Versão"]);
  const contato = quadro(linhas.slice(0, 60), ["Celular", "Telefone", "E-mail"]);
  const vei = quadro(linhas, ROT_VEICULO);
  const serv = quadro(linhas, SERVICOS);

  const tabela = tabelaPorColunas(pos, ["Descrição", "Limite Máximo Indenização R$", "Prêmio Líquido R$"], /^Prêmio Líquido Total/i);
  const coberturas: CoberturaExtraida[] = tabela.map((r) => {
    const lmi = vazio(r.get("Limite Máximo Indenização R$"));
    return {
      descricao: vazio(r.get("Descrição")) ?? "",
      valor: dinheiro(lmi),
      limite: dinheiro(lmi) === null ? lmi : null,
      premio: dinheiro(r.get("Prêmio Líquido R$")),
      franquia: null,
    };
  });
  /* Servicos contratados sem preco proprio (Vidros, Carro Reserva...): entram como cobertura com o plano no limite. */
  for (const s of ["Vidros", "Carro Reserva", "Martelinho e para-choque", "Lataria e pintura", "Roda, pneu e suspensão"]) {
    const v = vazio(serv.get(s));
    if (v !== null && !/^N[ãa]o possui$/i.test(v)) coberturas.push({ descricao: s, valor: null, limite: v, premio: null, franquia: null });
  }
  const percentual = Number(/(\d{2,3})\s*%\s*do valor referenciado/i.exec(coberturas.find((c) => /^Colis[ãa]o/i.test(c.descricao))?.limite ?? "")?.[1]);

  /* Franquias: "Casco / Indenização Parcial R$ x" e as de vidros ("Parabrisa: R$ x  Vigia/Traseiro: R$ y"). */
  const franquias: FranquiaExtraida[] = [];
  const iParcial = linhas.findIndex((l) => /^Indenização Parcial\b/i.test(l));
  if (iParcial >= 0) franquias.push({ descricao: "Casco - Indenização Parcial", tipo: null, valor: dinheiro(linhas[iParcial]) });
  const iServ = linhas.findIndex((l) => /^Serviços:$/i.test(l.trim()));
  if (iServ >= 0) {
    for (const l of linhas.slice(iServ + 1, iServ + 12)) {
      if (/^Tipo de Oficina/i.test(l)) break;
      for (const m of l.matchAll(/([A-Za-zÀ-ú/ ]+?):\s*R\$\s*([\d.,]+)/g)) franquias.push({ descricao: (m[1] as string).trim(), tipo: null, valor: dinheiro(m[2]) });
    }
  }

  const totais = quadro(linhas, ["Prêmio Líquido Total", "Juros", "I.O.F.", "Prêmio Total", "Cobrança"]);
  const parcelas = [...linhas.join("\n").matchAll(/^(\d{1,2}) [\d.,]+ \d{2}\/\d{2}\/\d{4}/gm)].map((m) => Number(m[1]));

  const a = autoVazio();
  Object.assign(a.veiculo, {
    descricao: t.veiculo_descricao,
    marca: t.fabricante,
    modelo: t.veiculo_descricao,
    ano_modelo: t.ano_modelo,
    placa: t.placa,
    chassi: t.chassi,
    codigo_fipe: t.codigo_fipe,
    combustivel: t.combustivel,
    zero_km: t.zero_km,
    blindado: simNao(vei.get("Veículo Blindado")),
    kit_gas: simNao(vei.get("Veículo Com Kit Gás")),
  });
  a.uso = t.uso;
  a.modalidade_casco = /valor referenciado/i.test(coberturas.find((c) => /^Colis[ãa]o/i.test(c.descricao))?.limite ?? "") ? "VALOR REFERENCIADO" : null;
  a.percentual_fipe = Number.isFinite(percentual) && percentual > 0 ? percentual : null;
  a.cep_pernoite = t.cep_pernoite;
  a.classe_bonus = t.classe_bonus;
  a.ci = t.ci;
  a.antifurto = vazio(vei.get("Dispositivo Em Comodato"));
  Object.assign(a.questionario, {
    residentes_18_25: t.cobertura_residentes_18_25,
    isencao_fiscal: t.isencao_fiscal,
    garagem_residencia: t.garagem_residencia,
  });
  a.condutor = condutor({ estado_civil: t.condutor_estado_civil }, t.condutor_determinado);

  return {
    ...doc,
    tipo_seguro: t.tipo_seguro,
    proposta: digitos(ap.get("Proposta")) || null,
    emissao: data(ap.get("Data da Emissão")),
    vigencia_inicio: vig[0] ?? null,
    vigencia_fim: vig[1] ?? null,
    segurado: pessoaCom({
      nome: t.segurado_nome,
      documento: t.segurado_documento,
      endereco: t.endereco,
      email: email(contato.get("E-mail")),
      telefones: [...telefones(contato.get("Celular")), ...telefones(contato.get("Telefone"))],
    }),
    coberturas,
    assistencias: coberturas.filter((c) => ASSISTENCIA.test(c.descricao)).map((c) => c.descricao),
    franquias,
    premio_liquido: dinheiro(totais.get("Prêmio Líquido Total")),
    premio_total: dinheiro(totais.get("Prêmio Total")),
    pagamento: { forma: vazio(totais.get("Cobrança")), parcelas: parcelas.length > 0 ? Math.max(...parcelas) : null },
    auto: a,
  };
}
