#!/usr/bin/env python3
"""Extrai as transações de ITBI do Edifício Green Space (R. Tutoia, 349 - Vila Mariana).

Percorre os arquivos anuais de "Guias de ITBI Pagas" publicados pela Prefeitura de
São Paulo, varre todas as abas mensais, detecta a linha de cabeçalho e filtra as
linhas cujo logradouro contenha "TUTOIA" (sem acento, case-insensitive) e cujo
número contenha "349".

Uso:
    python3 scripts/itbi_green_space.py --input-dir <dir com os xlsx> --out green_space_tutoia.csv
"""

from __future__ import annotations

import argparse
import re
import sys
import unicodedata
from pathlib import Path

import openpyxl
import pandas as pd

# Colunas canônicas dos arquivos de ITBI (usadas quando a aba não traz cabeçalho).
CANONICAL_HEADER = [
    "N° do Cadastro (SQL)",
    "Nome do Logradouro",
    "Número",
    "Complemento",
    "Bairro",
    "Referência",
    "CEP",
    "Natureza de Transação",
    "Valor de Transação (declarado pelo contribuinte)",
    "Data de Transação",
    "Valor Venal de Referência (Exercício)",
    "Proporção Transmitida (%)",
    "Valor Venal de Referência (parte transmitida)",
    "Base de Cálculo adotada",
    "Tipo de Financiamento",
    "Valor Financiado",
    "Cartório de Registro",
    "Matrícula do Imóvel",
    "Situação do SQL",
    "Área do Terreno (m2)",
    "Testada (m)",
    "Fração Ideal",
]

# Abas que não contêm transações (comparadas sem acento e em caixa alta).
NON_DATA_SHEETS = {"LEGENDA", "EXPLICACOES", "TABELA DE USOS", "TABELA DE PADROES"}

LOGRADOURO_ALVO = "TUTOIA"
NUMERO_ALVO = "349"


def strip_accents(value: str) -> str:
    """Remove acentos e normaliza para caixa alta."""
    decomposed = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch)).upper()


def norm_cell(value) -> str:
    """Converte uma célula em texto normalizado (sem acento, caixa alta, sem espaço extra)."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    text = str(value).strip()
    if text.lower() in {"nan", "nat", "none"}:
        return ""
    return strip_accents(re.sub(r"\s+", " ", text))


def norm_numero(value) -> str:
    """Normaliza a coluna de número, que vem como float em alguns arquivos ("349.0")."""
    text = norm_cell(value)
    # 349.0 -> 349 ; mantém sufixos alfabéticos (ex.: "349 A") intactos.
    return re.sub(r"^(\d+)\.0+$", r"\1", text)


def find_column(columns, *needles) -> str | None:
    """Encontra a coluna cujo nome normalizado contenha todos os termos informados."""
    for col in columns:
        normalized = norm_cell(col)
        if all(strip_accents(n) in normalized for n in needles):
            return col
    return None


def dedupe(names: list[str]) -> list[str]:
    """Garante nomes de coluna únicos (algumas abas repetem rótulos)."""
    seen: dict[str, int] = {}
    out: list[str] = []
    for name in names:
        if name in seen:
            seen[name] += 1
            out.append(f"{name} ({seen[name]})")
        else:
            seen[name] = 0
            out.append(name)
    return out


def detect_header(raw: pd.DataFrame) -> int | None:
    """Retorna o índice da linha de cabeçalho, ou None se a aba já começar nos dados.

    Varre as primeiras linhas procurando uma que contenha "LOGRADOURO" — o rótulo
    aparece no cabeçalho e nunca em uma linha de dados.
    """
    limit = min(20, len(raw))
    for idx in range(limit):
        row_text = [norm_cell(v) for v in raw.iloc[idx].tolist()]
        if any("LOGRADOURO" in cell for cell in row_text):
            return idx
    return None


def load_sheet(
    path: Path, sheet: str, fallback_header: list[str] | None = None
) -> pd.DataFrame | None:
    """Lê uma aba aplicando a detecção de cabeçalho. Retorna None se não for aba de dados.

    Quando a aba não traz cabeçalho (caso de JAN-2024), reaproveita o cabeçalho já
    detectado em outra aba do mesmo arquivo; se não houver, cai nos rótulos canônicos.
    """
    raw = pd.read_excel(path, sheet_name=sheet, header=None, dtype=object, engine="openpyxl")
    if raw.empty:
        return None

    header_idx = detect_header(raw)
    if header_idx is None:
        # Aba sem cabeçalho: nomeia as colunas pela ordem conhecida do layout.
        df = raw.copy()
        base = fallback_header or CANONICAL_HEADER
        if df.shape[1] <= len(base):
            df.columns = base[: df.shape[1]]
        else:
            extra = [f"Coluna {i}" for i in range(len(base), df.shape[1])]
            df.columns = list(base) + extra
    else:
        df = raw.iloc[header_idx + 1 :].copy()
        df.columns = dedupe(
            [
                str(c).strip() if c is not None and not pd.isna(c) else f"Coluna {i}"
                for i, c in enumerate(raw.iloc[header_idx].tolist())
            ]
        )

    df = df.dropna(how="all")
    return df


def filter_target(df: pd.DataFrame) -> pd.DataFrame:
    """Filtra linhas com logradouro contendo TUTOIA e número contendo 349."""
    col_logradouro = find_column(df.columns, "LOGRADOURO")
    col_numero = find_column(df.columns, "NUMERO")
    if col_logradouro is None or col_numero is None:
        return df.iloc[0:0]

    logradouro = df[col_logradouro].map(norm_cell)
    numero = df[col_numero].map(norm_numero)
    mask = logradouro.str.contains(LOGRADOURO_ALVO, na=False) & numero.str.contains(
        NUMERO_ALVO, na=False
    )
    return df[mask]


def peek_header(path: Path, sheets: list[str]) -> list[str] | None:
    """Lê barato (read_only) as primeiras linhas de cada aba até achar um cabeçalho real."""
    wb = openpyxl.load_workbook(path, read_only=True)
    try:
        for sheet in sheets:
            ws = wb[sheet]
            for row in ws.iter_rows(min_row=1, max_row=20, values_only=True):
                cells = [norm_cell(v) for v in row]
                if any("LOGRADOURO" in c for c in cells):
                    return dedupe(
                        [
                            str(v).strip() if v is not None else f"Coluna {i}"
                            for i, v in enumerate(row)
                        ]
                    )
    finally:
        wb.close()
    return None


def process_file(path: Path) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Processa um arquivo anual. Retorna (linhas do alvo, todas as linhas de Tutoia)."""
    xls = pd.ExcelFile(path, engine="openpyxl")
    hits: list[pd.DataFrame] = []
    tutoia_all: list[pd.DataFrame] = []

    data_sheets = [s for s in xls.sheet_names if strip_accents(s).strip() not in NON_DATA_SHEETS]
    fallback_header = peek_header(path, data_sheets)

    for sheet in data_sheets:
        df = load_sheet(path, sheet, fallback_header)
        if df is None or df.empty:
            print(f"  {sheet:>10}: aba vazia", file=sys.stderr)
            continue

        col_logradouro = find_column(df.columns, "LOGRADOURO")
        if col_logradouro is not None:
            tutoia = df[df[col_logradouro].map(norm_cell).str.contains(LOGRADOURO_ALVO, na=False)]
            if not tutoia.empty:
                tutoia = tutoia.copy()
                tutoia.insert(0, "Arquivo de Origem", path.name)
                tutoia.insert(1, "Aba de Origem", sheet)
                tutoia_all.append(tutoia)

        found = filter_target(df)
        print(f"  {sheet:>10}: {len(df):>6} linhas, {len(found)} no alvo", file=sys.stderr)
        if found.empty:
            continue

        found = found.copy()
        found.insert(0, "Arquivo de Origem", path.name)
        found.insert(1, "Aba de Origem", sheet)
        hits.append(found)

    xls.close()
    empty = pd.DataFrame()
    return (
        pd.concat(hits, ignore_index=True) if hits else empty,
        pd.concat(tutoia_all, ignore_index=True) if tutoia_all else empty,
    )


