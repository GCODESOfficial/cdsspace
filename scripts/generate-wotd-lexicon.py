"""Generate the 10,000-entry single-token WOTD migration.

One-time tooling dependencies:
  pip install nltk wordfreq eng_to_ipa
  python -m nltk.downloader wordnet omw-1.4

The generated data uses WordNet definitions as a lexical base, ranks terms
towards brand/design/creative relevance, requires CMU-derived pronunciation,
and overlays the core editorial terms below.
"""

from __future__ import annotations

import os
import json
import re
from dataclasses import dataclass
from pathlib import Path

import eng_to_ipa as ipa
from eng_to_ipa.transcribe import cmu_to_ipa
from nltk.corpus import wordnet as wn
from wordfreq import zipf_frequency


TARGET_COUNT = 10_000
OUTPUT = Path(os.environ.get("WOTD_OUTPUT", "glashdb/migrations/20260728_branding_words_10000.sql"))
CMU_DICTIONARY = json.loads(
    (Path(ipa.__file__).parent / "resources" / "CMU_dict.json").read_text(encoding="utf-8")
)


@dataclass(frozen=True)
class Entry:
    word: str
    pronunciation: str
    part_of_speech: str
    meaning: str
    example: str
    feature_date: str | None = None


CUSTOM = [
    Entry("Styling", "/ˈstaɪ.lɪŋ/", "noun", "The deliberate shaping of visual elements so a brand communicates a clear and consistent character.", "The styling paired restrained typography with a vivid accent colour.", "2026-07-28"),
    Entry("Monochrome", "/ˈmɒn.ə.krəʊm/", "noun", "A visual treatment that uses one colour or a range of tones from a single colour.", "The campaign used monochrome photography to create a focused, premium mood.", "2026-07-29"),
    Entry("Tracking", "/ˈtræk.ɪŋ/", "noun", "The uniform adjustment of spacing across a range of letters in typography.", "The designer increased the tracking to give the uppercase headline more air.", "2026-07-30"),
    Entry("Hue", "/hjuː/", "noun", "The basic family of a colour, such as red, blue, green, or yellow.", "The identity uses a blue hue to signal clarity and confidence.", "2026-07-31"),
    Entry("HEXcode", "/ˈhɛks.koʊd/", "noun", "A six-character digital code used to specify an exact colour for consistent screen reproduction.", "The primary brand blue is documented with its HEXcode.", "2026-08-01"),
    Entry("Colour-palette", "/ˈkʌl.ə ˈpæl.ət/", "noun", "A defined collection of colours selected to represent a brand consistently.", "The colour-palette combines a confident blue with calm neutral tones.", "2026-08-02"),
    Entry("Kerning", "/ˈkɜː.nɪŋ/", "noun", "The adjustment of space between individual letter pairs to improve balance and readability.", "Careful kerning made the custom wordmark feel more polished.", "2026-08-03"),
    Entry("Wordmark", "/ˈwɜːd.mɑːk/", "noun", "A distinct text-only typographic treatment of a company, institution, or product name.", "The wordmark was redrawn to remain legible at small sizes."),
    Entry("Logotype", "/ˈlɒɡ.ə.taɪp/", "noun", "A logo formed primarily from a specially designed rendering of a name or set of letters.", "The logotype uses custom terminals to create a recognisable signature."),
    Entry("Brandmark", "/ˈbrænd.mɑːk/", "noun", "A distinctive visual symbol used to identify a brand without relying on its full name.", "The brandmark remains recognisable when used as a social avatar."),
    Entry("Typography", "/taɪˈpɒɡ.rə.fi/", "noun", "The art and system of arranging type to make written language clear, readable, and expressive.", "Typography gives the campaign a confident editorial voice."),
    Entry("Typeface", "/ˈtaɪp.feɪs/", "noun", "A coordinated design for letters, numbers, and symbols that gives text a particular visual character.", "The typeface balances warmth with professional authority."),
    Entry("Leading", "/ˈlɛd.ɪŋ/", "noun", "The vertical distance between lines of text.", "Generous leading made the long-form article easier to read."),
    Entry("Ligature", "/ˈlɪɡ.ə.tʃə/", "noun", "A single typographic form that combines two or more letters.", "The custom ligature became a distinctive detail in the identity."),
    Entry("Baseline", "/ˈbeɪs.laɪn/", "noun", "The invisible line on which most letters sit in a line of type.", "The icons were aligned carefully to the text baseline."),
    Entry("Glyph", "/ɡlɪf/", "noun", "An individual visual form representing a character or symbol in a typeface.", "The font includes alternate glyphs for expressive headlines."),
    Entry("Iconography", "/ˌaɪ.kəˈnɒɡ.rə.fi/", "noun", "The visual language of symbols and icons used throughout a brand system.", "A consistent iconography makes the interface easier to recognise and navigate."),
    Entry("Moodboard", "/ˈmuːd.bɔːd/", "noun", "A curated collection of imagery, colour, type, and texture used to express a proposed creative direction.", "The moodboard aligned the team before detailed design began."),
    Entry("Whitespace", "/ˈwaɪt.speɪs/", "noun", "Unmarked space around design elements that improves focus, hierarchy, and readability.", "Whitespace gave the product photography room to command attention."),
    Entry("Tagline", "/ˈtæɡ.laɪn/", "noun", "A short memorable phrase that expresses a brand or campaign idea.", "The tagline turns the positioning into a line customers can remember."),
    Entry("Brand-equity", "/ˈbrænd ˈek.wɪ.ti/", "noun", "The commercial and perceptual value created by what people know, feel, and expect from a brand.", "Consistent delivery strengthened brand-equity over time."),
    Entry("Brand-identity", "/ˈbrænd aɪˈden.tɪ.ti/", "noun", "The coordinated visual and verbal elements through which a brand presents itself.", "The new brand-identity connects the logo, colour, type, imagery, and voice."),
    Entry("Brand-voice", "/ˈbrænd vɔɪs/", "noun", "The consistent personality, tone, and language used in a brand's communications.", "The brand-voice remains warm and direct across every channel."),
    Entry("Branding", "/ˈbræn.dɪŋ/", "noun", "The strategic practice of shaping how an organisation, product, or service is recognised and experienced.", "Branding aligned the organisation's promise with its customer experience."),
    Entry("Positioning", "/pəˈzɪʃ.ən.ɪŋ/", "noun", "The deliberate place a brand aims to occupy in the audience's mind relative to alternatives.", "Clear positioning helped customers understand why the offer was different."),
    Entry("Differentiation", "/ˌdɪf.ə.ren.ʃiˈeɪ.ʃən/", "noun", "The meaningful qualities that make a brand distinct from its competitors.", "The strategy built differentiation around speed and personal support."),
    Entry("Salience", "/ˈseɪ.li.əns/", "noun", "The degree to which a brand is noticeable or readily comes to mind in a buying situation.", "Distinctive assets improved brand salience."),
    Entry("Archetype", "/ˈɑː.kɪ.taɪp/", "noun", "A familiar character pattern used to give a brand a coherent personality and role.", "The Explorer archetype shaped the campaign's adventurous tone."),
    Entry("Semiotics", "/ˌsem.iˈɒt.ɪks/", "noun", "The study of signs, symbols, and how audiences interpret meaning.", "Semiotics revealed how the category's colours signalled trust and expertise."),
    Entry("Touchpoint", "/ˈtʌtʃ.pɔɪnt/", "noun", "Any moment or channel through which a person encounters or interacts with a brand.", "The onboarding email is an important early touchpoint."),
]

