/**
 * Residencial (MAPFRE, HDI, Tokio) e vida (MAPFRE, Allianz, Yelum): linhas
 * SINTETICAS no formato dos PDFs de cobranca de 2026-10-20 (nada real).
 */
import { describe, expect, it } from "vitest";
import { dinheiroPtBr, tabelaDeCoberturas } from "../src/tabela.js";
import { lerResidencialHdi } from "../src/hdi-residencial.js";
import { lerResidencialMapfre } from "../src/mapfre-residencial.js";
import { lerResidencialPorto } from "../src/porto-residencial.js";
import { lerResidencialTokio } from "../src/tokio-residencial.js";
import { lerVidaAllianz } from "../src/allianz-vida.js";
import { lerVidaMapfre } from "../src/mapfre-vida.js";
import { lerVidaYelum } from "../src/yelum-vida.js";

describe("tabela de coberturas", () => {
  it("dinheiro pt-BR em centavos", () => {
    expect(dinheiroPtBr("R$ 1.234,56")?.centavos).toBe(123456);
    expect(dinheiroPtBr("12,3")).toBeNull();
  });

  it("continuacao so com palavra, rodape numerico nao entra", () => {
    const itens = tabelaDeCoberturas(
      ["Coberturas", "INCENDIO E RAIO 100.000,00 50,00", "E EXPLOSAO", "1/2", "123456 7890", "DANOS ELETRICOS 5.000,00 10,00", "Fim"],
      /^Coberturas$/,
      /^Fim$/,
      { minimoDeValores: 2 },
    );
    expect(itens.map((i) => i.descricao)).toEqual(["INCENDIO E RAIO E EXPLOSAO", "DANOS ELETRICOS"]);
    expect(itens[0]?.outros_valores).toEqual(["50,00"]);
  });
});

describe("residencial MAPFRE", () => {
  const linhas = [
    "MAPFRE RESIDENCIAL",
    "Nº Apólice : 1234567890123",
    "DADOS DO SEGURADO",
    "Nome: FULANA DE TAL",
    "Tipo de pessoa: Pessoa Física CPF/CNPJ: 111.444.777-35",
    "Endereço: RUA DAS FLORES 120 APT 3",
    "Bairro: CENTRO CEP: 40000000",
    "Cidade: SALVADOR UF: BA",
    "Descrição do Risco: CASA HABITUAL - COND. FECHADO",
    "Endereço do Risco: RUA DAS FLORES",
    "Nº: 120 Complemento: APT 3",
    "Bairro: CENTRO CEP: 40000-000",
    "Cidade: SALVADOR Estado: BA",
    "COBERTURAS CONTRATADAS E VALORES MÁXIMOS DE INDENIZAÇÃO",
    "Cobertura Valor Prêmio",
    "BÁSICA (INCÊNDIO, QUEDA DE RAIO DENTRO DO TERRENO 300.000,00 100,00",
    "SEGURADO, EXPLOSÃO)",
    "PERDA OU PAGAMENTO DE ALUGUEL 10.000,00 5,00",
    "ASSISTENCIA DOMICILIAR 0,00 0,00",
    "Este seguro garante",
  ];

  it("le segurado, risco e coberturas; o endereco do segurado so com as partes separadas", () => {
    const r = lerResidencialMapfre(linhas, "1234567890123");
    expect(r?.segurado_documento).toBe("11144477735");
    expect(r?.segurado_endereco).toEqual({ cep: "40000000", logradouro: null, numero: null, complemento: null, bairro: "CENTRO", cidade: "SALVADOR", uf: "BA" });
    expect(r?.imovel).toMatchObject({ cep: "40000000", logradouro: "RUA DAS FLORES", numero: "120", uf: "BA" });
    expect([r?.tipo_imovel, r?.ocupacao, r?.condominio_fechado]).toEqual(["CASA", "HABITUAL", true]);
    expect(r?.lmi_basica?.centavos).toBe(30000000);
    expect(r?.coberturas.map((c) => c.descricao)).toEqual([
      "BÁSICA (INCÊNDIO, QUEDA DE RAIO DENTRO DO TERRENO SEGURADO, EXPLOSÃO)",
      "PERDA OU PAGAMENTO DE ALUGUEL",
    ]);
    expect(r?.assistencia).toBe("ASSISTENCIA DOMICILIAR");
  });

  it("trava: outra apolice e recusada", () => {
    expect(lerResidencialMapfre(linhas, "9999999999999")).toBeNull();
  });
});

