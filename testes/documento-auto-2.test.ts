/**
 * `extrairDocumento` por seguradora (continuação): Allianz, Yelum, Tokio,
 * Zurich, Bradesco, HDI, endossos e propostas. Documentos SINTETICOS.
 */
import { describe, expect, it } from "vitest";
import { extrairDocumento } from "../src/documento.js";

describe("Allianz auto", () => {
  const linhas = [
    "APÓLICE",
    "ALLIANZ",
    "Página 1 de 5 Nº Apólice: 5177202612345678901",
    "SUAS INFORMAÇÕES",
    "Segurado: FULANA DE TAL",
    "CPF/CNPJ: 111.444.777-35 Tel: 71999991234 E-mail: fulana@exemplo.com",
    "Endereço: R. DAS FLORES, 120, APTO 3 - CENTRO - SALVADOR/BA - 40000000",
    "INFORMAÇÕES DO CONDUTOR PRINCIPAL",
    "Nome: FULANA DE TAL CPF: 111.444.777-35",
    "Idade: 36 Estado Civil: Casado(a)",
    "O principal condutor reside em: Apartamento",
    "Deseja ampliar a cobertura do seguro para condutores do veículo segurado com idade entre 18 a 25 anos: Não, estou",
    "Mantém o veículo em garagem na residência? Sim, mantém o veículo segurado em garagem",
    "INFORMAÇÕES DO SEU SEGURO",
    "Vigência: das 24H de 10/01/2026 às 24H de 10/01/2027 Apólice Nº.: 5177202612345678901",
    "Tipo de Seguro: Renovação Allianz sem sinistro Proposta Nº.: 123456789",
    "Veículo: TOYOTA COROLLA CROSS XRE 2.0 Flex Aut. Emissão: 06/01/2026",
    "Cód. FIPE: 002204-0 Ramo: 31 - Automóvel",
    "Placa: ABC1D23 Produto: Automoveis 2025",
    "Chassi: 9BRK4AAG0R1234567 Versão: 123",
    "Zero Km: Não Condições Gerais: 01/2025",
    "Ano/Modelo: 2024 Classe Bônus: 10",
    "Finalidade de Uso: Particular Cód. CI: 12345678901234",
    "Kit gás: Não",
    "CEP Pernoite: 40000-000",
    "INFORMAÇÕES DA RENOVAÇÃO",
    "Nº. Apólice Anterior: 1234567 Cód. CI: 12345678901234",
    "Seguradora Anterior: 5177 Fim da vigência anterior: 10/01/2026",
    "OFERTA ESCOLHIDA",
    "COMPLETO",
    "Casco - Básica Compreensiva - Colisão, Incêndio, Roubo e",
    "100% FIPE * R$ 900,00",
    "Furto",
    "RCF* - Danos Materiais R$ 100.000,00 R$ 400,00",
    "Assistência 24 hs Plano 3 R$ 1.200,00",
    "Preço Líquido R$ 2.308,42",
    "Preço Total (IOF + Juros inclusos) R$ 2.478,77",
    "FRANQUIA - PARTICIPAÇÃO OBRIGATÓRIA",
    "Franquia Valor (R$)",
    "50% da Normal 3.000,00",
    "ASSISTÊNCIA 24H",
    "INFORMAÇÕES DE PAGAMENTO",
    "Forma de pagamento",
    "Débito em conta bancária",
    "em 6 parcelas",
  ];

  it("le seguro, condutor, questionario, renovacao, coberturas e franquia", () => {
    const d = extrairDocumento(linhas);
    expect([d?.seguradora, d?.tipo, d?.numero_apolice, d?.tipo_seguro]).toEqual(["allianz", "apolice", "5177202612345678901", "Renovação Allianz sem sinistro"]);
    expect(d?.segurado).toMatchObject({ nome: "FULANA DE TAL", email: "fulana@exemplo.com" });
    expect(d?.segurado?.endereco).toMatchObject({ numero: "120", cidade: "SALVADOR", uf: "BA", cep: "40000000" });
    expect(d?.auto?.veiculo).toMatchObject({ marca: "TOYOTA", ano_modelo: 2024, codigo_fipe: "002204-0", kit_gas: false, combustivel: "FLEX" });
    expect(d?.auto?.questionario).toMatchObject({ tipo_residencia: "Apartamento", cobertura_18_25: "Não", garagem_residencia: "Sim, mantém o veículo segurado em garagem" });
    expect(d?.renovacao_de).toEqual({ numero: "1234567", seguradora: "5177" });
    expect(d?.coberturas.map((c) => c.descricao)).toEqual(["Casco - Básica Compreensiva - Colisão, Incêndio, Roubo e Furto", "RCF - Danos Materiais", "Assistência 24 hs Plano 3"]);
    expect(d?.auto?.percentual_fipe).toBe(100);
    expect(d?.franquias[0]).toMatchObject({ descricao: "Casco", tipo: "50% da Normal", valor: { centavos: 300000 } });
    expect(d?.pagamento).toEqual({ forma: "Débito em conta bancária", parcelas: 6 });
  });
});