DOMAIN_WORDS = set(
    """
    brand branding design visual colour color typography typeface font kerning
    tracking leading layout logo logotype wordmark symbol icon image identity
    style styling palette hue saturation chroma tone shade tint contrast
    composition grid hierarchy alignment spacing whitespace shape form texture
    pattern illustration graphic photography packaging print editorial copy
    message messaging narrative story audience consumer customer market marketing
    advertise advertising campaign media content communication creative creativity
    concept strategy research insight perception psychology emotion reputation
    value product service digital website interface user experience usability
    accessible accessibility business commerce retail culture trend distinctive
    differentiation position positioning voice naming name recall recognition
    salience equity archetype aesthetic artwork sketch drawing motion animation
    video film screen display pixel vector raster resolution prototype wireframe
    mockup template system framework architecture clarity consistency personality
    purpose mission vision tag slogan headline caption channel touchpoint conversion
    engagement loyalty community social influence behavior meaning semiotics
    semiology gesture sign language writing publish presentation pitch idea
    brainstorm innovation merchandise storefront promotion publicity response
    interaction expression character quality attribute material surface dimension
    proportion rhythm balance emphasis unity harmony scale foreground background
    photograph lens light shadow exposure focus crop frame render canvas ink paper
    press poster brochure signage wayfinding label mark trademark monogram emblem
    favicon pictogram ideogram gestalt modular responsive navigation information
    data analytics metric reach frequency impression awareness affinity advocacy
    association attribution activation demand discovery ecosystem endorsement
    essence extension familiarity foresight governance growth manifesto momentum
    partnership presence promise proposition relevance resonance ritual stewardship
    symbolism trust validation vocabulary worldbuilding
    """.split()
)