describe("residencial HDI", () => {
  const linhas = [
    "HDI SEGUROS S.A.",
    "Compreensivo Residencial",
    "Apólice 01.234.567.000001",
    "CPF : 111.444.777-35",
    "Localização",
    "001 - RUA DAS FLORES 120 / BLOCO B - SALVADOR - BA - 40000-000",
    "Número: 120 - Bairro: CENTRO",
    "OCUPAÇÃO : Residencia Habitual Apartamento (00012)",
    "Coberturas (Valores em R$ ) L.M.I. Prêmio Líquido",
    "Incendio 250.000,00 80,00",
    "Responsabilidade Civil Familiar 20.000,00 4,00",
    "Coberturas de Assistencias Especial 0,00 30,00",
    "Franquias",
  ];

  it("le o local do risco, a ocupacao e o plano de assistencia", () => {
    const r = lerResidencialHdi(linhas);
    expect(r?.imovel).toEqual({ cep: "40000000", logradouro: "RUA DAS FLORES", numero: "120", complemento: "BLOCO B", bairro: "CENTRO", cidade: "SALVADOR", uf: "BA" });
    expect([r?.tipo_imovel, r?.ocupacao]).toEqual(["Apartamento", "Habitual"]);
    expect(r?.lmi_basica?.centavos).toBe(25000000);
    expect(r?.coberturas.map((c) => c.descricao)).toEqual(["Incendio", "Responsabilidade Civil Familiar"]);
    expect(r?.assistencia).toBe("Especial");
  });

  it("trava: sem o ramo Compreensivo Residencial, recusa", () => {
    expect(lerResidencialHdi(linhas.filter((l) => l !== "Compreensivo Residencial"))).toBeNull();
  });
});

describe("residencial Tokio", () => {
  const linhas = [
    "Tokio Marine Residencial",
    "Apólice nº 12345678 - RESIDENCIAL",
    "Segurado: FULANA DE TAL Nome Social:",
    "CPF : 111.444.777-35",
    "Endereço: AV DOS COQUEIROS , 450 - CS 2",
    "Bairro: ITAPUA",
    "CEP: 41000-000 Cidade: SALVADOR UF: BA",
    "Tipo de Imóvel: Casa em Condomínio",
    "Ocupação: Habitual",
    "Local do Risco: RUA DAS FLORES Número Logradouro: 120",
    "Complemento: CASA 2 Bairro: CENTRO",
    "Cidade: SALVADOR CEP: 40000-000 UF: BA",
    "Coberturas Contratadas",
    "Incêndio, Raio, Explosão, Fumaça e Queda Aeronave 400.000,00 150,00",
    "Danos Elétricos 10.000,00 20,00",
    "Prêmio Líquido Total",
    "Assistência 24 horas Plano Vip 45,00",
  ];

  it("le endereco, tipo, condominio, coberturas e assistencia", () => {
    const r = lerResidencialTokio(linhas, "0012345678");
    expect(r?.imovel).toEqual({ cep: "40000000", logradouro: "RUA DAS FLORES", numero: "120", complemento: "CASA 2", bairro: "CENTRO", cidade: "SALVADOR", uf: "BA" });
    expect(r?.condominio_fechado).toBe(true);
    expect(r?.segurado_endereco).toEqual({ cep: "41000000", logradouro: "AV DOS COQUEIROS", numero: "450", complemento: "CS 2", bairro: "ITAPUA", cidade: "SALVADOR", uf: "BA" });
    expect(r?.lmi_basica?.centavos).toBe(40000000);
    expect(r?.assistencia).toBe("Assistência 24 horas Plano Vip");
  });

  it("trava: outra apolice e recusada", () => {
    expect(lerResidencialTokio(linhas, "87654321")).toBeNull();
  });
});

