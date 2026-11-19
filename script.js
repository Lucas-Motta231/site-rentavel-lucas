'use strict';


const CHAVES = {
    config: 'horacerta.config',
    rascunho: 'horacerta.rascunho',
    historico: 'horacerta.historico',
    feriados: 'horacerta.feriados.'
};

const MAX_HISTORICO = 90;
const MIN_POR_DIA = 24 * 60;
const URL_FERIADOS = 'https://brasilapi.com.br/api/feriados/v1/';

const estado = {
    historico: [],  
    feriados: {},    
    calculo: null    
};

const $ = (seletor) => document.querySelector(seletor);

const el = {
    form: $('#form-horas'),
    data: $('#data'),
    infoData: $('#info-data'),
    entrada: $('#entrada'),
    saidaIntervalo: $('#saida-intervalo'),
    retorno: $('#retorno'),
    saidaFinal: $('#saida-final'),
    jornada: $('#jornada'),
    atalhos: document.querySelectorAll('[data-jornada]'),

    aviso: $('#aviso'),
    trabalhado: $('#res-trabalhado'),
    decimal: $('#res-decimal'),
    intervalo: $('#res-intervalo'),
    jornadaRes: $('#res-jornada'),
    blocoSaldo: $('#bloco-saldo'),
    saldo: $('#res-saldo'),
    saldoTexto: $('#res-saldo-texto'),
    blocoLinha: $('#bloco-linha'),
    linhaDia: $('#linha-dia'),
    eixoInicio: $('#eixo-inicio'),
    eixoFim: $('#eixo-fim'),

    mensagem: $('#mensagem'),
    btnCopiar: $('#btn-copiar'),
    btnCompartilhar: $('#btn-compartilhar'),
    btnLimpar: $('#btn-limpar'),

    lista: $('#lista-historico'),
    vazio: $('#historico-vazio'),
    saldoAcumulado: $('#saldo-acumulado'),
    btnExportar: $('#btn-exportar'),
    btnApagar: $('#btn-apagar')
};



function paraMinutos(texto) {
    if (!texto) return null;
    const [horas, minutos] = texto.split(':').map(Number);
    return horas * 60 + minutos;
}

function formatarDuracao(minutos, comSinal = false) {
    const absoluto = Math.abs(Math.round(minutos));
    const horas = String(Math.floor(absoluto / 60)).padStart(2, '0');
    const resto = String(absoluto % 60).padStart(2, '0');

    let sinal = '';
    if (minutos < 0) {
        sinal = '−';
    } else if (comSinal && absoluto > 0) {
        sinal = '+';
    }
    return `${sinal}${horas}:${resto}`;
}


function formatarHorasDecimais(minutos) {
    return `${(minutos / 60).toFixed(2).replace('.', ',')} h`;
}


function dataDeHoje() {
    const agora = new Date();
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const dia = String(agora.getDate()).padStart(2, '0');
    return `${agora.getFullYear()}-${mes}-${dia}`;
}


function formatarData(iso) {
    const [ano, mes, dia] = iso.split('-');
    return `${dia}/${mes}/${ano}`;
}


function diaDaSemana(iso) {
    const [ano, mes, dia] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(new Date(ano, mes - 1, dia));
}

function estadoDoSaldo(minutos) {
    if (minutos > 0) return 'extra';
    if (minutos < 0) return 'falta';
    return 'ok';
}

function criarElemento(tag, classe, texto) {
    const elemento = document.createElement(tag);
    if (classe) elemento.className = classe;
    if (texto !== undefined) elemento.textContent = texto;
    return elemento;
}


