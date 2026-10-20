/**
 * PORTO AUTO (Porto, Azul e Itaú, que a Porto emite), lida inteira sobre o
 * texto do motor novo. 10 PDFs, 2026-10-20: o "Seguro Auto" da Porto e a
 * "Proteção Combinada Itaú" (auto + residência na mesma apólice).
 *
 *   Dados da sua apólice  Apólice: 0000 31 00000000 Item: 01 / Renova nº /
 *                         Classe de bônus / Código C.I / Data de emissão /
 *                         Proposta / Vigência: Das 24h do dia ... às 24h do dia ...
 *   Dados cadastrais      Segurado(a) | Nome do segurado(a), nascimento, sexo,
 *                         CPF, Endereço (rua, número - complemento), Bairro,
 *                         Estado, Cidade, CEP, Celular, E-mail
 *   Veículo               Veículo, Ano (fabricação) Modelo (ano modelo), Chassi,
 *                         Combustível, Placa, Código Tabela FIPE (sem dígito),
 *                         Uso, Câmbio, Categoria tarifária
 *   Residência (Itaú)     Endereço, Bairro, CEP, Cidade, Estado, Tipo de residência
 *   Valores do seu seguro coberturas (LMI | Prêmio), adicionais e serviços
 *   Franquias             Perda Parcial (Obrigatória) e as de vidros/faróis
 *   Questionário          motorista principal (nome, sexo, nascimento, CPF),
 *                         antifurto, CEP de pernoite
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
  marcaEModelo,
  placa,
  ruaNumeroComplemento,
  secao,
  tabelaPorValores,
  telefones,
  vazio,
} from "./leitura.js";
import { autoVazio, condutor, pessoaCom, residencialVazio, type CoberturaExtraida, type DocumentoExtraido, type FranquiaExtraida } from "./modelo.js";

const ROT_APOLICE = ["Apólice", "Item", "Renova nº", "Classe de bônus", "Código C.I", "Data de emissão", "Proposta", "Vigência"];
const ROT_SEGURADO = ["Segurado(a)", "Nome do segurado(a)", "Data de nascimento", "Data de nasc.", "Sexo", "CPF", "Endereço", "Bairro", "Estado", "Cidade", "CEP", "Tel. residencial", "Celular", "Tel. comercial", "E-mail"];
const ROT_VEICULO = ["Veículo", "Ano", "Modelo", "Chassi", "Capacidade", "Portas", "Combustível", "Placa", "Código Tabela FIPE", "Uso", "Câmbio automático", "Categoria tarifária"];
const ROT_RESIDENCIA = ["Endereço", "Bairro", "CEP", "Cidade", "Estado", "Tipo de residência"];
const ROT_CONDUTOR = ["Nome do motorista principal", "Nome do condutor(a)", "Sexo", "Data de nascimento", "Data de nasc", "CPF", "Possui dispositivo antifurto/anti-roubo instalado no veículo"];

function quadro(linhas: readonly string[], rotulos: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const l of linhas) for (const [k, v] of camposDaLinha(l, rotulos)) if (!out.has(k) && v.trim().length > 0) out.set(k, v.trim());
  return out;
}

/** Linhas que sao cabecalho, nota ou total dentro de "Valores do seu seguro" (nao sao cobertura). */
const NAO_E_COBERTURA =
  /^(LMI|Prêmio\b|Valor máximo|Valor do\b|Valor \(R\$\)|de indenização|seguro$|passageiro$|do veículo segurado|\(R\$\)|serviços e benefícios|e benefícios|Coberturas?\s+(adicionais|do seu seguro|para o veículo|para os passageiros|para residência|a terceiros|a\b|LMI)|Cobertura\s+(para|a)\b|Coberturas LMI|Valores das coberturas|Valores do seu seguro|Total\b|Preço total|Prêmio coberturas|Prêmio líquido|Coberturas adicionais, serviços e benefícios|Apólice Porto Seguro|veículo referência|Terceiros|\d+\s*-\s*\d*\s*[\d,]+%\s*do valor|\d+\s*-\s|\*|#|\d+$)/i;

const ASSISTENCIA = /assist|guincho|reboque|km ilimitad|servi[çc]os|socorro/i;

export function lerAutoPorto(doc: DocumentoExtraido, linhas: readonly string[], numero: string): DocumentoExtraido | null {
  const dadosAp = secao(linhas, /^Dados da sua apólice/i, /^Dados cadastrais/i, 12);
  const ap = quadro(dadosAp, ROT_APOLICE);
  const linhaApolice = dadosAp.find((l) => /^Apólice:/i.test(l)) ?? "";
  const mNum = /^Apólice:\s*((?:\d+\s+)*\d+)\s+Item:\s*(\d+)/i.exec(linhaApolice);
  const impresso = (mNum?.[1] ?? "").trim().split(/\s+/).pop() ?? "";
  if (impresso.length < 5 || impresso.replace(/^0+/, "") !== digitos(numero).replace(/^0+/, "")) return null;

  const vig = datas(dadosAp.find((l) => /^Vigência:/i.test(l)));
  const renova = /Renova nº:\s*([\d\s]+?)\s+Classe/i.exec(dadosAp.find((l) => /Renova nº/i.test(l)) ?? "")?.[1] ?? null;

  /* Segurado. */
  const blocoSeg = secao(linhas, /^Dados cadastrais/i, /^(Descrição|Dados) do veículo segurado/i, 14);
  const seg = quadro(blocoSeg, ROT_SEGURADO);
  const rua = ruaNumeroComplemento(seg.get("Endereço"));
  const uf = vazio(seg.get("Estado"))?.toUpperCase() ?? null;

  /* Veiculo. */
  const blocoV = secao(linhas, /^(Descrição|Dados) do veículo segurado/i, /^(Dados do Corretor|Dados da residência|Apólice Porto Seguro)/i, 14);
  const vei = quadro(blocoV, ROT_VEICULO);
  const linhaAno = blocoV.find((l) => /^Ano:\s*\d{4}\s+Modelo:\s*\d{4}/i.test(l));
  const descricao = vazio(vei.get("Veículo"));

  /* Residencia (Itau Protecao Combinada). */
  const blocoR = secao(linhas, /^Dados da residência segurada/i, /^(Dados do Corretor|#|\d+$)/i, 8);
  const res = blocoR.length > 0 ? quadro(blocoR, ROT_RESIDENCIA) : null;

  /* Questionario. */
  const blocoQ = secao(linhas, /^Questionário de avaliação de risco|^Fatores de Risco|^Nome do (motorista principal|condutor\(a\))/i, /^(Condições específicas|Apólice Porto Seguro Auto)/i, 40);
  const q = quadro(blocoQ, ROT_CONDUTOR);
  const pernoite = cep(blocoQ.map((l) => /Cep do local onde o ve[íi]culo pernoita\??\s*([\d-]{8,9})/i.exec(l)?.[1]).find((x) => x !== undefined) ?? null);

  /* Coberturas: de "Valores do seu seguro" ate "Valores e franquias". */
  const blocoCob = secao(linhas, /^Valores do seu seguro/i, /^Valores e franquias/i, 120);
  const percentual = Number((/(\d{1,3}),\d+%\s*do valor do/i.exec(blocoCob.join(" "))?.[1] ?? "").trim());
  const linhasCob = tabelaPorValores(blocoCob, { ignorar: NAO_E_COBERTURA });
  const coberturas: CoberturaExtraida[] = linhasCob.map((c) => {
    const din = c.valores.map((v) => dinheiro(v));
    const texto = c.valores.filter((v, i) => din[i] === null);
    const casco = /Colis[ãa]o\/Inc[êe]ndio\/Roubo\/Furto/i.test(c.descricao);
    /* Dois valores: LMI | Prêmio. Um so: e o prêmio (casco, adicionais), salvo "Contratado"/"Não contratado". */
    const [lmi, premio] = c.valores.length >= 2 ? [c.valores[0], c.valores[c.valores.length - 1]] : [null, c.valores[0]];
    return {
      descricao: c.descricao.replace(/\*$/, "").trim(),
      valor: dinheiro(lmi),
      limite: casco && Number.isFinite(percentual) && percentual > 0 ? `${percentual}% do valor do veículo referência` : (texto[0] ?? null),
      premio: dinheiro(premio),
      franquia: null,
    };
  });

  /* Franquias. */
  const blocoF = secao(linhas, /^(Valores das franquias|Franquias do seu veículo)/i, /^(Em atendimento|Dados (de|do) pagamento)/i, 30);
  const franquias: FranquiaExtraida[] = blocoF
    .map((l) => /^(.+?):?\s+R\$\s*([\d.,]+)$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => {
      const desc = (m[1] as string).replace(/:$/, "");
      const tipo = /\(([^)]*Obrigat[óo]ria[^)]*)\)/i.exec(desc)?.[1] ?? null;
      return { descricao: desc.replace(/\s*\([^)]*\)\s*/, " ").trim(), tipo, valor: dinheiro(m[2]) };
    });

  /* Pagamento. */
  const iForma = linhas.findIndex((l) => /^Forma de pagamento$/i.test(l));
  const parcelas = [...linhas.join("\n").matchAll(/(?:^|\s)(\d{1,2}) R\$ [\d.,]+ \d{2}\/\d{2}\/\d{4}/g)].map((m) => Number(m[1]));
  const premioLiq = linhas.find((l) => /^Prêmio líquido R\$/i.test(l));
  const total = linhas.find((l) => /^Total do seguro R\$/i.test(l));

  const a = autoVazio();
  Object.assign(a.veiculo, {
    descricao,
    ...marcaEModelo(descricao),
    ano_fabricacao: linhaAno === undefined ? null : ano(vei.get("Ano")),
    ano_modelo: linhaAno === undefined ? null : ano(vei.get("Modelo")),
    chassi: chassi(vei.get("Chassi")),
    combustivel: vazio(vei.get("Combustível")),
    placa: placa(vei.get("Placa")),
    codigo_fipe_impresso: digitos(vei.get("Código Tabela FIPE")) || null,
    categoria: vazio(vei.get("Categoria tarifária")),
    blindado: coberturas.some((c) => /^Blindagem$/i.test(c.descricao)) ? coberturas.some((c) => /^Blindagem$/i.test(c.descricao) && c.valor !== null) : null,
    kit_gas: coberturas.some((c) => /^Kit G[áa]s$/i.test(c.descricao)) ? coberturas.some((c) => /^Kit G[áa]s$/i.test(c.descricao) && c.valor !== null) : null,
  });
  a.uso = vazio(vei.get("Uso"));
  a.modalidade_casco = linhas.some((l) => /Valor de Mercado/i.test(l)) ? "VALOR DE MERCADO" : linhas.some((l) => /Valor Determinado/i.test(l)) ? "VALOR DETERMINADO" : null;
  a.percentual_fipe = Number.isFinite(percentual) && percentual > 0 ? percentual : null;
  a.cep_pernoite = pernoite;
  a.classe_bonus = /^\d{1,2}$/.test(ap.get("Classe de bônus") ?? "") ? Number(ap.get("Classe de bônus")) : null;
  a.ci = digitos(ap.get("Código C.I")).length >= 8 ? digitos(ap.get("Código C.I")) : null;
  a.antifurto = vazio(q.get("Possui dispositivo antifurto/anti-roubo instalado no veículo"));
  a.condutor = condutor({
    nome: vazio(q.get("Nome do motorista principal") ?? q.get("Nome do condutor(a)")),
    documento: cpfOuCnpj(q.get("CPF")),
    nascimento: data(q.get("Data de nascimento") ?? q.get("Data de nasc")),
    sexo: vazio(q.get("Sexo")),
  });

  const imovel =
    res === null
      ? null
      : enderecoOuNulo({
          cep: cep(res.get("CEP")),
          ...ruaNumeroComplemento(res.get("Endereço")),
          bairro: vazio(res.get("Bairro")),
          cidade: vazio(res.get("Cidade")),
          uf: vazio(res.get("Estado"))?.toUpperCase() ?? null,
        });

  return {
    ...doc,
    item: digitos(mNum?.[2]) || null,
    proposta: digitos(ap.get("Proposta")) || null,
    emissao: data(ap.get("Data de emissão")),
    vigencia_inicio: vig[0] ?? null,
    vigencia_fim: vig[1] ?? null,
    renovacao_de: renova === null ? null : { numero: renova.trim().split(/\s+/).pop() ?? null, seguradora: "porto" },
    segurado: pessoaCom({
      nome: vazio(seg.get("Segurado(a)") ?? seg.get("Nome do segurado(a)")),
      documento: cpfOuCnpj(seg.get("CPF")),
      nascimento: data(seg.get("Data de nascimento") ?? seg.get("Data de nasc.")),
      sexo: vazio(seg.get("Sexo")),
      email: email(seg.get("E-mail")),
      telefones: [...telefones(seg.get("Celular")), ...telefones(seg.get("Tel. residencial")), ...telefones(seg.get("Tel. comercial"))],
      endereco: enderecoOuNulo({
        cep: cep(seg.get("CEP")),
        ...rua,
        bairro: vazio(seg.get("Bairro")),
        cidade: vazio(seg.get("Cidade")),
        uf: uf !== null && /^[A-Z]{2}$/.test(uf) ? uf : null,
      }),
    }),
    coberturas,
    assistencias: coberturas.filter((c) => ASSISTENCIA.test(c.descricao)).map((c) => c.descricao),
    franquias,
    premio_liquido: dinheiro(premioLiq),
    premio_total: dinheiro(total),
    pagamento: iForma < 0 ? null : { forma: vazio(linhas[iForma + 1]), parcelas: parcelas.length > 0 ? Math.max(...parcelas) : null },
    auto: a,
    residencial:
      res === null
        ? doc.residencial
        : { ...residencialVazio(), imovel, tipo_imovel: vazio(res.get("Tipo de residência")), ocupacao: null, condominio_fechado: null, lmi_basica: coberturas.find((c) => /^Inc[êe]ndio/i.test(c.descricao))?.valor ?? null },
  };
}
