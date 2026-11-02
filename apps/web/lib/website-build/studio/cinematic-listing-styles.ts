export const listingStyles=`
.catalog .car{transition:transform .24s ease,box-shadow .24s ease;border-radius:18px;box-shadow:0 12px 30px #0004}
@media(hover:hover){.catalog .car:hover{transform:translateY(-4px);box-shadow:0 22px 48px #0007}}
.catalog #concept-04{grid-column:1/-1;position:relative;display:grid;grid-template-columns:minmax(0,1.55fr) minmax(260px,1fr);padding:0;overflow:hidden;border:1px solid #8a795c;background:linear-gradient(120deg,#1b2c35,#101d25 78%);color:#f6f3ed}
.catalog #concept-04[hidden],#lot-dialog [hidden],#lot-open[hidden]{display:none!important}
.lot-visual{position:relative;min-height:255px}.lot-visual img{width:100%;height:100%;position:absolute;inset:0;object-fit:cover;object-position:center}
.lot-visual>span,.lot-eyebrow{letter-spacing:.17em;text-transform:uppercase;font:600 10px/1.5 system-ui;letter-spacing:.17em;color:#dbc39a}
.lot-visual>span{position:absolute;top:18px;left:18px;border:1px solid #d3bd975c;border-radius:3px;padding:5px 9px;background:#10202bd4}
.lot-summary{padding:clamp(22px,3.5vw,52px)}.lot-eyebrow{margin:0 0 8px}.lot-summary h3,#lot-title{font:500 clamp(36px,4vw,64px)/1.04 system-ui;letter-spacing:-.055em;color:#fff;margin:0}
.lot-subtitle{color:#dddfde;margin:8px 0}.lot-meta{color:#c4ced0;font:13px system-ui;margin:18px 0}
.lot-sale{border-top:1px solid #ffffff26;padding-top:14px;display:grid;gap:3px}.lot-sale span,.lot-offer .lot-eyebrow{color:#cab99b}.lot-sale span{font-size:12px}.lot-sale strong,.lot-offer>strong{font:500 28px system-ui;color:#fff}
#lot-open,.lot-actions button,#lot-confirm,#lot-close{font:600 13px system-ui;padding:11px 17px;border-radius:24px;cursor:pointer;color:#ebeeee;background:#203038;border:1px solid #718086}
#lot-open,.lot-actions button:first-child,#lot-confirm{background:#dfc298;color:#102027;border-color:#dfc298}
#lot-open{margin-top:20px}#lot-open:after{content:'';position:absolute;inset:0}
#concept-04 details{grid-column:1/-1}body:has(#lot-dialog[open]){overflow:hidden}
#lot-dialog{box-sizing:border-box;inset:0;width:min(1010px,94vw);max-width:94vw;max-height:90dvh;margin:auto;padding:0;overflow:auto;overscroll-behavior:contain;border:1px solid #66726f;border-radius:22px;background:linear-gradient(145deg,#1b2c34,#101c22 66%);color:#f5f1eb;box-shadow:0 36px 140px #000a}
#lot-dialog::backdrop{background:#041019cc;backdrop-filter:blur(6px)}.lot-sheet{padding:clamp(16px,3vw,34px)}.lot-header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}.lot-header #lot-title{font-size:clamp(30px,4vw,48px)}#lot-title small{font:400 16px system-ui;letter-spacing:0;color:#cad4d1}
.lot-gallery{display:grid;grid-template-columns:minmax(0,1fr) minmax(88px,15%);gap:10px}.lot-stage{position:relative;min-width:0;border-radius:13px;background:#28373d;overflow:hidden;aspect-ratio:1.95}
.lot-stage>img,.lot-stage>iframe{position:absolute;inset:0;width:100%;height:100%;border:0;object-fit:contain}
#lot-load{position:absolute;bottom:10px;left:10px;right:auto;max-width:calc(100% - 20px);padding:6px 10px;border-radius:12px;background:#101b21e8;color:#f5ece2;font:12px/1.4 system-ui}
.lot-views{display:grid;grid-template-rows:repeat(4,1fr);gap:7px}.lot-views button{position:relative;isolation:isolate;overflow:hidden;background:#26383f;border:1px solid #637273;border-radius:9px;color:#fff;cursor:pointer;text-align:left;font:600 12px system-ui}
.lot-views button[aria-pressed=true]{outline:2px solid #e3c28e;outline-offset:-2px}.lot-views img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-1}.lot-views span{position:absolute;left:5px;bottom:5px;background:#10191dd9;padding:2px 5px;border-radius:3px}.lot-views b{position:absolute;right:12%;top:5%;font:34px system-ui;color:#e3cba2}
.lot-info{display:grid;grid-template-columns:1fr 1fr;gap:clamp(18px,4vw,44px);margin-top:22px}.lot-info dl{display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;margin:0}.lot-info dl div{border-top:1px solid #67777755;padding-top:5px}.lot-info dt{color:#acbbbd;font-size:11px}.lot-info dd{color:#f4f5f1;margin:2px 0;font:500 15px system-ui}
.lot-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}.lot-actions button{padding:9px 12px}
#lot-form{margin-top:12px;border-top:1px solid #536266;padding-top:8px}#lot-form p,#lot-result{font:14px/1.4 system-ui;color:#ebe1d1}#lot-result:empty{display:none}#lot-form label{display:grid;gap:5px;font:13px system-ui}#lot-form input,#lot-form textarea{width:100%;padding:9px;color:white;background:#12232a;border:1px solid #728588;border-radius:6px}#lot-confirm{margin-top:10px}
.lot-sheet footer{margin-top:20px;padding:14px 0 0;border-top:1px solid #ffffff26;color:#b3c1c3;font:11px/1.5 system-ui;background:none}
@media(max-width:700px){.catalog #concept-04{grid-template-columns:1fr}.lot-visual{min-height:0;aspect-ratio:1.8}.lot-summary{padding:20px}#lot-dialog{width:96vw;max-width:96vw;max-height:94dvh;border-radius:15px}.lot-gallery,.lot-info{grid-template-columns:1fr}.lot-views{grid-template:56px/repeat(4,1fr)}.lot-stage{aspect-ratio:1.5}.lot-views b{font-size:28px}.lot-header #lot-title small{display:block;font-size:13px;margin-top:3px}}
@media(prefers-reduced-motion:reduce){.catalog .car{transition:none}.catalog .car:hover{transform:none}}
`