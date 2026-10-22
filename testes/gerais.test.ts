/**
 * Dados gerais de residencial e vida (vigencia, premios, pagamento,
 * franquias, contatos, beneficiarios): linhas SINTETICAS na forma dos PDFs de
 * cobranca de 2026-10-20 (nomes, documentos e enderecos inventados).
 */
import { describe, expect, it } from "vitest";
import { dataPorExtenso, franquiasEntremeadas, parcelasDaGrade, telefone } from "../src/gerais.js";
import { geraisResidencialAllianz } from "../src/allianz-residencial.js";
import { geraisResidencialHdi } from "../src/hdi-residencial.js";
import { geraisResidencialMapfre } from "../src/mapfre-residencial.js";
import { geraisResidencialPorto } from "../src/porto-residencial.js";
import { geraisResidencialTokio } from "../src/tokio-residencial.js";
import { geraisVidaAllianz } from "../src/allianz-vida.js";
import { geraisVidaMapfre } from "../src/mapfre-vida.js";
import { geraisVidaYelum } from "../src/yelum-vida.js";
import { extrairDocumento } from "../src/documento.js";
import { posicionarTexto } from "../src/leitura.js";

describe("pecas", () => {
  it("data por extenso", () => {
    expect(dataPorExtenso("São Paulo, 15 de Julho de 2026 .")).toEqual({ iso: "2026-07-15", original: "15 de Julho de 2026" });
    expect(dataPorExtenso("Bahia, 7 de março de 2026")?.iso).toBe("2026-03-07");
    expect(dataPorExtenso("15 de Brumário de 2026")).toBeNull();
  });

  it("telefone: DDD com zeros, 55 do pais, sem DDD e invalido", () => {
    expect(telefone("(0071)992211473")).toBe("71992211473");
    expect(telefone("5571991234567")).toBe("71991234567");
    expect(telefone("71 21051234")).toBe("7121051234");
    expect(telefone("33221234")).toBeNull();
    expect(telefone("1111111111")).toBeNull();
  });

  it("parcelas pela grade, so com a sequencia completa", () => {
    expect(parcelasDaGrade(["01 R$ 70,39 20/07/2026 03 R$ 70,39 20/09/2026", "02 R$ 70,39 20/08/2026 04 R$ 70,39 20/10/2026"])).toBe(4);
    expect(parcelasDaGrade(["01ª 520,02 15/10/2026 Carnê", "02ª 520,02 10/11/2026 Carnê"])).toBe(2);
    expect(parcelasDaGrade(["1 14/02/2026 86,91 3 20/04/2026 86,91"])).toBeNull();
  });

  it("franquia entremeada com o nome da cobertura (Porto)", () => {
    const bloco = [
      "INCÊNDIO, EXPLOSÃO, IMPLOSÃO, FUMAÇA E",
      "Não há",
      "QUEDA DE AERONAVE",
      "RC FAMILIAR Não há",
      "DANOS ELÉTRICOS 10% das indenizações com mínimo de R$600,00.",
      "10% das indenizações com mínimo de",
      "VAZAMENTO DE TANQUES OU TUBULAÇÕES",
      "R$1.000,00.",
    ];
    const coberturas = ["INCÊNDIO, EXPLOSÃO, IMPLOSÃO, FUMAÇA E QUEDA DE AERONAVE", "RC FAMILIAR", "DANOS ELÉTRICOS", "VAZAMENTO DE TANQUES OU TUBULAÇÕES"];
    const re = /N[ãa]o h[áa]|\d+%\s+das indeniza[çc][õo]es com m[íi]nimo de\s*(?<vao>(?:(?!R\$|N[ãa]o h[áa]).)*?)\s*R\$\s*(?<minimo>[\d.]+,\d{2})\.?/;
    const f = franquiasEntremeadas(bloco, coberturas, re);
    expect(f.map((x) => [x.descricao, x.tipo, x.valor?.centavos ?? null])).toEqual([
      [coberturas[0], "Não há", null],
      ["RC FAMILIAR", "Não há", null],
      ["DANOS ELÉTRICOS", "10% das indenizações com mínimo de R$600,00", 60000],
      ["VAZAMENTO DE TANQUES OU TUBULAÇÕES", "10% das indenizações com mínimo de R$1.000,00", 100000],
    ]);
    /* Nome que nao e cobertura conhecida: nada (nunca uma franquia na cobertura errada). */
    expect(franquiasEntremeadas(bloco, coberturas.slice(1), re)).toEqual([]);
  });
});

