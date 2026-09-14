#!/usr/bin/env python3
"""
Builds an editable PowerPoint companion to the HTML deck (slides/index.html).

Same content, same order, same talk — but real PowerPoint shapes (not an image clone), so it can
be hand-edited, dropped into a conference's template, or presented from PowerPoint/Keynote/Google
Slides if the live HTML deck isn't an option.

Run: /path/to/venv/bin/python presentation/pptx/build_pptx.py
"""
from __future__ import annotations

import os
import subprocess

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn
import copy

ASSETS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets")

# ---------------------------------------------------------------------------
# Palette (matches presentation/slides/theme.css and the claims-console app)
# ---------------------------------------------------------------------------
BG = RGBColor(0x0A, 0x0C, 0x16)
CARD = RGBColor(0x14, 0x18, 0x28)
CARD_BORDER = RGBColor(0x23, 0x2A, 0x41)
TEXT = RGBColor(0xE6, 0xE9, 0xF5)
MUTED = RGBColor(0x9A, 0xA2, 0xC0)
ACCENT = RGBColor(0x7C, 0x5C, 0xFF)
ACCENT_2 = RGBColor(0x4C, 0x9F, 0xFE)
SUCCESS = RGBColor(0x34, 0xD3, 0x99)
WARNING = RGBColor(0xFB, 0xBF, 0x24)
ERROR = RGBColor(0xF8, 0x71, 0x71)
WAITING = RGBColor(0x38, 0xBD, 0xF8)
CODE_BG = RGBColor(0x0D, 0x10, 0x20)

FONT = "Segoe UI"
FONT_CODE = "Consolas"

SLIDE_W = Inches(13.333)
SLIDE_H = Inches(7.5)

prs = Presentation()
prs.slide_width = SLIDE_W
prs.slide_height = SLIDE_H
BLANK = prs.slide_layouts[6]


def new_slide():
    slide = prs.slides.add_slide(BLANK)
    bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, SLIDE_W, SLIDE_H)
    bg.fill.solid()
    bg.fill.fore_color.rgb = BG
    bg.line.fill.background()
    bg.shadow.inherit = False
    # Send background behind everything else.
    spTree = slide.shapes._spTree
    spTree.remove(bg._element)
    spTree.insert(2, bg._element)
    return slide


def set_notes(slide, text: str):
    if not text:
        return
    slide.notes_slide.notes_text_frame.text = text


def add_textbox(slide, left, top, width, height, *, anchor=MSO_ANCHOR.TOP):
    box = slide.shapes.add_textbox(left, top, width, height)
    tf = box.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = 0
    tf.margin_right = 0
    tf.margin_top = 0
    tf.margin_bottom = 0
    return box, tf


def style_run(run, *, size=18, color=TEXT, bold=False, font=FONT, italic=False):
    run.font.size = Pt(size)
    run.font.color.rgb = color
    run.font.bold = bold
    run.font.italic = italic
    run.font.name = font


def add_kicker(slide, text, top=Inches(0.5), color=ACCENT_2, left=Inches(0.7)):
    _, tf = add_textbox(slide, left, top, Inches(11.5), Inches(0.4))
    p = tf.paragraphs[0]
    r = p.add_run()
    r.text = text.upper()
    style_run(r, size=13, color=color, bold=True)
    p.font.name = FONT
    # letter spacing isn't directly supported by python-pptx; leave as-is.
    return tf


def add_heading(slide, text, top=Inches(0.85), size=32, left=Inches(0.7), width=Inches(11.9)):
    _, tf = add_textbox(slide, left, top, width, Inches(1.3))
    p = tf.paragraphs[0]
    r = p.add_run()
    r.text = text
    style_run(r, size=size, color=TEXT, bold=True)
    return tf


def add_body(slide, text, top, *, left=Inches(0.7), width=Inches(11.5), size=16, color=MUTED):
    _, tf = add_textbox(slide, left, top, width, Inches(1.2))
    p = tf.paragraphs[0]
    r = p.add_run()
    r.text = text
    style_run(r, size=size, color=color)
    return tf


def rounded_card(slide, left, top, width, height, *, border_color=CARD_BORDER, fill=CARD):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    try:
        shape.adjustments[0] = 0.06
    except Exception:
        pass
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill
    shape.line.color.rgb = border_color
    shape.line.width = Pt(1)
    shape.shadow.inherit = False
    return shape


def card_with_text(slide, left, top, width, height, header, body, *, header_color=ACCENT_2, border=CARD_BORDER):
    rounded_card(slide, left, top, width, height, border_color=border)
    pad = Inches(0.22)
    _, tf = add_textbox(slide, left + pad, top + Inches(0.16), width - pad * 2, height - Inches(0.3))
    p0 = tf.paragraphs[0]
    r0 = p0.add_run()
    r0.text = header.upper()
    style_run(r0, size=12, color=header_color, bold=True)
    p1 = tf.add_paragraph()
    p1.space_before = Pt(6)
    r1 = p1.add_run()
    r1.text = body
    style_run(r1, size=13, color=MUTED)


def add_footer_brand(slide):
    _, tf = add_textbox(slide, Inches(0.7), Inches(7.05), Inches(6), Inches(0.35))
    p = tf.paragraphs[0]
    r = p.add_run()
    r.text = "◈ Temporal · Lifting the Veil"
    style_run(r, size=10, color=MUTED)


# ---------------------------------------------------------------------------
# Slide type builders
# ---------------------------------------------------------------------------

