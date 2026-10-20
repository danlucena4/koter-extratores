/**
 * ALLIANZ AUTO (carro, moto e caminhão), lida inteira sobre o texto do motor
 * novo. 15 PDFs da A vencer, 2026-10-20. Blocos:
 *
 *   SUAS INFORMAÇÕES          Segurado / CPF/CNPJ / Tel / E-mail / Endereço
 *                             ("R. X, 123 - BAIRRO - CIDADE/UF - 00000000")
 *   INFORMAÇÕES DO CONDUTOR   Nome + CPF, Idade, Estado Civil, "O principal
 *                             condutor reside em", 18 a 25, garagens (carro);
 *                             carga, alienação, região, garagem (caminhão)
 *   INFORMAÇÕES DO SEU SEGURO Vigência, Apólice Nº., Tipo de Seguro, Proposta,
 *                             Veículo, Emissão, Cód. FIPE, Placa, Produto,
 *                             Chassi, Zero Km, Ano/Modelo, Classe Bônus,
 *                             Categoria de Risco, Finalidade de Uso, Kit gás,
 *                             CEP Pernoite, Cód. CI
 *   INFORMAÇÕES DA RENOVAÇÃO  Apólice anterior, CI, seguradora, fim da vigência
 *   OFERTA ESCOLHIDA          coberturas (LMI | preço), Preço Líquido / Total
 *   FRANQUIA ...              franquia do casco e dos acessórios; vidros
 *   INFORMAÇÕES DE PAGAMENTO  forma e parcelas
 */
import { anosDaApolice, enderecoDaApolice, marcaEModelo as marcaEModeloAllianz } from "./allianz.js";
import {
  camposDaLinha,
  cep,
  chassi,
  cpfOuCnpj,
  data,
  datas,
  digitos,
  dinheiro,
  email,
  fipe,
  perguntasERespostas,
  placa,
  secao,
  simNao,
  tabelaPorValores,
  telefones,
  vazio,
} from "./leitura.js";
import { autoVazio, condutor, pessoaCom, type CoberturaExtraida, type DocumentoExtraido, type FranquiaExtraida } from "./modelo.js";

const ROT_SEGURADO = ["Segurado", "Nome", "CPF/CNPJ", "Tel", "E-mail", "Endereço"];
const ROT_CONDUTOR = ["Nome", "CPF", "Idade", "Estado Civil", "Condutor Principal utilizado", "Sistema de gerenciamento de risco", "Carga(s) selecionada(s)", "O principal condutor reside em"];
const ROT_SEGURO = [
  "Vigência", "Apólice Nº.", "Tipo de Seguro", "Proposta Nº.", "Nº da Proposta", "Veículo", "Emissão", "Cód. FIPE", "Ramo", "Placa", "Produto", "Chassi", "Versão",
  "Zero Km", "Condições Gerais", "Ano/Modelo", "Classe Bônus", "Categoria de Risco", "Grupo", "Finalidade de Uso", "Kit gás", "CEP Pernoite", "Cód. CI",
];
const ROT_RENOVACAO = ["Nº. Apólice Anterior", "Cód. CI", "Seguradora Anterior", "Fim da vigência anterior", "Veículo Igual ao Anterior"];

function quadro(linhas: readonly string[], rotulos: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const l of linhas) for (const [k, v] of camposDaLinha(l, rotulos)) if (!out.has(k) && v.trim().length > 0) out.set(k, v.trim());
  return out;
}

const NAO_E_COBERTURA = /^(Limite Máximo|Coberturas$|de Indenização|Página \d|Preço (Líquido|Total)|COMPLETO$|BÁSICO$|[A-ZÇÃÉÍÓÚ ]{3,25}$|\* |A tabela abaixo|de sinistro com|detalhes, consulte)/;
const ASSISTENCIA = /assist|guincho|reboque|km\b|servi[çc]os|socorro/i;