describe("Yelum auto (quadros por coluna)", () => {
  const linhas = [
    "Yelum Auto Perfil",
    "Apólice - Ramo 31 Automovel - Casco",
    "DADOS DO(A) SEGURADO(A)",
    "Nome do(a) Segurado(a)            CPF/CNPJ",
    "FULANA DE TAL                     111.444.777-35",
    "Endereço",
    "RUA DAS FLORES, 120",
    "Bairro        CEP          E-mail",
    "CENTRO        40000-000    FULANA@EXEMPLO.COM",
    "Cidade        UF           Telefone/Fax",
    "SALVADOR      BA           (71) 3333-4444",
    "DADOS DA APOLICE",
    "Apólice              Endosso      Nº do Contrato    Proposta",
    "31.10.2026.1234567   00000000 / 0                   1234567890",
    "Vigência do Seguro Data de Emissão",
    "Das 00:00hs de 10/01/2026 às 23:59hs de 10/01/2027 06/01/2026",
    "Código FIPE Marca/Tipo do Veículo Ano Fab/Mod",
    "002204-0 YARIS SEDAN XS 1.5 2023/2024",
    "Chassi Placa Capacidade Categoria",
    "9BRBC3F37R1234567 ABC1D23 5 PASSEIO NACIONAL",
    "Utilização Reg. Tarif/CEP Pernoite Tipo Franquia CI Atual",
    "PARTICULAR 0001 / 40000 0,00 FACULTATIVA 12345678901234",
    "Classe Bônus Renovação da Apólice/Seguradora Término de Vigência",
    "5",
    "Coberturas Contratadas                    LMI(R$)        Prêmio(R$)    Franquia(R$)",
    "BASICA - 01-COMPREENSIVA                  VMR x 100%     4.000,00      3.000,00",
    "RESP CIVIL FACULTATIVA VEICULOS - DANOS   100.000,00     300,00        0,00",
    "MATERIAIS",
    "ASSISTÊNCIA - SUPERIOR                    Ver Cond. Gerais  200,00     0,00",
    "INFORMAÇÕES COMPLEMENTARES",
    "Nome do Principal Condutor  Estado Civil  Data de Nascimento  Idade  Sexo",
    "FULANA DE TAL  Casado/Uniao Estavel  01/02/1990  36  Feminino",
    "CPF Condutor Vinculo c/ Segurado Uso do Veiculo para Prest. Serv. ou Visitas",
    "111.444.777-35 Proprio segurado NAO",
    "Residentes 18/25 Anos Sexo da(a) Pessoas(s) Residentes(s)",
    "NAO NAO SE APLICA",
  ];

  it("le os quadros por coluna e a tabela de coberturas", () => {
    const d = extrairDocumento(linhas);
    expect([d?.seguradora, d?.numero_apolice, d?.proposta]).toEqual(["yelum", "311020261234567", "1234567890"]);
    expect(d?.segurado).toMatchObject({ nome: "FULANA DE TAL", documento: "11144477735", email: "fulana@exemplo.com", telefones: ["7133334444"] });
    expect(d?.segurado?.endereco).toMatchObject({ logradouro: "RUA DAS FLORES", numero: "120", bairro: "CENTRO", cidade: "SALVADOR", uf: "BA", cep: "40000000" });
    expect(d?.coberturas.map((c) => [c.descricao, c.limite ?? c.valor?.centavos, c.premio?.centavos])).toEqual([
      ["BASICA - 01-COMPREENSIVA", "VMR x 100%", 400000],
      ["RESP CIVIL FACULTATIVA VEICULOS - DANOS MATERIAIS", 10000000, 30000],
      ["ASSISTÊNCIA - SUPERIOR", "Ver Cond. Gerais", 20000],
    ]);
    expect([d?.auto?.percentual_fipe, d?.auto?.modalidade_casco, d?.auto?.cep_pernoite_prefixo]).toEqual([100, "VMR", "40000"]);
  });
});