PRIORITY_WORDS = set(
    """
    brand branding identity logo logotype wordmark brandmark typography typeface
    kerning tracking leading ligature baseline glyph icon iconography styling
    monochrome hue palette colour color chroma saturation luminance contrast
    gradient tint shade tone duotone halftone pixel vector raster resolution
    opacity composition layout grid hierarchy alignment balance symmetry asymmetry
    rhythm proximity repetition whitespace framing crop scale proportion geometry
    texture pattern motif illustration photography imagery packaging label
    collateral stationery signage wayfinding storyboard mockup prototype wireframe
    interface usability accessibility responsive positioning differentiation
    equity salience recall recognition awareness perception reputation loyalty
    advocacy affinity archetype personality essence promise purpose mission vision
    values manifesto voice vocabulary naming tagline slogan headline copy narrative
    storytelling messaging content campaign audience consumer persona segmentation
    targeting insight research strategy concept creative ideation aesthetic style
    trend zeitgeist culture touchpoint experience activation engagement conversion
    attribution analytics metric impression reach frequency media channel editorial
    print digital social motion animation monogram emblem pictogram ideogram symbol
    signifier semiotics semiology gestalt modular clarity consistency resonance
    distinctive expression association governance stewardship proposition relevance
    worldbuilding
    """.split()
)

LEXNAME_WEIGHT = {
    "noun.communication": 9.0,
    "verb.communication": 8.0,
    "verb.creation": 8.0,
    "noun.cognition": 7.0,
    "noun.attribute": 7.0,
    "noun.shape": 7.0,
    "noun.act": 5.0,
    "noun.group": 4.0,
    "noun.artifact": 4.0,
    "noun.relation": 4.0,
    "noun.quantity": 3.0,
    "noun.substance": 3.0,
    "verb.cognition": 6.0,
    "verb.perception": 5.0,
    "verb.social": 5.0,
    "verb.change": 4.0,
    "adj.all": 6.0,
    "adj.pert": 5.0,
    "adv.all": 3.0,
}

DISALLOWED_CONTEXT = re.compile(
    r"""
    sexual|genital|porn|intercourse|racial\ group|ethnic\ group|offensive\ term|
    disease|syndrome|medical|medicine|anatomy|body\ part|muscle|blood|urine|
    weapon|military|warfare|murder|suicide|narcotic|drug|intoxicat|
    theology|religious|scripture|deity|church|language\ spoken|native\ to|
    taxonomic|genus|species|plant\ family|animal|bird|fish|insect|fungus|
    chemical\ element|atomic\ number|unit\ of\ measurement|cardinal\ number|
    sport|athletic|wrestling|game\ played|playing\ card|food|cooking|edible|
    anatomy|physiology|biochemistry|biology|chemistry|geology|astronomy|
    court\ of\ law|criminal|legislation|political|government|geographic|
    country|river|mountain|ocean|weather|farming|agriculture|
    deadly|lethal|mortal|death|massacre|evil|harmful|unhealthy|tragic|violent|hostile|
    pain|itch|swelling|injury|accident|endangered|bacter|paranoi|
    being\ .{0,30}\ more\ than|person\ with\ dark\ skin|nationality|
    of\ or\ relating\ to\ .{0,30}\ country|cooked|roasted
    """,
    re.I | re.X,
)
DISALLOWED_WORDS = set(
    """
    anus arse bastard bitch bowel breast corpse crotch damn death genital gun
    hate heroin idiot kill killer knife murder nazi nude penis porn racist rifle
    sex sexual slave slut suicide testicle tobacco vagina virus vomit warfare
    sumo biochemistry hump itch lethal mortal endangered fragile cookie maple
    negro oriental retarded paranoid bankrupt childish bombard oust thrusting
    self-deceit null vigil crap massacre deathly
    """.split()
)


