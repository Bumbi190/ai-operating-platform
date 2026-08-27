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

## Regel

Läs aldrig en `.docx` här som gällande regel. Läs motsvarande fil i `book/chapters/`.
Vid konflikt vinner alltid `book/chapters/`.
