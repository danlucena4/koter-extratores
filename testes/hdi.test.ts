/**
 * HDI: o documento de auto (HTML, o mesmo quadro do PDF da apolice).
 */
import { describe, expect, it } from "vitest";
import { condutorDoDocumentoHdi, garagensDaGuardaHdi, lerDocumentoAutoHdi } from "../src/hdi.js";

describe("HDI: Guarda do Veiculo e linha do condutor", () => {
  it("parte so as respostas vistas", () => {
    expect(garagensDaGuardaHdi("Na Residência e Local de Trabalho")).toEqual({
      residencia: "Na Residência e Local de Trabalho",
      trabalho: "SIM",
    });
    expect(garagensDaGuardaHdi("Na Residência, sem Garagem No Local de Trabalho").trabalho).toBe("SEM GARAGEM NO LOCAL DE TRABALHO");
    expect(garagensDaGuardaHdi("Não Possui Garagem")).toEqual({ residencia: "NAO POSSUI GARAGEM", trabalho: null });
    expect(garagensDaGuardaHdi("Garagem Coletiva")).toEqual({ residencia: "Garagem Coletiva", trabalho: null });
  });

  it("condutor: nome, CPF e nascimento", () => {
    const html =
      '<tr><td style="x">Condutor: FULANO DE TAL CPF: 11144477735</td><td colspan="2">Data de Nasc.: 01/02/1990</td></tr>';
    expect(condutorDoDocumentoHdi(html)).toEqual({
      nome: "FULANO DE TAL",
      cpf: "11144477735",
      nascimento: { iso: "1990-02-01", original: "01/02/1990" },
    });
    expect(condutorDoDocumentoHdi("<td>Nome Social do Condutor: </td>")).toBeNull();
  });
});

describe("HDI: lerDocumentoAutoHdi", () => {
  const td = (r: string, v: string) => `<tr><td>${r}</td><td>:&nbsp;&nbsp;${v}</td></tr>`;
  const html = [
    "<table>",
    td("Nome de Registro do Segurado", "FULANA DE TAL"),
    td("CPF", "111.444.777-35"),
    td("Endere&ccedil;o", "RUA DAS FLORES, 120 / APTO 3"),
    td("Cidade", "SALVADOR - BA"),
    td("CEP", "40000-000"),
    "<tr><td>Corretor</td></tr>",
    td("CEP", "41111-111"),
    td("Modelo", "0012345 - FORD KA 1.0 SE FLEX 5P"),
    td("Código FIPE", "003456-7"),
    td("Ano Fabr./Modelo", "2019/2020"),
    td("Combustível", "5-Bi-combustivel"),
    td("Placa/UF", "ABC1D23 - BA"),
    td("Classe de Bônus", "05 - 25,00%"),
    td("Qtde Sinistros", "0"),
    td("Guarda do Veiculo", "Na Residência e Local de Trabalho"),
    td("Utilizacao do Veiculo", "Exclusivamente para Locomocao Diaria"),
    "</table>",
  ].join("");

  it("le o segurado so do bloco dele, e o veiculo e o perfil", () => {
    const d = lerDocumentoAutoHdi(html);
    expect(d).toMatchObject({
      segurado_nome: "FULANA DE TAL",
      segurado_documento: "11144477735",
      endereco: { cep: "40000000", logradouro: "RUA DAS FLORES", numero: "120", complemento: "APTO 3", cidade: "SALVADOR", uf: "BA" },
      marca: "FORD",
      codigo_fipe: "003456-7",
      ano_fabricacao: 2019,
      ano_modelo: 2020,
      combustivel: "Bi-combustivel",
      placa: "ABC1D23",
      classe_bonus: 5,
      sinistros: 0,
      garagem_trabalho: "SIM",
      utilizacao: "Exclusivamente para Locomocao Diaria",
    });
  });
});
