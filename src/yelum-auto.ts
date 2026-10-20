/**
 * YELUM / ALIRO AUTO (mesmo gerador), lida inteira sobre o texto do motor
 * novo, pelos QUADROS de "rotulos em cima, valores embaixo" (por coluna).
 * 7 PDFs Yelum + 5 Aliro, 2026-10-20.
 *
 *   DADOS DO(A) SEGURADO(A)  Nome | CPF/CNPJ ; Endereço ; Bairro | CEP | E-mail ;
 *                            Cidade | UF | Telefone/Fax
 *   DADOS DA APOLICE         Apólice | Endosso | Nº do Contrato | Proposta ;
 *                            Vigência | Data de Emissão | Itens
 *   DEMONSTRATIVO DE PRÊMIO  Prêmio Líquido | ... | Prêmio Total
 *   FORMA DE PAGAMENTO       Tipo de Cobrança ... ; Nº Parcelas
 *   DADOS DO VEÍCULO         FIPE | Marca/Tipo | Ano Fab/Mod ; Chassi | Placa |
 *                            Capacidade | Categoria ; Utilização | CEP Pernoite |
 *                            Tipo Franquia | CI ; Gravame | Antifurto | Isenção ;
 *                            Classe Bônus | Renovação da Apólice/Seguradora | Término
 *   COBERTURAS               Coberturas | LMI | Prêmio | Franquia
 *   DADOS DO PERFIL          condutor (nome, estado civil, nascimento, sexo, CPF,
 *                            vínculo), uso comercial, residentes 18/25, extensão
 *   DADOS DO PROPRIETÁRIO    nome, CPF, nascimento, sexo, vínculo
 *
 * O que ja era lido (veiculo, perfil) continua vindo de `lerApoliceYelum`.
 */
import {
  cep,
  cpfOuCnpj,
  data,
  datas,
  digitos,
  dinheiro,
  email,
  enderecoOuNulo,
  quadroPorColuna,
  ruaNumeroComplemento,
  tabelaPorColunas,
  telefones,
  vazio,
} from "./leitura.js";
import { autoVazio, condutor, pessoaCom, type CoberturaExtraida, type DocumentoExtraido } from "./modelo.js";
import type { LinhaPosicionada } from "./pdf/motor.js";
import { lerApoliceYelum } from "./yelum.js";

const ASSISTENCIA = /assist|guincho|reboque|socorro/i;

