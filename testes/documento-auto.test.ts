/**
 * `extrairDocumento` de ponta a ponta, por seguradora: documentos SINTETICOS
 * (nada real) no layout de cada cia, como o motor de PDF devolve as linhas.
 * Colunas separadas por 2+ espacos (a posicao das palavras vem do texto).
 */
import { describe, expect, it } from "vitest";
import { extrairDocumento, identificarDocumento } from "../src/documento.js";

describe("reconhecer", () => {
  it("sem marca reconhecida: null (nunca um palpite)", () => {
    expect(identificarDocumento(["APÓLICE DE SEGURO", "Segurado: FULANA"])).toBeNull();
  });

  it("Itaú Proteção Combinada (veículo + residência) e auto da Itaú, não residencial da Porto", () => {
    const id = identificarDocumento([
      "Proteção Combinada Itaú",
      "Itaú Seguro Auto é uma marca licenciada para uso da Porto Seguro Companhia de Seguros Gerais.",
      "Apólice: 0001 31 12345678 Item: 01",
      "Dados do veículo segurado",
      "Tipo de residência: Casa Alvenaria/Apartamento",
    ]);
    expect([id?.seguradora, id?.ramo, id?.tipo, id?.numero_apolice]).toEqual(["itau", "auto", "apolice", "12345678"]);
  });

  it("Aliro e Yelum (mesmo CNPJ): com Aliro impresso, e Aliro", () => {
    expect(identificarDocumento(["Aliro Seguro Auto M", "Yelum Seguros S.A. CNPJ 61.550.141/0001-72"])?.seguradora).toBe("aliro");
  });
});