def title_slide(kicker, title, subtitle, meta_items, notes=""):
    s = new_slide()
    add_kicker(s, "Temporal · Engineering Talk", top=Inches(2.3))
    if kicker:
        add_kicker(s, kicker, top=Inches(2.65), color=ACCENT)
        title_top = Inches(3.0)
    else:
        title_top = Inches(2.7)
    _, tf = add_textbox(s, Inches(0.7), title_top, Inches(10), Inches(1.6))
    p = tf.paragraphs[0]
    r = p.add_run()
    r.text = title
    style_run(r, size=54, color=TEXT, bold=True)
    _, tf2 = add_textbox(s, Inches(0.7), Inches(4.3), Inches(8.5), Inches(1.2))
    p2 = tf2.paragraphs[0]
    r2 = p2.add_run()
    r2.text = subtitle
    style_run(r2, size=20, color=MUTED)

    # divider line
    line = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.7), Inches(5.7), Inches(11.9), Pt(1))
    line.fill.solid()
    line.fill.fore_color.rgb = CARD_BORDER
    line.line.fill.background()
    line.shadow.inherit = False

    x = Inches(0.7)
    for label, value in meta_items:
        _, tf3 = add_textbox(s, x, Inches(5.85), Inches(2.6), Inches(0.7))
        p3 = tf3.paragraphs[0]
        r3 = p3.add_run()
        r3.text = value
        style_run(r3, size=16, color=TEXT, bold=True)
        p4 = tf3.add_paragraph()
        r4 = p4.add_run()
        r4.text = label
        style_run(r4, size=11, color=MUTED)
        x += Inches(2.6)
    set_notes(s, notes)
    return s


def section_slide(number, title, subtitle, notes=""):
    s = new_slide()
    _, tf = add_textbox(s, Inches(0.9), Inches(2.4), Inches(4), Inches(1.6))
    p = tf.paragraphs[0]
    r = p.add_run()
    r.text = number
    style_run(r, size=72, color=ACCENT, bold=True, font=FONT_CODE)
    _, tf2 = add_textbox(s, Inches(0.9), Inches(3.7), Inches(9.5), Inches(1.1))
    p2 = tf2.paragraphs[0]
    r2 = p2.add_run()
    r2.text = title
    style_run(r2, size=40, color=TEXT, bold=True)
    _, tf3 = add_textbox(s, Inches(0.9), Inches(4.6), Inches(7.5), Inches(1))
    p3 = tf3.paragraphs[0]
    r3 = p3.add_run()
    r3.text = subtitle
    style_run(r3, size=17, color=MUTED)
    set_notes(s, notes)
    return s


def content_slide(kicker, title, notes=""):
    """Base content slide with kicker + heading; returns slide for caller to add content below y=1.9in."""
    s = new_slide()
    add_kicker(s, kicker, top=Inches(0.55))
    add_heading(s, title, top=Inches(0.9), size=30)
    add_footer_brand(s)
    set_notes(s, notes)
    return s


def bullets_slide(kicker, title, bullets, notes="", start_y=2.0, bullet_color=SUCCESS, size=17):
    s = content_slide(kicker, title, notes)
    _, tf = add_textbox(s, Inches(0.7), Inches(start_y), Inches(11.5), Inches(4.5))
    first = True
    for mark, text in bullets:
        p = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        p.space_after = Pt(10)
        r1 = p.add_run()
        r1.text = f"{mark}  "
        style_run(r1, size=size, color=bullet_color, bold=True)
        r2 = p.add_run()
        r2.text = text
        style_run(r2, size=size, color=TEXT)
    return s


def cards_slide(kicker, title, cards, notes="", cols=2, start_y=2.0, card_h=1.5, intro=None):
    s = content_slide(kicker, title, notes)
    if intro:
        add_body(s, intro, Inches(1.75), size=15)
    left0 = Inches(0.7)
    gap = Inches(0.3)
    total_w = Inches(11.9)
    card_w = Emu(int((total_w - gap * (cols - 1)) / cols))
    x, y = left0, Inches(start_y)
    for i, (header, body, *rest) in enumerate(cards):
        color = rest[0] if rest else ACCENT_2
        card_with_text(s, x, y, card_w, Inches(card_h), header, body, header_color=color)
        if (i + 1) % cols == 0:
            x = left0
            y = Emu(int(y + Inches(card_h) + gap))
        else:
            x = Emu(int(x + card_w + gap))
    return s


def folder_tree_slide(kicker, title, columns, note_text=None, notes=""):
    """columns: list of (header, tree_text, accent_color) — three monospace file-tree windows
    side by side, one per package."""
    s = content_slide(kicker, title, notes)
    left0 = Inches(0.7)
    gap = Inches(0.3)
    total_w = Inches(11.9)
    cols = len(columns)
    card_w = Emu(int((total_w - gap * (cols - 1)) / cols))
    top = Inches(1.85)
    height = Inches(4.3)
    x = left0
    for header, tree_text, color in columns:
        rounded_card(s, x, top, card_w, height, border_color=color)
        _, htf = add_textbox(s, x + Inches(0.18), top + Inches(0.12), card_w - Inches(0.36), Inches(0.5))
        hp = htf.paragraphs[0]
        hr = hp.add_run()
        hr.text = header
        style_run(hr, size=12, color=color, bold=True)
        _, tf = add_textbox(s, x + Inches(0.22), top + Inches(0.62), card_w - Inches(0.4), height - Inches(0.8))
        p = tf.paragraphs[0]
        r = p.add_run()
        r.text = tree_text
        style_run(r, size=11, color=TEXT, font=FONT_CODE)
        p.line_spacing = 1.25
        x = Emu(int(x + card_w + gap))
    if note_text:
        add_body(s, note_text, Emu(int(top + height + Inches(0.22))), size=14)
    return s


