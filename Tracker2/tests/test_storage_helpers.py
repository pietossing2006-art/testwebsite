import unittest

from storage import format_unit_label, parse_unit_number


class UnitFormattingTests(unittest.TestCase):
    def test_parse_unit_number_accepts_prefixed_or_plain_numbers(self):
        self.assertEqual(parse_unit_number("42/005", "42/"), 5)
        self.assertEqual(parse_unit_number("5", "42/"), 5)
        self.assertEqual(parse_unit_number("005", "42/"), 5)

    def test_parse_unit_number_rejects_empty_or_non_numeric_values(self):
        with self.assertRaises(ValueError):
            parse_unit_number("", "42/")
        with self.assertRaises(ValueError):
            parse_unit_number("42/A05", "42/")

    def test_format_unit_label_uses_dynamic_padding_for_total_rooms(self):
        self.assertEqual(format_unit_label(5, "42/", 755), "42/005")
        self.assertEqual(format_unit_label(5, "A-", 20), "A-05")
        self.assertEqual(format_unit_label(1200, "B/", 1200), "B/1200")


if __name__ == "__main__":
    unittest.main()