describe("Tokio auto", () => {
  const linhas = [
    "Tokio Marine Auto",
    "Vigência: a partir das 24 horas do dia 10/01/2026 até às 24 horas do dia 10/01/2027",
    "Ramo: 31.20 Apólice: 12345678 Negócio: 123456789 Proposta: 987654321",
    "Tipo de Seguro: Renovação Tokio CI: 12345678901234 Classe de Bônus: 5",
    "Data da Emissão: 06/01/2026 10:00:00 Data da Versão: 06/01/2026",
    "Segurado: FULANA DE TAL Nome Social:",
    "CPF : 111.444.777-35",
    "Endereço de Correspondência: RUA DAS FLORES , 120 - APTO 3",
    "Bairro: CENTRO",
    "CEP: 40000-000 Cidade: SALVADOR UF: BA",
    "Celular: (71) 99999-1234 Telefone: (71) 3333-4444",
    "É possível determinar o condutor: Próprio Segurado",
    "Estado Civil principal condutor: Casado(a) ou vive em união estável",
    "Veículo: SEAL EV AWD",
    "Fabricante: BYD Ano Modelo: 2025",
    "Tipo De Utilização: Particular - Lazer Chassi: LGXCF6CD5S1234567",
    "Placa: ABC1D23 Combustível: Elétrico",
    "Zero Km: Não Veículo Blindado: Não",
    "Veículo Com Kit Gás: Não Código Fipe: 012345-6",
    "Isenção Fiscal: Não",
    "CEP de pernoite: 40000-000",
    "Descrição                         Limite Máximo Indenização R$    Prêmio Líquido R$",
    "Colisão, Incêndio e Roubo/Furto   100% do valor referenciado      2.000,00",
    "RCF-V - Danos Materiais           200.000,00                      500,00",
    "Prêmio Líquido Total 2.500,00",
    "Vidros: Completo Logomarca (vidros): Não possui",
    "Carro Reserva: 15 diárias Básico (Mecânico) Martelinho e para-choque: Não possui",
    "Casco",
    "Indenização Parcial R$ 3.500,00",
    "Serviços:",
    "Parabrisa: R$ 1.200,00 Vigia/Traseiro: R$ 500,00",
    "Tipo de Oficina para Reparo: Livre Escolha",
    "Prêmio Líquido Total: R$ 2.500,00 Juros: R$ 0,00 I.O.F.: R$ 184,50",
    "Prêmio Total: R$ 2.684,50 Cobrança: Cartão de Crédito",
    "Parcela Valor (R$) Vencimento Forma de Pagamento",
    "01 268,45 10/02/2026 Cartão de Crédito",
    "10 268,45 10/11/2026 Cartão de Crédito",
  ];

  it("le coberturas por coluna, servicos e franquias de vidros", () => {
    const d = extrairDocumento(linhas);
    expect([d?.seguradora, d?.numero_apolice, d?.proposta, d?.vigencia_fim?.iso]).toEqual(["tokio", "12345678", "987654321", "2027-01-10"]);
    expect(d?.auto?.veiculo).toMatchObject({ marca: "BYD", placa: "ABC1D23", combustivel: "Elétrico", blindado: false, kit_gas: false });
    expect(d?.coberturas.map((c) => c.descricao)).toEqual(["Colisão, Incêndio e Roubo/Furto", "RCF-V - Danos Materiais", "Vidros", "Carro Reserva"]);
    expect(d?.auto?.percentual_fipe).toBe(100);
    expect(d?.franquias.map((f) => f.descricao)).toEqual(["Casco - Indenização Parcial", "Parabrisa", "Vigia/Traseiro"]);
    expect([d?.premio_total?.centavos, d?.pagamento?.parcelas, d?.pagamento?.forma]).toEqual([268450, 10, "Cartão de Crédito"]);
  });
});