def code_and_image_slide(
    kicker, title, left_label, code_text, right_label, image_path, note_text=None, notes="", font_size=13,
):
    """Two stacked "windows": a code block on top, a screenshot below."""
    s = content_slide(kicker, title, notes)
    full_w = Inches(9.0)
    x = Emu(int((Inches(13.33) - full_w) / 2))
    top1 = Inches(1.6)
    height1 = Inches(3.05)
    gap = Inches(0.1)
    top2 = Emu(int(top1 + height1 + gap))
    height2 = Inches(1.6)

    # Top: code window.
    rounded_card(s, x, top1, full_w, height1, fill=CODE_BG)
    bar = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, top1, full_w, Inches(0.4))
    bar.fill.solid(); bar.fill.fore_color.rgb = RGBColor(0x15, 0x19, 0x34)
    bar.line.color.rgb = CARD_BORDER; bar.line.width = Pt(1)
    bar.shadow.inherit = False
    _, btf = add_textbox(s, x + Inches(0.15), top1 + Inches(0.06), full_w - Inches(0.3), Inches(0.3))
    bp = btf.paragraphs[0]
    br = bp.add_run()
    br.text = f"●  ●  ●    {left_label}"
    style_run(br, size=10, color=MUTED, font=FONT_CODE)
    _, tf = add_textbox(s, x + Inches(0.2), top1 + Inches(0.55), full_w - Inches(0.4), height1 - Inches(0.75))
    p = tf.paragraphs[0]
    r = p.add_run()
    r.text = code_text
    style_run(r, size=font_size, color=RGBColor(0xD6, 0xDC, 0xF5), font=FONT_CODE)
    p.line_spacing = 1.3

    # Bottom: screenshot window.
    rounded_card(s, x, top2, full_w, height2, fill=CODE_BG)
    bar2 = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, top2, full_w, Inches(0.4))
    bar2.fill.solid(); bar2.fill.fore_color.rgb = RGBColor(0x15, 0x19, 0x34)
    bar2.line.color.rgb = CARD_BORDER; bar2.line.width = Pt(1)
    bar2.shadow.inherit = False
    _, btf2 = add_textbox(s, x + Inches(0.15), top2 + Inches(0.06), full_w - Inches(0.3), Inches(0.3))
    bp2 = btf2.paragraphs[0]
    br2 = bp2.add_run()
    br2.text = f"●  ●  ●    {right_label}"
    style_run(br2, size=10, color=MUTED, font=FONT_CODE)
    img_h = height2 - Inches(0.65)
    img_w = Emu(int(img_h * (1070 / 295)))
    img_x = Emu(int(x + (full_w - img_w) / 2))
    s.shapes.add_picture(image_path, img_x, top2 + Inches(0.5), height=img_h)

    if note_text:
        add_body(s, note_text, Emu(int(top2 + height2 + Inches(0.2))), size=14)
    return s


def code_window_slide(kicker, title, label, code_text, notes="", font_size=13):
    s = content_slide(kicker, title, notes)
    left, top, width, height = Inches(0.7), Inches(2.0), Inches(11.9), Inches(2.6)
    win = rounded_card(s, left, top, width, height, fill=CODE_BG)
    bar = slide_bar = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, Inches(0.4))
    bar.fill.solid(); bar.fill.fore_color.rgb = RGBColor(0x15, 0x19, 0x34)
    bar.line.color.rgb = CARD_BORDER; bar.line.width = Pt(1)
    bar.shadow.inherit = False
    _, btf = add_textbox(s, left + Inches(0.2), top + Inches(0.06), width - Inches(0.4), Inches(0.3))
    bp = btf.paragraphs[0]
    br = bp.add_run()
    br.text = f"●  ●  ●    {label}"
    style_run(br, size=11, color=MUTED, font=FONT_CODE)
    _, tf = add_textbox(s, left + Inches(0.25), top + Inches(0.55), width - Inches(0.5), height - Inches(0.75))
    p = tf.paragraphs[0]
    r = p.add_run()
    r.text = code_text
    style_run(r, size=font_size, color=RGBColor(0xD6, 0xDC, 0xF5), font=FONT_CODE)
    p.line_spacing = 1.3
    return s


RECORDINGS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "recordings")
POSTERS_DIR = os.path.join(ASSETS_DIR, "posters")


def get_video_dimensions(path):
    """Return (width, height) of a video via ffprobe, or None if unavailable."""
    try:
        out = subprocess.check_output(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=width,height", "-of", "csv=p=0", path],
            stderr=subprocess.DEVNULL,
        ).decode().strip()
        w, h = out.split(",")
        return int(w), int(h)
    except Exception:
        return None


