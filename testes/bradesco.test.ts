/**
 * Bradesco: o PDF da apolice com cada secao numa linha so (texto sintetico no
 * formato dos 15 PDFs da "A vencer", 2026-10-19).
 */
import { describe, expect, it } from "vitest";
import { lerApoliceBradesco } from "../src/bradesco.js";

const linhas = [
  "CORRETOR: CORRETORA TESTE",
  "Dados da sua apólice Número da apólice 0531.123.0531.012345 Item 0001 Proposta 123456789 Data da Emissão 01/10/2025 Renovação da apólice 654321 Cod. 123-4 Bônus 07 CI 53.100.000.000.001 Cobertura COMPREENSIVA Vigência das 24:00 horas Dados do segurado ________ Nome FULANA DE TAL Data de Nascimento 10/03/1985 Sexo FEMININO CPF/CNPJ 111.444.777/35 Tipo de Pessoa FÍSICA Endereço de Pernoite RUA DAS FLORES 120 Complemento APTO 3 Bairro CENTRO CEP 40000-000 Municipio SALVADOR UF BA Telefone Residencial Dados do principal condutor ________ Nome FULANA DE TAL",
  "Data de Nascimento 10/03/1985 CPF/CNPJ 111.444.777-35 Sexo FEMININO Estado Civil Casada/União Estável Dados do proprietário ____ Nome FULANA DE TAL CPF/CNPJ 111.444.777/35 Dados do veículo ____ Marca/Tipo Veículo FORD KA 1.0 FLEX Ano de Fabricação/Modelo 2019/2020 Chassi 9BFZZZ00000000000 Chassi Remarcado Não Código FIPE 3456.7 Placa ABC1D23 Uso do Veículo Particular Veículo c/ Isenção Fiscal NÃO Tipo Passeio Coberturas ____ Veículo",
  "Questionário de Risco ____ O segurado é proprietário do veículo? SIM O segurado é principal condutor do veículo? SIM Não considerando a(s) pessoa(s) do segurado e do principal condutor, deseja cobertura para outro condutor entre 18 e 25 anos? Não Qual quilometragem média rodada em condições habituais? Até 30 km/dia ou até 900 km/mês Corretor ____ Nome CORRETORA TESTE",
];

describe("Bradesco: secoes e rotulos colados", () => {
  it("le apolice, segurado, condutor, veiculo e questionario", () => {
    expect(lerApoliceBradesco(linhas, "12345")).toMatchObject({
      item: "0001",
      classe_bonus: 7,
      ci: "53100000000001",
      segurado_nascimento: { iso: "1985-03-10" },
      segurado_sexo: "FEMININO",
      segurado_documento: "11144477735",
      endereco_pernoite: { cep: "40000000", bairro: "CENTRO", cidade: "SALVADOR", uf: "BA", complemento: "APTO 3" },
      condutor_cpf: "11144477735",
      condutor_estado_civil: "Casada/União Estável",
      ano_fabricacao: 2019,
      ano_modelo: 2020,
      placa: "ABC1D23",
      uso: "Particular",
      isencao_fiscal: "NÃO",
      segurado_e_principal_condutor: "SIM",
      cobertura_outro_condutor_18_25: "Não",
      km_media: "Até 30 km/dia ou até 900 km/mês",
    });
  });

  it("outra apolice: nada e lido", () => {
    expect(lerApoliceBradesco(linhas, "99999")).toBeNull();
  });
});