describe("MAPFRE auto (kit)", () => {
  const linhas = [
    "APÓLICE DE SEGURO AUTO",
    "VALOR DE MERCADO REFERENCIADO",
    "DADOS GERAIS",
    "Produto: 551 Nº Apólice: 1234567890123",
    "Vigência início 24h do dia: 10/01/2026 Término 24h do dia: 10/01/2027",
    "Data e hora da proposta: 05/01/2026 10:00:00 Nº Proposta: 9876543210987",
    "Data de emissão da apólice: 06/01/2026",
    "Versão de cálculo: 1234567890 CI: 12345678901234",
    "DADOS DA SEGURADORA",
    "Nome: MAPFRE SEGUROS GERAIS S/A",
    "DADOS DO SEGURADO",
    "Nome: FULANA DE TAL",
    "Tipo de pessoa: FÍSICA CPF: 111.444.777-35",
    "Endereço: RUA DAS FLORES 120 APT 3",
    "Bairro: CENTRO CEP: 40000-000",
    "Cidade: SALVADOR UF: BA",
    "Telefone celular: 71999991234",
    "QUESTIONÁRIO DE AVALIAÇÃO DE RISCO",
    "Nome do principal condutor: BELTRANA DE TAL",
    "CPF: 222.333.444-05 Data de nascimento: 01/02/2000",
    "Sexo: FEMININO",
    "Estado Civil: CASADO OU RESIDE COM",
    "COMPANHEIRO(A)",
    "Deseja contratar cobertura para condutores residentes entre 18 e 25 anos?",
    "NÃO",
    "CEP do local onde o veículo pernoita: 40000-000",
    "DADOS DO VEÍCULO",
    "Marca/Modelo: TOYOTA YARIS SEDAN XS 1.5 16V (AUT.)(FLE",
    "Ano do modelo: 2024 Placa: ABC1D23",
    "0 KM: NÃO",
    "Nº Chassi: 9BRBC3F37R1234567",
    "Categoria tarifária: PASSEIO NACIONAL",
    "Uso: PARTICULAR",
    "Tipo de isenção: SEM ISENÇÃO",
    "Blindagem: NÃO CONTRATADA",
    "Código na Tabela de Referência: 002204-0 Código na MAPFRE:",
    "COBERTURAS CONTRATADAS E VALORES MÁXIMOS DE INDENIZAÇÃO",
    "Cobertura                              Valor                  Prêmio líquido",
    "Básica- Colisão/Incêndio/Roubo/Furto   100% FIPE              4.333,03",
    "RCFA - Danos Materiais                 100.000,00             1.326,66",
    "Vidros Top                             Conf. Cond. Gerais     115,08",
    "Assistencia Veiculo                    Conforme Manual        Gratuito",
    "Classe de bônus 05",
    "FRANQUIA",
    "Descrição                              Tipo   Valor (R$)",
    "CASCO DEDUTÍVEL REDUZIDA 50%                  3.783,64",
    "PARA-BRISA                                    495,00",
    "DEMONSTRATIVO DE PRÊMIO - VALORES EM R$",
    "Prêmio líquido: 6.001,93",
    "IOF: 442,94 Prêmio total: 6.444,87",
    "Forma: FCA + DEBITO EM CONTA Nº de parcela: 6",
  ];

  it("le apolice, segurado, condutor, veiculo, coberturas, franquias e premio", () => {
    const d = extrairDocumento(linhas);
    expect([d?.seguradora, d?.ramo, d?.tipo, d?.numero_apolice]).toEqual(["mapfre", "auto", "apolice", "1234567890123"]);
    expect([d?.vigencia_inicio?.iso, d?.vigencia_fim?.iso, d?.emissao?.iso, d?.proposta]).toEqual(["2026-01-10", "2027-01-10", "2026-01-06", "9876543210987"]);
    expect(d?.segurado).toMatchObject({ nome: "FULANA DE TAL", documento: "11144477735", telefones: ["71999991234"] });
    expect(d?.segurado?.endereco).toEqual({ cep: "40000000", logradouro: "RUA DAS FLORES", numero: "120", complemento: "APT 3", bairro: "CENTRO", cidade: "SALVADOR", uf: "BA" });
    const a = d?.auto;
    expect(a?.veiculo).toMatchObject({ marca: "TOYOTA", ano_modelo: 2024, placa: "ABC1D23", chassi: "9BRBC3F37R1234567", codigo_fipe: "002204-0", combustivel: "FLEX", zero_km: false, blindado: false });
    expect(a?.condutor).toMatchObject({ nome: "BELTRANA DE TAL", documento: "22233344405", sexo: "FEMININO", estado_civil: "CASADO OU RESIDE COM COMPANHEIRO(A)" });
    expect([a?.classe_bonus, a?.ci, a?.cep_pernoite, a?.percentual_fipe, a?.questionario.residentes_18_25]).toEqual([5, "12345678901234", "40000000", 100, "NÃO"]);
    expect(d?.coberturas.map((c) => [c.descricao, c.valor?.centavos ?? c.limite, c.premio?.centavos ?? null])).toEqual([
      ["Básica- Colisão/Incêndio/Roubo/Furto", "100% FIPE", 433303],
      ["RCFA - Danos Materiais", 10000000, 132666],
      ["Vidros Top", "Conf. Cond. Gerais", 11508],
      ["Assistencia Veiculo", "Conforme Manual", null],
    ]);
    expect(d?.assistencias).toEqual(["Assistencia Veiculo"]);
    expect(d?.franquias[0]).toMatchObject({ descricao: "CASCO DEDUTÍVEL", tipo: "REDUZIDA 50%" });
    expect([d?.premio_liquido?.centavos, d?.premio_total?.centavos, d?.pagamento?.parcelas]).toEqual([600193, 644487, 6]);
  });

  it("trava: outra apolice pedida, null", () => {
    expect(extrairDocumento(linhas, { numero_apolice: "9999999999999" })).toBeNull();
  });
});