def demo_slide(badge_text, badge_color, title, filename, path_hint, talking_points, notes=""):
    s = new_slide()
    _, btf = add_textbox(s, Inches(0.7), Inches(0.5), Inches(2.2), Inches(0.5))
    bp = btf.paragraphs[0]
    br = bp.add_run()
    br.text = badge_text
    style_run(br, size=13, color=badge_color, bold=True)
    _, tf = add_textbox(s, Inches(3.0), Inches(0.45), Inches(9.6), Inches(0.7))
    p = tf.paragraphs[0]
    r = p.add_run()
    r.text = title
    style_run(r, size=28, color=TEXT, bold=True)

    frame_x, frame_y = Inches(0.7), Inches(1.3)
    frame_w, frame_h = Inches(11.9), Inches(4.6)
    rounded_card(s, frame_x, frame_y, frame_w, frame_h, fill=RGBColor(0x05, 0x06, 0x0C), border_color=ACCENT)

    video_path = os.path.join(RECORDINGS_DIR, os.path.basename(path_hint))
    poster_name = os.path.splitext(os.path.basename(path_hint))[0] + ".jpg"
    poster_path = os.path.join(POSTERS_DIR, poster_name)
    inset = Inches(0.15)
    avail_w = frame_w - 2 * inset
    avail_h = frame_h - 2 * inset
    if os.path.exists(video_path):
        # Preserve the recording's real 16:9 aspect ratio instead of stretching it to
        # fill the (wider) frame — fit within avail_w x avail_h and center.
        vid_w, vid_h = get_video_dimensions(video_path) or (1280, 720)
        aspect = vid_w / vid_h
        if avail_w / avail_h > aspect:
            movie_h = avail_h
            movie_w = Emu(int(movie_h * aspect))
        else:
            movie_w = avail_w
            movie_h = Emu(int(movie_w / aspect))
        movie_x = Emu(int(frame_x + (frame_w - movie_w) / 2))
        movie_y = Emu(int(frame_y + (frame_h - movie_h) / 2))
        poster_kwargs = {"poster_frame_image": poster_path} if os.path.exists(poster_path) else {}
        s.shapes.add_movie(
            video_path,
            movie_x, movie_y,
            movie_w, movie_h,
            **poster_kwargs,
        )
    else:
        # Fallback placeholder if the recording is missing at build time.
        play = s.shapes.add_shape(MSO_SHAPE.ISOSCELES_TRIANGLE, Inches(6.2), Inches(3.0), Inches(0.9), Inches(0.9))
        play.rotation = 90
        play.fill.solid(); play.fill.fore_color.rgb = ACCENT
        play.line.fill.background()
        play.shadow.inherit = False
        _, ftf = add_textbox(s, Inches(3.7), Inches(4.05), Inches(5.9), Inches(0.5))
        fp = ftf.paragraphs[0]
        fp.alignment = PP_ALIGN.CENTER
        fr = fp.add_run()
        fr.text = filename
        style_run(fr, size=20, color=MUTED)

    _, htf = add_textbox(s, Inches(3.7), Inches(5.95), Inches(5.9), Inches(0.3))
    hp = htf.paragraphs[0]
    hp.alignment = PP_ALIGN.CENTER
    hr = hp.add_run()
    hr.text = f"{filename} \u2014 click to play"
    style_run(hr, size=12, color=RGBColor(0x6F, 0x77, 0x94), font=FONT_CODE)

    _, ttf = add_textbox(s, Inches(0.7), Inches(6.3), Inches(11.9), Inches(0.9))
    first = True
    for point in talking_points:
        p = ttf.paragraphs[0] if first else ttf.add_paragraph()
        first = False
        r = p.add_run()
        r.text = f"▸ {point}"
        style_run(r, size=13, color=MUTED)
        p.space_after = Pt(4)
    set_notes(s, notes)
    return s


def statement_slide(kicker, lines, attribution, notes=""):
    """lines: list of (text, is_accent) tuples rendered as one flowing heading."""
    s = new_slide()
    add_kicker(s, kicker, top=Inches(1.85))
    _, tf = add_textbox(s, Inches(0.9), Inches(2.3), Inches(10.8), Inches(3.2))
    p = tf.paragraphs[0]
    for text, is_accent in lines:
        r = p.add_run()
        r.text = text
        style_run(r, size=32, color=ACCENT_2 if is_accent else TEXT, bold=True)
    _, tf2 = add_textbox(s, Inches(0.9), Inches(5.75), Inches(9.8), Inches(0.8))
    p2 = tf2.paragraphs[0]
    r2 = p2.add_run()
    r2.text = attribution
    style_run(r2, size=15, color=MUTED)
    set_notes(s, notes)
    return s


# ---------------------------------------------------------------------------
# Build the deck (same order/content as slides/index.html)
# ---------------------------------------------------------------------------

title_slide(
    "A live-coded case study",
    "Lifting the Veil",
    "How to match your use case & Temporal — told through one prompt, one AI coding "
    "agent, and one insurance claim.",
    [("prompt → full app", "1"), ("databases used", "0")],
    notes=(
        "Welcome / intro yourself. Hook: 'How many of you have looked at Temporal's docs and "
        "thought this looks powerful, but I genuinely don't know if MY problem needs it?' That's "
        "the veil we're lifting today."
    ),
)

statement_slide(
    "The question everyone actually has",
    [('"This looks powerful. But is it right for ', False), ("my", True), (' use case?"', False)],
    "— every engineer's first honest reaction to Temporal",
    notes="Temporal's pitch is abstract until it touches a concrete, messy business process you own.",
)