describe("residencial MAPFRE", () => {
  const linhas = [
    "MAPFRE RESIDENCIAL 31800",
    "Ramo: 014 Produto: 405 Nº Apólice : 1234567890123",
    "Vigência início 24h do dia: 29/07/2026 Término 24h do dia: 29/07/2027",
    "Renova apólice Nº: 1234567890000",
    "Nº Proposta: 54806000000000001",
    "DADOS DO SEGURADO",
    "Nome: FULANA DE TAL",
    "Telefone residencial: 7133331234 Telefone celular: 71988881234",
    "QUESTIONÁRIO DE AVALIAÇÃO DE RISCO",
    "Descrição do Risco: CASA HABITUAL - COND. FECHADO",
    "Tempo de Experiência: 2 ANOS",
    "Tipo de Seguro: RENOVAÇÃO MAPFRE SEM SINISTRO",
    "O imóvel esta desabitado/desocupado? NAO",
    "Cláusula Valor de Novo? SIM",
    "COBERTURAS CONTRATADAS E VALORES MÁXIMOS DE INDENIZAÇÃO",
    "Custo de Assistência: R$ 45,76 PERFIL: TOP PLUS",
    "FRANQUIAS",
    "Nome Valor (R$) Participação",
    "FRANQUIA DANOS ELÉTRICOS E QUEDA DE RAIO FORA DO 500,00 10",
    "TERRENO SEGURADO",
    "3",
    "112251 1234567890123 16/07/2026 001 5 405 00000000001 1",
    "FRANQUIA ROMPIMENTO DE TUBULAÇÕES 1.000,00 15",
    "FRANQUIA: A participação obrigatória do segurado",
    "Prêmio líquido: 592,36 Encargos: 0,00",
    "IOF: 43,70 Prêmio: 636,06",
    "Forma: FICHA DE COMPENSACAO Nº de parcela: 10",
    "São Paulo, 15 de Julho de 2026 .",
  ];

  it("vigencia, renovacao, premios, pagamento, franquias, questionario e emissao", () => {
    const g = geraisResidencialMapfre(linhas);
    expect([g.produto, g.proposta, g.tipo_seguro, g.renovacao_de?.numero]).toEqual(["405", "54806000000000001", "RENOVAÇÃO MAPFRE SEM SINISTRO", "1234567890000"]);
    expect([g.vigencia_inicio?.iso, g.vigencia_fim?.iso, g.emissao?.iso]).toEqual(["2026-07-29", "2027-07-29", "2026-07-15"]);
    expect([g.premio_liquido?.centavos, g.premio_total?.centavos]).toEqual([59236, 63606]);
    expect(g.pagamento).toEqual({ forma: "FICHA DE COMPENSACAO", parcelas: 10 });
    expect(g.franquias.map((f) => [f.descricao, f.tipo, f.valor?.centavos])).toEqual([
      ["DANOS ELÉTRICOS E QUEDA DE RAIO FORA DO TERRENO SEGURADO", "10%", 50000],
      ["ROMPIMENTO DE TUBULAÇÕES", "15%", 100000],
    ]);
    expect(g.segurado.telefones).toEqual(["7133331234", "71988881234"]);
    expect(g.residencial.plano_assistencia).toBe("TOP PLUS");
    expect(g.residencial.valor_de_novo).toBe(true);
    expect(g.residencial.respostas?.map((r) => r.pergunta)).toEqual(["Tempo de Experiência", "O imóvel esta desabitado/desocupado?", "Cláusula Valor de Novo?"]);
  });

  it("extrairDocumento junta os gerais: premio e franquia por cobertura", () => {
    const doc = extrairDocumento([
      ...linhas.slice(0, 15),
      "Cobertura Valor (R$) Prêmio líquido (R$)",
      "BÁSICA (INCÊNDIO, QUEDA DE RAIO) 300.000,00 100,00",
      "DANOS ELÉTRICOS E QUEDA DE RAIO FORA DO 20.000,00 26,08",
      "TERRENO SEGURADO",
      "ASSISTENCIA DOMICILIAR 0,00 45,76",
      "Este seguro garante a cobertura dos riscos",
      ...linhas.slice(15),
    ]);
    expect([doc?.seguradora, doc?.ramo, doc?.numero_apolice]).toEqual(["mapfre", "residencial", "1234567890123"]);
    expect(doc?.coberturas.map((c) => [c.descricao, c.premio?.centavos, c.franquia])).toEqual([
      ["BÁSICA (INCÊNDIO, QUEDA DE RAIO)", 10000, null],
      ["DANOS ELÉTRICOS E QUEDA DE RAIO FORA DO TERRENO SEGURADO", 2608, "500,00 (10%)"],
    ]);
    expect(doc?.residencial).toMatchObject({ condominio_fechado: true, plano_assistencia: "TOP PLUS", valor_de_novo: true, lmi_basica: { centavos: 30000000 } });
    expect([doc?.vigencia_inicio?.iso, doc?.premio_total?.centavos, doc?.pagamento?.parcelas]).toEqual(["2026-07-29", 63606, 10]);
    expect(doc?.segurado?.nome).toBe("FULANA DE TAL");
  });
});