describe("Zurich auto", () => {
  const linhas = [
    "Zurich Automóvel Individual",
    "Filial: BR001 - Filial Bahia Proposta: 123456789",
    "Grupo / Ramo: 0531 Automóvel Apólice: 1234567 Endosso: 0000001",
    "Início: 24hs do dia 12 de Setembro de 2025 Término: 24hs do dia 12 de Setembro de 2026",
    "Dados do Segurado",
    "Nome Completo: FULANO DE TAL",
    "CPF: 11144477735 Data de nascimento: 01/02/1980 Sexo: Masculino",
    "Estado Civil: Casado(a)",
    "Endereço: Rua das Flores",
    "Número: 120 Complemento: CASA Bairro: Centro",
    "Cidade: Salvador UF: BA CEP: 40000-000",
    "Dados do Risco",
    "Código Marca: 25 1234 Chassi: 9BHPC81EBSP123456 Chassi Remarcado:",
    "Veículo: CRETA N LINE 1.0 TGDI Ano / Modelo: 2025",
    "Placa: ABC1D23 Combustível:",
    "Categoria: 21 - SUVs COMPACTAS",
    "Uso do Veículo: APENAS LAZER/LOCOMOÇÃO",
    "CEP do local de pernoite do veículo: 40000000",
    "Dispositivo(s) Antifurto:",
    "Nao Possui;",
    "Modalidade: VMR - Valor de Mercado Referenciado",
    "Fator de Ajuste: 100 % Tabela de Referência: FIPE Código: 0153180",
    "Classe de Bônus: 3 CI do Bônus: 12345678901234",
    "Questionário Perfil Condutor Principal",
    "Nome Completo: FULANO DE TAL",
    "Nasc: 01/02/1980 Sexo: Masculino Estado Civil: Casado(a)",
    "Qual o tipo de residência do condutor principal? Casa em condomínio fechado",
    "Deseja cobertura do seguro para outros condutores habilitados com menos de 25 anos? Não",
    "O veículo fica guardado em garagem ou estacionamento fechados no seu local de pernoite? Sim, com",
    "portão automático ou porteiro",
    "Coberturas",
    "Descrição                          LMG (R$)       Franquia (R$)     Prêmio (R$)",
    "Veículo - Colisão/Incêndio/Roubo   100% FIPE      D - 4.500,00      900,00",
    "RCV - Danos Materiais              100.000,00     -                 5,00",
    "Cláusulas",
    "Descrição",
    "28 - VIDROS VIP",
    "Conta do Prêmio",
    "Prêmio Auto R$ 900,00 Prêmio líquido R$ 905,00",
    "Equipamentos e Acessórios R$ 0,00 Prêmio Total R$ 971,79",
    "Forma de Pagamento: Cartao de Credito",
  ];

  it("le datas por extenso, questionario que quebra linha e coberturas com franquia", () => {
    const d = extrairDocumento(linhas);
    expect([d?.seguradora, d?.numero_apolice, d?.vigencia_inicio?.iso, d?.vigencia_fim?.iso]).toEqual(["zurich", "1234567", "2025-09-12", "2026-09-12"]);
    expect(d?.segurado?.endereco).toMatchObject({ logradouro: "Rua das Flores", numero: "120", complemento: "CASA", cidade: "Salvador", uf: "BA" });
    expect(d?.auto?.questionario).toMatchObject({ tipo_residencia: "Casa em condomínio fechado", cobertura_18_25: "Não", garagem_residencia: "Sim, com portão automático ou porteiro" });
    expect(d?.auto?.veiculo).toMatchObject({ codigo_fipe: "015318-0", placa: "ABC1D23", ano_modelo: 2025 });
    expect(d?.coberturas[0]).toMatchObject({ descricao: "Veículo - Colisão/Incêndio/Roubo", limite: "100% FIPE", franquia: "D - 4.500,00" });
    expect([d?.clausulas, d?.premio_liquido?.centavos, d?.premio_total?.centavos]).toEqual([["VIDROS VIP"], 90500, 97179]);
  });
});

