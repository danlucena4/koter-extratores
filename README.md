# koter-extratores

Extração de dados de documentos de seguradoras (PDF de apólice e de proposta) para a
**renovação** do Koter: o que está impresso no documento, cru, como a seguradora escreveu.

É **puro**: sem rede, sem portal, sem sessão. Quem baixa o documento (a automação: o
multicálculo, o koter-automation-api) chama o extrator; quem traduz para a cotação também é
o consumidor.

## Regra de ouro: só dado verdadeiro

- **Trava:** cada leitor confere que o documento é o pedido (número da apólice no cabeçalho;
  na proposta da MAPFRE, o CPF do segurado). Sem a trava, devolve `null`.
- Só sai o que tem **rótulo reconhecido**. Rótulo ausente ou valor fora do formato: o campo
  sai `null`, nunca um palpite.
- Valores saem **crus** (o texto da seguradora). Tradução para as opções da cotação, "a
  conferir" e padrões são de quem consome.

## O que tem

| Módulo | O que lê |
|---|---|
| `pdf-texto` | texto do PDF em linhas, ou em pedaços com posição (FlateDecode; fontes com `/ToUnicode`, inclusive compostas; ignora imagens) |
| `mapfre` | apólice (kit e layout antigo) e **proposta** (sexo, nascimento, estado civil e Atividade do segurado) |
| `yelum` | apólice Yelum e Aliro (veículo, perfil, vínculo do condutor, residentes 18/25, isenção) |
| `allianz` | apólice de auto (quadro, questionário: reside em, 18 a 25, garagens da moto) |
| `allianz-residencial` | apólice residencial |
| `porto` | apólice Porto/Azul/Itaú (segurado, motorista principal, pernoite, combustível, uso, endereço) |
| `hdi` | documento de auto (HTML, o mesmo quadro do PDF): segurado, veículo, perfil, guarda do veículo, condutor |
| `bradesco` | apólice de auto (seções numa linha só): segurado, condutor, veículo, isenção, Questionário de Risco |
| `zurich` | apólice de auto pelo Questionário Perfil (residência, garagens com portão, trabalho, escola) |
| `tokio` | apólice de auto (segurado, condutor determinado, residentes 18 a 25, garagem, uso, placa, chassi, bônus, CI) |
| `residencial` | apólice residencial MAPFRE, HDI e Tokio (endereço do risco, tipo, ocupação, coberturas + LMI, assistência) |
| `vida` | apólice de vida MAPFRE, Allianz e Yelum (nascimento, sexo, profissão, renda, coberturas + capital) |
| `tabela` | dinheiro pt-BR e a tabela de coberturas (descrição que quebra linha + valores) comum aos leitores |

Pier, Youse e Justos não têm renovação própria.

## Uso

```ts
import { linhasDoPdf, lerApoliceYelum } from "koter-extratores";

const linhas = linhasDoPdf(bytesDoPdf);
const lida = lerApoliceYelum(linhas, numeroDaApolice); // null se o PDF nao for desta apolice
```

Instalação (direto do git):

```bash
npm install github:danlucena4/koter-extratores
```

O `prepare` compila o `dist/` na instalação.

## Desenvolvimento

```bash
npm install
npm test
npm run typecheck
```

Os testes usam **linhas sintéticas** no formato visto nos PDFs reais (rótulos da seguradora,
valores inventados). Nenhum PDF real entra no repositório (`*.pdf` no `.gitignore`).

### Estudar um layout novo

Os PDFs ficam fora do repositório, numa pasta com uma subpasta por seguradora
(`<pasta>/<cia>/<n>.pdf` + `<n>.json` com o identificador), como o baixador do multicálculo
grava (`apps/api/scripts/_baixar-pdfs-renovacao.mts`, só leitura).

```bash
export EXTRATORES_PDFS=C:/projeto-api/.data/pdfs-renovacao
npx tsx scripts/layout.ts mapfre saida.txt     # layout mascarado (palavra que varia vira ▒, digito vira #)
npx tsx scripts/respostas.ts hdi "Guarda|Utiliza"   # linhas de pergunta e resposta, sem nome/CPF/placa
npx tsx scripts/cobertura.ts yelum             # quanto o leitor acha, campo a campo
```

O levantamento de 2026-10-19 (o que cada seguradora imprime e o que não imprime) está no
multicálculo: `docs/renovacao-pdf/LAYOUTS.md`.