describe("residencial HDI", () => {
  const linhas = [
    "HDI SEGUROS S.A.",
    "HDI Duo - SALVADOR",
    "Apólice 01.052.205.000001",
    "Renovação Versão: 09.88.00 (2a via)",
    "Nome de Registro do Segurado: FULANA DE TAL",
    "Email : FULANA@EXEMPLO.COM",
    "CPF : 111.444.777-35",
    "Endereço : Rua das Flores, 12 / Apt 3Telefone : (0071)33331234",
    "Bairro : Centro",
    "Cidade : Salvador - BA CEP : 40000-000",
    "Corretor",
    "Moeda: R$ Proposta: 1129275592",
    "Cotação Base: 1,0000 Vigência: das 24h do dia 22/01/2026 às 24h do dia 22/01/2027 ( 365 dias)",
    "Ramo: 0114 - Compreensivo Residencial",
    "Prêmio da Apólice",
    "Prêmio Líquido : R$ 174,08",
    "Prêmio Total : R$ 186,93",
    "Parcelamento do Prêmio",
    "Para a validade do presente contrato, emitido as 08:21:11, do dia 19/01/2026, a SEGURADORA",
    "Dados de Cobrança",
    "Banco: 033 Tipo de Cobrança: Carnê",
    "Parcela 15,57 Forma de Pagamento: 12 x",
    "Multa de Mora: 2,00%",
    "LMG - Limite máximo de garantia da apolice ( R$ 33.000,00 )",
    "OCUPAÇÃO : Residencia Habitual Casa (10000)",
    "TIPO DE CONSTRUÇÃO : Alvenaria (superior) (1)",
    "BEM SEGURADO : Predio e Conteudo (003)",
    "ANOS DE BÔNUS : 02 Anos",
    "Coberturas (Valores em R$) L.M.I. Prêmio Líquido",
    "Incendio 30.000,00 16,66",
    "Clausula Especifica de Valor Novo 0,00 3,94",
    "Coberturas de Assistencias Especial 0,00 136,34",
    "Franquias",
    "Incendio",
    "10% Sobre os Prejuizos Indenizaveis, com o Minimo de R$ 350,00 para Queda de Raio.",
    "Responsabilidade Civil Familiar",
    "Sem Franquia",
    "Se previsto na cobertura",
  ];

  it("produto, tipo, segurado (nome, endereco, contato), cobranca, risco e franquias", () => {
    const g = geraisResidencialHdi(linhas);
    expect([g.produto, g.tipo_seguro, g.proposta, g.emissao?.iso]).toEqual(["HDI Duo", "Renovação", "1129275592", "2026-01-19"]);
    expect([g.vigencia_inicio?.iso, g.vigencia_fim?.iso, g.premio_liquido?.centavos, g.premio_total?.centavos]).toEqual(["2026-01-22", "2027-01-22", 17408, 18693]);
    expect(g.pagamento).toEqual({ forma: "Carnê", parcelas: 12 });
    expect(g.segurado).toMatchObject({ nome: "FULANA DE TAL", documento: "11144477735", email: "fulana@exemplo.com", telefones: ["7133331234"] });
    expect(g.segurado.endereco).toEqual({ cep: "40000000", logradouro: "Rua das Flores", numero: "12", complemento: "Apt 3", bairro: "Centro", cidade: "Salvador", uf: "BA" });
    expect(g.residencial).toMatchObject({ tipo_construcao: "Alvenaria (superior)", bem_segurado: "Predio e Conteudo", bonus: "02 Anos", plano_assistencia: "Especial", valor_de_novo: true, lmg: { centavos: 3300000 } });
    expect(g.franquias.map((f) => [f.descricao, f.tipo, f.valor?.centavos ?? null])).toEqual([
      ["Incendio", "10% Sobre os Prejuizos Indenizaveis, com o Minimo de R$ 350,00 para Queda de Raio", 35000],
      ["Responsabilidade Civil Familiar", "Sem Franquia", null],
    ]);
  });
});

