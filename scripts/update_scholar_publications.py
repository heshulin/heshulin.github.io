#!/usr/bin/env python3
import argparse
import datetime as dt
from email.utils import parsedate_to_datetime
import json
import os
import re
import sys
import tempfile
import time
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse

import requests
from bs4 import BeautifulSoup

DEFAULT_CONFIG = "_config.yml"
DEFAULT_OUTPUT = os.path.join("_data", "scholar_publications.json")
RETRYABLE_STATUS_CODES = {408, 429, 500, 502, 503, 504}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

PREFERRED_VENUE_FIELDS = (
    "Conference",
    "Journal",
    "Publication",
    "Book",
    "Publisher",
)


def is_blocked_page(html):
    lower_html = html.lower()
    return any(marker in lower_html for marker in (
        "unusual traffic", "g-recaptcha", 'id="captcha"',
        "automated queries", "please show you're not a robot",
    ))


class BrowserSession:
    """Use normal browser navigation, keeping cookies and one page across requests."""

    def __enter__(self):
        try:
            from playwright.sync_api import Error, TimeoutError, sync_playwright
        except ImportError as error:
            raise RuntimeError(
                "Browser transport requires playwright. Install it with pip install playwright "
                "and python -m playwright install --with-deps chromium."
            ) from error
        self.browser_error = Error
        self.browser_timeout = TimeoutError
        self.runtime = sync_playwright().start()
        self.browser = None
        try:
            # The chromium channel uses the regular browser's current headless
            # mode. Keep its own User-Agent and browser defaults.
            self.browser = self.runtime.chromium.launch(channel="chromium", headless=True)
            self.context = self.browser.new_context(locale="en-US")
            self.page = self.context.new_page()
        except Error as error:
            self.__exit__(None, None, None)
            raise RuntimeError(f"Could not launch the Scholar browser: {error}") from error
        return self

    def __exit__(self, exc_type, exc, traceback):
        try:
            if self.browser is not None:
                self.browser.close()
        finally:
            self.runtime.stop()

    def get(self, url, headers=None, timeout=None):
        try:
            navigation = self.page.goto(url, wait_until="domcontentloaded", timeout=40000)
            if navigation is None:
                raise RuntimeError("Google Scholar navigation did not return a response.")
            html = self.page.content()
            if navigation.ok and not is_blocked_page(html):
                is_detail = parse_qs(urlparse(url).query).get("view_op") == ["view_citation"]
                selectors = (
                    [".gsc_oci_value, .gsc_vcd_value"] if is_detail
                    else ["#gsc_prf_in", "#gsc_a_b tr.gsc_a_tr", "#gsc_bpf_more"]
                )
                for selector in selectors:
                    self.page.locator(selector).first.wait_for(state="attached", timeout=15000)
                html = self.page.content()
        except self.browser_timeout as error:
            raise requests.Timeout(f"Google Scholar browser navigation or publication table timed out: {error}") from error
        except self.browser_error as error:
            raise requests.ConnectionError(f"Google Scholar browser navigation failed: {error}") from error
        response = requests.Response()
        response.status_code = navigation.status
        response.reason = navigation.status_text
        response.headers.update(navigation.headers)
        response.url = self.page.url
        response.encoding = "utf-8"
        response._content = html.encode("utf-8")
        return response


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
        "sortby": "pubdate",
        "cstart": start,
        "pagesize": pagesize,
    }
    return "https://scholar.google.com/citations?" + urlencode(params)