def normalise(value: str) -> str:
    return value.strip().lower().replace("_", "-")


def pronunciation_for(value: str) -> str | None:
    phonemes = []
    for token in value.replace("-", " ").lower().split():
        forms = CMU_DICTIONARY.get(token)
        if not forms:
            return None
        phonemes.append([forms[0]])
    converted = cmu_to_ipa(phonemes, stress_marking="both")
    top = " ".join(options[-1] for options in converted).strip()
    return f"/{top}/" if top else None


def part_label(pos: str) -> str:
    return {"n": "noun", "v": "verb", "a": "adjective", "s": "adjective", "r": "adverb"}.get(pos, "term")


def contextual_meaning(word: str, definition: str, pos: str) -> str:
    definition = definition.strip().rstrip(".")
    if pos == "v":
        return f"In branding and creative practice, to {word} is to {definition}."
    if pos in {"a", "s"}:
        return f"In brand expression, {word} describes something {definition}."
    if pos == "r":
        return f"In creative communication, {word} means {definition}."
    return f"In branding and creative work, {word} refers to {definition}."


def contextual_example(word: str, pos: str) -> str:
    if pos == "v":
        return f"The team used this principle to {word} the idea more clearly."
    if pos in {"a", "s"}:
        return f"The {word} direction helped the campaign express a more distinctive character."
    if pos == "r":
        return f"The identity applied the idea {word} across each audience touchpoint."
    return f"The creative team considered {word} while building the brand system."