export function lerAutoAllianz(doc: DocumentoExtraido, linhas: readonly string[], numero: string): DocumentoExtraido | null {
  const blocoSeguro = secao(linhas, /^INFORMAÇÕES DO SEU SEGURO/i, /^OFERTA ESCOLHIDA/i, 30);
  const s = quadro(blocoSeguro, ROT_SEGURO);
  /* Apolice: "Apólice Nº."; proposta: "Nº da Proposta" (mesmo layout). */
  const impresso = digitos(s.get("Apólice Nº.")) || digitos(s.get("Nº da Proposta"));
  if (impresso.length < 8 || impresso.replace(/^0+/, "") !== digitos(numero).replace(/^0+/, "")) return null;
  const vig = datas(s.get("Vigência"));

  const blocoSeg = secao(linhas, /^SUAS INFORMAÇÕES/i, /^INFORMAÇÕES DO (CONDUTOR|SEU SEGURO)/i, 10);
  const seg = quadro(blocoSeg, ROT_SEGURADO);

  const blocoCond = secao(linhas, /^INFORMAÇÕES DO CONDUTOR PRINCIPAL/i, /^INFORMAÇÕES DO SEU SEGURO/i, 30);
  const c = quadro(blocoCond, ROT_CONDUTOR);
  const respostas = [
    ...perguntasERespostas(blocoCond),
    ...blocoCond
      .map((l) => /^(Deseja ampliar a cobertura.*?anos|O principal condutor reside em|Condutor Principal utilizado|Sistema de gerenciamento de risco|Carga\(s\) selecionada\(s\))\s*:\s*(.+)$/i.exec(l))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => ({ pergunta: m[1] as string, resposta: (m[2] as string).trim() })),
  ];
  const resp = (re: RegExp) => respostas.find((r) => re.test(r.pergunta))?.resposta ?? null;

  const blocoRen = secao(linhas, /^INFORMAÇÕES DA RENOVAÇÃO/i, /^OFERTA ESCOLHIDA/i, 8);
  const ren = quadro(blocoRen, ROT_RENOVACAO);

  /* Coberturas: da OFERTA ESCOLHIDA ate a FRANQUIA. O "*" de nota sai antes. */
  const blocoCob = secao(linhas, /^OFERTA ESCOLHIDA/i, /^FRANQUIA/i, 60).map((l) => l.replace(/\s\*\s/g, " ").replace(/\*(?=\s)/g, ""));
  const oferta = blocoCob.find((l) => /^[A-ZÇÃÉÍÓÚ ]{3,25}$/.test(l) && !/^OFERTA/.test(l)) ?? null;
  const coberturas: CoberturaExtraida[] = tabelaPorValores(blocoCob.slice(1), { ignorar: NAO_E_COBERTURA }).map((t) => {
    const [lmi, premio] = t.valores.length >= 2 ? [t.valores[0], t.valores[t.valores.length - 1]] : [null, t.valores[0]];
    return {
      descricao: t.descricao,
      valor: dinheiro(lmi),
      limite: lmi !== null && lmi !== undefined && dinheiro(lmi) === null ? lmi : null,
      premio: dinheiro(premio),
      franquia: null,
    };
  });
  const percentual = Number(/(\d{1,3})\s*%\s*FIPE/i.exec(coberturas.find((x) => /^Casco/i.test(x.descricao))?.limite ?? "")?.[1]);

  /* Franquias: casco/acessorios ("Franquia Valor (R$)") e a de vidros (duas por linha). */
  const blocoF = secao(linhas, /^Franquia\s+Valor \(R\$\)/i, /^ASSISTÊNCIA/i, 10).slice(1);
  const franquias: FranquiaExtraida[] = blocoF
    .map((l) => /^(.+?)\s+(\d[\d.]*,\d{2})$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => {
      const desc = m[1] as string;
      const tipo = /^(\d+%\s+da\s+\w+|Normal|Reduzida.*|Majorada.*)$/i.test(desc) ? desc : null;
      return { descricao: tipo !== null ? "Casco" : desc, tipo, valor: dinheiro(m[2]) };
    });
  for (const l of secao(linhas, /^ASSISTÊNCIA A VIDROS/i, /^(Sinistros de Vidros|INFORMAÇÕES DE PAGAMENTO)/i, 15)) {
    for (const m of l.matchAll(/([A-Za-zÀ-ú][A-Za-zÀ-ú/ ]+?)\s+(\d[\d.]*,\d{2})/g)) {
      const desc = (m[1] as string).trim();
      if (/^(Cobertura|Franquia)/i.test(desc)) continue;
      franquias.push({ descricao: desc, tipo: null, valor: dinheiro(m[2]) });
    }
  }

  const blocoPag = secao(linhas, /^INFORMAÇÕES DE PAGAMENTO/i, /^(Página|CONDIÇÕES|INFORMAÇÕES IMPORTANTES)/i, 15);
  const forma = blocoPag.find((l) => /^(Boleto|Cart[ãa]o|D[ée]bito|Carn[êe]|PIX)/i.test(l)) ?? null;
  const parcelas = Number(/em\s+(\d{1,2})\s+parcelas?/i.exec(blocoPag.join(" "))?.[1]);

  const veiculo = vazio(s.get("Veículo"));
  const anos = anosDaApolice(s.get("Ano/Modelo") ?? null);
  const mm = marcaEModeloAllianz(veiculo);
  const a = autoVazio();
  Object.assign(a.veiculo, {
    descricao: veiculo,
    marca: mm.marca,
    modelo: mm.modelo,
    ano_fabricacao: anos.fabricacao,
    ano_modelo: anos.modelo,
    placa: placa(s.get("Placa")),
    chassi: chassi(s.get("Chassi")),
    codigo_fipe: fipe(s.get("Cód. FIPE")),
    zero_km: simNao(s.get("Zero Km")),
    categoria: vazio(s.get("Categoria de Risco")),
    kit_gas: s.has("Kit gás") ? simNao(s.get("Kit gás")) : null,
    alienado: resp(/alienado/i) === null ? null : !/N[ãa]o/i.test(resp(/alienado/i) as string),
  });
  a.uso = vazio(s.get("Finalidade de Uso")) ?? vazio(s.get("Categoria de Risco"));
  a.percentual_fipe = Number.isFinite(percentual) && percentual > 0 ? percentual : null;
  a.cep_pernoite = cep(s.get("CEP Pernoite"));
  a.classe_bonus = /^\d{1,2}$/.test(s.get("Classe Bônus") ?? "") ? Number(s.get("Classe Bônus")) : null;
  a.ci = digitos(s.get("Cód. CI")).length >= 8 ? digitos(s.get("Cód. CI")) : null;
  a.questionario.respostas = respostas;
  a.questionario.tipo_residencia = vazio(c.get("O principal condutor reside em"));
  a.questionario.cobertura_18_25 = /^(Sim|N[ãa]o)\b/i.exec(resp(/ampliar a cobertura/i) ?? "")?.[1] ?? null;
  a.questionario.garagem_residencia = resp(/garagem na resid[êe]ncia|garagem quando n[ãa]o est[áa] em servi[çc]o/i);
  a.questionario.garagem_trabalho = resp(/garagem no trabalho/i);
  a.questionario.garagem_estudo = resp(/garagem na faculdade/i);
  const nomeCond = vazio(c.get("Nome"));
  a.condutor = condutor(
    { nome: nomeCond, documento: cpfOuCnpj(c.get("CPF")), estado_civil: vazio(c.get("Estado Civil")) },
    vazio(c.get("Condutor Principal utilizado")),
  );

  return {
    ...doc,
    produto: vazio(s.get("Produto")),
    tipo_seguro: vazio(s.get("Tipo de Seguro")),
    proposta: digitos(s.get("Proposta Nº.")) || null,
    emissao: data(s.get("Emissão")),
    vigencia_inicio: vig[0] ?? null,
    vigencia_fim: vig[1] ?? null,
    renovacao_de: ren.size === 0 ? null : { numero: digitos(ren.get("Nº. Apólice Anterior")) || null, seguradora: vazio(ren.get("Seguradora Anterior")) },
    segurado: pessoaCom({
      nome: vazio(seg.get("Segurado") ?? seg.get("Nome")),
      documento: cpfOuCnpj(seg.get("CPF/CNPJ")),
      email: email(seg.get("E-mail")),
      telefones: telefones(seg.get("Tel")),
      endereco: enderecoDaApolice(seg.get("Endereço") ?? null),
    }),
    coberturas,
    assistencias: coberturas.filter((x) => ASSISTENCIA.test(x.descricao)).map((x) => x.descricao),
    franquias,
    premio_liquido: dinheiro(linhas.find((l) => /^Preço Líquido R\$/i.test(l))),
    premio_total: dinheiro(linhas.find((l) => /^Preço Total/i.test(l))?.replace(/^.*?R\$/, "")),
    pagamento: forma === null && !Number.isFinite(parcelas) ? null : { forma: vazio(forma), parcelas: Number.isFinite(parcelas) ? parcelas : null },
    auto: a,
    ...(oferta === null ? {} : { produto: [vazio(s.get("Produto")), oferta].filter(Boolean).join(" - ") }),
  };
}