function calcular(dados) {
    const entrada = paraMinutos(dados.entrada);
    const saidaIntervalo = paraMinutos(dados.saidaIntervalo);
    const retorno = paraMinutos(dados.retorno);
    const saidaFinal = paraMinutos(dados.saidaFinal);
    const jornada = paraMinutos(dados.jornada);

    if (entrada === null || saidaFinal === null) {
        return { status: 'incompleto', mensagem: 'Preencha a entrada e a saída final para ver o cálculo.' };
    }

    const temIntervalo = saidaIntervalo !== null || retorno !== null;
    if (temIntervalo && (saidaIntervalo === null || retorno === null)) {
        return { status: 'erro', mensagem: 'Preencha a saída e o retorno do intervalo, ou deixe os dois vazios.' };
    }

    if (jornada === null) {
        return { status: 'erro', mensagem: 'Informe a jornada diária.' };
    }

    const marcas = temIntervalo
        ? [entrada, saidaIntervalo, retorno, saidaFinal]
        : [entrada, saidaFinal];
    const sequencia = [];
    let viraDia = false;

    for (let i = 0; i < marcas.length; i++) {
        let valor = marcas[i];
        while (i > 0 && valor < sequencia[i - 1]) {
            valor += MIN_POR_DIA;
            viraDia = true;
        }
        sequencia.push(valor);
    }

    const total = sequencia[sequencia.length - 1] - sequencia[0];
    if (total >= MIN_POR_DIA) {
        return { status: 'erro', mensagem: 'Confira a ordem dos horários: o período passou de 24 horas.' };
    }

    const intervalo = temIntervalo ? sequencia[2] - sequencia[1] : 0;
    const trabalhado = total - intervalo;
    if (trabalhado <= 0) {
        return { status: 'erro', mensagem: 'Confira os horários: o total trabalhado ficou zerado.' };
    }

    const trechos = temIntervalo
        ? [
            { tipo: 'trabalho', minutos: sequencia[1] - sequencia[0] },
            { tipo: 'pausa', minutos: intervalo },
            { tipo: 'trabalho', minutos: sequencia[3] - sequencia[2] }
        ]
        : [{ tipo: 'trabalho', minutos: total }];

    return {
        status: 'ok',
        trabalhado,
        intervalo,
        jornada,
        saldo: trabalhado - jornada,
        trechos,
        viraDia
    };
}



function lerStorage(chave, padrao) {
    try {
        const bruto = localStorage.getItem(chave);
        return bruto === null ? padrao : JSON.parse(bruto);
    } catch {
        return padrao;
    }
}

function salvarStorage(chave, valor) {
    try {
        localStorage.setItem(chave, JSON.stringify(valor));
        return true;
    } catch {
        return false;   
    }
}



const requisicoesEmAndamento = new Map();

function nomeDoFeriado(dataISO) {
    return estado.feriados[dataISO.slice(0, 4)]?.[dataISO] ?? null;
}


async function baixarFeriados(ano) {
    const numero = Number(ano);
    if (!Number.isInteger(numero) || numero < 1900 || numero > 2199) return {};

    const guardado = lerStorage(CHAVES.feriados + ano, null);
    if (guardado) {
        estado.feriados[ano] = guardado;
        return guardado;
    }

    const controle = new AbortController();
    const limite = setTimeout(() => controle.abort(), 6000);

    try {
        const resposta = await fetch(URL_FERIADOS + ano, { signal: controle.signal });
        if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);

        const lista = await resposta.json();       
        const mapa = {};
        for (const feriado of lista) {
            mapa[feriado.date] = feriado.name;
        }

        estado.feriados[ano] = mapa;
        salvarStorage(CHAVES.feriados + ano, mapa);
        return mapa;
    } catch (erro) {
        console.warn(`Não foi possível carregar os feriados de ${ano}:`, erro);
        return {};
    } finally {
        clearTimeout(limite);
    }
}


function buscarFeriados(ano) {
    if (estado.feriados[ano]) return Promise.resolve(estado.feriados[ano]);

    if (!requisicoesEmAndamento.has(ano)) {
        const promessa = baixarFeriados(ano).finally(() => requisicoesEmAndamento.delete(ano));
        requisicoesEmAndamento.set(ano, promessa);
    }
    return requisicoesEmAndamento.get(ano);
}


async function atualizarInfoData() {
    const iso = el.data.value;
    if (!iso) {
        el.infoData.textContent = '';
        return;
    }

    const diaSemana = diaDaSemana(iso);
    el.infoData.textContent = diaSemana;

    const mapa = await buscarFeriados(iso.slice(0, 4));
    if (el.data.value !== iso) return;   // o usuário trocou a data enquanto esperava

    const feriado = mapa[iso];
    el.infoData.textContent = feriado ? `${diaSemana} — feriado nacional: ${feriado}` : diaSemana;
}


function lerFormulario() {
    return {
        data: el.data.value,
        entrada: el.entrada.value,
        saidaIntervalo: el.saidaIntervalo.value,
        retorno: el.retorno.value,
        saidaFinal: el.saidaFinal.value,
        jornada: el.jornada.value
    };
}

function atualizarAtalhos() {
    for (const botao of el.atalhos) {
        botao.setAttribute('aria-pressed', String(botao.dataset.jornada === el.jornada.value));
    }
}