describe("vida", () => {
  it("MAPFRE: segurado e coberturas, sem as siglas", () => {
    const r = lerVidaMapfre(
      [
        "MAPFRE VIDA S.A.",
        "Nº da Apólice: 1234567890123",
        "Data de Início de Vigência Apólice 24h do dia: 10/01/2026 Término de Vigência Apólice 24h do dia: 10/01/2027",
        "DADOS DO SEGURADO TITULAR",
        "Nome Completo: FULANA DE TAL CPF: 111.444.777-35",
        "Estado Civil: SOLTEIRO Sexo: FEMININO",
        "Data de Nascimento: 01/02/1990",
        "Profissão: ADVOGADO Faixa de Renda: DE R$ 5.000,00 A R$ 10.000,00",
        "ENDEREÇO RESIDENCIAL DO SEGURADO",
        "Logradouro: RUA DAS FLORES Número: 120",
        "Bairro: CENTRO CEP: 40000-000",
        "Cidade: SALVADOR UF: BA",
        "Complemento: AP 3",
        "Coberturas Capital Segurado Prêmio Líquido Carência/Franquia",
        "Morte (M) 100.000,00 30,00 24 / Não",
        "Invalidez Permanente Total ou Parcial por Acidente (IPA) 100.000,00 5,00",
        "Para todas as Coberturas",
      ],
      "1234567890123",
    );
    expect(r?.segurado_nascimento?.iso).toBe("1990-02-01");
    expect([r?.segurado_sexo, r?.profissao]).toEqual(["FEMININO", "ADVOGADO"]);
    expect([r?.segurado_nome, r?.segurado_documento, r?.vigencia_fim?.iso]).toEqual(["FULANA DE TAL", "11144477735", "2027-01-10"]);
    expect(r?.segurado_endereco).toEqual({ cep: "40000000", logradouro: "RUA DAS FLORES", numero: "120", complemento: "AP 3", bairro: "CENTRO", cidade: "SALVADOR", uf: "BA" });
    expect(r?.coberturas.map((c) => c.descricao)).toEqual(["Morte", "Invalidez Permanente Total ou Parcial por Acidente"]);
    expect(r?.capital_morte?.centavos).toBe(10000000);
  });

  it("Allianz: capital por cobertura e assistencias; trava pelo numero SUSEP", () => {
    const linhas = [
      "Allianz Vida Individual",
      "Nº Apólice: 1234567890123456789",
      "SEGURADO : FULANA DE TAL",
      "ENDEREÇO: R. DAS FLORES, 120, APTO 3",
      "CPF : 111.444.777-35",
      "E-MAIL: fulana@exemplo.com CEP: 40000-000",
      "BAIRRO: CENTRO TELEFONE: 71999999999",
      "CIDADE : Salvador/Bahia",
      "VIGÊNCIA ANUAL: das 24H de 10/01/2026 às 24H de 10/01/2027",
      "PACOTE CONTRATADO: Essencial PROFISSÃO: Coordenador",
      "COBERTURAS (R$)",
      "CAPITAL",
      "Morte R$ 100.000,00",
      "IPA - Invalidez Permanente Total ou Parcial por Acidente R$ 50.000,00",
      "ASSISTÊNCIAS (R$)",
      "Funeral Ampliada R$ 5.000,00",
      "Prêmio Líquido: R$ 40,00",
    ];
    const r = lerVidaAllianz(linhas, "1234567890123456789");
    expect(r?.profissao).toBe("Coordenador");
    expect(r?.vigencia_fim?.iso).toBe("2027-01-10");
    expect(r?.segurado_endereco).toEqual({ cep: "40000000", logradouro: "R. DAS FLORES", numero: "120", complemento: "APTO 3", bairro: "CENTRO", cidade: "Salvador", uf: "BA" });
    expect(r?.coberturas.map((c) => c.valor.centavos)).toEqual([10000000, 5000000]);
    expect(r?.assistencias).toEqual(["Funeral Ampliada"]);
    expect(lerVidaAllianz(linhas, "1234567890123456780")).toBeNull();
  });

  it("Yelum: valores na linha de baixo e continuacao depois deles", () => {
    const r = lerVidaYelum(
      [
        "Apólice - Ramo 93 Vida",
        "Apólice: 12345678",
        "Nome do(a) Segurado(a) CPF/CNPJ Nº da Sorte",
        "FULANA DE TAL 111.444.777-35 12345",
        "Endereço",
        "RUA DAS FLORES , 120",
        "Bairro Cidade UF CEP",
        "CENTRO SALVADOR BA 40000-000",
        "Vigência do Seguro Data de Emissão",
        "Das 00:00hs de 10/01/2026 às 23:59hs de 10/01/2027 05/01/2026",
        "Data de Nascimento",
        "01/02/1990",
        "Cap.Segurado(R$) Prêmio(R$) Carência Franquia",
        "Morte",
        "100.000,00 30,00 - -",
        "Invalidez Permanente Total ou Parcial por",
        "100.000,00 5,00 - -",
        "Acidente",
        "ASSISTENCIA FUNERAL TITULAR I",
        "0,00 3,00 - -",
        "SERVIÇOS COMPLEMENTARES",
      ],
      "12345678",
    );
    expect(r?.segurado_nascimento?.iso).toBe("1990-02-01");
    expect(r?.coberturas.map((c) => c.descricao)).toEqual(["Morte", "Invalidez Permanente Total ou Parcial por Acidente"]);
    expect(r?.assistencias).toEqual(["ASSISTENCIA FUNERAL TITULAR I"]);
    expect([r?.segurado_nome, r?.segurado_documento, r?.vigencia_fim?.iso]).toEqual(["FULANA DE TAL", "11144477735", "2027-01-10"]);
    /* Bairro e cidade colados: so o CEP e a rua com numero. */
    expect(r?.segurado_endereco).toEqual({ cep: "40000000", logradouro: "RUA DAS FLORES", numero: "120", complemento: null, bairro: null, cidade: null, uf: null });
  });
});

