"""Text for ReportLab Paragraphs.

A Paragraph reads its text as ReportLab's mini-HTML, so data from the
database — a customer called "A & B <Pty>", a note with an unclosed "<i>" —
either breaks the document or formats it. Every value that comes from a record
goes through `para` on its way into a Paragraph; a builder's own markup (its
"<b>" labels) is written around the escaped value, never through it.
"""

from xml.sax.saxutils import escape


def para(value) -> str:
    """`value` as Paragraph text: markup characters escaped, newlines kept."""
    if value is None:
        return ""
    return escape(str(value)).replace("\n", "<br/>")
