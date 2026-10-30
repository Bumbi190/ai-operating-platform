export type WeeklyChannel='facebook'|'instagram'
export type WeeklyOccasion={key:string;scheduledAt:string;kind:'ordinary'|'month_release';channels:WeeklyChannel[];sourcePostIds:string[]}
export type WeeklySlot={key:string;localMinute:string;scheduledAt:string;kind:'ordinary'|'month_release';releaseMonth:string|null}
export type WeeklyPlan={weekStart:string;weekEndExclusive:string;existing:WeeklyOccasion[];slots:WeeklySlot[];missing:string[]}
