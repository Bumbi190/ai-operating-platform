import React from 'react'
import {createRoot} from 'react-dom/client'
import {SocialWeeklyAutomationControls} from '../components/social-launch/SocialWeeklyAutomationControls'
import {FAMILY_WEEKLY_PROJECT_ID} from '../lib/social-launch/weekly/auto-preparation'

// Pure browser fixture. All API reads/writes are intercepted by Playwright.
// No real login, Supabase, cron, model or social provider access.
const params=new URLSearchParams(location.search)
const projectId=params.get('foreign')==='1'
 ? '88888888-8888-4888-8888-888888888888':FAMILY_WEEKLY_PROJECT_ID
const disabled=params.get('disabled')==='1'
createRoot(document.getElementById('root')!).render(
 <SocialWeeklyAutomationControls projectId={projectId} disabled={disabled}/>
)