function limparResultado() {
    el.trabalhado.textContent = '--:--';
    el.decimal.textContent = '';
    el.intervalo.textContent = '--:--';
    el.jornadaRes.textContent = '--:--';
    el.saldo.textContent = '--:--';
    el.saldoTexto.textContent = '';
    el.blocoSaldo.dataset.estado = 'vazio';
    el.blocoLinha.hidden = true;
}

function desenharBarraDoDia(resultado, dados) {
    el.linhaDia.replaceChildren();

    for (const trecho of resultado.trechos) {
        const faixa = criarElemento('span', trecho.tipo);
        faixa.style.flexGrow = String(trecho.minutos);
        el.linhaDia.append(faixa);
    }

    el.linhaDia.setAttribute(
        'aria-label',
        `Trabalho de ${formatarDuracao(resultado.trabalhado)} e intervalo de ${formatarDuracao(resultado.intervalo)}`
    );
    el.eixoInicio.textContent = dados.entrada;
    el.eixoFim.textContent = dados.saidaFinal;
    el.blocoLinha.hidden = false;
}

function atualizarResultado() {
    const dados = lerFormulario();
    const resultado = calcular(dados);

    if (resultado.status !== 'ok') {
        estado.calculo = null;
        el.aviso.textContent = resultado.mensagem;
        el.aviso.dataset.tipo = resultado.status === 'erro' ? 'erro' : 'info';
        limparResultado();
        return;
    }

    estado.calculo = { ...resultado, dados };

    el.aviso.textContent = resultado.viraDia
        ? 'Turno atravessa a meia-noite: os horários menores foram considerados no dia seguinte.'
        : '';
    el.aviso.dataset.tipo = 'info';

    const situacao = estadoDoSaldo(resultado.saldo);
    const textos = { extra: 'Hora extra', falta: 'Saldo negativo', ok: 'Jornada cumprida' };

    el.trabalhado.textContent = formatarDuracao(resultado.trabalhado);
    el.decimal.textContent = `equivale a ${formatarHorasDecimais(resultado.trabalhado)}`;
    el.intervalo.textContent = formatarDuracao(resultado.intervalo);
    el.jornadaRes.textContent = formatarDuracao(resultado.jornada);
    el.saldo.textContent = formatarDuracao(resultado.saldo, true);
    el.saldoTexto.textContent = textos[situacao];
    el.blocoSaldo.dataset.estado = situacao;

    desenharBarraDoDia(resultado, dados);
}

let temporizadorMensagem;

function mostrarMensagem(texto, tipo = 'ok') {
    el.mensagem.textContent = texto;
    el.mensagem.dataset.tipo = tipo;

    clearTimeout(temporizadorMensagem);
    temporizadorMensagem = setTimeout(() => {
        el.mensagem.textContent = '';
    }, 4000);
}



function salvarHistorico() {
    const ok = salvarStorage(CHAVES.historico, estado.historico);
    if (!ok) mostrarMensagem('Não foi possível salvar no navegador (armazenamento indisponível).', 'erro');
}

function salvarNoHistorico() {
    const dados = lerFormulario();
    const resultado = calcular(dados);

    if (resultado.status !== 'ok') {
        mostrarMensagem(resultado.mensagem, 'erro');
        return;
    }
    if (!dados.data) {
        mostrarMensagem('Escolha a data do dia para salvar.', 'erro');
        return;
    }

    const registro = {
        id: Date.now(),
        data: dados.data,
        entrada: dados.entrada,
        saidaIntervalo: dados.saidaIntervalo,
        retorno: dados.retorno,
        saidaFinal: dados.saidaFinal,
        jornada: resultado.jornada,
        trabalhado: resultado.trabalhado,
        intervalo: resultado.intervalo,
        saldo: resultado.saldo
    };

    const indice = estado.historico.findIndex((item) => item.data === registro.data);
    if (indice >= 0) {
        estado.historico[indice] = registro;
        mostrarMensagem('Registro desta data atualizado.');
    } else {
        estado.historico.push(registro);
        mostrarMensagem('Dia salvo no histórico.');
    }

    estado.historico.sort((a, b) => b.data.localeCompare(a.data));
    estado.historico = estado.historico.slice(0, MAX_HISTORICO);

    salvarHistorico();
    renderizarHistorico();
}