def fetch_page(session, url, attempts=3):
    for attempt in range(attempts):
        try:
            response = session.get(url, headers=HEADERS, timeout=(10, 30))
        except (requests.ConnectionError, requests.Timeout):
            if attempt + 1 == attempts:
                raise
            delay = 10 * (2 ** attempt)
        else:
            if response.status_code == 403:
                raise RuntimeError(
                    "Google Scholar refused access (HTTP 403). The runner's network "
                    "may be blocked. Try again later or check the runner network."
                )
            if response.status_code in RETRYABLE_STATUS_CODES and attempt + 1 < attempts:
                retry_after = response.headers.get("Retry-After", "")
                delay = 10 * (2 ** attempt)
                if retry_after.isdigit():
                    delay = max(delay, int(retry_after))
                elif retry_after:
                    try:
                        retry_at = parsedate_to_datetime(retry_after)
                        delay = max(delay, (retry_at - dt.datetime.now(dt.timezone.utc)).total_seconds())
                    except (TypeError, ValueError):
                        pass
                if delay > 120:
                    raise RuntimeError(
                        "Google Scholar requested a longer cooldown; stopping this run "
                        "instead of retrying before Retry-After."
                    )
            else:
                response.raise_for_status()
                html = response.text
                if is_blocked_page(html):
                    raise RuntimeError("Google Scholar returned a block or CAPTCHA page.")
                return html
        print(f"Temporary Scholar request failure; retry {attempt + 2}/{attempts} in {delay}s.", file=sys.stderr)
        time.sleep(delay)


def parse_publications(html):
    soup = BeautifulSoup(html, "html.parser")
    if not soup.select_one("#gsc_prf_in") or not soup.select_one("#gsc_a_b"):
        raise RuntimeError("Response is not a Google Scholar profile publication list.")
    rows = soup.select("tr.gsc_a_tr")
    publications = []
    for row in rows:
        title_el = row.select_one("a.gsc_a_at")
        if not title_el or not title_el.get_text(strip=True):
            raise RuntimeError("Google Scholar returned an incomplete publication row.")
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
    if not publications:
        raise RuntimeError("Google Scholar returned no publications; refusing to erase the existing list.")
    return publications


def needs_full_venue(venue):
    if not venue:
        return True
    return "..." in venue or "\u2026" in venue


def parse_detail_venue(html):
    soup = BeautifulSoup(html, "html.parser")
    fields = {}
    for row in soup.select("div.gs_scl"):
        field = row.select_one(".gsc_oci_field")
        value = row.select_one(".gsc_oci_value")
        if not field or not value:
            field = row.select_one(".gsc_vcd_field")
            value = row.select_one(".gsc_vcd_value")
        if not field or not value:
            continue
        label = field.get_text(" ", strip=True)
        fields[label] = value.get_text(" ", strip=True)

    for key in PREFERRED_VENUE_FIELDS:
        value = fields.get(key)
        if value:
            return value
    return ""


def resolve_full_venues(session, publications, sleep_seconds):
    for pub in publications:
        if not needs_full_venue(pub.get("venue", "")):
            continue
        scholar_url = pub.get("scholar_url", "")
        if not scholar_url:
            continue
        html = fetch_page(session, scholar_url)
        full_venue = parse_detail_venue(html)
        if full_venue:
            pub["venue"] = full_venue
        if sleep_seconds > 0:
            time.sleep(sleep_seconds)


def collect_publications(
    user_id,
    pagesize,
    sleep_seconds,
    max_pages,
    resolve_venues,
    detail_sleep_seconds,
    transport="http",
):
    with BrowserSession() if transport == "browser" else requests.Session() as session:
        return collect_with_session(session, user_id, pagesize, sleep_seconds, max_pages, resolve_venues, detail_sleep_seconds)