def candidate_entries() -> list[tuple[float, Entry]]:
    base_synsets = set()
    for synset in wn.all_synsets():
        if synset.lexname() not in LEXNAME_WEIGHT or DISALLOWED_CONTEXT.search(synset.definition()):
            continue
        lemma_words = [
            normalise(lemma.name())
            for lemma in synset.lemmas()
            if "_" not in lemma.name()
        ]
        lemma_relevant = any(
            word in PRIORITY_WORDS
            or any(
                len(key) >= 4 and (word.startswith(key) or key.startswith(word))
                for key in DOMAIN_WORDS
            )
            for word in lemma_words
        )
        if lemma_relevant:
            base_synsets.add(synset)

    # Two controlled semantic hops add synonyms, related descriptors and
    # derivational forms while keeping each term connected to a core
    # brand/design lemma. Distance is retained as a ranking penalty.
    synset_depth = {synset: 0 for synset in base_synsets}
    frontier = set(base_synsets)
    for depth in (1, 2):
        next_frontier = set()
        for synset in frontier:
            for relation in (
                "hypernyms", "hyponyms", "similar_tos", "also_sees",
                "attributes", "verb_groups",
            ):
                next_frontier.update(getattr(synset, relation)())
            for lemma in synset.lemmas():
                next_frontier.update(
                    related.synset()
                    for related in lemma.derivationally_related_forms()
                )
        next_frontier.difference_update(synset_depth)
        for synset in next_frontier:
            synset_depth[synset] = depth
        frontier = next_frontier

    candidates: dict[str, tuple[float, Entry]] = {}
    for synset, semantic_depth in synset_depth.items():
        lex_weight = LEXNAME_WEIGHT.get(synset.lexname())
        if lex_weight is None:
            continue
        definition = synset.definition().strip()
        if DISALLOWED_CONTEXT.search(definition):
            continue
        definition_words = set(re.findall(r"[a-z]+", definition.lower()))
        domain_hits = len(definition_words & DOMAIN_WORDS)
        for lemma in synset.lemmas():
            if "_" in lemma.name():
                continue
            word = normalise(lemma.name())
            if (
                not re.fullmatch(r"[a-z][a-z-]{2,23}", word)
                or "--" in word
                or word.endswith("-")
                or word.count("-") > 1
                or re.match(r"^[a-z]-", word)
                or re.search(r"-(?:prone|sized|faced|seated|fellow|like|shaped|backed|controlled|tension)$", word)
                or re.search(r"-(?:laden|positive|negative)$", word)
                or word in DISALLOWED_WORDS
            ):
                continue
            frequency = zipf_frequency(word, "en")
            if frequency < 2.5 and word not in PRIORITY_WORDS:
                continue
            pronunciation = pronunciation_for(word)
            if not pronunciation:
                continue
            word_stem_hit = any(
                len(key) >= 4 and (word.startswith(key) or key.startswith(word))
                for key in DOMAIN_WORDS
            )
            relevance = (
                frequency * 2.0
                + lex_weight
                + min(domain_hits, 4) * 2.6
                + (4.0 if word_stem_hit else 0.0)
                + (35.0 if word in PRIORITY_WORDS else 0.0)
                + (12.0 if semantic_depth == 0 else 6.0 if semantic_depth == 1 else 0.0)
            )
            entry = Entry(
                word=word,
                pronunciation=pronunciation,
                part_of_speech=part_label(synset.pos()),
                meaning=contextual_meaning(word, definition, synset.pos()),
                example=contextual_example(word, synset.pos()),
            )
            previous = candidates.get(word)
            if previous is None or relevance > previous[0]:
                candidates[word] = (relevance, entry)
    return sorted(
        candidates.values(),
        key=lambda item: (-item[0], -zipf_frequency(item[1].word, "en"), item[1].word),
    )


def sql_literal(value: str | None) -> str:
    return "null" if value is None else "'" + value.replace("'", "''") + "'"


def build_entries() -> list[Entry]:
    seen: set[str] = set()
    entries: list[Entry] = []
    for entry in CUSTOM:
        key = normalise(entry.word)
        if key not in seen:
            seen.add(key)
            entries.append(entry)
    for _, entry in candidate_entries():
        key = normalise(entry.word)
        if key in seen:
            continue
        seen.add(key)
        entries.append(entry)
        if len(entries) == TARGET_COUNT:
            break
    if len(entries) != TARGET_COUNT:
        raise RuntimeError(f"Expected {TARGET_COUNT} entries, got {len(entries)}")
    return entries