/**
 * ENDOSSO da Allianz (alteracao da apolice): traz o segurado, a vigencia e o
 * que mudou; as coberturas e o veiculo continuam os da apolice.
 */
export function lerEndossoAllianz(doc: DocumentoExtraido, linhas: readonly string[], numero: string): DocumentoExtraido | null {
  const i = linhas.findIndex((l) => /N[ºo°]\.?\s*da Apólice Endossada/i.test(l));
  const impresso = i < 0 ? "" : digitos(/(\d{10,})/.exec(`${linhas[i]} ${linhas[i + 1] ?? ""}`)?.[1]);
  if (impresso.length < 10 || impresso.replace(/^0+/, "") !== digitos(numero).replace(/^0+/, "")) return null;
  const blocoSeg = secao(linhas, /^SUAS INFORMAÇÕES/i, /^INFORMAÇÕES DO SEGURO/i, 8);
  const seg = quadro(blocoSeg, ["Nome", "CPF", "CNPJ", "E-mail", "Tel", "Endereço de correspondência", "CEP", "Bairro", "Cidade/UF"]);
  const cidadeUf = /^(.+?)\/([A-Z]{2})$/.exec(seg.get("Cidade/UF") ?? "");
  const vig = datas(linhas.find((l) => /^Vigência:/i.test(l)));
  const rua = /^(.+?),\s*(\d+\w*)\s*(?:,\s*(.+))?$/.exec(seg.get("Endereço de correspondência") ?? "");
  return {
    ...doc,
    proposta: digitos(linhas.map((l) => /Proposta:\s*(\d+)/.exec(l)?.[1]).find((x) => x !== undefined)) || null,
    emissao: data(linhas.find((l) => /^Emissão:/i.test(l))),
    vigencia_inicio: vig[0] ?? null,
    vigencia_fim: vig[1] ?? null,
    segurado: pessoaCom({
      nome: vazio(seg.get("Nome")),
      documento: cpfOuCnpj(seg.get("CPF") ?? seg.get("CNPJ")),
      email: email(seg.get("E-mail")),
      telefones: telefones(seg.get("Tel")),
      endereco: {
        cep: cep(seg.get("CEP")),
        logradouro: vazio(rua?.[1]),
        numero: vazio(rua?.[2]),
        complemento: vazio(rua?.[3]),
        bairro: vazio(seg.get("Bairro")),
        cidade: vazio(cidadeUf?.[1]),
        uf: cidadeUf?.[2] ?? null,
      },
    }),
    /* O que mudou, sem as linhas de cartao. */
    clausulas: secao(linhas, /^VEJA O QUE MUDOU/i, /^(Página|Importante:|PROCESSO SUSEP)/i, 15)
      .slice(1)
      .filter((l) => !/N[úu]mero:|\*{4}|Bandeira:/i.test(l)),
  };
}