function criarItemHistorico(item) {
    const li = criarElemento('li', 'item');

    const topo = criarElemento('div', 'item-topo');
    topo.append(
        criarElemento('strong', 'item-data', formatarData(item.data)),
        criarElemento('span', 'item-dia', diaDaSemana(item.data))
    );
    const feriado = nomeDoFeriado(item.data);
    if (feriado) {
        topo.append(criarElemento('span', 'selo', `Feriado: ${feriado}`));
    }

    const metricas = criarElemento('dl', 'item-metricas');
    const campos = [
        ['Trabalhado', formatarDuracao(item.trabalhado), null],
        ['Intervalo', formatarDuracao(item.intervalo), null],
        ['Saldo', formatarDuracao(item.saldo, true), estadoDoSaldo(item.saldo)]
    ];
    for (const [rotulo, valor, situacao] of campos) {
        const grupo = criarElemento('div');
        const dd = criarElemento('dd', '', valor);
        if (situacao) dd.dataset.estado = situacao;
        grupo.append(criarElemento('dt', '', rotulo), dd);
        metricas.append(grupo);
    }

    const acoes = criarElemento('div', 'item-acoes');
    const editar = criarElemento('button', 'editar', 'Editar');
    const remover = criarElemento('button', 'remover', 'Remover');
    for (const botao of [editar, remover]) {
        botao.type = 'button';
        botao.dataset.acao = botao.className;
        botao.dataset.id = String(item.id);
    }
    acoes.append(editar, remover);

    li.append(topo, metricas, acoes);
    return li;
}

function renderizarHistorico() {
    el.lista.replaceChildren();
    el.vazio.hidden = estado.historico.length > 0;

    for (const item of estado.historico) {
        el.lista.append(criarItemHistorico(item));
    }

    const acumulado = estado.historico.reduce((soma, item) => soma + item.saldo, 0);
    el.saldoAcumulado.textContent = formatarDuracao(acumulado, true);
    el.saldoAcumulado.dataset.estado = estadoDoSaldo(acumulado);

    const semRegistros = estado.historico.length === 0;
    el.btnExportar.disabled = semRegistros;
    el.btnApagar.disabled = semRegistros;
}

function aoClicarNoHistorico(evento) {
    const botao = evento.target.closest('button[data-acao]');
    if (!botao) return;

    const id = Number(botao.dataset.id);

    if (botao.dataset.acao === 'remover') {
        estado.historico = estado.historico.filter((item) => item.id !== id);
        salvarHistorico();
        renderizarHistorico();
        return;
    }

    const item = estado.historico.find((registro) => registro.id === id);
    if (!item) return;

    el.data.value = item.data;
    el.entrada.value = item.entrada;
    el.saidaIntervalo.value = item.saidaIntervalo;
    el.retorno.value = item.retorno;
    el.saidaFinal.value = item.saidaFinal;
    el.jornada.value = formatarDuracao(item.jornada);

    aoMudarFormulario();
    el.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    mostrarMensagem('Registro carregado. Altere os horários e salve novamente.');
}

function apagarHistorico() {
    if (!window.confirm('Apagar todo o histórico? Esta ação não pode ser desfeita.')) return;

    estado.historico = [];
    salvarHistorico();
    renderizarHistorico();
    mostrarMensagem('Histórico apagado.');
}


function montarResumo() {
    const calculo = estado.calculo;
    if (!calculo) return null;

    const d = calculo.dados;
    const linhas = [];

    if (d.data) linhas.push(`${formatarData(d.data)} (${diaDaSemana(d.data)})`);

    const horarios = [`Entrada ${d.entrada}`];
    if (d.saidaIntervalo) {
        horarios.push(`saída p/ intervalo ${d.saidaIntervalo}`, `retorno ${d.retorno}`);
    }
    horarios.push(`saída final ${d.saidaFinal}`);
    linhas.push(horarios.join(' | '));

    linhas.push(`Trabalhado: ${formatarDuracao(calculo.trabalhado)} (${formatarHorasDecimais(calculo.trabalhado)})`);
    linhas.push(`Intervalo: ${formatarDuracao(calculo.intervalo)} | Jornada: ${formatarDuracao(calculo.jornada)}`);
    linhas.push(`Saldo: ${formatarDuracao(calculo.saldo, true)}`);

    return linhas.join('\n');
}

async function copiarTexto(texto) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(texto);
        return;
    }

    const area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const copiou = document.execCommand('copy');
    area.remove();
    if (!copiou) throw new Error('Cópia não suportada');
}