describe("residencial Porto", () => {
  const linhas = [
    "Seguro Residencial Habitual",
    "Apólice: *Renovação* Número da proposta: 19 16000001",
    "Número da apólice: 114 04 4000001 Ramo: 114",
    "Vigência: A partir das 24h do dia 07/07/2026 até as 24h do dia 07/07/2027.",
    "DADOS DO SEGURADO",
    "Telefone: 71 33331234 Celular: 71 988881234",
    "E-mail: fulana@exemplo.com",
    "DADOS DO CORRETOR",
    "Telefone: 71 21050000",
    "PARTICIPAÇÃO OBRIGATÓRIA DO SEGURADO",
    "RC FAMILIAR Não há",
    "DANOS ELÉTRICOS 10% das indenizações com mínimo de R$600,00.",
    "SERVIÇOS CONTRATADOS",
    "PLANO ESSENCIAL - GRATUITO APARTAMENTO",
    "QUESTIONÁRIO",
    "A residencia encontra-se localizada em condomínio horizontal?: Não",
    "Deseja Contratar Indenização a Valor de Novo(Sem aplicação de depreciação) ?: Sim",
    "INFORMAÇÕES ADICIONAIS",
    "VALORES DO SEGURO",
    "Preço líquido das coberturas R$ 128,87",
    "Preço líquido do plano de serviços R$ 152,04",
    "PREÇO TOTAL DO SEGURO R$ 301,64",
    "DADOS DO PAGAMENTO",
    "FORMA DE PAGAMENTO",
    "DÉBITO EM CONTA Banco: 000 Agência: 0000 Conta: 0000-0",
    "PARCELAMENTO DO SEGURO",
    "01 R$ 75,41 20/07/2026 02 R$ 75,41 20/08/2026",
    "INFORMAÇÕES E CLÁUSULAS GERAIS",
    "Bahia, 7 de julho de 2026",
    "Local e data de emissão",
  ];

  it("contatos do segurado (nao do corretor), questionario, premio com o plano de servicos e emissao", () => {
    const g = geraisResidencialPorto(linhas, ["RC FAMILIAR", "DANOS ELÉTRICOS"]);
    expect([g.produto, g.tipo_seguro, g.proposta]).toEqual(["Seguro Residencial Habitual", "Renovação", "1916000001"]);
    expect([g.vigencia_inicio?.iso, g.vigencia_fim?.iso, g.emissao?.iso]).toEqual(["2026-07-07", "2027-07-07", "2026-07-07"]);
    expect([g.premio_liquido?.centavos, g.premio_total?.centavos]).toEqual([28091, 30164]);
    expect(g.pagamento).toEqual({ forma: "DÉBITO EM CONTA", parcelas: 2 });
    expect(g.segurado).toMatchObject({ telefones: ["7133331234", "71988881234"], email: "fulana@exemplo.com" });
    expect(g.residencial).toMatchObject({ condominio_fechado: false, valor_de_novo: true, plano_assistencia: "PLANO ESSENCIAL - GRATUITO APARTAMENTO" });
    expect(g.franquias.map((f) => f.tipo)).toEqual(["Não há", "10% das indenizações com mínimo de R$600,00"]);
  });
});

