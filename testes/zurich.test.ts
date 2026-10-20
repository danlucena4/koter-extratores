/**
 * Zurich: o questionario lido pelos PEDACOS (a pagina em colunas embaralha as
 * linhas). Pedacos sinteticos na ordem vista em 9 PDFs (2026-10-20).
 */
import { describe, expect, it } from "vitest";
import { lerApoliceZurichDosPedacos } from "../src/zurich.js";

const p = (texto: string) => ({ x: 0, y: 0, texto });
const pagina = [
  p("Apólice: 1234567"),
  p("Questionário Perfil Condutor Principal"),
  p("Nome Completo: FULANA DE TAL"),
  p("Nasc: 10/03/1985"),
  p("Sexo: Feminino"),
  p("Estado Civil: Solteiro(a)"),
  p("Qual o tipo de residência do condutor principal? Casa ou sobrado"),
  p("Deseja cobertura do seguro para outros condutores habilitados com menos de 25 anos? Não"),
  p("O  veículo fica guardado em garagem ou estacionamento fechados quando utilizado para ir ao "),
  p("trabalho? Não usa veículo para ir ao trabalho"),
  p("O veículo fica guardado em garagem ou estacionamento fechados quando utilizado para ir à escola, "),
  p("faculdade ou pós-graduação? Sim"),
  p("O veículo fica guardado em garagem ou estacionamento fechados no seu local de pernoite? Sim, com "),
  p("portão manual"),
  p("Coberturas"),
  p("Descrição"),
];

describe("Zurich: questionario pelos pedacos", () => {
  it("cada resposta ate a proxima pergunta", () => {
    expect(lerApoliceZurichDosPedacos([pagina], "1234567")).toEqual({
      numero: "1234567",
      condutor_nascimento: { iso: "1985-03-10", original: "10/03/1985" },
      condutor_sexo: "Feminino",
      condutor_estado_civil: "Solteiro(a)",
      tipo_residencia: "Casa ou sobrado",
      cobertura_menores_25: "Não",
      garagem_trabalho: "Não usa veículo para ir ao trabalho",
      garagem_estudo: "Sim",
      garagem_residencia: "Sim, com portão manual",
    });
  });

  it("outra apolice: nada e lido", () => {
    expect(lerApoliceZurichDosPedacos([pagina], "7654321")).toBeNull();
  });
});