cards_slide("The experiment", "I asked AI a vague prompt. Here's what happened.", [
    ("Step 1", "Write the rough idea", ACCENT),
    ("Step 2", "Ask AI to turn it into a real spec", ACCENT),
    ("Step 3", "Hand that spec to a coding agent & build it", ACCENT),
], cols=3, start_y=2.9, card_h=1.3,
    intro="Not \u201chere is a finished spec, build it.\u201d A genuinely rough, one-paragraph idea "
          "\u2014 the kind you'd type into a chat box on your commute. Then I watched what it took "
          "to turn that into something worth demoing to engineers.",
    notes="Set up the three-act structure of the talk. Reproducible — anyone can do this on their own use case.")

bullets_slide("Agenda", "Where we're headed", [
    ("01", "The prompt experiment \u2014 before & after"),
    ("02", "What actually got built (architecture + lifecycle)"),
    ("03", "Live demo \u2014 real failures, real recovery"),
    ("04", "Lessons \u2014 how to match your use case to Temporal"),
    ("05", "Resources & how to try this yourself"),
], bullet_color=SUCCESS, notes="Quick roadmap. Keep brief.")

section_slide("01", "The Prompt Experiment",
              "Before and after \u2014 and why the gap between them is the whole lesson.")

code_window_slide("What I actually typed", "My first prompt (verbatim)", "chat \u2014 untitled idea",
    "> I want to see what temporal workflows can do for me. Create me a project with a UI to "
    "track workflow progress and for me to interact with the workflows. Scenario: Claim process "
    "for an insurance company. No database, just get state and progress from temporal itself. "
    "Use a local temporal instance. Implement any cool ideas you can think of. Make sure there "
    "is at lease 1 wait for signal from the UI. Use local storage so the UI persists on refresh.",
    notes="Read it out loud, typo and all ('at lease 1').", font_size=14)

s = content_slide("Read it again, like a coding agent has to", "Five things it never says",
    notes="The point isn't 'this prompt is bad' \u2014 it under-specifies exactly the decisions "
          "that make or break a durable-execution design.")
_, tf = add_textbox(s, Inches(0.7), Inches(2.0), Inches(5.6), Inches(2.5))
p = tf.paragraphs[0]
r = p.add_run()
r.text = ("\u201c\u2026track workflow progress\u2026 interact with the workflows\u2026 no database\u2026 "
          "any cool ideas\u2026 at lease 1 wait for signal\u2026 local storage so it persists\u2026\u201d")
style_run(r, size=14, color=MUTED, font=FONT_CODE)
_, tf2 = add_textbox(s, Inches(6.6), Inches(2.0), Inches(6.0), Inches(3))
first = True
for q in [
    "Which failures are transient vs. permanent?",
    "What must never be lost on a crash?",
    "Where's the API/worker/UI boundary?",
    "What does \u201cinteract with\u201d mean \u2014 signals? updates?",
    "\u201cCool ideas\u201d = infinite scope, zero acceptance criteria",
]:
    p2 = tf2.paragraphs[0] if first else tf2.add_paragraph()
    first = False
    p2.space_after = Pt(8)
    r1 = p2.add_run(); r1.text = "?  "; style_run(r1, size=15, color=SUCCESS, bold=True)
    r2 = p2.add_run(); r2.text = q; style_run(r2, size=15, color=TEXT)
add_body(s, "None of this makes the prompt bad \u2014 it's a perfectly normal first draft.",
          Inches(5.0), size=14)

cards_slide("The move that actually matters", "I didn't fix the prompt myself. I asked AI to fix it.", [
    ("Why not write the spec by hand?", "Because \u201cwhat should a good Temporal spec contain\u201d is "
     "itself a question worth delegating \u2014 the model already knows the shape of retries, "
     "signals, queries, sagas, especially with a Temporal skill loaded for grounding.", ACCENT_2),
    ("What I asked for", "\u201cWould this be good for a coding-agent prompt?\u201d \u2014 the answer "
     "covered architecture, failure modes, and UI/UX explicitly.", ACCENT_2),
], cols=2, start_y=2.0, card_h=2.0,
    notes="Generalizable trick: use the model to interrogate its own upcoming task.")

cards_slide("What came back", "The improved prompt  (condensed)", [
    ("Stack & architecture, named explicitly",
     "Temporal TS SDK \u00b7 local dev server \u00b7 NestJS API + worker \u00b7 React + TS UI \u00b7 "
     "Docker Compose \u00b7 separate workflow/activity/client/API/UI layers", ACCENT_2),
    ("Durability requirements, named explicitly",
     "retry policies per activity \u00b7 at least one timer \u00b7 a child workflow \u00b7 signals for "
     "every human action \u00b7 queries for state/progress \u00b7 cancellation handling", ACCENT_2),
    ("The claim lifecycle, spelled out",
     "9 named stages from submission to payout \u2014 not \u201cany cool ideas,\u201d a concrete process "
     "to map onto primitives", ACCENT_2),
    ("Definition of done",
     "README, unit tests, one integration test that signals a real workflow to completion, "
     "build/lint/test must pass", ACCENT_2),
], cols=2, start_y=2.0, card_h=2.0,
   notes="Full text is in the appendix. The point is the shape, not the word count.")

statement_slide(
    "The point of this whole talk",
    [("Don't be overwhelmed.\n", False),
     ("You don't need to spell everything out ", False),
     ("to see what Temporal can do for you.", True)],
    "A sharper prompt makes for a sharper demo \u2014 but retries, signals, queries and durability "
    "are primitives Temporal gives you either way.",
    notes="Slow down here. The refined prompt made this specific demo cleaner, but the takeaway "
          "isn't 'write a perfect spec or don't bother.' Even the rough first draft would have "
          "gotten a working workflow with retries and durability for free.",
)

