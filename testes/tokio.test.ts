/**
 * Tokio Marine: o PDF da apolice de auto (linhas sinteticas no formato de 9
 * PDFs, 2026-10-20). As respostas do questionario vem na linha de baixo.
 */
import { describe, expect, it } from "vitest";
import { lerApoliceTokio } from "../src/tokio.js";

const linhas = [
  "Tokio Marine Auto",
  "Ramo: 31.20 Apólice: 12345678 Negócio: 123456789 Proposta: 123456789",
  "Tipo de Seguro: Renovação Tokio CI: 01234567890123 Classe de Bônus: 5",
  "Segurado: FULANA DE TAL Nome Social:",
  "CPF : 111.444.777-35",
  "Endereço de Correspondência: RUA DAS FLORES , 120 - APTO 3",
  "Bairro: CENTRO",
  "CEP: 40000-000 Cidade: SALVADOR UF: BA",
  "É possível determinar o condutor: Próprio Segurado",
  "Estado Civil principal condutor: Casado(a) ou vive em união estável",
  "Deseja contratar cobertura do seguro para condutores na faixa etária de 18 a 25 anos que",
  "residem com o Principal Condutor?",
  "Não e estou ciente que esta resposta reduz o prêmio pago",
  "Veículo: KA 1.0 SE FLEX",
  "Fabricante: FORD Ano Modelo: 2020",
  "Tipo De Utilização: Particular - Lazer / ida e Chassi: 9BFZZZ00000000000",
  "volta ao trabalho",
  "Placa: ABC1D23 Combustível: Flex",
  "Zero Km: Não Veículo Blindado: Não",
  "Condição Exclusiva: Não disponível Isenção Fiscal: Não",
  "CEP de pernoite: 40000-000",
  "O Principal condutor possui estacionamento ou garagem fechada, própria ou alugada, na",
  "residência habitual para o veículo segurado?",
  "Sim",
];

describe("Tokio: apolice de auto", () => {
  it("le o quadro e as respostas da linha de baixo", () => {
    expect(lerApoliceTokio(linhas, "12345678")).toMatchObject({
      tipo_seguro: "Renovação Tokio",
      ci: "01234567890123",
      classe_bonus: 5,
      segurado_nome: "FULANA DE TAL",
      segurado_documento: "11144477735",
      endereco: { cep: "40000000", logradouro: "RUA DAS FLORES", numero: "120", complemento: "APTO 3", bairro: "CENTRO", cidade: "SALVADOR", uf: "BA" },
      condutor_determinado: "Próprio Segurado",
      cobertura_residentes_18_25: "Não",
      fabricante: "FORD",
      ano_modelo: 2020,
      uso: "Particular - Lazer / ida e volta ao trabalho",
      placa: "ABC1D23",
      chassi: "9BFZZZ00000000000",
      combustivel: "Flex",
      zero_km: false,
      isencao_fiscal: "Não",
      cep_pernoite: "40000000",
      garagem_residencia: "Sim",
    });
  });

  it("outra apolice, ou o PDF residencial: nada e lido", () => {
    expect(lerApoliceTokio(linhas, "87654321")).toBeNull();
    expect(lerApoliceTokio(["Tokio Marine Residencial - Apólice de Seguro", "Ramo: 14.00 Apólice: 12345678 Negócio: 1"], "12345678")).toBeNull();
  });
});
