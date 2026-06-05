# The Prompt — Hook- & videoanalys

*Datadriven genomgång av publicerade videos mot verklig räckvidd. 2026-06-05.*

---

## Läs detta först — två ärliga förbehåll

1. **Litet underlag (16 videos), låg statistisk säkerhet.** Allt nedan är *hypoteser att testa*, inte bevisade lagar. Mönstren är tydliga men kan ändras med mer data.
2. **Med ~3–4 följare är räckvidd rätt mått nu, inte engagemang.** Likes/sparningar/delningar är nära noll överallt — inte för att innehållet är dåligt, utan för att publiken ännu är pytteliten. Algoritmens *räckvidd* (push till icke-följare) är den signal som faktiskt rör sig, så det är den vi optimerar. Engagemang kommer när basen växer.

Vi har ännu inte *äkta* retention (genomtittnings-%) — bara räckvidd/visningar som proxy. Det är på väg in via YouTube Analytics (se sist).

---

## Vad datan säger

**Vinnande mönster: namngiven aktör + "just" + konkret verb + insats.**

| Hook | Räckvidd |
|---|---|
| Trump just signed an AI executive order — here's what changed. | **289** |
| Braintrust just eliminated their feature backlog with one workflow. | **274** |
| Martin Scorsese just went full AI — and Hollywood is imploding. | **260** |
| OpenAI and Anthropic just warned Congress: regulate us before it's too late. | **200** |

**Förlorande mönster: jargong och vaghet utan namngiven aktör/insats.**

| Hook | Räckvidd |
|---|---|
| Gartner just made AI coding agents mission-critical infrastructure. | **9** |
| Moms returning to code are finding a completely different job. | **23** |
| AI is now finding and exploiting software vulnerabilities faster than human teams can patch them. | **29** |

Tre regler ut ur detta:

1. **Namnge alltid den verkliga aktören** (Trump, Braintrust, Scorsese, Vatikanen). Abstrakt "AI" utan ansikte presterar sämre.
2. **"just" + konkret dåtidsverb** ger nyhet och spänning ("just signed", "just eliminated", "just went full AI").
3. **Aldrig jargong.** "mission-critical infrastructure" är den enskilt sämsta videon. Säg det en människa skulle säga.

---

## Hook-playbook (formeln)

> **{Namngiven aktör} just {konkret verb} — {konsekvens/spänning}.** Max 12 ord. Mest överraskande konkreta faktum FÖRST.

- **Behåll spänning till slutet.** Avsluta så sista bilden glider in i första — loopbart = fler omtittningar = mer push.
- **Captions från frame 0.** Texten ska synas innan rösten hinner.
- **CTA = äkta antingen/eller.** "Hype eller game-changer?" slår "gilla och följ".

Detta är nu inbyggt i Script Writer-agenten (se ändringar sist), så varje framtida hook följer mönstret automatiskt.

---

## Per-video — betyg & omskrivning

Skala: 🟢 stark (behåll) · 🟡 ok (skärp) · 🔴 svag (skriv om)

**🟢 Trump just signed an AI executive order — here's what changed.** (289)
Perfekt mall. Namngiven aktör + just + insats + öppen loop ("here's what changed"). Inget att ändra.

**🟢 Braintrust just eliminated their feature backlog with one workflow.** (274)
Konkret aktör + dramatiskt verb + specifik mekanism. Behåll.

**🟢 Martin Scorsese just went full AI — and Hollywood is imploding.** (260)
Igenkänt namn + kulturell spänning. Behåll.

**🟡 AI is giving doctors their humanity back.** (255)
Vacker, men ingen namngiven aktör och vag insats. → *"This hospital's AI just gave ER doctors 2 hours back every shift."*

**🟡 This YC startup finds wasted GPUs hiding in your cluster right now.** (230)
Bra konkretion, men "This YC startup" är anonymt. → Namnge startupen: *"{Startup} just found thousands in wasted GPUs hiding in your cluster."*

**🟢 OpenAI and Anthropic just warned Congress: regulate us before it's too late.** (200)
Två tunga aktörer + paradox (be om reglering). Behåll.

**🟡 OpenAI just gave ChatGPT the ability to dream.** (130)
Stark nyfikenhet men vag — "dream" säljer inte den konkreta nyttan. → *"OpenAI just gave ChatGPT memory that rewrites itself overnight."*

**🟡 AI-generated lawsuits are literally breaking federal courts right now.** (111)
Bra spänning, men ingen aktör. → *"A lawyer just filed 200 AI-written lawsuits — federal courts are buckling."*

**🟡 Anthropic just showed developers shipping production code written entirely by Claude.** (105)
Rätt mönster men för långt. → *"Anthropic just shipped production code written 100% by Claude."*

**🟢 The Vatican just declared war on Silicon Valley's AI monopoly.** (100)
Oväntad aktör + krigsmetafor. Behåll.

**🟡 The Vatican just invited Anthropic inside a papal encyclical.** (91)
Stark aktör men "papal encyclical" är jargong. → *"The Vatican just put Anthropic inside an official Church doctrine."*

**🟡 OpenAI just told political groups to stop speaking for them.** (79)
Ok, men låg insats. → *"OpenAI just publicly disowned the groups lobbying in its name."*

**🟢 Boston Children's just used AI to crack 40 rare disease cases.** (67)
Namn + siffra + hög insats. Stark hook trots låg räckvidd (troligen ämne/timing, inte hooken).

**🔴 AI is now finding and exploiting software vulnerabilities faster than human teams can patch them.** (29)
För lång, abstrakt, ingen aktör. → *"An AI just found security holes faster than humans could patch them."*

**🔴 Moms returning to code are finding a completely different job.** (23)
Vag, ingen aktör/insats. → *"AI just erased the career gap for moms returning to code."*

**🔴 Gartner just made AI coding agents mission-critical infrastructure.** (9)
Sämst — ren jargong. → *"Gartner just told every CEO: adopt AI coding agents or fall behind."*

**🟡 OpenAI just made Codex role-specific — and it changes everything.** (mätanomali, ~82 visningar)
Rätt start men "changes everything" är ett tomt slut. → *"OpenAI just gave Codex a job title — and it writes like a senior dev."*

---

## Sammanfattning av vad som ändrats i systemet

1. **Script Writer-prompten uppdaterad** (live i databasen) med det vinnande hook-mönstret + retention/loop-regler. Varje ny video följer det nu.
2. **Atlas content-score fixad** att aggregera per video (inte per plattform-rad), så analysen blir korrekt med IG+FB+YouTube.
3. **YouTube-retention (genomtittnings-%) inkopplad** i koden — börjar flöda när YouTube-OAuth re-authas med scopet `yt-analytics.readonly` (kräver ett externt steg, likt FB:s read_insights).

---

*Nästa naturliga steg: låt mönstret samla 2–3 veckors ny data, jämför mot baslinjen ovan, och lås det som faktiskt höjer räckvidd + (när basen växer) sparningar/delningar.*
