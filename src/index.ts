/**
 * koter-extratores: extracao de dados de documentos de seguradoras (PDF de
 * apolice e de proposta) para a renovacao do Koter.
 *
 * PURO: recebe as linhas (ou os bytes) do documento e a TRAVA (numero da
 * apolice ou CPF do segurado) e devolve o que esta impresso, cru, como a cia
 * escreveu; `null` quando o documento nao e o pedido. Sem rede, sem portal,
 * sem sessao: baixar o documento e traduzir para a cotacao e de quem consome.
 */
export * from "./tipos.js";
export * from "./pdf-texto.js";
export * from "./mapfre.js";
export * from "./yelum.js";
export * from "./allianz.js";
export * from "./allianz-residencial.js";
export * from "./porto.js";
export * from "./hdi.js";
export * from "./bradesco.js";
export * from "./zurich.js";
export * from "./tokio.js";
export * from "./tabela.js";
export * from "./residencial.js";
export * from "./vida.js";
export * from "./gerais.js";
export * from "./documento.js";
export * from "./compat.js";