async function copiarResumo() {
    const resumo = montarResumo();
    if (!resumo) {
        mostrarMensagem('Preencha os horários antes de copiar.', 'erro');
        return;
    }

    try {
        await copiarTexto(resumo);
        mostrarMensagem('Resumo copiado!');
    } catch {
        mostrarMensagem('Não foi possível copiar automaticamente.', 'erro');
    }
}

async function compartilharResumo() {
    const resumo = montarResumo();
    if (!resumo) {
        mostrarMensagem('Preencha os horários antes de compartilhar.', 'erro');
        return;
    }

    try {
        await navigator.share({ title: 'Horas trabalhadas – HoraCerta', text: resumo });
    } catch (erro) {
        if (erro.name !== 'AbortError') {
            mostrarMensagem('Não foi possível compartilhar.', 'erro');
        }
    }
}

function exportarCSV() {
    if (estado.historico.length === 0) return;

    const cabecalho = [
        'Data', 'Entrada', 'Saída intervalo', 'Retorno', 'Saída final',
        'Trabalhado', 'Intervalo', 'Jornada', 'Saldo'
    ];
    const linhas = estado.historico.map((item) => [
        formatarData(item.data),
        item.entrada,
        item.saidaIntervalo,
        item.retorno,
        item.saidaFinal,
        formatarDuracao(item.trabalhado),
        formatarDuracao(item.intervalo),
        formatarDuracao(item.jornada),
        formatarDuracao(item.saldo, true).replace('−', '-')
    ]);

    const csv = [cabecalho, ...linhas].map((linha) => linha.join(';')).join('\r\n');
    const arquivo = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(arquivo);

    const link = document.createElement('a');
    link.href = url;
    link.download = 'horacerta-historico.csv';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}



function salvarPreferencias() {
    salvarStorage(CHAVES.config, { jornada: el.jornada.value });
    salvarStorage(CHAVES.rascunho, {
        entrada: el.entrada.value,
        saidaIntervalo: el.saidaIntervalo.value,
        retorno: el.retorno.value,
        saidaFinal: el.saidaFinal.value
    });
}


function aoMudarFormulario(evento) {
    salvarPreferencias();
    atualizarResultado();
    atualizarAtalhos();

    if (!evento || evento.target === el.data) {
        atualizarInfoData();
    }
}

function limparHorarios() {
    el.entrada.value = '';
    el.saidaIntervalo.value = '';
    el.retorno.value = '';
    el.saidaFinal.value = '';
    aoMudarFormulario({ target: el.entrada });
    el.entrada.focus();
}

function registrarEventos() {
    el.form.addEventListener('input', aoMudarFormulario);

    el.form.addEventListener('submit', (evento) => {
        evento.preventDefault();   // não recarrega a página
        salvarNoHistorico();
    });

    for (const botao of el.atalhos) {
        botao.addEventListener('click', () => {
            el.jornada.value = botao.dataset.jornada;
            aoMudarFormulario({ target: el.jornada });
        });
    }

    el.btnCopiar.addEventListener('click', copiarResumo);
    el.btnCompartilhar.addEventListener('click', compartilharResumo);
    el.btnLimpar.addEventListener('click', limparHorarios);

    el.lista.addEventListener('click', aoClicarNoHistorico);
    el.btnExportar.addEventListener('click', exportarCSV);
    el.btnApagar.addEventListener('click', apagarHistorico);
}

async function iniciar() {
    const config = lerStorage(CHAVES.config, {});
    const rascunho = lerStorage(CHAVES.rascunho, {});
    const historico = lerStorage(CHAVES.historico, []);

    el.jornada.value = config.jornada || '08:00';
    el.entrada.value = rascunho.entrada || '';
    el.saidaIntervalo.value = rascunho.saidaIntervalo || '';
    el.retorno.value = rascunho.retorno || '';
    el.saidaFinal.value = rascunho.saidaFinal || '';
    el.data.value = dataDeHoje();

    estado.historico = Array.isArray(historico) ? historico : [];


    el.btnCompartilhar.hidden = typeof navigator.share !== 'function';

    registrarEventos();
    atualizarResultado();
    atualizarAtalhos();
    renderizarHistorico();
    atualizarInfoData();

  
    const anos = new Set([
        el.data.value.slice(0, 4),
        ...estado.historico.map((item) => item.data.slice(0, 4))
    ]);
    await Promise.all([...anos].map(buscarFeriados));

    renderizarHistorico();   
}

iniciar();