describe("Bradesco auto (quadros por coluna, titulos sem '____')", () => {
  const linhas = [
    "Agradecemos pela sua escolha ao contratar o Bradesco Seguro Auto.",
    "Dados da sua apólice",
    "Número da apólice      Item     Proposta     Data da Emissão",
    "0931.531.5312.123456   0001     123456789    06/01/2026",
    "Renovação da apólice   Cód.     Bônus   CI",
    "111222                 571-0    5       12.345.678.901.234",
    "Cobertura",
    "COMPREENSIVA",
    "Vigência",
    "das 24:00 horas do dia 10/01/2026 às 24:00 horas do dia 10/01/2027",
    "Dados do segurado",
    "Nome                      Data de Nascimento   Sexo",
    "FULANA DE TAL SOBRENOME   01/02/1990           FEMININO",
    "COMPRIDO",
    "CPF/CNPJ          Tipo de Pessoa",
    "111.444.777/35    FÍSICA",
    "Endereço de Pernoite        Complemento",
    "RUA DAS FLORES 120          CASA",
    "Bairro     CEP          Municipio     UF",
    "CENTRO     40000-000    SALVADOR      BA",
    "E-mail",
    "FULANA@EXEMPLO.COM",
    "Dados do veículo",
    "Marca/Tipo Veículo                 Ano de Fabricação/Modelo",
    "TOYOTA HILUX SW4 SRX 2.8           2020/2021",
    "Chassi               Chassi Remarcado    Código FIPE",
    "8AJBA3FS8L1234567    Não                 2204.0",
    "Placa      Uso do Veículo    Veículo c/ Isenção Fiscal",
    "ABC1D23    Particular        NÃO",
    "Coberturas",
    "Veículo",
    "VALOR MERCADO REFERENCIADO / Prêmio Líq. R$ 4.000,00",
    "Fator de Ajuste do VMR",
    "100 %",
    "Danos Materiais a Terceiros",
    "LMI R$ 100.000,00 / Prêmio Líq. R$ 300,00",
    "Serviços Complementares",
    "Assistência Auto Dia e Noite 500 Km",
    "Cláusulas do Seguro",
    "Nº 1 - Cobertura Compreensiva",
    "Demonstrativo de Prêmio",
    "Questionário de Risco",
    "O segurado é principal condutor do veículo?",
    "SIM",
    "Qual quilometragem média rodada em condições habituais?",
    "Até 30 km/dia ou até 900 km/mês",
  ];

  it("le os quadros (valor que quebra linha), FIPE sem zeros, coberturas e questionario", () => {
    const d = extrairDocumento(linhas);
    expect([d?.seguradora, d?.numero_apolice, d?.item, d?.proposta]).toEqual(["bradesco", "123456", "0001", "123456789"]);
    expect([d?.auto?.classe_bonus, d?.renovacao_de?.numero, d?.renovacao_de?.seguradora]).toEqual([5, "111222", "571-0"]);
    expect(d?.segurado).toMatchObject({ nome: "FULANA DE TAL SOBRENOME COMPRIDO", sexo: "FEMININO", email: "fulana@exemplo.com", endereco: null });
    expect(d?.auto?.endereco_pernoite).toMatchObject({ logradouro: "RUA DAS FLORES 120", complemento: "CASA", cidade: "SALVADOR", uf: "BA" });
    expect(d?.auto?.veiculo).toMatchObject({ codigo_fipe: "002204-0", ano_fabricacao: 2020, ano_modelo: 2021, placa: "ABC1D23" });
    expect(d?.coberturas.slice(0, 2).map((c) => [c.descricao, c.limite ?? c.valor?.centavos, c.premio?.centavos])).toEqual([
      ["Veículo", "VALOR MERCADO REFERENCIADO", 400000],
      ["Danos Materiais a Terceiros", 10000000, 30000],
    ]);
    expect([d?.auto?.percentual_fipe, d?.auto?.questionario.km_mensal, d?.auto?.condutor?.vinculo]).toEqual([100, "Até 30 km/dia ou até 900 km/mês", "Próprio segurado"]);
  });
});