section_slide("02", "What Got Built",
    "An insurance claims console where Temporal \u2014 not a database \u2014 is the source of truth.")

s = content_slide("Architecture", "Four pieces, one source of truth",
    notes="Walk left to right. UI never talks to Temporal directly \u2014 only through the API.")
boxes = [
    ("React Dashboard", "polling \u00b7 localStorage prefs only"),
    ("NestJS API", "Temporal client \u00b7 REST facade"),
    ("Temporal Server", "event history \u00b7 task queue \u00b7 visibility"),
    ("NestJS Worker", "workflows + activities"),
]
x = Inches(0.7)
w = Inches(2.7)
gap = Inches(0.35)
for i, (name, sub) in enumerate(boxes):
    fill = RGBColor(0x1c, 0x16, 0x30) if i == 2 else CARD
    border = ACCENT if i == 2 else CARD_BORDER
    box = rounded_card(s, x, Inches(2.2), w, Inches(1.1), fill=fill, border_color=border)
    _, tf = add_textbox(s, x + Inches(0.15), Inches(2.35), w - Inches(0.3), Inches(0.8))
    p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
    r = p.add_run(); r.text = name; style_run(r, size=14, color=TEXT, bold=True)
    p2 = tf.add_paragraph(); p2.alignment = PP_ALIGN.CENTER
    r2 = p2.add_run(); r2.text = sub; style_run(r2, size=10, color=MUTED)
    if i < len(boxes) - 1:
        _, atf = add_textbox(s, Emu(int(x + w)), Inches(2.55), gap, Inches(0.5))
        ap = atf.paragraphs[0]; ap.alignment = PP_ALIGN.CENTER
        ar = ap.add_run(); ar.text = "\u2192"; style_run(ar, size=20, color=ACCENT_2)
    x = Emu(int(x + w + gap))
badges = [("\u2717 no database, anywhere", ERROR), ("\u2713 Temporal event history is the state", SUCCESS),
          ("\u2713 localStorage = prefs + recent ids only", WAITING)]
x = Inches(0.7)
for text, color in badges:
    _, tf = add_textbox(s, x, Inches(3.7), Inches(4), Inches(0.4))
    p = tf.paragraphs[0]
    r = p.add_run(); r.text = text; style_run(r, size=13, color=color, bold=True)
    x = Emu(int(x + Inches(4.0)))

s = content_slide("The business process", "Nine stages \u2192 nine Temporal decisions",
    notes="Exact stage list from the improved prompt. Stage 6 = the required signal, precisely specified.")
stages = [
    ("1. Submitted", "workflow start"), ("2. Validation", "activity + retry"),
    ("3. Coverage check", "activity + retry"), ("4. Damage assessment", "heartbeat + cancel"),
    ("5. Fraud evaluation", "child workflow"), ("6. Human review", "signal \u00b7 waits forever"),
    ("7. Decision", "saga: release/reserve"), ("8. Payment", "durable timer + activity"),
    ("9. Completed", "workflow result"),
]
cols = 3
cw = Inches(3.83)
ch = Inches(0.9)
gap = Inches(0.15)
for i, (name, tag) in enumerate(stages):
    col = i % cols
    row = i // cols
    x = Emu(int(Inches(0.7) + col * (cw + gap)))
    y = Emu(int(Inches(2.0) + row * (ch + gap)))
    rounded_card(s, x, y, cw, ch)
    _, tf = add_textbox(s, Emu(int(x + Inches(0.15))), Emu(int(y + Inches(0.12))), Emu(int(cw - Inches(0.3))), Emu(int(ch - Inches(0.2))))
    p = tf.paragraphs[0]
    r = p.add_run(); r.text = name; style_run(r, size=14, color=TEXT, bold=True)
    p2 = tf.add_paragraph()
    r2 = p2.add_run(); r2.text = tag; style_run(r2, size=11, color=ACCENT_2, font=FONT_CODE)
add_body(s, "Every chip on this rail is a query result, live, from a running Temporal workflow.",
          Inches(5.2), size=14)