def collect_with_session(session, user_id, pagesize, sleep_seconds, max_pages, resolve_venues, detail_sleep_seconds):
    start = 0
    pages_fetched = 0
    seen = set()
    all_publications = []

    while True:
        url = build_list_url(user_id, start, pagesize)
        html = fetch_page(session, url)
        page_publications = parse_publications(html)
        previous_count = len(all_publications)
        for pub in page_publications:
            citation = parse_qs(urlparse(pub["scholar_url"]).query).get("citation_for_view", [""])[0]
            if not citation.startswith(user_id + ":"):
                raise RuntimeError("Publication link does not belong to the requested Scholar profile.")
            key = citation
            if key in seen:
                continue
            seen.add(key)
            all_publications.append(pub)

        if len(all_publications) == previous_count:
            raise RuntimeError("Google Scholar repeated a page without advancing pagination.")

        # Google can return fewer rows than requested. Its More button is the
        # authoritative pagination signal when present.
        soup = BeautifulSoup(html, "html.parser")
        more_button = soup.select_one("#gsc_bpf_more")
        has_more = not more_button.has_attr("disabled") if more_button else len(page_publications) >= pagesize
        if not has_more:
            break

        pages_fetched += 1
        if max_pages and pages_fetched >= max_pages:
            raise RuntimeError("Reached --max-pages before the complete profile was fetched.")

        start += len(page_publications)
        if sleep_seconds > 0:
            time.sleep(sleep_seconds)

    if resolve_venues:
        resolve_full_venues(session, all_publications, detail_sleep_seconds)

    return all_publications


def publication_key(publication):
    citation = parse_qs(urlparse(publication.get("scholar_url", "")).query).get("citation_for_view", [""])[0]
    return citation or publication["title"].strip().casefold()


def write_output(output_path, scholar_url, publications, allow_removals=False):
    if not publications:
        raise RuntimeError("Refusing to write an empty publication list.")
    output = Path(output_path)
    if output.exists():
        previous = json.loads(output.read_text(encoding="utf-8"))
        if extract_user_id(previous.get("source", "")) != extract_user_id(scholar_url):
            raise RuntimeError("Existing data belongs to a different Scholar profile.")
        previous_keys = {publication_key(pub) for pub in previous["publications"]}
        fetched_keys = {publication_key(pub) for pub in publications}
        removed = previous_keys - fetched_keys
        if removed and not allow_removals:
            removed_titles = [pub["title"] for pub in previous["publications"] if publication_key(pub) in removed]
            raise RuntimeError(
                f"Fetched list omits {len(removed)} existing publications; old data was retained. "
                f"Missing titles: {json.dumps(removed_titles, ensure_ascii=True)}. "
                "Check the profile and use --allow-removals only for verified removals or merges."
            )
    publications.sort(key=lambda item: item["year"], reverse=True)
    data = {
        "source": scholar_url,
        "last_updated": dt.date.today().isoformat(),
        "publications": publications,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=output.parent, delete=False) as handle:
            temporary_path = Path(handle.name)
            json.dump(data, handle, ensure_ascii=True, indent=2)
            handle.write("\n")
        os.replace(temporary_path, output)
    finally:
        if temporary_path and temporary_path.exists():
            temporary_path.unlink()
    print(f"Updated {len(publications)} publications from Google Scholar.")


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
    parser.add_argument("--detail-sleep", type=float, default=0.5)
    parser.add_argument("--max-pages", type=int, default=0)
    parser.add_argument(
        "--transport", choices=("http", "browser"), default="http",
        help="Use HTTP requests or normal Playwright Chromium navigation (requires playwright).",
    )
    parser.add_argument(
        "--allow-removals", action="store_true",
        help="Allow verified Scholar publication removals or merges in a manual update.",
    )
    parser.add_argument(
        "--no-resolve-venues",
        action="store_true",
        help="Disable per-publication requests to expand truncated venues.",
    )
    args = parser.parse_args()
    if not 1 <= args.pagesize <= 100 or args.max_pages < 0 or min(args.sleep, args.detail_sleep) < 0:
        parser.error("pagesize must be 1..100; max-pages and sleep intervals must be nonnegative.")

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
        resolve_venues=not args.no_resolve_venues,
        detail_sleep_seconds=args.detail_sleep,
        transport=args.transport,
    )
    write_output(args.output, scholar_url, publications, allow_removals=args.allow_removals)


if __name__ == "__main__":
    try:
        main()
    except (requests.RequestException, RuntimeError, ValueError, OSError) as error:
        print(f"Scholar update failed: {error}\nExisting publication data was not replaced.", file=sys.stderr)
        raise SystemExit(1)
