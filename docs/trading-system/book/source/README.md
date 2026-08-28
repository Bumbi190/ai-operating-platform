# book/source — historiska originaldokument

**Dessa `.docx`-filer är inte aktiv source of truth.**

De är de oförändrade originalen som kapitlen skrevs i, bevarade som revisionsspår.

Aktiv kanonisk text för boken är:

```
docs/trading-system/book/chapters/*.md
```

## Varför de skiljer sig

Vid canonical-reconciliationen 2026-08-27 gjordes textändringar för att stänga två
regeltvetydigheter. Ändringarna infördes i markdown-kapitlen, inte i `.docx`-originalen,
så att det går att se exakt vad som stod före och efter.

Berörda kapitel: **3, 4, 10, 11, 13, 16**.

Varje ändring är listad med före/efter och motivering i:

```
docs/trading-system/reviews/Canonical Amendments v1.0.md
```

## Kapitel 9 — filnamnen skiljer sig avsiktligt

`09 - MetaTrader 5-integration.docx` är **v1.0:s historiska källmaterial** och behåller
sitt ursprungliga namn. Den döps aldrig om.

Aktiv kapitelkälla för Canonical v1.1 är:

```
book/chapters/09 - Futures Execution Integration.md
```

Kapitlet skrevs om provider-neutralt i Beslut D (2026-08-28). Att filnamnen skiljer sig
är avsiktligt: `.docx`-originalet dokumenterar vad som faktiskt stod i v1.0.

## Regel

Läs aldrig en `.docx` här som gällande regel. Läs motsvarande fil i `book/chapters/`.
Vid konflikt vinner alltid `book/chapters/`.
