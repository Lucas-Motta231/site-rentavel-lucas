HoraCerta – Calculadora de horas trabalhadas

Aluno: Lucas Motta Poncio
Curso: Engenharia de Software – UTFPR, Campus Dois Vizinhos
Tecnologias: HTML, CSS e JavaScript puro (site estático, sem back-end)

O problema que o site resolve

"Entrei às 8h, almocei de 12h às 13h e saí às 17h30. Quantas horas trabalhei e tenho hora extra?"

Público: quem precisa conferir o próprio ponto (CLT, estagiários, freelancers que cobram por hora). O resultado aparece em poucos segundos, sem cadastro.

O que a ferramenta faz
Recebe entrada, saída para o intervalo, retorno e saída final.
Calcula total trabalhado, tempo de intervalo e saldo (hora extra ou saldo negativo) com base na jornada configurada.
Aceita turnos que passam da meia-noite e dias sem intervalo.
Guarda um histórico dos dias, com saldo acumulado, e permite baixar em CSV.
Incrementos da atividade
Incremento	Onde aparece no projeto
1. JS básico	script.js: variáveis e constantes, operadores, if, laços for/while, funções (calcular, formatarDuracao), arrays (histórico, trechos) e objetos (estado, registros)
2. DOM e eventos	Formulário que recalcula a cada input, submit com preventDefault(), histórico montado com createElement e cliques tratados por delegação de eventos
3. Persistência	localStorage: jornada, últimos horários digitados, histórico e cache de feriados
4. APIs	fetch + JSON na BrasilAPI (/api/feriados/v1/{ano}) para avisar quando a data é feriado nacional
5. Assincronismo	async/await, Promise.all para buscar em paralelo os feriados de todos os anos do histórico, AbortController para limite de tempo e tratamento de falhas
6. Web APIs	Clipboard (copiar resumo), Web Share (compartilhar, quando o navegador suporta) e Blob + download (CSV)
7. Publicação e monetização	GitHub Pages e estratégia opcional de monetização (abaixo)
Estrutura
horacerta/
├── index.html   estrutura: header, ferramenta, conteúdo complementar, footer
├── style.css    estilos mobile-first, com media queries em 768 px e 1024 px
├── script.js    lógica da aplicação
└── README.md
Como executar

Abra o index.html no navegador. Não há instalação nem servidor.