describe("HDI auto (PDF) e endosso", () => {
  const corpo = [
    "Nome de Registro do Segurado: FULANO DE TAL",
    "Email : fulano@exemplo.com",
    "CPF : 111.444.777-35",
    "Endereço : Rua das Flores, 120 / Ap 301 Celular : (071)999991234",
    "Bairro : Centro",
    "Cidade : Salvador - BA CEP : 40000-000",
    "Informações do Seguro",
    "Moeda: R$ Proposta: 1234567890",
    "Cotação Base: 1,0000 Vigência: das 24h do dia 10/01/2026 às 24h do dia 10/01/2027 ( 365 dias)",
    "Prêmio da Apólice",
    "Prêmio Líquido : R$ 2.027,26",
    "Prêmio Total : R$ 2.176,87",
    "Parcelamento do Prêmio",
    "Dados de Cobrança",
    "Banco: 000 Tipo de Cobrança: Cartão de Crédito",
    "Parcela 544,22 Forma de Pagamento: 4 x",
    "Multa de Mora: 2,00%",
    "Dados do Veículo - Item 000001",
    "Modelo : 1234567 - Caoa Chery Tiggo 5 Sport 1.5 Turbo Flex",
    "Renavam : Código FIPE : 012345-6",
    "Ano Fabr./Modelo : 2025/2026 Combustível : 5-Bi-combustivel",
    "Placa/UF : ABC1D23 - BA Chassi : 95PEFL61DTB123456",
    "Cobertura : 01-Valor de Mercado Referenciado",
    "Região : 0001-Barra Pituba Franquia : 02-Facultativa 50%",
    "CEP Pernoite : 40000-000 CEP Circulação : 40000-000",
    "Código CI : 12345678901234",
    "Cia Anterior : 6572-YELUM SEGUROS S.A",
    "Apólice Anterior : 123456789012345",
    "Qtde Sinistros : 0 Classe de Bônus : 10 - 40,00%",
    "Coberturas Auto(Valores em R$)   L.M.I.              Prêmio     Prêmio Anual   Franquia",
    "Casco                            100,00% tab. FIPE   1.000,00   1.000,00       3.000,00",
    "RCF-V Danos Materiais            200.000,00          400,00     400,00",
    "Impressão dos Textos Explicativos",
    "(*1)Vidros com franquia de R$ 300,00. Vidro Traseiro com franquia de R$ 250,00.",
    "Nome Social do Condutor:",
    "Condutor: FULANO DE TAL CPF: 11144477735 Data de Nasc.: 01/02/1980",
    "Sexo : Masculino",
    "Estado Civil : Casado(a)",
    "Guarda do Veiculo : Na Residência, sem Garagem No Local de Trabalho",
    "Utilizacao do Veiculo : Exclusivamente para Locomocao Diaria",
    "Cob Demais Condutores Resid entre 18 Até 25 Anos : Nao",
    "Este documento foi elaborado",
  ];

  it("apolice: segurado, veiculo, cia anterior, coberturas, notas de franquia e guarda", () => {
    const d = extrairDocumento(["HDI SEGUROS S.A.", "Hdi Auto Perfil - SALVADOR", "Apólice 01.031.000.123456", ...corpo]);
    expect([d?.seguradora, d?.tipo, d?.numero_apolice, d?.proposta]).toEqual(["hdi", "apolice", "01031000123456", "1234567890"]);
    expect(d?.segurado?.endereco).toMatchObject({ logradouro: "Rua das Flores", numero: "120", complemento: "Ap 301", cidade: "Salvador", uf: "BA" });
    expect(d?.auto?.veiculo).toMatchObject({ marca: "Caoa Chery", ano_fabricacao: 2025, ano_modelo: 2026, placa: "ABC1D23", combustivel: "Bi-combustivel" });
    expect([d?.auto?.classe_bonus, d?.auto?.sinistros, d?.auto?.percentual_fipe, d?.renovacao_de?.seguradora]).toEqual([10, 0, 100, "YELUM SEGUROS S.A"]);
    expect(d?.coberturas[0]).toMatchObject({ descricao: "Casco", valor: null, limite: "100,00% tab. FIPE", franquia: "3.000,00" });
    expect(d?.franquias.map((f) => f.descricao)).toEqual(["Casco", "Vidros", "Vidro Traseiro"]);
    expect(d?.auto?.questionario).toMatchObject({ garagem_trabalho: "SEM GARAGEM NO LOCAL DE TRABALHO", residentes_18_25: "Nao" });
    expect(d?.pagamento).toEqual({ forma: "Cartão de Crédito", parcelas: 4 });
  });

  it("endosso: a apolice sao os 4 primeiros grupos do numero", () => {
    const d = extrairDocumento(["HDI SEGUROS S.A.", "Hdi Auto Perfil - SALVADOR", "Endosso 01.031.000.123456.000002", ...corpo]);
    expect([d?.tipo, d?.numero_apolice, d?.auto?.veiculo.placa]).toEqual(["endosso", "01031000123456", "ABC1D23"]);
  });
});