def year_of(sheet: str) -> str:
    match = re.search(r"(20\d{2})", str(sheet))
    return match.group(1) if match else "?"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument(
        "--tutoia-out",
        type=Path,
        default=None,
        help="CSV opcional com TODAS as linhas da Rua Tutoia (para conferência).",
    )
    args = parser.parse_args()

    files = sorted(args.input_dir.glob("*.xlsx"))
    if not files:
        print(f"Nenhum .xlsx em {args.input_dir}", file=sys.stderr)
        return 1

    frames: list[pd.DataFrame] = []
    tutoia_frames: list[pd.DataFrame] = []
    for path in files:
        print(f"\n[{path.name}]", file=sys.stderr)
        found, tutoia = process_file(path)
        if not found.empty:
            frames.append(found)
        if not tutoia.empty:
            tutoia_frames.append(tutoia)

    if not frames:
        print("Nenhuma transação encontrada.", file=sys.stderr)
        return 1

    result = pd.concat(frames, ignore_index=True)

    col_data = find_column(result.columns, "DATA DE TRANSACAO")
    if col_data is not None:
        result[col_data] = pd.to_datetime(result[col_data], errors="coerce")
        result = result.sort_values(col_data).reset_index(drop=True)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    result.to_csv(args.out, index=False, encoding="utf-8")

    if args.tutoia_out and tutoia_frames:
        pd.concat(tutoia_frames, ignore_index=True).to_csv(
            args.tutoia_out, index=False, encoding="utf-8"
        )

    # ---- Resumo ----
    print("\n" + "=" * 62)
    print("RESUMO — Green Space, R. Tutoia, 349")
    print("=" * 62)
    print(f"Total de transações: {len(result)}")

    anos = result["Aba de Origem"].map(year_of)
    print("\nTransações por ano:")
    for ano, qtd in anos.value_counts().sort_index().items():
        print(f"  {ano}: {qtd}")

    col_natureza = find_column(result.columns, "NATUREZA")
    if col_natureza is not None:
        print("\nNaturezas de transação encontradas:")
        for nat, qtd in result[col_natureza].value_counts().items():
            print(f"  {qtd:>3}x  {nat}")

    col_valor = find_column(result.columns, "VALOR DE TRANSACAO")
    if col_valor is not None:
        valores = pd.to_numeric(result[col_valor], errors="coerce").dropna()
        if not valores.empty:
            print("\nValor de transação declarado:")
            print(f"  mínimo: R$ {valores.min():,.2f}")
            print(f"  média:  R$ {valores.mean():,.2f}")
            print(f"  máximo: R$ {valores.max():,.2f}")

    print(f"\nCSV gerado em: {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
