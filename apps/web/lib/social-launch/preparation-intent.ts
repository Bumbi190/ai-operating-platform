/** Operational preparation must retain tools even when the UI sends mode=content. */
export function isSocialPreparationIntent(text:string):boolean{
 const value=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
 const social=/\b(?:linkedin|facebook|instagram|pinterest|youtube|social|inlagg|publicering\w*|posts?)\b/.test(value)
 const prepare=/\b(?:planera\w*|forbered\w*|schemalagg\w*|spara\w*|schedule\w*|prepare\w*|save|review|granskning)\b/.test(value)
 return social&&prepare||/\b(?:workflow\w*|arbetsflode\w*)\b/.test(value)&&/\b(?:granskning|forbered\w*|spara\w*|satt|skapa\w*)\b/.test(value)
}
