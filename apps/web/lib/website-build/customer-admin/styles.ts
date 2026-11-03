import {premiumDealerStyle} from '../templates/premium-dealer-style'
import {dealerShowroomCss} from '../templates/dealer-showroom-presentation'

const accent = '#91d2bc'
const chrome = `
*{box-sizing:border-box}
body{margin:0;overflow-wrap:anywhere}
.shell{width:100%;max-width:1310px;margin-inline:auto;padding-inline:clamp(20px,5vw,76px)}
.site-header{background:#090f12}
.nav{min-height:76px;gap:18px}
.wordmark{display:inline-flex;min-width:0;align-items:center;gap:12px}
.seal{display:grid;place-items:center;width:39px;height:39px;flex:none;border-radius:12px;border:1px solid #68887e;background:linear-gradient(145deg,#213c32,#101c1b);color:var(--accent);font:italic 22px Georgia,serif}
.brand{font-size:clamp(17px,2.3vw,23px);overflow-wrap:anywhere}
.brand small{font-size:9px;letter-spacing:.19em;margin-top:4px}
.nav-actions,.actions{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.nav-actions{justify-content:flex-end;flex:none}
.nav-actions form{margin:0}
.button,.nav-actions .button{min-height:44px;padding:10px 18px;gap:8px}
.nav-actions .button{margin:0;font-size:13px}
.button.outline{background:#111c20;border-color:#516862;color:#dfebe7}
.button.quiet{color:var(--muted);background:transparent;border-color:var(--line)}
.button:disabled{cursor:default;filter:saturate(.3);opacity:.58}
.button:hover{filter:brightness(1.08)}
.notice{letter-spacing:.02em;background:#10181c}
.preview-banner,.feedback{color:#f9e6c5;background:#2b261b;border-bottom:1px solid #5b4a2d}
.preview-banner .shell{min-height:46px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding-block:8px}
.preview-banner a,.text-link{color:var(--accent);text-decoration:underline;text-underline-offset:3px}
.footer{border-top:1px solid var(--line);color:var(--muted);font-size:.83rem}
.footer .shell{display:flex;justify-content:space-between;align-items:center;gap:18px;padding-block:24px}.footer p{margin:0}
@media(max-width:760px){
 .nav{min-height:66px}.nav-actions .button{padding:7px 11px}
}
@media(max-width:460px){
 .nav{gap:8px}.seal{width:31px;height:31px;font-size:17px}.wordmark{gap:7px}
 .brand{font-size:16px}.brand small{font-size:8px}
 .footer .shell{align-items:flex-start;flex-direction:column}
 .preview-banner .shell{align-items:flex-start;flex-direction:column}
 .nav-actions .button{font-size:.75rem;padding:7px 9px}
}
`

