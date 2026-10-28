/**
 * Shared read-only rules for identifying what a snippet or page ACTUALLY says.
 * A company name (e.g. "AB Inkasso") must never become an industry claim.
 * Neither rule verifies a legal entity or grants outreach permission.
 */
export const REGISTRATION_ONLY_VEHICLE_TRADE = /\b(?:verksamhet(?:en)?\s+inom|registrerad\s+(?:verksamhet|för)|verksamhetsbeskrivning(?:en)?)\b[^.!?]{0,110}\b(?:detaljhandel\s+med\s+(?:personbilar|bilar)|handel\s+med\s+(?:personbilar|bilar))\b/i

export const EXPLICIT_FINANCIAL_ACTIVITY = /\b(?:bedriver|erbjuder|utför|arbetar\s+med|verksamhet\s+inom|tjänster\s+inom|hjälper\s+med|specialiserad(?:e)?\s+på)\s+(?:[a-zåäö]+\s+){0,3}(?:inkasso(?:tjänster|verksamhet)?|skuldindrivning|kravhantering|kreditförvaltning|factoring|skuldrådgivning|kreditupplysning)\b/i