describe("Porto auto", () => {
  const linhas = [
    "Esta é a apólice do seu veículo.",
    "Apólice Porto Seguro Auto 26",
    "Dados da sua apólice",
    "Apólice: 0001 31 12345678 Item: 01",
    "Renova nº: 0001 31 11112222 Classe de bônus: 7",
    "Código C.I: 12.345.678.901.234 Data de emissão: 06/01/2026",
    "Proposta: 12 34567890",
    "Vigência: Das 24h do dia 10/01/2026 às 24h do dia 10/01/2027. Processo SUSEP",
    "Nº. 15414.000000/2020-00 - PSCG123 Auto Valor de Mercado",
    "Dados cadastrais",
    "Segurado(a): Fulana de Tal",
    "Data de nascimento: 01/02/1990 Sexo: Feminino",
    "CPF: 111.444.777-35",
    "Endereço: Tv Das Flores, 120 Apt 3",
    "Bairro: Centro Estado: BA",
    "Cidade: Salvador CEP: 40000-000",
    "Tel. residencial: Celular: (71) 999991234",
    "Tel. comercial: E-mail: fulana@exemplo.com",
    "Descrição do veículo segurado",
    "Veículo: Volkswagen T-Cross 1.0 Tsi Flex Aut.",
    "Ano: 2023 Modelo: 2024 Chassi: 9BWBH6BF0R1234567",
    "Portas: 4 Combustível: Gasolina/Alcool",
    "Placa: ABC1D23 Código Tabela FIPE: 005340",
    "Uso: Particular Câmbio automático: Sim",
    "Categoria tarifária: 10 - Passeio",
    "Dados do Corretor",
    "Valores do seu seguro",
    "Coberturas LMI Prêmio",
    "1-1 100,00% do valor do",
    "Colisão/Incêndio/Roubo/Furto R$ 1.500,00",
    "veículo referência",
    "Blindagem Não contratado R$ 0,00",
    "Danos Materiais R$ 100.000,00 R$ 500,00",
    "(111) Essencial: Assistência Km Ilimitado / Serviços GRATUITA",
    "Total de coberturas adicionais R$ 0,00",
    "Prêmio líquido R$ 2.043,66",
    "Valores e franquias do seu seguro",
    "Total do seguro R$ 2.194,48",
    "Valores das franquias Valor",
    "Perda Parcial (Obrigatória): R$ 3.000,00",
    "Vidros Laterais R$ 300,00",
    "Em atendimento à regulamentação vigente",
    "Forma de pagamento",
    "Cartão de Crédito Porto Bank.",
    "1 R$ 200,00 10/02/2026 6 R$ 200,00 10/07/2026",
    "5 R$ 200,00 10/06/2026 10 R$ 200,00 10/11/2026",
    "Questionário de avaliação de risco",
    "Nome do motorista principal: Fulana de Tal",
    "Sexo: Feminino Data de nascimento: 01/02/1990 CPF: 111.444.777-35",
    "Possui dispositivo antifurto/anti-roubo instalado no veículo: Outros Dispositivos",
    "Cep do local onde o veiculo pernoita? 40000000",
    "Condições específicas",
  ];

  it("le tudo, inclusive o casco em % e a franquia obrigatoria", () => {
    const d = extrairDocumento(linhas);
    expect([d?.seguradora, d?.numero_apolice, d?.item, d?.renovacao_de?.numero]).toEqual(["porto", "12345678", "01", "11112222"]);
    expect(d?.segurado).toMatchObject({ nome: "Fulana de Tal", sexo: "Feminino", email: "fulana@exemplo.com", telefones: ["71999991234"] });
    expect(d?.segurado?.endereco).toMatchObject({ logradouro: "Tv Das Flores", numero: "120", complemento: "Apt 3", uf: "BA" });
    expect(d?.auto?.veiculo).toMatchObject({ marca: "Volkswagen", ano_fabricacao: 2023, ano_modelo: 2024, placa: "ABC1D23", codigo_fipe_impresso: "005340", blindado: false });
    expect([d?.auto?.classe_bonus, d?.auto?.percentual_fipe, d?.auto?.cep_pernoite, d?.auto?.antifurto]).toEqual([7, 100, "40000000", "Outros Dispositivos"]);
    expect(d?.coberturas.map((c) => c.descricao)).toEqual(["Colisão/Incêndio/Roubo/Furto", "Blindagem", "Danos Materiais", "(111) Essencial: Assistência Km Ilimitado / Serviços"]);
    expect(d?.coberturas[2]).toMatchObject({ valor: { centavos: 10000000 }, premio: { centavos: 50000 } });
    expect(d?.franquias[0]).toMatchObject({ descricao: "Perda Parcial", tipo: "Obrigatória", valor: { centavos: 300000 } });
    expect([d?.premio_liquido?.centavos, d?.premio_total?.centavos, d?.pagamento?.parcelas]).toEqual([204366, 219448, 10]);
  });
});