export function lerAutoYelum(doc: DocumentoExtraido, pos: readonly LinhaPosicionada[], numero: string): DocumentoExtraido | null {
  const linhas = pos.map((l) => l.texto);
  const y = lerApoliceYelum(linhas, numero);
  if (y === null) return null;
  const q = (rotulos: string[], linhasDeValor = 1) => quadroPorColuna(pos, rotulos, { linhasDeValor }) ?? new Map<string, string>();
  /* A primeira variante de cabecalho que existir (Yelum e Aliro arrumam os quadros diferente). */
  const qv = (...variantes: string[][]) => {
    for (const v of variantes) {
      const r = quadroPorColuna(pos, v);
      if (r !== null) return r;
    }
    return new Map<string, string>();
  };

  const segA = q(["Nome do(a) Segurado(a)", "CPF/CNPJ"]);
  const iEnd = linhas.findIndex((l) => /^Endereço$/i.test(l.trim()));
  const segB = qv(["Bairro", "CEP", "E-mail"], ["Bairro", "Cidade", "UF", "CEP"]);
  const segC = qv(["Cidade", "UF", "Telefone/Fax"], ["Bairro", "Cidade", "UF", "CEP"]);
  const segD = qv(["Telefone", "E-mail"]);
  const ap = q(["Apólice", "Endosso", "Nº do Contrato", "Proposta"]);
  const vigLinha = linhas.find((l) => /^Das\s+[\d:]+hs?\s+de\s+\d{2}\/\d{2}\/\d{4}/i.test(l));
  const vig = datas(vigLinha);
  const premio = qv(["Prêmio Líquido (R$)", "Adic. Frac. (R$)", "Custo Apólice (R$)", "IOF (R$)", "Prêmio Total (R$)"], ["Prêmio Líquido (R$)", "Custo Apólice (R$)", "Adic. Frac. (R$)", "IOF (R$)", "Prêmio Total (R$)"]);
  const pag = q(["Tipo de Cobrança", "Parcelas"]);
  const nParc = Number(/^(\d{1,2})\b/.exec(linhas[linhas.findIndex((l) => /^N[ºo°] Parcelas/i.test(l)) + 1] ?? "")?.[1]);
  const veiA = q(["Utilização", "Reg. Tarif/CEP Pernoite", "Tipo Franquia", "CI Atual"]);
  const veiB = quadroPorColuna(pos, ["Gravame/Alienação", "Antifurto", "Isenção Fiscal"]) ?? quadroPorColuna(pos, ["Gravame / Alienação", "Anti Furto", "Isenção Fiscal"]) ?? new Map();
  const ren = quadroPorColuna(pos, ["Classe Bônus", "Renovação da Apólice/Seguradora", "Término"]) ?? new Map();
  const perfilA = q(["Nome do Principal Condutor", "Estado Civil", "Data de Nascimento", "Idade", "Sexo"]);
  const perfilB = q(["CPF Condutor", "Vinculo c/ Segurado", "Uso do Veiculo"]);
  const prop = q(["Data Nascimento", "Idade", "Sexo", "Vínculo c/ Segurado"]);

  /* Coberturas. */
  const tabela = tabelaPorColunas(pos, ["Coberturas Contratadas", "LMI(R$)", "Prêmio(R$)", "Franquia(R$)"], /^(INFORMAÇÕES COMPLEMENTARES|RAMO DA COBERTURA)/i, {
    ignorar: /^(\d+\/\d+|Yelum Seguros|Yelum Auto|Aliro Seguro|Apólice - Ramo|complementares)/i,
  });
  const coberturas: CoberturaExtraida[] = tabela.map((t) => {
    const lmi = vazio(t.get("LMI(R$)"));
    const fr = vazio(t.get("Franquia(R$)"));
    return {
      descricao: vazio(t.get("Coberturas Contratadas")) ?? "",
      valor: dinheiro(lmi),
      limite: dinheiro(lmi) === null ? lmi : null,
      premio: dinheiro(t.get("Prêmio(R$)")),
      franquia: fr,
    };
  });
  const percentual = Number(/(\d{2,3})\s*%/.exec(coberturas.find((c) => /^BASICA/i.test(c.descricao))?.limite ?? "")?.[1]);

  const a = autoVazio();
  Object.assign(a.veiculo, {
    descricao: y.marca_modelo,
    /* A Yelum so imprime o modelo ("Marca/Tipo do Veículo" traz o modelo): a marca fica nula. */
    modelo: y.marca_modelo,
    codigo_fipe: y.codigo_fipe,
    ano_fabricacao: y.ano_fabricacao,
    ano_modelo: y.ano_modelo,
    chassi: y.chassi,
    placa: y.placa,
    categoria: y.categoria,
    alienado: veiB.get("Gravame/Alienação") ?? veiB.get("Gravame / Alienação") ? !/N[ÃA]O/i.test((veiB.get("Gravame/Alienação") ?? veiB.get("Gravame / Alienação")) as string) : null,
  });
  a.uso = y.uso;
  a.modalidade_casco = coberturas.some((c) => /VMR/i.test(c.limite ?? "")) ? "VMR" : null;
  a.percentual_fipe = Number.isFinite(percentual) && percentual > 0 ? percentual : null;
  a.cep_pernoite = y.cep_pernoite;
  a.cep_pernoite_prefixo = y.cep_pernoite_prefixo;
  a.classe_bonus = y.classe_bonus;
  a.ci = y.ci;
  a.antifurto = vazio(veiB.get("Antifurto") ?? veiB.get("Anti Furto"));
  Object.assign(a.questionario, {
    residentes_18_25: y.residentes_18_25,
    uso_comercial: y.uso_comercial,
    cobertura_18_25: y.cobertura_18_25,
    isencao_fiscal: y.isencao_fiscal,
  });
  a.condutor = condutor(
    {
      nome: y.condutor_nome ?? vazio(perfilA.get("Nome do Principal Condutor")),
      documento: y.condutor_cpf ?? cpfOuCnpj(perfilB.get("CPF Condutor")),
      nascimento: y.condutor_nascimento ?? data(perfilA.get("Data de Nascimento")),
      sexo: y.condutor_sexo ?? vazio(perfilA.get("Sexo")),
      estado_civil: y.condutor_estado_civil ?? vazio(perfilA.get("Estado Civil")),
    },
    y.condutor_vinculo ?? vazio(perfilB.get("Vinculo c/ Segurado")),
  );

  const renTxt = vazio(ren.get("Renovação da Apólice/Seguradora"));
  const mRen = renTxt === null ? null : /^([\d.]+)\s*\/\s*(.+?)(?:\s*\(\d+\))?$/.exec(renTxt);
  const vinculoProp = vazio(prop.get("Vínculo c/ Segurado"));
  const proprioSegurado = y.proprietario_e_o_segurado || /PROPRIO SEGURADO/i.test(vinculoProp ?? "");

  return {
    ...doc,
    proposta: digitos(ap.get("Proposta")) || null,
    emissao: data(vigLinha?.replace(/^.*?\d{2}\/\d{2}\/\d{4}.*?\d{2}\/\d{2}\/\d{4}/, "")),
    vigencia_inicio: vig[0] ?? null,
    vigencia_fim: vig[1] ?? null,
    renovacao_de: mRen === null ? null : { numero: digitos(mRen[1]) || null, seguradora: vazio(mRen[2]) },
    segurado: pessoaCom({
      nome: vazio(segA.get("Nome do(a) Segurado(a)")),
      documento: cpfOuCnpj(segA.get("CPF/CNPJ")),
      email: email(segB.get("E-mail") ?? segD.get("E-mail")),
      telefones: telefones(segC.get("Telefone/Fax") ?? segD.get("Telefone")),
      nascimento: proprioSegurado ? (y.proprietario_nascimento ?? data(prop.get("Data Nascimento"))) : null,
      sexo: proprioSegurado ? (y.proprietario_sexo ?? vazio(prop.get("Sexo"))) : null,
      endereco: enderecoOuNulo({
        cep: cep(segB.get("CEP")),
        ...ruaNumeroComplemento(iEnd < 0 ? null : linhas[iEnd + 1]),
        bairro: vazio(segB.get("Bairro")),
        cidade: vazio(segC.get("Cidade")),
        uf: /^[A-Z]{2}$/.test(segC.get("UF") ?? "") ? (segC.get("UF") as string) : null,
      }),
    }),
    coberturas,
    assistencias: coberturas.filter((c) => ASSISTENCIA.test(c.descricao)).map((c) => c.descricao),
    franquias: vazio(veiA.get("Tipo Franquia")) === null ? [] : [{ descricao: "Casco", tipo: vazio(veiA.get("Tipo Franquia")), valor: dinheiro(coberturas.find((c) => /^BASICA/i.test(c.descricao))?.franquia) }],
    premio_liquido: dinheiro(premio.get("Prêmio Líquido (R$)")),
    premio_total: dinheiro(premio.get("Prêmio Total (R$)")),
    pagamento: vazio(pag.get("Tipo de Cobrança")) === null && !Number.isFinite(nParc) ? null : { forma: vazio(pag.get("Tipo de Cobrança")), parcelas: Number.isFinite(nParc) ? nParc : null },
    auto: a,
  };
}