describe("residencial Tokio", () => {
  it("vigencia, item, emissao, construcao, valor de novo, LMG e franquias", () => {
    const g = geraisResidencialTokio(
      [
        "Tokio Marine Residencial - Apólice de Seguro",
        "Vigência: a partir das 24 horas do dia 02/10/2026 até às 24 horas do dia 02/10/2027",
        "Ramo: 01.14 Apólice: 04000001 Negócio: 178000000 Item: 196000000",
        "Tipo de Seguro: Renovação Congênere sem sinistro Classe de Bônus: 1",
        "Data da Emissão: 08/10/2026 Data da Versão: 28/09/2026",
        "E-mail: fulana@exemplo.com",
        "Celular: (75) 98888-1234 Telefone:",
        "Tipo de Construção: Alvenaria Tipo de Imóvel: Casa em Condomínio",
        "Tipo de Cobertura: Prédio + Conteúdo",
        "Tipo de Indenização: Valor de Novo",
        "Assistência 24 horas Plano Vip 515,79",
        "Prêmio Líquido Total: 1.937,13",
        "Limite Máximo de Garantia: R$ 5.230.000,00",
        "Cobertura P.O.S",
        "Quebra de Vidros, Espelhos, Mármores e 10% dos prejuízos indenizáveis com mínimo de",
        "Granitos R$ 150,00",
        "Esta Apólice não cobre",
        "Prêmio Total: R$ 2.080,08 Cobrança: Carnê",
        "Parcela Valor (R$) Vencimento Forma de Pagamento",
        "01ª 520,02 15/10/2026 Carnê",
        "Após o vencimento da parcela",
      ],
      ["Quebra de Vidros, Espelhos, Mármores e Granitos"],
    );
    expect([g.produto, g.item, g.tipo_seguro, g.emissao?.iso]).toEqual(["Tokio Marine Residencial", "196000000", "Renovação Congênere sem sinistro", "2026-10-08"]);
    expect([g.vigencia_fim?.iso, g.premio_liquido?.centavos, g.premio_total?.centavos]).toEqual(["2027-10-02", 193713, 208008]);
    expect(g.pagamento).toEqual({ forma: "Carnê", parcelas: 1 });
    expect(g.residencial).toMatchObject({ tipo_construcao: "Alvenaria", bem_segurado: "Prédio + Conteúdo", plano_assistencia: "Plano Vip", valor_de_novo: true, bonus: "1", lmg: { centavos: 523000000 } });
    expect(g.franquias).toEqual([
      { descricao: "Quebra de Vidros, Espelhos, Mármores e Granitos", tipo: "10% dos prejuízos indenizáveis com mínimo de R$ 150,00", valor: { centavos: 15000, moeda: "BRL", original: "150,00" } },
    ]);
  });
});

describe("residencial Allianz", () => {
  it("produto, contratacao, LMG, pagamento, clausulas e condominio pelo tipo", () => {
    const g = geraisResidencialAllianz([
      "SUAS INFORMAÇÕES",
      "Nome: FULANA DE TAL",
      "CPF/CNPJ: 111.444.777-35 Tel: 5571988881234 E-mail: fulana@exemplo.com",
      "Produto | Ramo: 14 - Residência Digital Tipo de residência: Casa Condomínio Veraneio Alvenaria",
      "Tipo de Seguro: Renovação Allianz",
      "Tipo de contratação: Prédio+Conteúdo Limite máximo de garantia da Apólice: R$ 3.620.000,00",
      "Há Telhado de Isopainel?: Não",
      "Proposta Nº: 135000001 Apólice Nº: 5177202563140000001",
      "Data de emissão: 27/10/2025 Versão da tabela: 43 Condições gerais: 10/2025",
      "Vigência: das 24H de 27/10/2025 às 24H de 27/10/2026",
      "Assistência 24h VIP R$ 403,17",
      "Forma de pagamento",
      "Boleto Bancário Preço líquido: R$ 2.254,35 Taxa mensal juros: 0,00",
      "em 4 parcelas IOF: R$ 166,37",
      "Total a pagar",
      "R$ 2.420,72",
      "CLÁUSULAS",
      "Cláusula Indenização à valor de novo",
      "Página 4 de 6",
    ]);
    expect([g.produto, g.tipo_seguro, g.proposta, g.emissao?.iso, g.vigencia_inicio?.iso]).toEqual(["14 - Residência Digital", "Renovação Allianz", "135000001", "2025-10-27", "2025-10-27"]);
    expect([g.premio_liquido?.centavos, g.premio_total?.centavos, g.pagamento]).toEqual([225435, 242072, { forma: "Boleto Bancário", parcelas: 4 }]);
    expect(g.segurado).toMatchObject({ telefones: ["71988881234"], email: "fulana@exemplo.com" });
    expect(g.clausulas).toEqual(["Cláusula Indenização à valor de novo"]);
    expect(g.residencial).toMatchObject({
      bem_segurado: "Prédio+Conteúdo",
      tipo_construcao: "Alvenaria",
      condominio_fechado: true,
      valor_de_novo: true,
      plano_assistencia: "VIP",
      lmg: { centavos: 362000000 },
      respostas: [{ pergunta: "Há Telhado de Isopainel?", resposta: "Não" }],
    });
  });

  it("endosso sem cobranca: preco 0,00 e 'Selecione' nao viram premio nem forma", () => {
    const g = geraisResidencialAllianz(["Forma de pagamento", "Selecione Preço líquido: R$ 0,00 Taxa mensal juros: 0,00", "em 1 parcela IOF: R$ 0,00", "Total a pagar", "R$ 0,00"]);
    expect([g.premio_liquido, g.premio_total, g.pagamento]).toEqual([null, null, { forma: null, parcelas: 1 }]);
  });
});

