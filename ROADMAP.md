# Roadmap

What we are working on, what comes next, and what is further away. This is a shared project:
if something here matters to you, open an issue and say so. Dates are not promised.

Last updated: November 2026.

## Now

- **Sending a request to the shop.** "Send request" saves the design and hands it to the shop's
  cart, where the customer enters contact and shipping details. Being tested end to end.
- **A starting sign that can be ordered.** The sign the page opens with ("Ciao" in Sacramento)
  is too tight for the default 10 mm strip at every size. We need a better starting point.
- **Real prices for parts.** Power supplies and boxes already carry a price range. Controllers,
  LED strips, filament and backplate materials are next, each with a date and a source.
  You can help: tell us what you paid and where.

## Next

- **Translations.** One JSON file per language, English as the source. Italian, French, Spanish,
  Portuguese and Chinese first. An issue form will let anyone translate the interface without
  using git.
- **Arabic and Hebrew.** These need a text-shaping engine (joining letters, right-to-left).
  The same engine will fix joined scripts such as Pecita, whose letters do not connect today.
- **More fonts.** Seven more are checked and waiting. A font enters only with a licence that
  allows redistribution, stated by its author.
- **Assembly time you can trust.** Strips that do not bend sideways are cut at every bend, ten
  minutes each. A small cursive sign can mean a cut per LED: the page should say so early and
  suggest a bendable strip or a bigger size.
- **A drawing of the channel** in Technical settings, with every parameter explained in a line.
- **This documentation in English.** The specification is detailed but written in Italian and
  partly out of date.

## Later

- Splitting tall signs with horizontal cuts, movable cuts, and alignment pins between parts.
- Production files to download: hole drawings, bill of materials.
- A light for the dot of the "i" that is easier to wire.
- Per-letter transforms in the path editor, and one colour per segment.
- Prices recalculated on the server, so a quote can be automatic.

## Done recently

- Cutting the sign into parts that fit your printer's plate, set in Technical settings.
- A menu of LED strips that fills in the measurements, with a scale drawing of each strip.
- Chinese and Japanese fonts; five more Latin fonts.
- Saving, sharing and reopening a design; editing the paths by hand.

## How to take part

- [Report a problem or propose an idea](https://github.com/lampados/sign-configurator/issues)
- Add a part, with its price and where you found it: use the "+ Add one" form in the parts page.
