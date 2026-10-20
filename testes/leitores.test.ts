/**
 * Leitores do PDF da apolice para o Renovar (docs/renovacao-pdf/LAYOUTS.md).
 * Linhas SINTETICAS no formato visto nos PDFs da "A vencer" (2026-10-19): os
 * rotulos sao os da cia, os valores sao inventados.
 */
import { describe, expect, it } from "vitest";
import { lerToUnicode, linhasDoConteudo } from "../src/pdf-texto.js";
import { simNaoNoFim } from "../src/yelum.js";
import { lerApoliceMapfreKit, lerPropostaMapfre } from "../src/mapfre.js";
import { questionarioDaApoliceAllianz } from "../src/allianz.js";
import { lerApolicePorto } from "../src/porto.js";

describe("pdf-texto: fonte composta com ToUnicode (Porto, Yelum/Aliro)", () => {
  const cmap = [
    "begincodespacerange <0000> <FFFF> endcodespacerange",
    "2 beginbfchar <0003> <0041> <0004> <00E3> endbfchar",
    "1 beginbfrange <0010> <0012> <004E> endbfrange",
  ].join("\n");
  const tabela = lerToUnicode(cmap);

  it("le bfchar e bfrange", () => {
    expect(tabela.bytes).toBe(2);
    expect(tabela.mapa.get("0003")).toBe("A");
    expect(tabela.mapa.get("0004")).toBe("ã");
    expect(tabela.mapa.get("0011")).toBe("O");
  });

  it("traduz hexadecimal e literal de 2 bytes pela fonte selecionada com Tf", () => {
    const fontes = new Map([["F0", tabela]]);
    const hex = linhasDoConteudo("BT /F0 10 Tf 10 700 Td <00100004>Tj ET", fontes);
    expect(hex).toEqual(["Nã"]);
    /* Literal "\0\4" (o "ã" da Aliro) tambem passa pela tabela. */
    const literal = linhasDoConteudo("BT /F0 10 Tf 10 700 Td (\\000\\004)Tj ET", fontes);
    expect(literal).toEqual(["ã"]);
  });

  it("sem tabela, o literal segue como sempre", () => {
    expect(linhasDoConteudo("BT 10 700 Td (Classe de bonus: 5)Tj ET")).toEqual(["Classe de bonus: 5"]);
  });
});

describe("Yelum/Aliro: SIM/NAO com o til perdido", () => {
  it.each([
    ["Proprio segurado NAO", "NAO"],
    ["Proprio segurado N ã o", "NAO"],
    ["NÃO POSSUI N   o", "NAO"],
    ["Socios e ou diretores SIM", "SIM"],
    ["Proprio segurado", null],
  ])("%s -> %s", (texto, esperado) => {
    expect(simNaoNoFim(texto)).toBe(esperado);
  });
});

describe("MAPFRE (kit): bonus e 18 a 25 fora do quadro de rotulos", () => {
  const base = ["Produto: 999 Nº Apólice: 1234567 8901 23", "Endosso: 0 Itens: 1 Nº Via: 1 ª"];
  const ler = (extra: string[]) => lerApoliceMapfreKit([...base, ...extra], "12345678901 23");

  it("'1 0' e 10, nunca 1", () => {
    expect(ler(["Classe de bônus 1 0"])?.classe_bonus).toBe(10);
    expect(ler(["Classe de bônus 03"])?.classe_bonus).toBe(3);
  });

  it("frase que menciona a classe de bonus nao e a classe", () => {
    expect(ler(["Tratando-se de renovação de seguro de outra seguradora, a classe de bônus"])?.classe_bonus).toBeNull();
  });

  it("resposta letra por letra na linha de baixo", () => {
    const r = ler(["Deseja contratarcobertura para condutores residentes entre 1 8e 25anos?", "#", "N Ã O"]);
    expect(r?.menores_25).toBe("NAO");
  });

  it("outra apolice: nada e lido", () => {
    expect(lerApoliceMapfreKit(base, "99999999999 99")).toBeNull();
  });
});

describe("Allianz: questionario impresso", () => {
  it("carro: reside em e 18 a 25 (so o Sim/Não da frente)", () => {
    const q = questionarioDaApoliceAllianz([
      "Deseja ampliar a cobertura do seguro para condutores do veículo segurado com idade entre 18 a 25 anos: Não. Estou",
      "ciente que não haverá cobertura para condutores entre 18 a 25 anos.",
      "O principal condutor reside em: Casa",
    ]);
    expect(q).toMatchObject({ tipo_residencia: "Casa", cobertura_18_25: "Não", garagem_residencia: null });
  });

  it("moto: as tres garagens", () => {
    const q = questionarioDaApoliceAllianz([
      "Mantém o veículo em garagem na residência? Sim, mantém o veículo segurado em garagem",
      "Mantém o veículo em garagem no trabalho? Não mantém o veículo segurado em garagem",
      "Mantém o veículo em garagem na faculdade / universidade / escola / pós-graduação / cursos? Não estuda/Não",
    ]);
    expect(q).toMatchObject({
      garagem_residencia: "Sim, mantém o veículo segurado em garagem",
      garagem_trabalho: "Não mantém o veículo segurado em garagem",
      garagem_estudo: "Não estuda/Não",
    });
  });
});

