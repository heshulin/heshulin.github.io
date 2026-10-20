import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import requests


SCRIPT = Path(__file__).resolve().parents[1] / "update_scholar_publications.py"
SPEC = importlib.util.spec_from_file_location("scholar_update", SCRIPT)
scholar = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(scholar)

USER = "IweWDgYAAAAJ"
SOURCE = f"https://scholar.google.com/citations?user={USER}&hl=en"


def publication(identifier="paper1"):
    return {
        "title": identifier,
        "authors": "S He, A Researcher",
        "venue": "Conference, 2026",
        "year": 2026,
        "scholar_url": f"{SOURCE}&citation_for_view={USER}:{identifier}",
    }


def profile(identifiers=("paper1",), has_more=False):
    rows = "".join(
        f'<tr class="gsc_a_tr"><td><a class="gsc_a_at" '
        f'href="/citations?citation_for_view={USER}:{identifier}">{identifier}</a>'
        '<div class="gs_gray">S He, A Researcher</div>'
        '<div class="gs_gray">Conference, 2026</div></td>'
        '<td class="gsc_a_y">2026</td></tr>'
        for identifier in identifiers
    )
    disabled = "" if has_more else " disabled"
    return (
        '<div id="gsc_prf_in">Shulin He</div>'
        f'<table><tbody id="gsc_a_b">{rows}</tbody></table>'
        f'<button id="gsc_bpf_more"{disabled}>More</button>'
    )


def response(status=200, html=None, headers=None):
    result = requests.Response()
    result.status_code = status
    result.url = SOURCE
    result._content = (profile() if html is None else html).encode()
    result.headers.update(headers or {})
    return result


class ScholarFetchTests(unittest.TestCase):
    def test_standard_profile_url(self):
        url = scholar.build_list_url(USER, 0, 100)
        self.assertNotIn("view_op", url)
        self.assertIn(f"user={USER}", url)

    def test_forbidden_fails_without_retry(self):
        session = Mock()
        session.get.return_value = response(403)
        with self.assertRaisesRegex(RuntimeError, "HTTP 403"):
            scholar.fetch_page(session, SOURCE)
        self.assertEqual(session.get.call_count, 1)

    @patch.object(scholar.time, "sleep")
    def test_rate_limit_respects_retry_after_then_recovers(self, sleep):
        session = Mock()
        session.get.side_effect = [response(429, headers={"Retry-After": "45"}), response()]
        self.assertIn("gsc_a_b", scholar.fetch_page(session, SOURCE))
        sleep.assert_called_once_with(45)

    @patch.object(scholar.time, "sleep")
    def test_repeated_rate_limit_still_fails(self, sleep):
        session = Mock()
        session.get.return_value = response(429)
        with self.assertRaises(requests.HTTPError):
            scholar.fetch_page(session, SOURCE)
        self.assertEqual(session.get.call_count, 3)
        self.assertEqual(sleep.call_count, 2)

    @patch.object(scholar.time, "sleep")
    def test_long_cooldown_stops_without_retrying_early(self, sleep):
        session = Mock()
        session.get.return_value = response(429, headers={"Retry-After": "3600"})
        with self.assertRaisesRegex(RuntimeError, "longer cooldown"):
            scholar.fetch_page(session, SOURCE)
        self.assertEqual(session.get.call_count, 1)
        sleep.assert_not_called()

    @patch.object(scholar.time, "sleep")
    def test_temporary_network_timeout_recovers(self, sleep):
        session = Mock()
        session.get.side_effect = [requests.Timeout("timed out"), response()]
        self.assertIn("gsc_a_b", scholar.fetch_page(session, SOURCE))
        sleep.assert_called_once_with(10)

    @patch.object(scholar.time, "sleep")
    def test_temporary_server_failure_recovers(self, sleep):
        session = Mock()
        session.get.side_effect = [response(503), response()]
        self.assertIn("gsc_a_b", scholar.fetch_page(session, SOURCE))
        sleep.assert_called_once_with(10)

    def test_http_200_captcha_is_failure(self):
        session = Mock()
        session.get.return_value = response(html='<html><div class="g-recaptcha"></div></html>')
        with self.assertRaisesRegex(RuntimeError, "CAPTCHA"):
            scholar.fetch_page(session, SOURCE)

    def test_wrong_page_is_failure(self):
        with self.assertRaisesRegex(RuntimeError, "not a Google Scholar profile"):
            scholar.parse_publications("<html><h1>Please sign in</h1></html>")

    def test_empty_profile_is_failure(self):
        with self.assertRaisesRegex(RuntimeError, "no publications"):
            scholar.parse_publications(profile(()))

    def test_incomplete_row_is_failure(self):
        html = profile().replace('class="gsc_a_at"', 'class="missing"')
        with self.assertRaisesRegex(RuntimeError, "incomplete publication row"):
            scholar.parse_publications(html)

    @patch.object(scholar, "fetch_page", side_effect=[profile(("paper1",), True), profile(("paper2",))])
    def test_more_button_fetches_short_page_continuation(self, fetch):
        pubs = scholar.collect_publications(USER, 100, 0, 0, False, 0)
        self.assertEqual([pub["title"] for pub in pubs], ["paper1", "paper2"])
        self.assertIn("cstart=1", fetch.call_args_list[1][0][1])

    @patch.object(scholar, "fetch_page", return_value=profile(has_more=True))
    def test_page_limit_does_not_publish_truncated_list(self, fetch):
        with self.assertRaisesRegex(RuntimeError, "complete profile"):
            scholar.collect_publications(USER, 100, 0, 1, False, 0)

    @patch.object(scholar, "fetch_page", return_value=profile().replace(USER + ":", "other-user:"))
    def test_wrong_profile_is_failure(self, fetch):
        with self.assertRaisesRegex(RuntimeError, "requested Scholar profile"):
            scholar.collect_publications(USER, 100, 0, 0, False, 0)

    @patch.object(scholar, "fetch_page", return_value=profile(has_more=True))
    def test_repeated_page_fails_instead_of_looping(self, fetch):
        with self.assertRaisesRegex(RuntimeError, "repeated a page"):
            scholar.collect_publications(USER, 100, 0, 0, False, 0)


