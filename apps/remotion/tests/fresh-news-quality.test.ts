import {test} from 'node:test'
import assert from 'node:assert/strict'
import {
  checkFreshRelevantNews, filterFreshRelevantNews, FRESH_NEWS_MAX_HOURS,
} from '../../web/lib/media/news-freshness'

const NOW=Date.parse('2026-10-17T14:00:00.000Z')
const hoursAgo=(h:number)=>new Date(NOW-h*3600000)
const story=(fields:Record<string,unknown>={})=>({
  title:'OpenAI tests new Codex AI agent workflow',
  summary:'A verified release or real experiment with agentic coding implications',
  url:'https://openai.com/index/agent-update',
  source:'rss_openai',sourceLabel:'OpenAI Blog',publishedAt:hoursAgo(3),
  ...fields,
})

test('accepts an authentic, relevant, fresh primary-source report',()=>{
  assert.deepEqual(checkFreshRelevantNews(story(),NOW),
    {eligible:true,reason:null,ageHours:3})
})
test('refuses old or future dated articles even if popular or highly relevant',()=>{
  assert.equal(checkFreshRelevantNews(story({publishedAt:hoursAgo(50)}),NOW).reason,'stale')
  assert.equal(checkFreshRelevantNews(story({publishedAt:hoursAgo(FRESH_NEWS_MAX_HOURS)}),NOW).eligible,true)
  assert.equal(checkFreshRelevantNews(story({publishedAt:new Date(NOW+16*60000)}),NOW).reason,'future_date')
})
test('rejects missing timestamps rather than hallucinating a breaking-news date',()=>{
  assert.equal(checkFreshRelevantNews(story({publishedAt:new Date(NaN)}),NOW).reason,'invalid_date')
  assert.equal(checkFreshRelevantNews(story({publishedAt:null}),NOW).reason,'invalid_date')
  assert.equal(checkFreshRelevantNews(story({publishedAt:new Date(0)}),NOW).reason,'stale')
})
test('refuses unknown community sources even when domain is reputable',()=>{
  assert.equal(checkFreshRelevantNews(story({source:'reddit_artificial'}),NOW).reason,'unverified_source')
  assert.equal(checkFreshRelevantNews(story({source:'hackernews'}),NOW).reason,'unverified_source')
  assert.equal(checkFreshRelevantNews(story({source:'rss_unknown'}),NOW).reason,'unverified_source')
})
test('refuses lookalike hostnames, http, credentials and unrelated sources',()=>{
  const cases=[
    {url:'https://openai.com.evil.net/article'},
    {url:'http://openai.com/article'},
    {url:'https://me:password@openai.com/article'},
    {url:'https://openai.com:8333/article'},
  ]
  for(const x of cases)assert.equal(checkFreshRelevantNews(story(x),NOW).reason,
    x.url.startsWith('https://openai.com.evil.')?'unverified_source':
    x.url.startsWith('https://openai.com.evil.net')?'unverified_source':'unsafe_url')
  assert.equal(checkFreshRelevantNews(story({title:'The latest football scores',summary:'A great match'}),NOW).reason,'not_ai_news')
})
test('an OpenAI RSS label cannot be used for an unrelated trusted newsroom URL',()=>{
  assert.equal(checkFreshRelevantNews(story({
    source:'rss_openai',url:'https://wired.com/story/openai-tested-codex',
  }),NOW).reason,'unverified_source')
  assert.equal(checkFreshRelevantNews(story({
    source:'rss_wired',url:'https://openai.com/index/agent-update',
  }),NOW).reason,'unverified_source')
  assert.equal(checkFreshRelevantNews(story({
    source:'rss_wired',url:'https://www.wired.com/story/openai-test',
  }),NOW).eligible,true)
})
test('roundups and evergreen listicles cannot masquerade as fresh news',()=>{
  assert.equal(checkFreshRelevantNews(story({title:'Top 10 AI tools for beginners'}),NOW).reason,'low_news_value')
  assert.equal(checkFreshRelevantNews(story({title:'Weekly digest: AI headlines'}),NOW).reason,'low_news_value')
})
test('batch keeps only individually verified leads with explicit refusal counts',()=>{
  const input=[story(),story({source:'hackernews'}),story({publishedAt:hoursAgo(75)}),story({url:'https://wired.com/ai/real',source:'rss_wired',title:'Anthropic unveils Claude tool'})]
  const {eligible,rejections}=filterFreshRelevantNews(input,NOW)
  assert.equal(eligible.length,2)
  assert.equal(rejections.stale,1)
  assert.equal(rejections.unverified_source,1)
  assert.ok(eligible.every(x=>x.publishedAt.getTime()>=NOW-48*3600000))
})