describe("Allianz endosso", () => {
  it("le segurado e vigencia, sem dados de cartao", () => {
    const d = extrairDocumento([
      "Endosso Nº. da Proposta: 123456789",
      "Nº. da Apólice Endossada:",
      "5177202612345678901",
      "Allianz Automóvel Nº. do Endosso: 1",
      "Emissão: 06/02/2026",
      "SUAS INFORMAÇÕES",
      "Nome: FULANA DE TAL CPF: 111.444.777-35",
      "E-mail: fulana@exemplo.com Tel: 71999991234",
      "Endereço de correspondência: R. DAS FLORES, 120, CASA CEP: 40000-000",
      "Bairro: CENTRO Cidade/UF: SALVADOR/BA",
      "INFORMAÇÕES DO SEGURO",
      "Vigência: das 24h de 10/01/2026 às 24h de 10/01/2027",
      "VEJA O QUE MUDOU NO SEU SEGURO ALLIANZ:",
      "INFORMAÇÕES DE PAGAMENTO",
      "Número: 1234 **** **** 5678 Número: 1234 **** **** 5678",
      "Página 1 de 2",
    ]);
    expect([d?.tipo, d?.numero_apolice, d?.vigencia_fim?.iso]).toEqual(["endosso", "5177202612345678901", "2027-01-10"]);
    expect(d?.segurado?.endereco).toMatchObject({ logradouro: "R. DAS FLORES", numero: "120", complemento: "CASA", cidade: "SALVADOR", uf: "BA" });
    expect(d?.clausulas).toEqual(["INFORMAÇÕES DE PAGAMENTO"]);
  });
});