class BrowserTransportTests(unittest.TestCase):
    def setUp(self):
        self.session = scholar.BrowserSession()
        self.session.page = Mock()
        self.session.page.url = SOURCE
        self.session.page.content.return_value = profile()
        self.session.browser_error = type("BrowserError", (Exception,), {})
        self.session.browser_timeout = type("BrowserTimeout", (self.session.browser_error,), {})
        self.navigation = Mock(ok=True, status=200, status_text="OK", headers={})
        self.session.page.goto.return_value = self.navigation

    def test_complete_browser_profile_uses_existing_parser(self):
        html = scholar.fetch_page(self.session, SOURCE)
        self.assertEqual(scholar.parse_publications(html)[0]["title"], "paper1")
        self.session.page.locator.assert_any_call("#gsc_bpf_more")

    def test_browser_forbidden_keeps_true_failure(self):
        self.navigation.ok = False
        self.navigation.status = 403
        with self.assertRaisesRegex(RuntimeError, "HTTP 403"):
            scholar.fetch_page(self.session, SOURCE)
        self.session.page.locator.assert_not_called()

    def test_browser_captcha_does_not_wait_for_or_bypass_challenge(self):
        self.session.page.content.return_value = '<div class="g-recaptcha"></div>'
        with self.assertRaisesRegex(RuntimeError, "CAPTCHA"):
            scholar.fetch_page(self.session, SOURCE)
        self.session.page.locator.assert_not_called()

    @patch.object(scholar.time, "sleep")
    def test_browser_navigation_timeout_uses_bounded_retry(self, sleep):
        self.session.page.goto.side_effect = self.session.browser_timeout("timeout")
        with self.assertRaises(requests.Timeout):
            scholar.fetch_page(self.session, SOURCE)
        self.assertEqual(self.session.page.goto.call_count, 3)


class ScholarOutputTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.output = Path(self.temporary.name) / "scholar.json"
        self.previous = json.dumps({
            "source": SOURCE, "last_updated": "2026-06-15",
            "publications": [publication("paper1"), publication("paper2")],
        }) + "\n"
        self.output.write_text(self.previous)

    def test_empty_fetch_preserves_file(self):
        with self.assertRaisesRegex(RuntimeError, "empty publication list"):
            scholar.write_output(self.output, SOURCE, [])
        self.assertEqual(self.output.read_text(), self.previous)

    def test_missing_old_paper_preserves_file(self):
        with self.assertRaisesRegex(RuntimeError, "omits 1 existing"):
            scholar.write_output(self.output, SOURCE, [publication()])
        self.assertEqual(self.output.read_text(), self.previous)

    def test_verified_removal_is_explicit(self):
        scholar.write_output(self.output, SOURCE, [publication()], allow_removals=True)
        self.assertEqual(len(json.loads(self.output.read_text())["publications"]), 1)

    def test_full_success_updates_file(self):
        scholar.write_output(self.output, SOURCE, [publication("paper1"), publication("paper2"), publication("paper3")])
        self.assertEqual(len(json.loads(self.output.read_text())["publications"]), 3)

    def test_failed_atomic_replace_preserves_file_and_cleans_temporary(self):
        with patch.object(scholar.os, "replace", side_effect=OSError("disk error")):
            with self.assertRaises(OSError):
                scholar.write_output(self.output, SOURCE, [publication("paper1"), publication("paper2")])
        self.assertEqual(self.output.read_text(), self.previous)
        self.assertEqual(list(self.output.parent.iterdir()), [self.output])


if __name__ == "__main__":
    unittest.main()
