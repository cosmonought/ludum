# SectionHead

How a section of a page begins: a 2px rule, the section's number in mono, its name at d2, and an optional way onward.

**Markup.** `<header class="ld-sechead">` → `.ld-sechead__no` (01, 02…), `h2.ld-sechead__title`, optional `p.ld-sechead__dek`, optional `.ld-sechead__more` holding a TextLink.

- Numbers count a page's sections in order on project pages and About. The homepage's sections are fields that introduce themselves, so they carry no numbers.
- Titles are two or three words. The dek, when there is one, is one sentence.
- Phone: the number and the onward link share the top line; the title takes the full width under them.