folder_tree_slide("Architecture", "Inside the three packages", [
    ("WEB \u2014 DASHBOARD",
     "src/\n"
     "\u251c\u2500\u2500 pages/\n"
     "\u2502   \u251c\u2500\u2500 DashboardPage.tsx\n"
     "\u2502   \u2514\u2500\u2500 ClaimDetailPage.tsx\n"
     "\u251c\u2500\u2500 components/\n"
     "\u2502   \u251c\u2500\u2500 StageTimeline.tsx\n"
     "\u2502   \u251c\u2500\u2500 ActionPanel.tsx\n"
     "\u2502   \u251c\u2500\u2500 SimulationPanel.tsx\n"
     "\u2502   \u2514\u2500\u2500 \u202610 more\n"
     "\u251c\u2500\u2500 hooks/\n"
     "\u2502   \u251c\u2500\u2500 usePolling.ts\n"
     "\u2502   \u2514\u2500\u2500 usePreferences.tsx\n"
     "\u2514\u2500\u2500 lib/\n"
     "    \u251c\u2500\u2500 api.ts\n"
     "    \u2514\u2500\u2500 storage.ts",
     ACCENT_2),
    ("API \u2014 REST FACADE",
     "src/\n"
     "\u251c\u2500\u2500 claims/\n"
     "\u2502   \u251c\u2500\u2500 claims.controller.ts\n"
     "\u2502   \u251c\u2500\u2500 claims.service.ts\n"
     "\u2502   \u251c\u2500\u2500 temporal.mappers.ts\n"
     "\u2502   \u2514\u2500\u2500 dto.ts\n"
     "\u251c\u2500\u2500 temporal/\n"
     "\u2502   \u2514\u2500\u2500 temporal.service.ts\n"
     "\u251c\u2500\u2500 system/\n"
     "\u2502   \u2514\u2500\u2500 system.controller.ts\n"
     "\u2514\u2500\u2500 main.ts",
     ACCENT),
    ("WORKER \u2014 WORKFLOWS & ACTIVITIES",
     "src/\n"
     "\u251c\u2500\u2500 workflows/\n"
     "\u2502   \u251c\u2500\u2500 claim.workflow.ts\n"
     "\u2502   \u2514\u2500\u2500 fraud-check.workflow.ts\n"
     "\u251c\u2500\u2500 activities/\n"
     "\u2502   \u251c\u2500\u2500 claim/\n"
     "\u2502   \u2502   \u251c\u2500\u2500 validate-claim.ts\n"
     "\u2502   \u2502   \u251c\u2500\u2500 process-payment.ts\n"
     "\u2502   \u2502   \u2514\u2500\u2500 \u20268 more\n"
     "\u2502   \u251c\u2500\u2500 fraud/\n"
     "\u2502   \u2502   \u251c\u2500\u2500 check-watchlists.ts\n"
     "\u2502   \u2502   \u2514\u2500\u2500 score-fraud-risk.ts\n"
     "\u2502   \u2514\u2500\u2500 simulation.ts\n"
     "\u251c\u2500\u2500 temporal/\n"
     "\u2502   \u2514\u2500\u2500 temporal-worker.service.ts\n"
     "\u2514\u2500\u2500 admin/\n"
     "    \u2514\u2500\u2500 admin.controller.ts",
     SUCCESS),
], note_text="packages/web, packages/api, packages/worker \u2014 plus packages/shared for the "
             "request/response types, stage definitions and progress math every package imports, "
             "none of them redefine.",
   notes="Folder-level version of the architecture diagram. Each package has exactly one job: web "
         "renders and polls, api translates HTTP to Temporal client calls, worker is the only place "
         "workflow and activity code lives. Activities are one function per file, grouped by domain.")

code_and_image_slide(
    "Code \u2192 observability, for free",
    "Three activity calls. One real execution timeline.",
    "fraud-check.workflow.ts \u2014 simplified",
    "const { checkClaimHistory, checkWatchlists, scoreFraudRisk } =\n"
    "  proxyActivities<typeof activities>({ ...retryPolicy });\n\n"
    "export async function fraudCheckWorkflow(input: ClaimInput) {\n"
    "  const [history, watchlist] = await Promise.all([\n"
    "    checkClaimHistory(input),\n"
    "    checkWatchlists(input),\n"
    "  ]);\n"
    "  return await scoreFraudRisk(input.claimId, [...history, ...watchlist]);\n"
    "}",
    "Temporal Web UI \u2014 Timeline tab",
    os.path.join(ASSETS_DIR, "screenshots", "temporal-timeline-fraud-example.png"),
    note_text="No custom logging, no tracing setup, no dashboard to build \u2014 every activity call "
              "at the top shows up as a bar at the bottom the moment it runs.",
    notes="This is the real Timeline tab for this app's fraud-check child workflow, not a mockup. "
          "The code on top is the entire body \u2014 just a proxyActivities call and three "
          "activity invocations, two of them running in parallel. That parallelism is exactly what "
          "you see as two overlapping bars below, with zero extra instrumentation code.",
    font_size=12,
)

cards_slide("The Temporal bingo card", "What's actually demonstrated", [
    ("Retry policies", "per-stage, configurable backoff", SUCCESS),
    ("Non-retryable failures", "permanent errors stop cleanly", ERROR),
    ("Durable timers", "settlement hold + reminder loop", WAITING),
    ("Child workflow", "fraud check, own history", ACCENT),
    ("Signals", "approve / deny / info / recover", WAITING),
    ("Queries", "live state + progress %", ACCENT_2),
    ("Update + validator", "adjuster notes, rejected inline", ACCENT_2),
    ("Cancellation", "saga-style compensation", WARNING),
    ("Search attributes", "find claims by status/type/score", ACCENT_2),
    ("Worker-restart durability", "kill it mid-claim, resume", SUCCESS),
    ("Heartbeats", "cancellable long-running activity", ACCENT_2),
    ("No database", "Temporal is the only state store", ERROR),
], cols=3, start_y=2.0, card_h=1.3, notes="Let it sit as a 'yes it really does all of this' moment.")

section_slide("03", "Let's See It Run",
    "Real failures. Real recovery. No cuts hiding a crash.")

