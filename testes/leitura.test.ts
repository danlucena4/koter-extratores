/**
 * As pecas comuns de leitura (texto sintetico, nada real).
 */
import { describe, expect, it } from "vitest";
import {
  camposDaLinha,
  dinheiro,
  marcaEModelo,
  perguntasERespostas,
  posicionarTexto,
  quadroPorColuna,
  ruaNumeroComplemento,
  ruaPeloPrimeiroNumero,
  tabelaPorColunas,
  tabelaPorValores,
  telefones,
} from "../src/leitura.js";
import { dataPorExtenso } from "../src/zurich-auto.js";

describe("valores", () => {
  it("dinheiro pt-BR, e percentual nao e dinheiro", () => {
    expect(dinheiro("R$ 1.234,56")?.centavos).toBe(123456);
    expect(dinheiro("100,00% tab. FIPE")).toBeNull();
    expect(dinheiro("Não contratado")).toBeNull();
  });

  it("telefones com DDD, sem repetir", () => {
    expect(telefones("(71) 99999-1234 / 71 999991234 Tel: (11) 3333-4444")).toEqual(["71999991234", "1133334444"]);
  });

  it("data por extenso", () => {
    expect(dataPorExtenso("24hs do dia 12 de Setembro de 2025")?.iso).toBe("2025-09-12");
  });

  it("marca de duas palavras", () => {
    expect(marcaEModelo("Caoa Chery Tiggo 5 Sport")).toEqual({ marca: "Caoa Chery", modelo: "Tiggo 5 Sport" });
    expect(marcaEModelo("Volkswagen T-Cross 1.0")).toEqual({ marca: "Volkswagen", modelo: "T-Cross 1.0" });
  });

  it("rua, numero e complemento so quando o numero esta isolado", () => {
    expect(ruaNumeroComplemento("Rua das Flores, 120 - Apto 3")).toEqual({ logradouro: "Rua das Flores", numero: "120", complemento: "Apto 3" });
    expect(ruaNumeroComplemento("RUA DAS FLORES 120 APTO 3")).toEqual({ logradouro: null, numero: null, complemento: null });
    expect(ruaPeloPrimeiroNumero("RUA DAS FLORES 120 APTO 3")).toEqual({ logradouro: "RUA DAS FLORES", numero: "120", complemento: "APTO 3" });
  });
});

describe("rotulos e quadros", () => {
  it("varios rotulos na mesma linha, CPF dentro de CPF/CNPJ", () => {
    const c = camposDaLinha("Nome: FULANA DE TAL CPF/CNPJ: 111.444.777-35 Sexo: FEMININO", ["Nome", "CPF", "CPF/CNPJ", "Sexo"]);
    expect([c.get("Nome"), c.get("CPF/CNPJ"), c.get("Sexo"), c.has("CPF")]).toEqual(["FULANA DE TAL", "111.444.777-35", "FEMININO", false]);
  });

  it("quadro por coluna, com valor que quebra em duas linhas", () => {
    const pos = posicionarTexto([
      "Nome                      Data de Nascimento  Sexo",
      "FULANA DE TAL SOBRENOME   01/02/1990          FEMININO",
      "COMPRIDO",
      "CPF/CNPJ  Tipo de Pessoa",
    ]);
    const q = quadroPorColuna(pos, ["Nome", "Data de Nascimento", "Sexo"], { ate: /^CPF/ });
    expect(q?.get("Nome")).toBe("FULANA DE TAL SOBRENOME COMPRIDO");
    expect(q?.get("Sexo")).toBe("FEMININO");
  });

  it("tabela por colunas: descricao com numero, valor em texto, descricao quebrada", () => {
    const pos = posicionarTexto([
      "Cobertura                              Valor                  Prêmio líquido",
      "Básica- Colisão/Incêndio/Roubo/Furto   100% FIPE              4.333,03",
      "RCFA - Danos Materiais                 100.000,00             1.326,66",
      "RCFA – Objetos Transportados pelo      Conf. Cond. Gerais     Gratuito",
      "Veículo",
      "Carro Reserva 7 Dias Econômico         Conf. Cond. Gerais     23,76",
      "FRANQUIA",
    ]);
    const t = tabelaPorColunas(pos, ["Cobertura", "Valor", "Prêmio líquido"], /^FRANQUIA/);
    expect(t.map((r) => r.get("Cobertura"))).toEqual([
      "Básica- Colisão/Incêndio/Roubo/Furto",
      "RCFA - Danos Materiais",
      "RCFA – Objetos Transportados pelo Veículo",
      "Carro Reserva 7 Dias Econômico",
    ]);
    expect(t[0]?.get("Valor")).toBe("100% FIPE");
    expect(t[3]?.get("Prêmio líquido")).toBe("23,76");
  });

  it("tabela pelos valores do fim da linha, com descricao em volta da linha so de valores e prosa ignorada", () => {
    const t = tabelaPorValores([
      "INCÊNDIO, EXPLOSÃO, IMPLOSÃO, FUMAÇA E",
      "R$ 300.000,00 R$ 90,00",
      "QUEDA DE AERONAVE",
      "Blindagem Não contratado R$ 0,00",
      "Danos Materiais R$ 100.000,00 R$ 500,00",
      "1 - Limite máximo de Indenização - Na contratação da modalidade valor de mercado, constará na apólice",
      "Extensão De Perímetro GRATUITA",
    ]);
    expect(t.map((r) => [r.descricao, r.valores])).toEqual([
      ["INCÊNDIO, EXPLOSÃO, IMPLOSÃO, FUMAÇA E QUEDA DE AERONAVE", ["R$ 300.000,00", "R$ 90,00"]],
      ["Blindagem", ["Não contratado", "R$ 0,00"]],
      ["Danos Materiais", ["R$ 100.000,00", "R$ 500,00"]],
      ["Extensão De Perímetro", ["GRATUITA"]],
    ]);
  });

  it("perguntas e respostas, com pergunta quebrada e resposta na linha de baixo", () => {
    expect(
      perguntasERespostas([
        "O segurado é proprietário do veículo?",
        "SIM",
        "Não considerando a(s) pessoa(s) do segurado e do principal condutor, deseja cobertura para",
        "outro condutor entre 18 e 25 anos?",
        "Não",
        "Mantém o veículo em garagem no trabalho? Não mantém",
      ]),
    ).toEqual([
      { pergunta: "O segurado é proprietário do veículo?", resposta: "SIM" },
      {
        pergunta: "Não considerando a(s) pessoa(s) do segurado e do principal condutor, deseja cobertura para outro condutor entre 18 e 25 anos?",
        resposta: "Não",
      },
      { pergunta: "Mantém o veículo em garagem no trabalho?", resposta: "Não mantém" },
    ]);
  });
});