export const publicStyles = dealerShowroomCss(accent) + chrome
export const adminStyles = premiumDealerStyle(accent) + chrome + `
.eyebrow{margin:0 0 10px;color:var(--accent);font-size:.7rem;font-weight:640;letter-spacing:.16em;text-transform:uppercase}
.tag{display:inline-flex;align-items:center;gap:7px;font-size:.76rem;font-weight:600;color:#c1eddb;background:#162e26;border:1px solid #456455;border-radius:100px;padding:4px 10px;white-space:nowrap}
.tag:before{content:"";width:6px;height:6px;display:block;border-radius:50%;background:#8cd8a9}
.tag.sold,.tag.draft{color:#ead4b0;background:#30271d;border-color:#64513b}
.tag.sold:before,.tag.draft:before{background:#e3b779}
.page-title{font:540 clamp(34px,4vw,59px)/1.04 system-ui;letter-spacing:-.055em;margin:0 0 10px}
.section-head{align-items:center;margin-bottom:24px}
.counts,.hint,.fineprint{color:var(--muted);margin:0}
.hint,.fineprint{font-size:.83rem}
.panel,.inventory-row,.stat{min-width:0;border:1px solid #31413e;background:linear-gradient(150deg,#18252a,#101b1d)}
.history summary{padding:14px 22px;min-height:48px;font-size:.9rem;font-weight:600;color:var(--accent);cursor:pointer}
.worktop{padding-block:clamp(28px,4vw,52px);background:radial-gradient(ellipse at 76% -15%,#254238,#101c20 58%,#0d171a);border-bottom:1px solid var(--line)}
.worktop .section-head{margin:0;align-items:end}
.stats{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}
.stat{display:inline-flex;align-items:baseline;gap:5px;padding:5px 10px;border-radius:99px;font-size:.77rem;color:var(--muted)}.stat b{font-size:.92rem;color:var(--fg)}
.workspace{display:grid;grid-template-columns:minmax(190px,.76fr) minmax(0,2.25fr);gap:clamp(17px,3vw,33px);padding-block:28px 54px;align-items:start}
.stock-list{display:grid;gap:8px;padding:0;list-style:none;margin:0}.stock-list h2,.panel h2{font-size:clamp(22px,2.2vw,32px);letter-spacing:-.04em}
.stock-heading{font-size:1rem;letter-spacing:0;margin:0 0 10px}
.inventory-row{display:block;padding:13px 15px;border-radius:10px}
.inventory-row[aria-current=page]{border-color:var(--accent);background:#19312a}
.inventory-row strong,.inventory-row small{display:block}.inventory-row small{font-size:.76rem;color:var(--muted)}
.panel{padding:clamp(18px,3vw,32px);border-radius:16px}
.panel-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap}
.panel-heading h2{margin-bottom:4px}
.panel-heading .hint{margin:0}
.feedback{padding:11px 16px;margin:0;border:1px solid #65583e;border-radius:7px}
.feedback-wrap{padding-top:18px}
.editor fieldset{min-width:0;margin:18px 0 0;padding:0;border:0}.editor legend{font-size:1.04rem;font-weight:650;padding:0 0 6px}
.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px 14px}
.fields .wide{grid-column:1/-1}
.editor label,.signin label{font-size:.84rem;font-weight:550;color:#e2ece7;margin:0}
.editor label input,.editor label select,.signin input{margin-top:4px}
.editor input:not([type=checkbox]),.editor select,.signin input{display:block;width:100%;border:1px solid #4d615b;border-radius:6px;padding:9px 10px;min-height:44px;font-size:16px;color:var(--fg);background:#0c1619}
.editor input[type=file]{min-width:0;max-width:100%;padding:4px}
.editor input[type=file]::file-selector-button{border:0;border-radius:4px;margin-right:8px;min-height:34px;padding-inline:10px;background:#264039;color:var(--fg)}
.editor .check{display:flex;align-items:center;gap:9px;padding-block:6px;min-height:44px}
.editor input[type=checkbox]{width:18px;min-height:auto;height:18px;margin:0;display:inline-block;accent-color:var(--accent)}
.existing{display:flex;flex-wrap:wrap;gap:10px;margin-block:7px 13px}
.existing .check{flex-direction:column;align-items:flex-start;border:1px solid #3c4e48;border-radius:8px;padding:8px;font-weight:480}
.existing .check img{width:100px;aspect-ratio:1.7;object-fit:cover;border-radius:4px}
.existing .check span{display:flex;gap:6px;align-items:center}
.commit,.history{border-top:1px solid #394a46;margin-top:20px;padding-top:16px}
.commit h3,.history h3{margin:0 0 6px;font-size:1.1rem}.commit .actions,.history .actions{margin-top:10px}
.commit .actions form,.commit button,.history .button{margin:0}
.history summary{padding-inline:0}
.history select{display:block;min-height:44px;max-width:100%;padding:6px 8px;background:#101a1c;border:1px solid #4d615b;border-radius:6px;color:var(--fg)}
.signin-layout{min-height:65vh;display:grid;align-items:center;justify-items:center;padding-block:34px 55px}
.signin{max-width:430px;width:100%}.signin h1{font-size:clamp(34px,4vw,48px);letter-spacing:-.05em;margin-bottom:12px}.signin label{display:block;margin-top:16px}.signin .feedback{margin-top:14px}.signin .button{width:100%;margin-top:20px}
@media(max-width:760px){
 .section-head{display:flex;align-items:start;gap:10px;flex-wrap:wrap}
 .workspace{grid-template-columns:1fr}.stock-list{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
 .worktop .section-head{align-items:start}.worktop .actions{margin-top:4px}
}
@media(max-width:460px){
 .fields{grid-template-columns:1fr}
}
`