DEMOS = [
    ("DEMO 1 / 6", ACCENT, "Submit a claim, watch it run", "submit-and-progress.mp4",
     "presentation/recordings/01-submit-and-progress.mp4",
     ["Dashboard \u2192 Submit claim \u2192 live redirect", "Stage timeline updates via polling, no refresh",
      "Progress % computed from stage weights, not hardcoded"],
     "Submit the Happy path preset. This whole timeline is one query, getClaimState, polled every 2s."),
    ("DEMO 2 / 6", WAITING, "The workflow waits \u2014 forever \u2014 for you", "human-review-signals.mp4",
     "presentation/recordings/02-human-review-signals.mp4",
     ["Claim parks at \u201cHuman adjuster review\u201d", "Request more info \u2192 provide info \u2192 back to review",
      "Approve \u2192 durable settlement timer \u2192 paid"],
     "The required signal from the original prompt. The workflow is genuinely suspended."),
    ("DEMO 3 / 6", WARNING, "Break it a little \u2014 watch it heal itself", "transient-retry.mp4",
     "presentation/recordings/03-transient-retry.mp4",
     ["Arm \u201ctransient failure\u201d on damage assessment", "Activity panel shows attempt 1, 2, 3 \u2014 live",
      "Same code path, zero extra retry logic written"],
     "Point at the Activity execution & retries panel \u2014 that's Temporal's own attempt counter."),
    ("DEMO 4 / 6", ERROR, "Break it for real \u2014 recover it from the UI", "permanent-failure-recovery.mp4",
     "presentation/recordings/04-permanent-failure-recovery.mp4",
     ["\u201cBreak payment (permanent)\u201d \u2192 non-retryable ApplicationFailure",
      "Claim parks in \u201cblocked on failure\u201d \u2014 not crashed, not lost",
      "Operator clicks Retry \u2192 clears fault \u2192 claim completes"],
     "A permanent failure doesn't kill the workflow, it parks it waiting for a human decision."),
    ("DEMO 5 / 6", SUCCESS, "Kill the worker. Mid-claim. On purpose.", "worker-restart-durability.mp4",
     "presentation/recordings/05-worker-restart-durability.mp4",
     ["\u201cKill & restart worker\u201d while a claim is blocked", "worker-\u2026-gen1 dies, worker-\u2026-gen2 comes up",
      "Claim resumes exactly where it was \u2014 timers included"],
     "THE moment of the talk. Let this one breathe; don't rush the narration."),
    ("DEMO 6 / 6", MUTED, "Cancel mid-flight \u2014 compensations run", "cancellation-saga.mp4",
     "presentation/recordings/06-cancellation-saga.mp4",
     ["Cancel a running claim from the dashboard", "Reserve released, payment reversed, claimant notified",
      "Workflow closes CANCELED \u2014 cleanly, not abruptly"],
     "If time is short, this is the cut candidate."),
]
for badge, color, title, fname, path, points, notes in DEMOS:
    demo_slide(badge, color, title, fname, path, points, notes=notes)

section_slide("04", "Matching Your Use Case",
    "Turning what we just saw into a checklist you can use.")

bullets_slide("Pattern match", "Signals you have a good Temporal use case", [
    ("\u2713", "A process that spans minutes, days, or months \u2014 not one request/response"),
    ("\u2713", "A human has to approve, deny, or provide info at some unknown point"),
    ("\u2713", "Steps call flaky external systems that need retries with backoff"),
    ("\u2713", "A crash mid-process must not lose or double-run anything"),
    ("\u2713", "You need an audit trail of exactly what happened, in order"),
    ("\u2713", "Multiple steps must be undone together if a later one fails (saga)"),
], bullet_color=SUCCESS, notes="Ask the room how many already do 3+ of these with cron jobs and status columns.")

cards_slide("The reusable checklist", "Durability questions to ask yourself", [
    ("Ask about failure", "What activities can fail transiently? What's permanent? What must be non-retryable?", ACCENT_2),
    ("Ask about waiting", "What waits on a human? For how long? What happens if nobody answers?", ACCENT_2),
    ("Ask about state", "What must survive a crash? Who is the source of truth?", ACCENT_2),
    ("Ask about boundaries", "Where does UI end and API begin? Where does API end and worker begin?", ACCENT_2),
], cols=2, start_y=2.0, card_h=2.0,
    notes="This slide is the payoff \u2014 a generalized checklist for deciding whether a process maps cleanly to Temporal.")

code_window_slide("Homework", "Try this yourself, this week", "prompt-template.txt",
    "> Here's my rough idea: [describe your process in 2-3 sentences]. Turn this into a spec "
    "for a coding agent building it on Temporal. Explicitly call out: which steps need retries "
    "and what kind of failures they should tolerate, where a human needs to approve/reject/"
    "provide input and how long we should wait, what a crash mid-process must not lose, and how "
    "the UI/API/worker boundaries should be drawn. Then build it.",
    notes="Invite people to paste their own use case into this template tonight.", font_size=14)

cards_slide("Go build something", "Resources", [
    ("This demo", "Full source, README, tests \u2014 github.com/simy307/temporal-claims-demo", ACCENT_2),
    ("Temporal docs", "docs.temporal.io \u00b7 TypeScript SDK samples", ACCENT_2),
    ("Community", "Temporal Slack \u00b7 community forum \u00b7 local meetups", ACCENT_2),
    ("The prompt template", "Previous slide \u2014 steal it, adapt it, use it on your own use case", ACCENT_2),
], cols=2, start_y=2.0, card_h=1.6, notes="Fill in your actual repo URL before the talk.")

title_slide("", "Thank you.", "", [],
    notes="Open the floor. Be ready for: versioning, Cloud vs self-hosted, payload limits, vs Airflow/Step Functions.")

out_path = "Lifting-the-Veil-Temporal-Talk.pptx"
prs.save(out_path)
print(f"Saved {out_path} with {len(prs.slides._sldIdLst)} slides")
