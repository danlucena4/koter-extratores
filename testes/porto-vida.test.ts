/**
 * Porto Vida: linhas SINTETICAS na forma dos dois layouts da cobranca de
 * 2026-10-22 (nomes, documentos, enderecos e valores inventados).
 */
import { describe, expect, it } from "vitest";
import { extrairDocumento } from "../src/documento.js";

const legado = [
  "VIDA INDIVIDUAL",
  "Porto Seguro Cia de Seguros Gerais",
  "APÓLICE DE RENOVAÇÃO SEGURO DE VIDA INDIVIDUAL",
  "Al. Barão de Piracicaba, 740 - Campos Elíseos São Paulo",
  "CEP 01216-012 CNPJ 61.198.164/0001-60 E/OU ACIDENTES PESSOAIS",
  "APÓLICE Nº 4.1381.1000001 PROPOSTA Nº 1 - 20000001 FOLHA 1 de 3",
  "VIGÊNCIA DO SEGURO: A PARTIR DAS 24 HORAS DO DIA 10/03/2026 ATÉ ÀS 24 HORAS DO DIA 10/03/2027.",
  "DADOS DO SEGURADO",
  "NOME FULANO DE TAL",
  "NOME SOCIAL",
  "DATA NASCIMENTO 01/02/1980 CPF/CNPJ 111.444.777-35",
  "RG 1234567890 DATA EXPEDIÇÃO 01/01/2000 ORGÃO EXPEDIDOR SSPBA",
  "CEP 40000-000 ENDEREÇO R DAS FLORES, 12 CASA",
  "BAIRRO CENTRO CIDADE SALVADOR ESTADO BA",
  "DADOS DO DESTINATÁRIO",
  "FULANO DE TAL",
  "DADOS DO CORRETOR",
  "CORRETOR LÍDER: CORRETORA EXEMPLO LTDA",
  "DADOS DO BENEFICIÁRIO",
  "NOME DATA DE NASCIMENTO PARENTESCO: CPF: %:",
  "FULANA DE TAL 05/06/1985 Cônjuge 222.333.444-05 50.00",
  "CICLANO DE TAL 07/08/2010 FILHO - 50.00",
  "DADOS DO SEGURO",
  "RAMO GARANTIAS CAPITAIS SEGURADOS PRÊMIOS",
  "1381 Morte R$ 100.000,00 R$ 300,00",
  "1381 Invalidez Permanente Total ou R$ 100.000,00 R$ 40,00",
  "Parcial por Acidente até(***)",
  "1381 Assistência Funeral - Titular R$ 5.000,00 R$ 20,00",
  "O seguro dará cobertura para eventos ocorridos em todo o mundo, exceto para Diária por",
  "Incapacidade por Acidente e Diária por Internação, que o âmbito será o Brasil.",
  "CARÊNCIAS E FRANQUIAS",
  "DEMONSTRATIVO DE CUSTOS",
  "PRÊMIO LIQUIDO ADICIONAL FRACIONAMENTO I.O.F. CUSTO ASSISTENCIAS VALOR TOTAL",
  "R$ 360,00 R$ 0,00 R$ 1,37 R$ 0,00 R$ 361,37",
  "FORMA DE PAGAMENTO",
  "QTDE. PARC. FORMA DE PAGAMENTO PARCELA DATA VENCIMENTO I.O.F. VALOR DAS PARCELAS",
  "2 CARTAO PORTO SEGURO 1 FATURA CARTÃO R$ 0,69 R$ 180,69",
  "2 FATURA CARTÃO R$ 0,68 R$ 180,68",
];

