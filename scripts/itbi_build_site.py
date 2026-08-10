#!/usr/bin/env python3
"""Gera um site estático autocontido a partir do CSV de transações do Green Space.

Os dados são embutidos no HTML como um array de objetos JS — nenhuma requisição de
rede nem processamento de planilha acontece no navegador.

Uso:
    python3 scripts/itbi_build_site.py --csv green_space_tutoia.csv --out itbi/index.html
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import pandas as pd

FONTE_URL = "https://prefeitura.sp.gov.br/web/fazenda/w/acesso_a_informacao/31501"

# Colunas exibidas por padrão, na ordem. As demais ficam atrás do botão "todas as colunas".
COLUNAS_PRINCIPAIS = [
    "Data de Transação",
    "Complemento",
    "Natureza de Transação",
    "Valor de Transação (declarado pelo contribuinte)",
    "Valor Venal de Referência (proporcional)",
    "Base de Cálculo adotada",
    "Área Construída (m2)",
    "Matrícula do Imóvel",
    "Aba de Origem",
]

COLUNAS_MOEDA = {
    "Valor de Transação (declarado pelo contribuinte)",
    "Valor Venal de Referência",
    "Valor Venal de Referência (proporcional)",
    "Base de Cálculo adotada",
    "Valor Financiado",
}

COLUNAS_DATA = {"Data de Transação"}

# Colunas cujo conteúdo é um código/identificador: nunca formatar como número.
COLUNAS_TEXTO = {
    "N° do Cadastro (SQL)",
    "CEP",
    "Matrícula do Imóvel",
    "Número",
    "Uso (IPTU)",
    "Padrão (IPTU)",
    "ACC (IPTU)",
}


def cell_value(column: str, raw):
    """Converte a célula para o tipo que vai ao JSON (número, string ou None)."""
    if raw is None or (isinstance(raw, float) and math.isnan(raw)):
        return None
    text = str(raw).strip()
    if text == "" or text.lower() in {"nan", "nat"}:
        return None
    if column in COLUNAS_TEXTO or column in COLUNAS_DATA:
        return text
    try:
        number = float(text)
    except ValueError:
        return text
    return int(number) if number.is_integer() else number


def build_rows(df: pd.DataFrame) -> list[dict]:
    return [
        {col: cell_value(col, row[col]) for col in df.columns}
        for _, row in df.iterrows()
    ]


def render_html(df: pd.DataFrame) -> str:
    rows = build_rows(df)
    colunas = list(df.columns)
    principais = [c for c in COLUNAS_PRINCIPAIS if c in colunas]
    secundarias = [c for c in colunas if c not in principais]

    payload = {
        "rows": rows,
        "columns": colunas,
        "primary": principais,
        "secondary": secundarias,
        "currency": [c for c in COLUNAS_MOEDA if c in colunas],
        "dates": [c for c in COLUNAS_DATA if c in colunas],
        "text": [c for c in COLUNAS_TEXTO if c in colunas],
    }

    data_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    # Evita fechar o <script> caso algum valor contenha a sequência.
    data_json = data_json.replace("</", "<\\/")

    return TEMPLATE.replace("__DATA__", data_json).replace("__FONTE__", FONTE_URL)


TEMPLATE = """<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ITBI — Edifício Green Space, R. Tutoia 349</title>
<style>
  :root {
    --bg-primary: #140016;
    --bg-secondary: #1f0322;
    --surface-card: #1d3362;
    --surface-soft: #101c3a;
    --gradient-a: #ff2f92;
    --gradient-b: #ff7a5c;
    --pink-light: #ff6fb8;
    --text-primary: #f5f7ff;
    --text-secondary: #c9cde8;
    --text-muted: #8f96b8;
    --neutral: #47536b;
    --radius-md: 16px;
    --radius-lg: 24px;
    --shadow-card: 0 14px 30px rgba(0, 0, 0, 0.32);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: clamp(20px, 4vw, 48px) clamp(14px, 4vw, 40px) 64px;
    background: radial-gradient(120% 80% at 50% 0%, var(--bg-secondary), var(--bg-primary));
    color: var(--text-primary);
    font-family: "Work Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    line-height: 1.5;
    min-height: 100vh;
  }
  header { max-width: 1180px; margin: 0 auto 28px; }
  .eyebrow {
    font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--pink-light); margin: 0 0 8px;
  }
  h1 {
    margin: 0 0 6px;
    font-size: clamp(28px, 5.2vw, 44px);
    line-height: 1.08;
    background: linear-gradient(90deg, var(--gradient-a), var(--gradient-b));
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .subtitle { margin: 0; color: var(--text-secondary); font-size: clamp(14px, 2.4vw, 17px); }
  main { max-width: 1180px; margin: 0 auto; }
  .stats {
    display: grid; gap: 14px; margin: 26px 0 20px;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }
  .stat {
    background: var(--surface-card); border-radius: var(--radius-md);
    padding: 16px 18px; box-shadow: var(--shadow-card);
  }
  .statLabel {
    font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--text-muted); margin: 0 0 6px;
  }
  .statValue { font-size: clamp(20px, 3.2vw, 27px); font-weight: 700; margin: 0; }
  .statHint { margin: 4px 0 0; font-size: 12px; color: var(--text-muted); }
  .toolbar {
    display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
    margin-bottom: 14px;
  }
  .toolbar input, .toolbar button {
    font: inherit; color: var(--text-primary);
    background: var(--surface-soft); border: 1px solid var(--neutral);
    border-radius: 999px; padding: 9px 16px;
  }
  .toolbar input { min-width: min(100%, 280px); flex: 1 1 240px; }
  .toolbar input::placeholder { color: var(--text-muted); }
  .toolbar button { cursor: pointer; }
  .toolbar button.isActive {
    background: linear-gradient(90deg, var(--gradient-a), var(--gradient-b));
    border-color: transparent; font-weight: 700;
  }
  .tableWrap {
    overflow-x: auto; background: var(--surface-soft);
    border-radius: var(--radius-lg); box-shadow: var(--shadow-card);
    border: 1px solid rgba(255, 255, 255, 0.06);
  }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  th, td { padding: 11px 14px; text-align: left; white-space: nowrap; }
  thead th {
    position: sticky; top: 0; z-index: 1;
    background: var(--surface-card); cursor: pointer; user-select: none;
    font-size: 12px; letter-spacing: 0.05em; text-transform: uppercase;
    color: var(--text-secondary); border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  thead th:hover { color: var(--text-primary); }
  thead th .arrow { color: var(--pink-light); font-size: 10px; margin-left: 5px; }
  tbody tr:nth-child(even) { background: rgba(255, 255, 255, 0.025); }
  tbody tr:hover { background: rgba(255, 47, 146, 0.09); }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.empty { color: var(--text-muted); }
  .count { margin: 10px 2px 0; font-size: 13px; color: var(--text-muted); }
  footer {
    max-width: 1180px; margin: 34px auto 0; padding-top: 18px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    font-size: 13px; color: var(--text-muted);
  }
  footer p { margin: 0 0 9px; }
  footer a { color: var(--pink-light); }
  @media (max-width: 720px) {
    th, td { padding: 9px 10px; font-size: 13px; }
  }
</style>
</head>
<body>
<header>
  <p class="eyebrow">ITBI · Prefeitura de São Paulo</p>
  <h1>Edifício Green Space</h1>
  <p class="subtitle">Rua Tutoia, 349 — Vila Mariana, São Paulo · Declarações de transações imobiliárias (DTI/ITBI-IV) pagas, 2024 em diante</p>
</header>

<main>
  <section class="stats" id="stats"></section>

  <div class="toolbar">
    <input id="busca" type="search" placeholder="Filtrar (unidade, natureza, data…)" aria-label="Filtrar transações">
    <button id="toggleColunas" type="button">Mostrar todas as colunas</button>
  </div>

  <div class="tableWrap">
    <table>
      <thead><tr id="cabecalho"></tr></thead>
      <tbody id="corpo"></tbody>
    </table>
  </div>
  <p class="count" id="contagem"></p>
</main>

<footer>
  <p><strong>Fonte:</strong> Secretaria Municipal da Fazenda de São Paulo — base pública de Guias de ITBI pagas (DTI/ITBI-IV), disponível em <a href="__FONTE__" target="_blank" rel="noopener">prefeitura.sp.gov.br — Acesso à Informação</a>. Dados extraídos das planilhas anuais oficiais, filtrando logradouro “TUTOIA” e número “349”.</p>
  <p><strong>Atenção ao interpretar os valores:</strong> o “valor de transação” é o declarado pelo contribuinte e nem sempre corresponde ao preço efetivo de venda. Quando o valor declarado é inferior ao valor venal de referência arbitrado pela Prefeitura, a base de cálculo adotada passa a ser o valor venal de referência — por isso a coluna de base de cálculo pode divergir do preço real negociado. Vagas de garagem costumam ser lançadas como transações separadas do apartamento, na mesma data.</p>
  <p>Página estática: os dados estão embutidos neste arquivo e nada é carregado da rede.</p>
</footer>

<script>
const DATA = __DATA__;
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const currencyCols = new Set(DATA.currency);
const dateCols = new Set(DATA.dates);
const textCols = new Set(DATA.text);

let mostrarTudo = false;
let ordem = { coluna: "Data de Transação", asc: false };
let filtro = "";

function colunasVisiveis() {
  return mostrarTudo ? DATA.columns : DATA.primary;
}

function formatar(coluna, valor) {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (currencyCols.has(coluna) && typeof valor === "number") return moeda.format(valor);
  if (dateCols.has(coluna)) {
    const partes = String(valor).slice(0, 10).split("-");
    if (partes.length === 3) return partes[2] + "/" + partes[1] + "/" + partes[0];
  }
  if (typeof valor === "number" && !textCols.has(coluna)) {
    return valor.toLocaleString("pt-BR");
  }
  return String(valor);
}

function ehNumerica(coluna) {
  if (textCols.has(coluna) || dateCols.has(coluna)) return false;
  return DATA.rows.some((r) => typeof r[coluna] === "number");
}

function linhasFiltradas() {
  const termo = filtro.trim().toLowerCase();
  let linhas = DATA.rows;
  if (termo) {
    linhas = linhas.filter((r) =>
      DATA.columns.some((c) => r[c] !== null && String(r[c]).toLowerCase().includes(termo))
    );
  }
  const col = ordem.coluna;
  const dir = ordem.asc ? 1 : -1;
  return linhas.slice().sort((a, b) => {
    const va = a[col], vb = b[col];
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return String(va).localeCompare(String(vb), "pt-BR", { numeric: true }) * dir;
  });
}

function renderStats() {
  const valores = DATA.rows
    .map((r) => r["Valor de Transação (declarado pelo contribuinte)"])
    .filter((v) => typeof v === "number");
  const soma = valores.reduce((acc, v) => acc + v, 0);
  const datas = DATA.rows.map((r) => r["Data de Transação"]).filter(Boolean).sort();
  const periodo = datas.length
    ? formatar("Data de Transação", datas[0]) + " – " + formatar("Data de Transação", datas[datas.length - 1])
    : "—";

  const cards = [
    { label: "Transações", value: String(DATA.rows.length), hint: "apartamentos e vagas, lançados separadamente" },
    { label: "Menor valor", value: moeda.format(Math.min(...valores)), hint: "valor declarado" },
    { label: "Valor médio", value: moeda.format(soma / valores.length), hint: "média dos valores declarados" },
    { label: "Maior valor", value: moeda.format(Math.max(...valores)), hint: "valor declarado" },
    { label: "Período", value: periodo, hint: "data da transação" },
  ];

  document.getElementById("stats").innerHTML = cards
    .map((c) =>
      '<div class="stat"><p class="statLabel">' + c.label + '</p><p class="statValue">' +
      c.value + '</p><p class="statHint">' + c.hint + "</p></div>"
    )
    .join("");
}

function renderTabela() {
  const colunas = colunasVisiveis();
  const cabecalho = document.getElementById("cabecalho");
  cabecalho.innerHTML = "";
  colunas.forEach((coluna) => {
    const th = document.createElement("th");
    th.textContent = coluna;
    th.setAttribute("scope", "col");
    if (ordem.coluna === coluna) {
      const seta = document.createElement("span");
      seta.className = "arrow";
      seta.textContent = ordem.asc ? "▲" : "▼";
      th.appendChild(seta);
      th.setAttribute("aria-sort", ordem.asc ? "ascending" : "descending");
    }
    th.addEventListener("click", () => {
      if (ordem.coluna === coluna) ordem.asc = !ordem.asc;
      else ordem = { coluna, asc: !ehNumerica(coluna) };
      renderTabela();
    });
    cabecalho.appendChild(th);
  });

  const linhas = linhasFiltradas();
  const corpo = document.getElementById("corpo");
  corpo.innerHTML = "";
  linhas.forEach((linha) => {
    const tr = document.createElement("tr");
    colunas.forEach((coluna) => {
      const td = document.createElement("td");
      const bruto = linha[coluna];
      td.textContent = formatar(coluna, bruto);
      if (typeof bruto === "number" && !textCols.has(coluna)) td.className = "num";
      if (bruto === null || bruto === undefined || bruto === "") td.className = "empty";
      tr.appendChild(td);
    });
    corpo.appendChild(tr);
  });

  document.getElementById("contagem").textContent =
    linhas.length + " de " + DATA.rows.length + " transações exibidas · clique no cabeçalho para ordenar";
}

document.getElementById("busca").addEventListener("input", (e) => {
  filtro = e.target.value;
  renderTabela();
});

const botaoColunas = document.getElementById("toggleColunas");
botaoColunas.addEventListener("click", () => {
  mostrarTudo = !mostrarTudo;
  botaoColunas.textContent = mostrarTudo ? "Mostrar colunas principais" : "Mostrar todas as colunas";
  botaoColunas.classList.toggle("isActive", mostrarTudo);
  renderTabela();
});

renderStats();
renderTabela();
</script>
</body>
</html>
"""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()

    df = pd.read_csv(args.csv, dtype=object)
    # Descarta colunas totalmente vazias herdadas da planilha original.
    df = df.dropna(axis=1, how="all")

    html = render_html(df)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(html, encoding="utf-8")

    size_kb = args.out.stat().st_size / 1024
    print(f"Site gerado em {args.out} ({size_kb:.1f} KB, {len(df)} transações embutidas)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