def build_sql(entries: list[Entry]) -> str:
    chunks: list[str] = []
    for start in range(0, len(entries), 250):
        values = []
        for offset, entry in enumerate(entries[start : start + 250], start=start + 1):
            values.append(
                "("
                + ",".join(
                    [
                        sql_literal(entry.word),
                        sql_literal(entry.pronunciation),
                        sql_literal(entry.part_of_speech),
                        sql_literal(entry.meaning),
                        sql_literal(entry.example),
                        sql_literal(entry.feature_date),
                        str(offset),
                    ]
                )
                + ")"
            )
        chunks.append(
            "insert into wotd_single_word_lexicon "
            "(word, pronunciation, part_of_speech, meaning, example, feature_date, editorial_rank) values\n  "
            + ",\n  ".join(values)
            + ";\n"
        )

    header = """-- Rebuild the Branding Word of the Day library as 10,000 genuine
-- single-token branding, design and creative terms.
--
-- No entry contains whitespace. Recognised compounds use a hyphen or closed
-- form (for example Colour-palette and HEXcode). Every entry includes a
-- pronunciation, contextual definition and example. The first seven terms are
-- pinned to 2026-07-28 through 2026-08-03 so the incorrect scheduled batch can
-- be replaced predictably.

create extension if not exists "pgcrypto";

create table if not exists public.branding_words (
  id uuid primary key default gen_random_uuid(),
  word text not null,
  pronunciation text,
  part_of_speech text,
  meaning text not null,
  example text,
  feature_date date unique,
  editorial_rank integer,
  created_at timestamptz not null default now()
);

alter table public.branding_words
  add column if not exists editorial_rank integer;

create temporary table wotd_single_word_lexicon (
  word text primary key,
  pronunciation text not null,
  part_of_speech text not null,
  meaning text not null,
  example text,
  feature_date date,
  editorial_rank integer not null unique
) on commit drop;

"""
    footer = r"""
do $$
begin
  if (select count(*) from wotd_single_word_lexicon) <> 10000 then
    raise exception 'WOTD lexicon must contain exactly 10,000 entries';
  end if;
  if exists (select 1 from wotd_single_word_lexicon where word ~ '\s') then
    raise exception 'WOTD lexicon contains a multi-word entry';
  end if;
  if exists (
    select 1 from wotd_single_word_lexicon
    where pronunciation is null or btrim(pronunciation) = ''
  ) then
    raise exception 'Every WOTD entry must include a pronunciation';
  end if;
end $$;

-- Preserve original editorial row IDs where a direct single-token replacement
-- exists, keeping historical WOTD metadata resolvable.
update public.branding_words
set word = case lower(word)
  when 'brand equity' then 'Brand-equity'
  when 'brand identity' then 'Brand-identity'
  when 'brand voice' then 'Brand-voice'
  when 'color palette' then 'Colour-palette'
  when 'mood board' then 'Moodboard'
  when 'white space' then 'Whitespace'
  else word
end
where lower(word) in (
  'brand equity', 'brand identity', 'brand voice',
  'color palette', 'mood board', 'white space'
);

update public.branding_words existing
set pronunciation = source.pronunciation,
    part_of_speech = source.part_of_speech,
    meaning = source.meaning,
    example = source.example,
    feature_date = source.feature_date,
    editorial_rank = source.editorial_rank
from wotd_single_word_lexicon source
where lower(existing.word) = lower(source.word);

delete from public.branding_words existing
where not exists (
  select 1 from wotd_single_word_lexicon source
  where lower(source.word) = lower(existing.word)
);

insert into public.branding_words
  (word, pronunciation, part_of_speech, meaning, example, feature_date, editorial_rank)
select source.word, source.pronunciation, source.part_of_speech,
       source.meaning, source.example, source.feature_date, source.editorial_rank
from wotd_single_word_lexicon source
where not exists (
  select 1 from public.branding_words existing
  where lower(existing.word) = lower(source.word)
);

alter table public.branding_words
  alter column pronunciation set not null;
alter table public.branding_words
  drop constraint if exists branding_words_single_token_check;
alter table public.branding_words
  add constraint branding_words_single_token_check
  check (
    btrim(word) <> ''
    and word !~ '\s'
    and word ~ '^[[:alnum:]][[:alnum:]-]*$'
  );

drop index if exists public.branding_words_normalized_word_idx;
create unique index if not exists branding_words_normalized_word_uidx
  on public.branding_words(lower(word));
create index if not exists branding_words_created_word_idx
  on public.branding_words(created_at, word, id);
create unique index if not exists branding_words_editorial_rank_uidx
  on public.branding_words(editorial_rank);

do $$
begin
  if (select count(*) from public.branding_words) <> 10000 then
    raise exception 'Expected 10,000 branding words after migration';
  end if;
end $$;

grant select, insert, update, delete on public.branding_words
  to anon, authenticated, service_role;
"""
    return header + "\n".join(chunks) + footer


def main() -> None:
    entries = build_entries()
    OUTPUT.write_text(build_sql(entries), encoding="utf-8")
    print(f"generated={len(entries)} output={OUTPUT} bytes={OUTPUT.stat().st_size}")
    print("head:", ", ".join(entry.word for entry in entries[:30]))
    print("tail:", ", ".join(entry.word for entry in entries[-30:]))


if __name__ == "__main__":
    main()