describe("residencial Porto", () => {
  const linhas = [
    "Seguro Residencial Habitual",
    "DADOS DA APÓLICE",
    "Número da apólice: 001 14 1234567 Ramo: 114",
    "DADOS DO SEGURADO",
    "Nome: FULANA DE TAL",
    "CPF: 111.444.777-35",
    "Endereço: Rua das Flores, 120 - Apto 3",
    "Bairro: Centro",
    "Cidade: Salvador Estado: BA CEP: 40000-000",
    "LOCAL SEGURADO",
    "Endereço: RUA DAS FLORES 120 APTO 3",
    "Bairro: CENTRO",
    "Cidade: SALVADOR",
    "Estado: BA CEP: 40000-000",
    "Tipo de residência: APARTAMENTO",
    "COBERTURAS CONTRATADAS",
    "PREÇO (R$)",
    "NOME DA COBERTURA L.M.I (R$)",
    "INCÊNDIO, EXPLOSÃO, IMPLOSÃO, FUMAÇA E",
    "R$ 300.000,00 R$ 90,00",
    "QUEDA DE AERONAVE",
    "RC FAMILIAR R$ 20.000,00 R$ 10,00",
    "PREÇO LÍQUIDO DAS COBERTURAS R$ 100,00",
    "SERVIÇOS CONTRATADOS",
    "PLANO ESSENCIAL - GRATUITO APARTAMENTO",
  ];

  it("le a descricao quebrada em volta dos valores e divide o local pelo endereco do segurado", () => {
    const r = lerResidencialPorto(linhas, "001234567");
    expect(r?.coberturas.map((c) => c.descricao)).toEqual(["INCÊNDIO, EXPLOSÃO, IMPLOSÃO, FUMAÇA E QUEDA DE AERONAVE", "RC FAMILIAR"]);
    expect(r?.lmi_basica?.centavos).toBe(30000000);
    expect(r?.imovel).toEqual({ cep: "40000000", logradouro: "RUA DAS FLORES", numero: "120", complemento: "APTO 3", bairro: "CENTRO", cidade: "SALVADOR", uf: "BA" });
    expect(r?.segurado_endereco?.logradouro).toBe("Rua das Flores");
    expect([r?.tipo_imovel, r?.ocupacao, r?.assistencia]).toEqual(["APARTAMENTO", "Habitual", "PLANO ESSENCIAL - GRATUITO APARTAMENTO"]);
  });

  it("local que nao comeca pela rua do segurado: rua e numero ficam nulos", () => {
    const r = lerResidencialPorto(linhas.map((l) => (l === "Endereço: RUA DAS FLORES 120 APTO 3" ? "Endereço: AV OUTRA 55" : l)), "1234567");
    expect(r?.imovel).toMatchObject({ logradouro: null, numero: null, cep: "40000000", uf: "BA" });
  });

  it("trava: outra apolice e recusada", () => {
    expect(lerResidencialPorto(linhas, "7654321")).toBeNull();
  });
});