describe("Porto: o PDF completa o Renovar", () => {
  const linhas = [
    "Apólice: 0001 31 12345678 Item: 01",
    "Renova nº: 0001 31 87654321 Classe de bônus: 7",
    "Segurado(a): FULANA",
    "Data de nascimento: 10/03/1985 Sexo: Feminino",
    "Portas: Combustível:",
    "4 Gasolina/Alcool",
    "Uso: Particular Câmbio automático: Não",
    "Nome do motorista principal: FULANA",
    "Sexo: Feminino Data de nascimento: 10/03/1985 CPF: 111.444.777-35",
    "Cep do local onde o veiculo pernoita? 40000000",
  ];

  it("le o segurado, o motorista e o veiculo pelos rotulos", () => {
    expect(lerApolicePorto(linhas, "12345678")).toMatchObject({
      classe_bonus: 7,
      segurado_nascimento: { iso: "1985-03-10" },
      segurado_sexo: "Feminino",
      combustivel: "Gasolina/Alcool",
      uso: "Particular",
      condutor_sexo: "Feminino",
      condutor_nascimento: { iso: "1985-03-10" },
      condutor_cpf: "11144477735",
      cep_pernoite: "40000000",
    });
  });

  it("acento separado do Itau ('Combust í vel') ainda casa", () => {
    const itau = ["Apólice: 0001 31 12345678 Item: 01", "Portas: 4 Combust í vel: Gasolina/Alcool"];
    expect(lerApolicePorto(itau, "12345678")?.combustivel).toBe("Gasolina/Alcool");
  });

  it("outra apolice: nada e lido", () => {
    expect(lerApolicePorto(linhas, "99999999")).toBeNull();
  });

  it("endereco do segurado nas duas formas de coluna", () => {
    const a = ["Segurado(a): FULANA", "Endereço: R Das Flores, 120 Casa", "Bairro: Centro Estado: BA", "40000-000", "Cidade: Salvador CEP:", "Tel. residencial: Celular:"];
    expect(lerApolicePorto(["Apólice: 0001 31 12345678 Item: 01", ...a], "12345678")?.endereco).toEqual({
      cep: "40000000",
      logradouro: "R Das Flores",
      numero: "120",
      complemento: "Casa",
      bairro: "Centro",
      cidade: "Salvador",
      uf: "BA",
    });
    const b = ["Segurado(a): FULANA", "Endereço: R Um, 5", "Bairro: Centro CEP: 01000-000", "Cidade: Sao Paulo - SP - CEP:", "Tel. residencial:"];
    expect(lerApolicePorto(["Apólice: 0001 31 12345678 Item: 01", ...b], "12345678")?.endereco).toMatchObject({
      cep: "01000000",
      bairro: "Centro",
      cidade: null,
      uf: null,
    });
  });

  it("Itau: 'Nome do segurado(a)' e 'Nome do condutor(a)', com nascimento e sem sexo", () => {
    const itau = [
      "Ap ó lice: 0001 31 12345678 Item: 01",
      "Nome do segurado(a): FULANA",
      "CPF: 11144477735 Data de nasc.: 10/03/1985",
      "Endere ç o: R Um, 5 Apt 2",
      "Bairro: Centro Estado: BA",
      "Cidade: Salvador CEP: 40000-000",
      "Dados do ve í culo segurado",
      "Nome do condutor(a): FULANA",
      "CPF: 11144477735 Data de nasc: 10/03/1985",
    ];
    expect(lerApolicePorto(itau, "12345678")).toMatchObject({
      segurado_nascimento: { iso: "1985-03-10" },
      segurado_sexo: null,
      condutor_cpf: "11144477735",
      condutor_nascimento: { iso: "1985-03-10" },
      condutor_sexo: null,
      endereco: { cep: "40000000", logradouro: "R Um", numero: "5", complemento: "Apt 2", bairro: "Centro", cidade: "Salvador", uf: "BA" },
    });
  });

  it("rotulo 'Apólice:' noutra linha: o numero antes de 'Item:' ainda trava", () => {
    const l = ["Apólice:", "01 31 0001 12345678 Item: 01", "Uso: Particular Câmbio automático: Não"];
    expect(lerApolicePorto(l, "12345678")?.uso).toBe("Particular");
    expect(lerApolicePorto(l, "87654321")).toBeNull();
  });

  it("PDF de endosso (sem linha de Item): vale o numero inteiro em alguma linha, nunca um pedaco", () => {
    const endosso = ["Endosso nº: 7654321 Classe de bônus: 10", "apolice=12345678;origem=31"];
    expect(lerApolicePorto(endosso, "12345678")?.classe_bonus).toBe(10);
    expect(lerApolicePorto(endosso, "2345678")).toBeNull();
  });
});

describe("MAPFRE (proposta): o segurado, travado pelo CPF", () => {
  const linhas = [
    "Proposta de Seguro MAPFRE Auto - 999",
    "Nome do Segurado: FULANA DE TAL Tipo Pessoa: FISICA CPF: 111.444.777-35",
    "Tipo de Documento: Nr. do Documento:",
    "Data Nasc.: 10/03/1985 Sexo: FEMININO Est.Civil: CASADO",
    "E-mail: fulana@exemplo.com Atividade: ADMINISTRADOR",
    "Nome do Segurado: Tipo Pessoa: CPF:",
    "Data Nasc.: Sexo: Est.Civil:",
    "01/01/1960 MASCULINO SOLTEIRO",
  ];

  it("le o bloco do segurado, nunca o do pagador", () => {
    expect(lerPropostaMapfre(linhas, "11144477735")).toEqual({
      segurado_nascimento: { iso: "1985-03-10", original: "10/03/1985" },
      segurado_sexo: "FEMININO",
      segurado_estado_civil: "CASADO",
      segurado_atividade: "ADMINISTRADOR",
    });
  });

  it("CPF de outra pessoa (ou sem CPF): nada e lido", () => {
    expect(lerPropostaMapfre(linhas, "52998224725")).toBeNull();
    expect(lerPropostaMapfre(linhas, null)).toBeNull();
  });
});