const novo = [
  "Apólice Individual de Seguros de Pessoas:",
  "PORTO SEGURO CIA DE SEGUROS GERAIS",
  "CNPJ:61.198.164/0001-60",
  "Seguro de Pessoas Individual",
  "Registro Susep:0000-0",
  "Processo SUSEP nº:15414.000000/2020-00",
  "APÓLICE N°: 001000002",
  "VIGÊNCIA DO SEGURO: a partir das 24 horas do dia 15/04/2026 até PROPOSTA Nº: 30000002",
  "as 24 horas do dia 15/04/2027",
  "INICIO DE VIGÊNCIA DO SEGURO: FIM DE VIGÊNCIA DO SEGURO: DATA DE EMISSÃO DA APÓLICE:",
  "15/04/2026 15/04/2027 20/04/2026",
  "DADOS DO SEGURADO",
  "Nome: FULANA DE TAL",
  "Data de nascimento: 03/04/1975 CPF/CNPJ: 111.444.777-35",
  "E-mail: FULANA@EXEMPLO.COM Endereço: RUA DAS FLORES",
  "Número: 120 Complemento: APTO 301",
  "Bairro: CENTRO Cidade: SALVADOR Estado: BA CEP: 40000-000",
  "DADOS DO CORRETOR",
  "Corretor líder: CORRETORA EXEMPLO LTDA",
  "Endereco: AV EXEMPLO Numero: 1 Complemento: SALA 2",
  "Bairro: OUTRO Cidade: SALVADOR Estado: BA CEP: 41000-000",
  "COBERTURAS",
  "Ramo: Cobertura(s): Validade da Cobertura: Capital Segurado(R$): Valor do Seguro(R$):",
  "1391 Morte 15/04/2026-15/04/2027 R$ 200.000,00 R$ 500,00",
  "1391 Invalidez Permanente Total ou Parcial por Acidente Plus* 15/04/2026-15/04/2027 R$ 200.000,00 R$ 60,00",
  "1391 Doenças Graves - Plano Básico 15/04/2026-15/04/2027 R$ 50.000,00 R$ 90,00",
  "O seguro dará cobertura para eventos cobertos, ocorridos por todo o mundo.",
  "CARÊNCIAS E FRANQUIAS",
  "ASSISTÊNCIAS E BENEFÍCIOS",
  "Assistência(s) e Benefício (s): Validade da Assistência: Valor da Assistência",
  "Telemedicina 15/04/2026-15/04/2027 Assistência gratuita",
  "BENEFICIÁRIO",
  "Nome do(s) Beneficiario(s): Nome Social do(s) Beneficiario(s): Data de nascimento: Grau de parentesco: %:",
  "FULANO DE TAL 09/10/1970 Cônjuge 100.00%",
  "VALORES E PAGAMENTOS",
  "Valor Liquido Total: Valor Total de Assistência: IOF: Valor Total:",
  "R$ 650,00 - R$ 2,47 R$ 652,47",
  "Forma de Pagamento: Quantidade de Parcelas: Primeira Parcela Demais Parcelas",
  "FRAC.1.A PARCELA CARNE 12 R$ 54,37 R$ 54,37",
];

describe("Porto Vida — layout legado", () => {
  it("e vida da Porto (nao auto) e o documento sai inteiro", () => {
    const doc = extrairDocumento(legado);
    expect([doc?.seguradora, doc?.ramo, doc?.tipo, doc?.numero_apolice]).toEqual(["porto", "vida", "apolice", "1000001"]);
    expect([doc?.produto, doc?.tipo_seguro, doc?.proposta]).toEqual(["VIDA INDIVIDUAL", "RENOVAÇÃO", "20000001"]);
    expect([doc?.vigencia_inicio?.iso, doc?.vigencia_fim?.iso]).toEqual(["2026-03-10", "2027-03-10"]);
    expect(doc?.segurado).toMatchObject({ nome: "FULANO DE TAL", documento: "11144477735", nascimento: { iso: "1980-02-01" } });
    expect(doc?.segurado?.endereco).toEqual({ cep: "40000000", logradouro: "R DAS FLORES", numero: "12", complemento: "CASA", bairro: "CENTRO", cidade: "SALVADOR", uf: "BA" });
    /* O texto corrido embaixo da tabela nao vira parte da ultima cobertura. */
    expect(doc?.coberturas.map((c) => [c.descricao, c.valor?.centavos, c.premio?.centavos])).toEqual([
      ["Morte", 10000000, 30000],
      ["Invalidez Permanente Total ou Parcial por Acidente", 10000000, 4000],
      ["Assistência Funeral - Titular", 500000, 2000],
    ]);
    expect(doc?.vida?.capital_morte?.centavos).toBe(10000000);
    expect([doc?.premio_liquido?.centavos, doc?.premio_total?.centavos, doc?.vida?.periodicidade_premio]).toEqual([36000, 36137, "ANUAL"]);
    expect(doc?.pagamento).toEqual({ forma: "CARTAO PORTO SEGURO", parcelas: 2 });
    expect(doc?.vida?.beneficiarios.map((b) => [b.nome, b.documento, b.nascimento?.iso, b.parentesco, b.percentual])).toEqual([
      ["FULANA DE TAL", "22233344405", "1985-06-05", "Cônjuge", 50],
      ["CICLANO DE TAL", null, "2010-08-07", "FILHO", 50],
    ]);
  });

  it("endereco sem separador: rua e numero ficam nulos, o resto entra", () => {
    const sem = legado.map((l) => (l.startsWith("CEP 40000") ? "CEP 40000-000 ENDEREÇO R DAS FLORES 12 CASA" : l));
    expect(extrairDocumento(sem)?.segurado?.endereco).toEqual({ cep: "40000000", logradouro: null, numero: null, complemento: null, bairro: "CENTRO", cidade: "SALVADOR", uf: "BA" });
  });

  it("Acidentes Pessoais: so Morte Acidental, e o capital de morte fica nulo (nunca o acidental no lugar)", () => {
    const ap = legado
      .map((l) => (l === "VIDA INDIVIDUAL" ? "ACIDENTES PESSOAIS INDIVIDUAL - PLUS" : l === "1381 Morte R$ 100.000,00 R$ 300,00" ? "1381 Morte Acidental R$ 100.000,00 R$ 30,00" : l));
    const doc = extrairDocumento(ap);
    expect(doc?.produto).toBe("ACIDENTES PESSOAIS INDIVIDUAL - PLUS");
    expect(doc?.coberturas[0]?.descricao).toBe("Morte Acidental");
    expect(doc?.vida?.capital_morte).toBeNull();
  });

  it("trava: o numero e o ULTIMO grupo de sucursal.ramo.apolice; outra apolice e recusada", () => {
    expect(extrairDocumento(legado, { numero_apolice: "001000001" })?.ramo).toBe("vida");
    expect(extrairDocumento(legado, { numero_apolice: "1381" })).toBeNull();
    expect(extrairDocumento(legado, { numero_apolice: "1000009" })).toBeNull();
  });
});