describe("vida", () => {
  it("MAPFRE: premio mensal, periodicidade, prazo e beneficiarios sem o nome quebrado", () => {
    const g = geraisVidaMapfre([
      "APÓLICE DE SEGURO - MAPFRE VIDA VOCE MULTIFLEX",
      "Nº da Proposta: 009012600000001",
      "Nº da Apólice: 6008000000001 Data/Hora Emissão da Apólice: 10/06/2026 16:54",
      "Data de Início de Vigência Apólice 24h do dia: 11/05/2026 Término de Vigência Apólice 24h do dia: 11/05/2031",
      "DADOS DO(A) SEGURADO TITULAR",
      "Telefone Celular: 71988881234",
      "ENDEREÇO RESIDENCIAL DO SEGURADO",
      "Benefícios Custo",
      "SORTEIO MENSAL Gratuito",
      "MAPFRE Cuidando de Você Gratuito",
      "OBSERVAÇÕES",
      "BENEFICIÁRIO(S)",
      "FULANO",
      "FÍSICA 111.444.777-35 DE TAL 28/11/1962 PAI 50%",
      "SOBRINHO",
      "FÍSICA 529.982.247-25 01/02/1965 MÃE 50%",
      "O(s) beneficiário(s) poderá(ão) ser indicado(s)",
      "Prêmio Mensal Líquido: R$ 25,97 IOF: R$ 0,10 Prêmio Mensal Total: R$ 26,07",
      "Forma de Pagamento: DEBITO Periodicidade: MENSAL Dia de vencimento: 30",
      "Prazo de Pagamento: 60 parcelas",
    ]);
    expect([g.produto, g.proposta, g.emissao?.iso, g.vigencia_inicio?.iso]).toEqual(["MAPFRE VIDA VOCE MULTIFLEX", "009012600000001", "2026-06-10", "2026-05-11"]);
    expect([g.premio_liquido?.centavos, g.premio_total?.centavos, g.pagamento]).toEqual([2597, 2607, { forma: "DEBITO", parcelas: 60 }]);
    expect(g.vida.periodicidade_premio).toBe("MENSAL");
    expect(g.assistencias).toEqual(["MAPFRE Cuidando de Você"]);
    expect(g.segurado.telefones).toEqual(["71988881234"]);
    expect(g.vida.beneficiarios).toEqual([
      { nome: null, documento: "11144477735", nascimento: { iso: "1962-11-28", original: "28/11/1962" }, parentesco: "PAI", percentual: 50 },
      { nome: null, documento: "52998224725", nascimento: { iso: "1965-02-01", original: "01/02/1965" }, parentesco: "MÃE", percentual: 50 },
    ]);
  });

  it("Allianz: vigencia anual, premio anual, assistencias e beneficiario pela coluna", () => {
    const pos = posicionarTexto([
      "Nº. da Proposta: 131000001",
      "SEGURADO: FULANO DE TAL",
      "BAIRRO: CENTRO TELEFONE: 71988881234",
      "E-MAIL: FULANO@EXEMPLO.COM",
      "TIPO DE SEGURO: Seguro Novo RAMO: 91 - Vida Individual",
      "PRODUTO: Vida Individual",
      "VIGÊNCIA ANUAL: das 24H de 04/02/2026 às 24H de 04/02/2027",
      "CAPITAL PRÊMIO ANUAL",
      "ASSISTÊNCIAS (R$)",
      "PRONTO ATENDIMENTO VIRTUAL",
      "Funeral Ampliada R$ 7.000,00",
      "INFORMAÇÕES DE PAGAMENTO",
      "Forma de Pagamento: Boleto Bancário",
      "Prêmio Líquido: R$ 865,97 Taxa mensal juros: 0,00%",
      "1 14/02/2026 86,91 2 20/03/2026 86,91",
      "Total a Pagar: R$ 869,26",
      "BENEFICIÁRIOS",
      "NOME                                    PARENTESCO          PARTICIPAÇÃO",
      "(%)",
      "FULANA DE",
      "TAL",
      "NOME SOCIAL DO BENEFICIÁRIO:         O cônjuge do segurado           100,00",
      "FULANA DE TAL",
      "Página 2 de 9",
      "SALVADOR, 14 de Janeiro de 2026",
    ]);
    const g = geraisVidaAllianz(pos);
    expect([g.produto, g.tipo_seguro, g.proposta, g.emissao?.iso]).toEqual(["Vida Individual", "Seguro Novo", "131000001", "2026-01-14"]);
    expect([g.vigencia_inicio?.iso, g.vigencia_fim?.iso, g.premio_liquido?.centavos, g.premio_total?.centavos]).toEqual(["2026-02-04", "2027-02-04", 86597, 86926]);
    expect(g.pagamento).toEqual({ forma: "Boleto Bancário", parcelas: 2 });
    expect(g.assistencias).toEqual(["PRONTO ATENDIMENTO VIRTUAL", "Funeral Ampliada"]);
    expect(g.segurado).toMatchObject({ email: "fulano@exemplo.com", telefones: ["71988881234"] });
    expect(g.vida).toEqual({
      periodicidade_premio: "ANUAL",
      beneficiarios: [{ nome: "FULANA DE TAL", documento: null, nascimento: null, parentesco: "O cônjuge do segurado", percentual: 100 }],
    });
  });

  it("Yelum: quadros por coluna, renovacao, cobranca, UF e beneficiario", () => {
    const pos = posicionarTexto([
      "Yelum Vida Mais Tranquila",
      "Apólice - Ramo 91 Vida",
      "Bairro Cidade UF CEP",
      "CENTRO CIDADE PB 58000-000",
      "Telefone 1           Telefone 2           E-mail",
      "(84) 98888-1234      (84) 3333-1234       FULANO@EXEMPLO.COM",
      "Apólice                Endosso      Nº do Contrato    Proposta",
      "91.35.2026.0000001                  78000000/1        11000001",
      "Vigência do Seguro                                        Data de Emissão    Data da 1ª Contratação do Seguro",
      "Das 24:00hs de 25/09/2026 às 24:00hs de 25/09/2027        14/08/2026         25/09/2020",
      "Prêmio Líquido (R$) Adic. Frac. (R$) Custo Apólice (R$) IOF (R$) Prêmio Total (R$) Juros (%)",
      "168,02              0,00             0,00               0,64     168,66            0,00",
      "Tipo de Cobrança Parcelas Banco Ag. C/C Vencimento Valor (R$)",
      "CARTÃO DE CRÉDITO 0001 26/09/2026 13,96",
      "Nº Parcelas 0002 26/10/2026 14,06",
      "12 0003 26/11/2026 14,06",
      "Data de Nascimento    Renova Apólice Nº     Seguradora",
      "12/11/1990            913520250000001       YELUM SEGUROS S.A. (5185)",
      "DADOS DO(S) BENEFICIÁRIO(S)",
      "FULANA DE TAL 100% PAIS",
      "DADOS DO CORRETOR",
    ]);
    const g = geraisVidaYelum(pos);
    expect([g.produto, g.proposta, g.emissao?.iso, g.vigencia_inicio?.iso, g.vigencia_fim?.iso]).toEqual(["Yelum Vida Mais Tranquila", "11000001", "2026-08-14", "2026-09-25", "2027-09-25"]);
    expect([g.premio_liquido?.centavos, g.premio_total?.centavos, g.pagamento]).toEqual([16802, 16866, { forma: "CARTÃO DE CRÉDITO", parcelas: 12 }]);
    expect(g.renovacao_de).toEqual({ numero: "913520250000001", seguradora: "YELUM SEGUROS S.A. (5185)" });
    expect(g.segurado).toMatchObject({ email: "fulano@exemplo.com", telefones: ["84988881234", "8433331234"], endereco: { uf: "PB" } });
    expect(g.vida.beneficiarios).toEqual([{ nome: "FULANA DE TAL", documento: null, nascimento: null, parentesco: "PAIS", percentual: 100 }]);
  });
});