describe("Proposta MAPFRE", () => {
  const linhas = [
    "Proposta de Seguro MAPFRE Auto - 551",
    "Dados do Seguro Vigência: das 24 horas do dia 10/01/2026 até as 24 horas do dia 10/01/2027",
    "Proposta:1234567890123 Data Proposta - Hora 05/01/2026 - 10:00:00 Tipo Cálculo: ANUAL",
    "Dados do Segurado / Correspondência",
    "Nome do Segurado: FULANA DE TAL Tipo Pessoa: FISICA CPF:111.444.777-35",
    "Data Nasc.: 01/02/1990 Sexo: FEMININO Est.Civil: CASADO",
    "E-mail: FULANA@EXEMPLO.COM Atividade: ADVOGADO",
    "Tel.Celular: (71) 99999-1234 Tel.Res.: (71) 3333-4444",
    "Renda Mensal: ATE R$ 10.000,00",
    "Endereço: RUA DAS FLORES Nº 120 Compl.: APT 3",
    "Bairro: CENTRO Cidade: SALVADOR UF: BA CEP:40000-000",
    "Dados do Veículo e do Seguro",
    "Veículo:12;34;5; TO123456 TOYOTA - YARIS SEDAN XS 1.5 (Aut.)(Flex)",
    "Ano Modelo: 2024 0Km: NÃO",
    "Chassi:9BRBC3F37R1234567 Placa:ABC1D23",
    "Uso: 1 - PARTICULAR Categoria Tarifária: 10 - PASSEIO NACIONAL",
    "Tipo de Seguro:SEGURO NOVO Classe de Bônus:0",
    "Modalidade**: VALOR DE MERCADO REFERENCIADO Fator de Ajuste: 100%",
    "Tabela de Referência: FIPE (www.fipe.org.br)(002204-0) Tabela Substituta: Molicar",
    "Questionário de Avaliação de Risco",
    "- Nome do Principal Condutor: BELTRANA DE TAL CPF:222.333.444-05",
    "- Data de Nascimento Condutor: 01/02/2000",
    "- Sexo do Condutor:2 - FEMININO",
    "- Estado Civil do Condutor: S - SOLTEIRO",
    "- CEP de pernoite do veículo: 40000-000 Cidade: SALVADOR UF: BA",
    "SUAS INFORMAÇÕES GARANTEM A PROTEÇÃO!",
  ];

  it("traz o que a apolice nao imprime: nascimento, sexo, estado civil, atividade, renda", () => {
    const d = extrairDocumento(linhas, { cpf_segurado: "111.444.777-35" });
    expect([d?.seguradora, d?.tipo, d?.numero_proposta]).toEqual(["mapfre", "proposta", "1234567890123"]);
    expect(d?.segurado).toMatchObject({ nascimento: { iso: "1990-02-01" }, sexo: "FEMININO", estado_civil: "CASADO", profissao: "ADVOGADO", renda: "ATE R$ 10.000,00" });
    expect(d?.segurado?.endereco).toMatchObject({ logradouro: "RUA DAS FLORES", numero: "120", complemento: "APT 3", uf: "BA" });
    expect(d?.auto?.veiculo).toMatchObject({ marca: "TOYOTA", codigo_fipe: "002204-0", combustivel: "Flex", zero_km: false });
    expect(d?.auto?.condutor).toMatchObject({ sexo: "FEMININO", estado_civil: "SOLTEIRO" });
  });

  it("trava: outro CPF, null", () => {
    expect(extrairDocumento(linhas, { cpf_segurado: "222.333.444-05" })).toBeNull();
  });
});