describe("Porto Vida — layout novo (Seguro de Pessoas Individual)", () => {
  it("e vida da Porto e o documento sai inteiro", () => {
    const doc = extrairDocumento(novo);
    expect([doc?.seguradora, doc?.ramo, doc?.tipo, doc?.numero_apolice]).toEqual(["porto", "vida", "apolice", "001000002"]);
    expect([doc?.produto, doc?.proposta, doc?.emissao?.iso]).toEqual(["Seguro de Pessoas Individual", "30000002", "2026-04-20"]);
    expect([doc?.vigencia_inicio?.iso, doc?.vigencia_fim?.iso]).toEqual(["2026-04-15", "2027-04-15"]);
    expect(doc?.segurado).toMatchObject({ nome: "FULANA DE TAL", documento: "11144477735", email: "fulana@exemplo.com", nascimento: { iso: "1975-04-03" } });
    /* O endereco e o do segurado, nao o do corretor (que vem logo abaixo, com os mesmos rotulos). */
    expect(doc?.segurado?.endereco).toEqual({ cep: "40000000", logradouro: "RUA DAS FLORES", numero: "120", complemento: "APTO 301", bairro: "CENTRO", cidade: "SALVADOR", uf: "BA" });
    expect(doc?.coberturas.map((c) => [c.descricao, c.valor?.centavos, c.premio?.centavos])).toEqual([
      ["Morte", 20000000, 50000],
      ["Invalidez Permanente Total ou Parcial por Acidente Plus", 20000000, 6000],
      ["Doenças Graves - Plano Básico", 5000000, 9000],
    ]);
    expect(doc?.vida?.capital_morte?.centavos).toBe(20000000);
    expect(doc?.assistencias).toEqual(["Telemedicina"]);
    expect([doc?.premio_liquido?.centavos, doc?.premio_total?.centavos, doc?.vida?.periodicidade_premio]).toEqual([65000, 65247, "ANUAL"]);
    expect(doc?.pagamento).toEqual({ forma: "FRAC.1.A PARCELA CARNE", parcelas: 12 });
    expect(doc?.vida?.beneficiarios.map((b) => [b.nome, b.nascimento?.iso, b.parentesco, b.percentual])).toEqual([["FULANO DE TAL", "1970-10-09", "Cônjuge", 100]]);
  });

  it("trava: outra apolice e recusada", () => {
    expect(extrairDocumento(novo, { numero_apolice: "1000003" })).toBeNull();
  });
});

describe("Porto auto continua auto", () => {
  it("apolice de auto da Porto nao e confundida com vida", () => {
    const auto = ["Porto Seguro", "Dados da sua apólice", "Apólice: 0531 12345678 Item: 1"];
    expect(extrairDocumento(auto)?.ramo).toBe("auto");
  });
});
