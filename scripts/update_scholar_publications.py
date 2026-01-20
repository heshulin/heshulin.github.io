#!/usr/bin/env python3
import argparse
import datetime as dt
import json
import os
import re
import time
from urllib.parse import parse_qs, urlencode, urlparse

import requests
from bs4 import BeautifulSoup

DEFAULT_CONFIG = "_config.yml"
DEFAULT_OUTPUT = os.path.join("_data", "scholar_publications.json")

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}


def parse_config_scholar_url(config_path):
    if not os.path.exists(config_path):
        return None
    pattern = re.compile(r"^\s*googlescholar\s*:\s*(.+?)\s*$")
    with open(config_path, "r", encoding="utf-8") as handle:
        for line in handle:
            if line.lstrip().startswith("#"):
                continue
            match = pattern.match(line)
            if match:
                value = match.group(1).strip()
                if value.startswith(("'", '"')) and value.endswith(("'", '"')):
                    value = value[1:-1]
                return value
    return None


def extract_user_id(scholar_url):
    parsed = urlparse(scholar_url)
    query = parse_qs(parsed.query)
    user_ids = query.get("user")
    if user_ids:
        return user_ids[0]
    return None


def build_list_url(user_id, start, pagesize):
    params = {
        "hl": "en",
        "user": user_id,
        "view_op": "list_works",
        "sortby": "pubdate",
        "cstart": start,
        "pagesize": pagesize,
    }
    return "https://scholar.google.com/citations?" + urlencode(params)


def fetch_page(session, url):
    response = session.get(url, headers=HEADERS, timeout=30)
    response.raise_for_status()
    text = response.text
    if "unusual traffic" in text.lower():
        raise RuntimeError("Google Scholar blocked the request due to unusual traffic.")
    return text


def parse_publications(html):
    soup = BeautifulSoup(html, "html.parser")
    rows = soup.select("tr.gsc_a_tr")
    publications = []
    for row in rows:
        title_el = row.select_one("a.gsc_a_at")
        if not title_el:
            continue
        title = title_el.get_text(" ", strip=True)
        href = title_el.get("href", "").strip()
        scholar_url = ""
        if href:
            scholar_url = href
            if href.startswith("/"):
                scholar_url = "https://scholar.google.com" + href

        gs_gray = row.select("div.gs_gray")
        authors = gs_gray[0].get_text(" ", strip=True) if len(gs_gray) >= 1 else ""
        venue = gs_gray[1].get_text(" ", strip=True) if len(gs_gray) >= 2 else ""

        year_cell = row.select_one("td.gsc_a_y")
        year_text = year_cell.get_text(strip=True) if year_cell else ""
        year = int(year_text) if year_text.isdigit() else 0

        publications.append(
            {
                "title": title,
                "authors": authors,
                "venue": venue,
                "year": year,
                "scholar_url": scholar_url,
            }
        )
    return publications


def collect_publications(user_id, pagesize, sleep_seconds, max_pages):
    session = requests.Session()
    start = 0
    pages_fetched = 0
    seen = set()
    all_publications = []

    while True:
        url = build_list_url(user_id, start, pagesize)
        html = fetch_page(session, url)
        page_publications = parse_publications(html)
        if not page_publications:
            break

        for pub in page_publications:
            key = (pub["title"].lower(), pub["year"])
            if key in seen:
                continue
            seen.add(key)
            all_publications.append(pub)

        if len(page_publications) < pagesize:
            break

        pages_fetched += 1
        if max_pages and pages_fetched >= max_pages:
            break

        start += pagesize
        if sleep_seconds > 0:
            time.sleep(sleep_seconds)

    return all_publications


def write_output(output_path, scholar_url, publications):
    publications.sort(key=lambda item: item["year"], reverse=True)
    data = {
        "source": scholar_url,
        "last_updated": dt.date.today().isoformat(),
        "publications": publications,
    }
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=True, indent=2)
        handle.write("\n")


def main():
    parser = argparse.ArgumentParser(
        description="Fetch Google Scholar publications into a Jekyll data file."
    )
    parser.add_argument(
        "--scholar-url",
        default=None,
        help="Google Scholar profile URL. Defaults to googlescholar in _config.yml.",
    )
    parser.add_argument(
        "--config",
        default=DEFAULT_CONFIG,
        help="Path to _config.yml to infer the Google Scholar URL.",
    )
    parser.add_argument(
        "--output",
        default=DEFAULT_OUTPUT,
        help="Path to write the JSON data file.",
    )
    parser.add_argument("--pagesize", type=int, default=100)
    parser.add_argument("--sleep", type=float, default=1.0)
    parser.add_argument("--max-pages", type=int, default=0)
    args = parser.parse_args()

    scholar_url = args.scholar_url or parse_config_scholar_url(args.config)
    if not scholar_url:
        raise SystemExit("Missing Google Scholar URL. Provide --scholar-url or set it in _config.yml.")

    user_id = extract_user_id(scholar_url)
    if not user_id:
        raise SystemExit("Unable to parse user ID from Google Scholar URL.")

    publications = collect_publications(
        user_id=user_id,
        pagesize=args.pagesize,
        sleep_seconds=args.sleep,
        max_pages=args.max_pages,
    )
    write_output(args.output, scholar_url, publications)


if __name__ == "__main__":
    main()
