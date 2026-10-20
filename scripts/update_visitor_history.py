#!/usr/bin/env python3
"""Refresh aggregate visitor locations without executing provider JavaScript.

Only replace the checked-in snapshot after validating that the provider's date
range covers the website's complete history. Keep that snapshot when the
provider is unavailable or silently falls back to a shorter reporting period.
"""

import argparse
import datetime as dt
from html import unescape
from html.parser import HTMLParser
import json
import math
import os
from pathlib import Path
import re
import sys
import tempfile
import time
from urllib.error import URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


PROFILE_URL = "https://mapmyvisitors.com/web/1c3bj"
SINCE = dt.date(2026, 3, 18)
DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "assets/maps/visitor-history.json"
MONTHS = {name: index for index, name in enumerate(
    ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"), 1
)}


class ProfileParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.total_pageviews = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "total-pageviews" in attrs.get("class", "").split():
            value = attrs.get("data-value", "").replace(",", "")
            if not value.isdigit():
                raise ValueError("missing or invalid total pageview count")
            self.total_pageviews = int(value)


def utc_today():
    return dt.datetime.now(dt.timezone.utc).date()


def request_profile(today):
    # This is the date-range cookie used by the provider's own calendar UI.
    # The public profile may ignore it, so parse_profile also checks the range
    # actually returned by the server instead of trusting the request alone.
    daterange = "custom|{}|{}".format(SINCE.isoformat(), today.isoformat())
    request = Request(PROFILE_URL, headers={
        "User-Agent": (
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html",
        "Accept-Language": "en-US,en;q=0.9",
        "Cookie": "daterange=" + quote(daterange, safe=""),
    })
    with urlopen(request, timeout=20) as response:
        return response.read().decode(response.headers.get_content_charset() or "utf-8")


def parse_profile(source, today):
    parser = ProfileParser()
    parser.feed(source)
    if parser.total_pageviews is None:
        raise ValueError("total pageview count was not found")

    since_match = re.search(r"Since\s+([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})", unescape(source))
    if not since_match:
        raise ValueError("history start date was not found")
    month, day, year = since_match.groups()
    since = dt.date(int(year), MONTHS[month[:3]], int(day))
    if since != SINCE:
        raise ValueError("provider history start changed from {} to {}".format(SINCE, since))

    reported_dates = {}
    for name in ("start", "end"):
        match = re.search(r'\bvar\s+' + name + r'\s*=\s*[\"\'](\d{2}/\d{2}/\d{4})[\"\']\s*;', source)
        if not match:
            raise ValueError("provider reporting range was not found")
        reported_dates[name] = dt.datetime.strptime(match.group(1), "%m/%d/%Y").date()
    if reported_dates["start"] > since or reported_dates["end"] < today:
        raise ValueError("provider returned {} to {}, which does not cover {} to {}".format(
            reported_dates["start"], reported_dates["end"], since, today
        ))

    match = re.search(r"\bvar\s+addressPoints\s*=\s*", source)
    if not match:
        raise ValueError("aggregate visitor locations were not found")
    points, _ = json.JSONDecoder().raw_decode(source[match.end():])
    if not isinstance(points, list):
        raise ValueError("aggregate visitor locations must be an array")
    locations = []
    for point in points:
        if not isinstance(point, list) or len(point) < 4:
            raise ValueError("invalid aggregate visitor location")
        lat, lng = float(point[0]), float(point[1])
        name, pageviews = point[2], point[3]
        if not (math.isfinite(lat) and math.isfinite(lng) and -90 <= lat <= 90 and -180 <= lng <= 180):
            raise ValueError("invalid visitor coordinates")
        if not isinstance(name, str) or not name.strip():
            raise ValueError("invalid visitor location name")
        if isinstance(pageviews, bool) or not isinstance(pageviews, int) or pageviews < 0:
            raise ValueError("invalid visitor pageview count")
        # The fifth provider field is a marker radius bucket, not visitor count.
        # Preserve unknown-location data; the map handles its virtual coordinates.
        locations.append({"lat": lat, "lng": lng, "name": name, "pageviews": pageviews})
    if not locations and parser.total_pageviews:
        raise ValueError("provider returned no locations for a nonempty history")

    return {
        "profileUrl": PROFILE_URL,
        "since": since.isoformat(),
        "updatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "totalPageviews": parser.total_pageviews,
        "locations": locations,
    }


def write_snapshot(output, data):
    # Use a sibling temporary file so a failed download, parse, or write leaves
    # the previous published snapshot intact.
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=output.parent, delete=False) as handle:
            temporary = Path(handle.name)
            json.dump(data, handle, ensure_ascii=False, indent=2, allow_nan=False)
            handle.write("\n")
        os.replace(str(temporary), str(output))
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args(argv)
    today = utc_today()
    error = None
    for attempt in range(2):
        try:
            data = parse_profile(request_profile(today), today)
            write_snapshot(args.output, data)
            print("Updated {}: {} locations, {} total pageviews".format(
                args.output, len(data["locations"]), data["totalPageviews"]
            ))
            return 0
        except (OSError, URLError, ValueError, KeyError, TypeError) as exc:
            error = str(exc)
            if attempt == 0:
                time.sleep(1)
    message = "Visitor history refresh failed; preserving the existing snapshot: " + error
    if os.environ.get("GITHUB_ACTIONS") == "true":
        print("::warning::" + message.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A"), file=sys.stderr)
    else:
        print("Warning: " + message, file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
