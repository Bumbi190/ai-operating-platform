import type {
  ConnectionProvider,
  ConnectionScope,
  GuideCard,
  VerifiedTarget,
} from "./types";
const reviewedAt = "2026-10-14";
export function resolveOwnedTarget(
  input: unknown,
  scope: ConnectionScope,
): VerifiedTarget | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const t = input as Record<string, unknown>;
  if (
    Object.keys(t).some(
      (k) =>
        ![
          "provider",
          "projectId",
          "operatorId",
          "resourceId",
          "verified",
        ].includes(k),
    ) ||
    t.verified !== true ||
    t.projectId !== scope.projectId ||
    t.operatorId !== scope.operatorId ||
    typeof t.resourceId !== "string"
  )
    return null;
  if (t.provider === "supabase" && !/^[a-z0-9]{20}$/.test(t.resourceId))
    return null;
  if (
    t.provider === "vercel" &&
    !/^[a-z0-9][a-z0-9-]{0,62}\/[a-z0-9][a-z0-9-]{0,62}$/.test(t.resourceId)
  )
    return null;
  if (t.provider !== "supabase" && t.provider !== "vercel") return null;
  return {
    provider: t.provider,
    projectId: scope.projectId,
    operatorId: scope.operatorId,
    resourceId: t.resourceId,
    verified: true,
  };
}
export function getConnectionGuide(input: {
  provider: ConnectionProvider;
  verifiedTarget: unknown;
  scope: ConnectionScope;
  os: "windows" | "macos" | "linux" | "unknown";
  need: string;
}): GuideCard {
  const provider = input.provider,
    target = resolveOwnedTarget(input.verifiedTarget, input.scope);
  const base = { provider, fields: [], commands: [], reviewedAt } as Pick<
    GuideCard,
    "provider" | "fields" | "commands" | "reviewedAt"
  >;
  switch (provider) {
    case "strato":
      return {
        ...base,
        title: "Domän via Strato",
        why: "Välj domännamnet först. Köp görs genom ditt befintliga Strato-konto.",
        steps: [
          "Sök det önskade namnet hos Strato. Sökresultatet visar tillgänglighet, inte att du äger domänen.",
          "Logga in på ditt Strato-konto, kontrollera pris och villkor där och slutför ett önskat köp själv. Atlas har ännu ingen anslutning som läser kontot eller genomför köp.",
          "När rätt publiceringsprojekt är klart: Domäner → Domänadministration → kugghjulet vid rätt domän → Inställningar (domän) → DNS.",
          "Hämta aktuella DNS-värden från just webbplatsens hostingprojekt. Kontrollera befintliga poster; bevara e-postens MX/TXT och övriga tjänster.",
          "Verifiera kontoåtkomst, ägande, DNS och HTTPS var för sig. En uppgift om ägande i chatten verifierar inte kontot.",
        ],
        links: [
          {
            label: "Sök domän hos Strato",
            href: "https://www.strato.se/domannamn/sok-doman/",
          },
          {
            label: "Öppna ditt Strato-konto",
            href: "https://www.strato.se/apps/CustomerService",
          },
          {
            label: "Stratos DNS-guide",
            href: "https://www.strato.se/faq/domaen/vilka-dns-poster-finns-tillgaengliga-hos-strato-och-hur-kan-jag-hantera-dem/",
          },
        ],
      };
    case "terminal":
      return {
        ...base,
        title: "Projektmapp och dator",
        why: "Den sparade platsen används för projektets kod, bilder, media och planer.",
        steps: [
          "Välj standardmapp och projektets byggagent i Omniras bygginställningar. Den sparade platsen skapar ännu ingen mapp på datorn.",
          "Tills filanslutningen finns: ladda ner projektets ZIP i previewvyn och packa upp det i den valda projektmappen.",
          "Atlas behöver därefter en verifierad fil- och terminalanslutning till just den datorn, med åtkomst till projektmappen. En ansluten identitetsbroker räcker inte.",
        ],
        links: [
          {
            label: "Välj standardmapp och byggagent",
            href: "/settings/website-build#project-" + input.scope.projectId,
          },
        ],
      };
    case "vercel":
      return {
        ...base,
        title: "Publicera på Vercel",
        why: "Preview fungerar redan i Omnira. Vercel behövs när sidan ska få en publik webbadress.",
        steps: [
          "Logga in på rätt Vercel-konto och välj eller skapa webbplatsens eget projekt. Omniras hosting bevisar inte att Atlas har åtkomst till detta projekt.",
          "Om Vercel CLI redan finns kan du logga in och länka koden manuellt från projektets källkodsmapp. Kontrollera vilket konto, team och projekt som väljs.",
          "Om appen behöver en hemlighet: öppna projektets Environment Variables, ange appens exakta variabelnamn, värde och miljö och spara. Värdet ska stanna i leverantörens skyddade inställning.",
          "Atlas saknar ännu en anslutning som publicerar projektet eller hanterar dess nycklar. Att logga in manuellt ger inte Atlas denna förmåga.",
        ],
        links: [
          { label: "Vercels projekt", href: "https://vercel.com/dashboard" },
          ...(target?.provider === "vercel"
            ? [
                {
                  label: "Det verifierade projektets miljövariabler",
                  href:
                    "https://vercel.com/" +
                    target.resourceId +
                    "/settings/environment-variables",
                },
              ]
            : []),
          {
            label: "Guide: miljövariabler",
            href: "https://vercel.com/docs/environment-variables/managing-environment-variables",
          },
          {
            label: "Guide: länka projekt",
            href: "https://vercel.com/docs/cli/link",
          },
        ],
        commands:
          input.os === "unknown"
            ? []
            : [
                {
                  label: "Logga in manuellt",
                  text: "vercel login",
                  precondition:
                    "Vercel CLI måste vara installerad. Gör inloggningen hos Vercel.",
                },
                {
                  label: "Länka källkodsmappen",
                  text: "vercel link",
                  precondition:
                    "Kör i projektets källkodsmapp och kontrollera rätt konto, team och projekt.",
                },
              ],
      };
    case "supabase":
      return {
        ...base,
        title: "Databas och inloggning",
        why: "Behövs bara om planen kräver databas eller användarkonton.",
        steps: [
          "Öppna rätt Supabase-konto och välj webbplatsens eget projekt. Omniras databas är en separat koppling.",
          "Projektets Connect-vy visar anslutningsuppgifter; API Keys visar nyckeltypen. En publishable key är för klienten; en secret/service_role-nyckel ska bara finnas på en skyddad server.",
          "Skapa ett personligt åtkomsttoken hos Supabase bara om den valda administratörsanslutningen kräver det. Det är inte en projekt-API-nyckel och skapas inte med ett slumpkommando.",
          "Atlas har ännu ingen anslutning som skapar databasen eller kör ändringar. Lägg aldrig hemliga värden i chatten, planer, preview eller källkod.",
        ],
        links: [
          { label: "Supabase-projekt", href: "https://supabase.com/dashboard" },
          ...(target?.provider === "supabase"
            ? [
                {
                  label: "Det verifierade projektets API-nycklar",
                  href:
                    "https://supabase.com/dashboard/project/" +
                    target.resourceId +
                    "/settings/api-keys",
                },
              ]
            : []),
          {
            label: "Personliga åtkomsttoken",
            href: "https://supabase.com/dashboard/account/tokens",
          },
          {
            label: "Guide: API-nycklar",
            href: "https://supabase.com/docs/guides/getting-started/api-keys",
          },
        ],
        fields: [
          {
            name: "Publishable key",
            where:
              "Supabase-projektets API Keys; endast enligt appens klientkonfiguration.",
          },
          {
            name: "Secret key / service_role",
            where:
              "Endast appens namngivna skyddade serverinställning hos vald hosting.",
          },
        ],
      };
    case "form_delivery":
      return {
        ...base,
        title: "Kontaktformulär",
        why: "Ett previewformulär är en demo tills en mottagare har kopplats.",
        steps: [
          "Välj hur formuläret ska leverera meddelanden och vilken mottagare det ska använda.",
          "Koppla leverans genom en serverfunktion och lägg eventuella leverantörsnycklar i serverns skyddade inställning.",
          "Atlas saknar ännu en genomförd formuläranslutning. Testa faktisk leverans innan funktionen märks som live.",
        ],
        links: [
          { label: "Diskutera formulärkopplingen med Atlas", href: "/chat" },
        ],
      };
    default:
      throw Error("Unsupported connection provider");
  }
}
