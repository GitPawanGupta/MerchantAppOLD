'use strict';
/**
 * Payment page HTML builder
 * - Dynamic QR: loading screen → auto Razorpay modal, zero clicks
 * - Static QR:  branded form (amount + optional phone) → Razorpay modal
 * - Result page: animated success / failure screen with receipt details
 */

// ─── Shared constants ─────────────────────────────────────────────────────────
const BRAND   = '#528FF0';
const BRAND_D = '#3b6fd4';
const FONTS   = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap';
const RZP_SDK = 'https://checkout.razorpay.com/v1/checkout.js';

const CSS_RESET = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',system-ui,sans-serif;background:#f0f4ff;min-height:100vh;
  -webkit-tap-highlight-color:transparent;}
`;

const CSS_LOCK_ICON = `
<svg width="11" height="13" viewBox="0 0 12 14" fill="none"
  stroke="currentColor" stroke-width="2" stroke-linecap="round">
  <rect x="1" y="6" width="10" height="7" rx="2"/>
  <path d="M4 6V4a2 2 0 014 0v2"/>
</svg>`;

/** Escape for safe JS string embedding */
const esc = (s) => String(s)
  .replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  .replace(/'/g, "\\'").replace(/\r?\n/g, ' ');

/** HTML entity-escape for inline HTML text nodes */
const escHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ─── Dynamic Page (fixed-amount QR) ──────────────────────────────────────────
function buildDynamicPage({ merchantName, merchantCategory, label, fixedAmount, rzpKeyId, qrId, avatarLetter, logoUrl }) {
  const safeM = esc(merchantName);
  const safeL = esc(label);
  const safeK = esc(rzpKeyId);
  const safeQ = esc(qrId);
  const displayAmt = fixedAmount.toFixed(2);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta name="theme-color" content="${BRAND}">
<title>Pay ₹${displayAmt} · ${escHtml(merchantName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="${FONTS}" rel="stylesheet">
<script src="${RZP_SDK}"></script>
<style>
${CSS_RESET}
body{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;}
.card{background:#fff;border-radius:24px;box-shadow:0 4px 32px rgba(0,0,0,.1);
  width:100%;max-width:380px;overflow:hidden;}
.merchant-header{
  background:linear-gradient(160deg,${BRAND} 0%,${BRAND_D} 100%);
  padding:32px 24px 28px;text-align:center;position:relative;}
.avatar{width:72px;height:72px;border-radius:20px;margin:0 auto 14px;
  background:rgba(255,255,255,.2);border:3px solid rgba(255,255,255,.4);
  display:flex;align-items:center;justify-content:center;
  font-size:30px;font-weight:800;color:#fff;overflow:hidden;}
.avatar img{width:100%;height:100%;object-fit:cover;}
.m-name{font-size:18px;font-weight:800;color:#fff;margin-bottom:3px;}
.m-cat{font-size:12px;color:rgba(255,255,255,.75);font-weight:500;text-transform:capitalize;}
.amount-badge{
  background:rgba(255,255,255,.15);backdrop-filter:blur(8px);
  border:1.5px solid rgba(255,255,255,.3);border-radius:16px;
  display:inline-flex;align-items:baseline;gap:4px;
  padding:10px 24px;margin-top:16px;}
.amt-rs{font-size:22px;font-weight:700;color:rgba(255,255,255,.85);}
.amt-val{font-size:40px;font-weight:800;color:#fff;letter-spacing:-1px;line-height:1;}
.body{padding:28px 24px;}
.status-wrap{text-align:center;min-height:90px;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;}
.spinner{width:42px;height:42px;border:4px solid #e5e7eb;
  border-top-color:${BRAND};border-radius:50%;
  animation:spin .75s linear infinite;}
@keyframes spin{to{transform:rotate(360deg)}}
.status-text{font-size:14px;font-weight:600;color:#374151;}
.status-sub{font-size:12px;color:#9ca3af;margin-top:2px;}
.retry-btn{
  padding:12px 28px;background:${BRAND};color:#fff;border:none;
  border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;
  display:none;transition:opacity .15s;}
.retry-btn:active{opacity:.8}
.divider{height:1px;background:#f3f4f6;margin:0 24px;}
.footer{padding:14px 24px;display:flex;align-items:center;
  justify-content:center;gap:5px;font-size:11px;color:#9ca3af;}
</style>
</head>
<body>
<div class="card">
  <div class="merchant-header">
    <div class="avatar">
      ${logoUrl
        ? `<img src="${escHtml(logoUrl)}" alt="${escHtml(merchantName)}" onerror="this.style.display='none';this.parentNode.textContent='${escHtml(avatarLetter)}';">`
        : escHtml(avatarLetter)}
    </div>
    <div class="m-name">${escHtml(merchantName)}</div>
    <div class="m-cat">${escHtml(merchantCategory || 'Business')}</div>
    <div class="amount-badge">
      <span class="amt-rs">₹</span>
      <span class="amt-val">${displayAmt}</span>
    </div>
  </div>
  <div class="body">
    <div class="status-wrap">
      <div class="spinner" id="spin"></div>
      <div>
        <div class="status-text" id="stxt">Opening secure payment...</div>
        <div class="status-sub" id="ssub">Please wait a moment</div>
      </div>
      <button class="retry-btn" id="retryBtn" onclick="go()">Try Again</button>
    </div>
  </div>
  <div class="divider"></div>
  <div class="footer">${CSS_LOCK_ICON} Secured by Razorpay</div>
</div>
<script>
var Q="${safeQ}",A=${fixedAmount},K="${safeK}",M="${safeM}",L="${safeL}",oid=null;
function setStatus(txt,sub,showRetry){
  document.getElementById('stxt').textContent=txt||'';
  document.getElementById('ssub').textContent=sub||'';
  document.getElementById('spin').style.display=showRetry?'none':'block';
  document.getElementById('retryBtn').style.display=showRetry?'inline-flex':'none';
}
async function go(){
  setStatus('Opening secure payment...','Please wait a moment',false);
  if(typeof Razorpay==='undefined'){
    setStatus('Payment SDK failed to load','Please refresh the page',true);return;}
  try{
    var r=await fetch('/api/payment/create-order',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({qrId:Q,amount:A})});
    var d=await r.json();
    if(!d.success)throw new Error(d.message||'Could not create order');
    oid=d.data.orderId;
    var rzp=new Razorpay({
      key:K,amount:Math.round(A*100),currency:'INR',
      name:M,description:L,order_id:d.data.rzpOrderId,
      theme:{color:'${BRAND}'},
      handler:function(p){
        setStatus('Verifying payment...','Almost done!',false);
        var pid=p.razorpay_payment_id||'';
        var sig=p.razorpay_signature||'';
        fetch('/api/payment/verify?order_id='+oid
          +'&razorpay_payment_id='+encodeURIComponent(pid)
          +'&razorpay_signature='+encodeURIComponent(sig))
        .then(function(r){return r.json();})
        .then(function(d){
          if(d.success){
            showResult(true,oid,pid,Math.round(A*100));
          } else {
            showResult(false,oid,null,Math.round(A*100));
          }
        })
        .catch(function(){showResult(true,oid,pid,Math.round(A*100));});},
      modal:{
        ondismiss:function(){
          setStatus('Payment cancelled','Tap "Try Again" to retry',true);},
        animation:true,backdropclose:false}
    });
    rzp.on('payment.failed',function(e){
      showResult(false,oid,null,Math.round(A*100),e.error.description||'Payment failed');});
    rzp.open();
    setStatus('Complete payment in the popup','Do not close this page',false);
  }catch(e){setStatus('Something went wrong',e.message||'Please try again',true);}
}
function showResult(ok,orderId,payId,amtPaise,errMsg){
  document.body.innerHTML='';
  var amtRs=(amtPaise/100).toFixed(2);
  var accent=ok?'#16a34a':'#dc2626';
  var bgGrad=ok?'linear-gradient(160deg,#dcfce7,#bbf7d0)':'linear-gradient(160deg,#fee2e2,#fecaca)';
  var icon=ok
    ?'<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
    :'<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  var sub=ok?'Your payment was completed successfully':(errMsg||'Payment could not be processed');
  document.body.style.cssText='display:flex;align-items:center;justify-content:center;padding:20px;background:#f0f4ff;min-height:100vh;font-family:Inter,sans-serif;';
  document.body.innerHTML='<div style="background:#fff;border-radius:24px;box-shadow:0 4px 32px rgba(0,0,0,.10);width:100%;max-width:400px;overflow:hidden;">'
    +'<div style="padding:40px 24px 32px;text-align:center;background:'+bgGrad+'">'
    +'<div style="width:80px;height:80px;border-radius:50%;background:'+accent+';display:flex;align-items:center;justify-content:center;margin:0 auto 18px;animation:pop .45s cubic-bezier(.34,1.56,.64,1) both;">'+icon+'</div>'
    +'<div style="font-size:22px;font-weight:800;color:'+accent+';margin-bottom:6px;">'+(ok?'Payment Successful':'Payment Failed')+'</div>'
    +'<div style="font-size:13px;color:'+(ok?'#166534':'#991b1b')+';font-weight:500;">'+sub+'</div>'
    +'</div>'
    +'<div style="padding:8px 24px 4px;">'
    +(ok?'<div style="display:flex;justify-content:space-between;padding:13px 0;border-bottom:1px solid #f3f4f6;"><span style="font-size:13px;color:#6b7280;">Amount</span><span style="font-size:20px;font-weight:700;color:#528FF0;">₹'+amtRs+'</span></div>':'')
    +'<div style="display:flex;justify-content:space-between;padding:13px 0;border-bottom:1px solid #f3f4f6;"><span style="font-size:13px;color:#6b7280;">Order ID</span><span style="font-size:12px;font-weight:700;color:#111827;word-break:break-all;max-width:55%;text-align:right;">'+orderId+'</span></div>'
    +(ok&&payId?'<div style="display:flex;justify-content:space-between;padding:13px 0;border-bottom:1px solid #f3f4f6;"><span style="font-size:13px;color:#6b7280;">Payment ID</span><span style="font-size:12px;font-weight:700;color:#111827;word-break:break-all;max-width:55%;text-align:right;">'+payId+'</span></div>':'')
    +'<div style="display:flex;justify-content:space-between;padding:13px 0;"><span style="font-size:13px;color:#6b7280;">Status</span><span style="font-size:13px;font-weight:700;color:'+accent+';">'+(ok?'SUCCESS':'FAILED')+'</span></div>'
    +'</div>'
    +'<div style="padding:20px 24px 24px;">'
    +'<button onclick="try{window.close();}catch(e){} this.textContent=\'You may close this tab\';this.disabled=true;" style="width:100%;height:52px;background:#111827;color:#fff;border:none;border-radius:14px;font-size:16px;font-weight:700;cursor:pointer;">Done</button>'
    +'</div>'
    +'</div>';
  var s=document.createElement('style');
  s.textContent='@keyframes pop{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}';
  document.head.appendChild(s);
  if(ok) setTimeout(function(){try{window.close();}catch(e){}},8000);
}
window.addEventListener('load',function(){setTimeout(go,500);});
</script>
</body></html>`;
}

// ─── Static Page (any-amount QR) ─────────────────────────────────────────────
function buildStaticPage({ merchantName, merchantCategory, label, rzpKeyId, qrId, avatarLetter, logoUrl }) {
  const safeM = esc(merchantName);
  const safeL = esc(label);
  const safeK = esc(rzpKeyId);
  const safeQ = esc(qrId);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta name="theme-color" content="${BRAND}">
<title>Pay · ${escHtml(merchantName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="${FONTS}" rel="stylesheet">
<script src="${RZP_SDK}"></script>
<style>
${CSS_RESET}
body{display:flex;flex-direction:column;align-items:center;}
/* ── Sticky top bar ── */
.topbar{
  position:sticky;top:0;z-index:20;width:100%;
  background:#fff;border-bottom:1px solid #e5e7eb;
  padding:12px 16px;display:flex;align-items:center;gap:12px;}
.tb-avatar{
  width:40px;height:40px;border-radius:11px;flex-shrink:0;overflow:hidden;
  background:linear-gradient(135deg,${BRAND},${BRAND_D});
  display:flex;align-items:center;justify-content:center;
  font-size:17px;font-weight:800;color:#fff;}
.tb-avatar img{width:100%;height:100%;object-fit:cover;}
.tb-info h1{font-size:14px;font-weight:700;color:#111827;line-height:1.2;}
.tb-info p{font-size:11px;color:#6b7280;font-weight:500;text-transform:capitalize;}
/* ── Main card ── */
.wrap{width:100%;max-width:420px;padding:16px 16px 48px;}
.card{background:#fff;border-radius:20px;
  box-shadow:0 2px 24px rgba(0,0,0,.08);overflow:hidden;}
.card-body{padding:24px;}
/* ── Amount input ── */
.field-label{font-size:11px;font-weight:700;color:#9ca3af;
  letter-spacing:.8px;text-transform:uppercase;margin-bottom:8px;display:block;}
.amt-wrap{
  display:flex;align-items:center;
  border:2px solid #e5e7eb;border-radius:14px;
  background:#f9fafb;transition:border-color .2s,background .2s;
  margin-bottom:6px;}
.amt-wrap:focus-within{border-color:${BRAND};background:#fff;}
.amt-rs{
  padding:0 4px 0 16px;font-size:24px;font-weight:700;
  color:#d1d5db;line-height:1;transition:color .2s;}
.amt-wrap:focus-within .amt-rs{color:${BRAND};}
.amt-input{
  flex:1;height:60px;border:none;outline:none;
  font-size:32px;font-weight:800;color:#111827;
  padding:0 16px 0 6px;background:transparent;
  letter-spacing:-0.5px;}
.amt-input::placeholder{color:#d1d5db;}
.quick-amounts{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:4px;}
.qa{
  padding:5px 14px;border:1.5px solid #e5e7eb;border-radius:20px;
  font-size:13px;font-weight:600;color:#374151;background:#fff;
  cursor:pointer;transition:all .15s;}
.qa:active,.qa.active{background:${BRAND};border-color:${BRAND};color:#fff;}
.hint{font-size:11px;color:#9ca3af;margin-bottom:20px;}
/* ── Divider ── */
.div{height:1px;background:#f3f4f6;margin:20px 0;}
/* ── Phone input ── */
.ph-row{
  display:flex;align-items:center;
  border:2px solid #e5e7eb;border-radius:14px;
  background:#f9fafb;overflow:hidden;
  transition:border-color .2s,background .2s;margin-bottom:6px;}
.ph-row:focus-within{border-color:${BRAND};background:#fff;}
.ph-pfx{
  padding:0 12px;height:52px;display:flex;align-items:center;
  font-size:14px;font-weight:600;color:#374151;
  border-right:1.5px solid #e5e7eb;white-space:nowrap;gap:6px;}
.ph-input{
  flex:1;height:52px;border:none;outline:none;
  font-size:16px;font-weight:600;color:#111827;
  padding:0 14px;background:transparent;letter-spacing:1px;}
.ph-input::placeholder{font-weight:400;letter-spacing:0;color:#d1d5db;}
.opt-hint{font-size:11px;color:#9ca3af;margin-bottom:24px;}
/* ── Pay button ── */
.pay-btn{
  width:100%;height:58px;
  background:linear-gradient(135deg,${BRAND} 0%,${BRAND_D} 100%);
  border:none;border-radius:14px;color:#fff;
  font-size:17px;font-weight:700;cursor:pointer;
  display:flex;align-items:center;justify-content:center;gap:10px;
  box-shadow:0 4px 18px rgba(82,143,240,.4);
  transition:opacity .15s,transform .1s;}
.pay-btn:active{transform:scale(.98);}
.pay-btn:disabled{opacity:.55;cursor:not-allowed;transform:none;box-shadow:none;}
.btn-spinner{
  width:20px;height:20px;border:2.5px solid rgba(255,255,255,.3);
  border-top-color:#fff;border-radius:50%;
  animation:spin .7s linear infinite;display:none;}
@keyframes spin{to{transform:rotate(360deg)}}
/* ── Payment methods ── */
.methods{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin-top:16px;}
.mc{
  background:#f3f4f6;border-radius:8px;padding:5px 11px;
  font-size:11px;font-weight:600;color:#6b7280;}
/* ── Footer ── */
.card-footer{
  padding:14px 24px;background:#fafafa;
  border-top:1px solid #f3f4f6;
  display:flex;align-items:center;justify-content:center;
  gap:5px;font-size:11px;color:#9ca3af;}
/* ── Toast ── */
.toast{
  position:fixed;bottom:24px;left:50%;
  transform:translateX(-50%) translateY(100px);
  background:#1f2937;color:#fff;
  padding:12px 20px;border-radius:12px;
  font-size:14px;font-weight:500;
  transition:transform .3s cubic-bezier(.34,1.56,.64,1);
  z-index:9999;white-space:nowrap;}
.toast.show{transform:translateX(-50%) translateY(0);}
</style>
</head>
<body>
<!-- Sticky merchant bar -->
<div class="topbar">
  <div class="tb-avatar">
    ${logoUrl
      ? `<img src="${escHtml(logoUrl)}" alt="${escHtml(merchantName)}" onerror="this.style.display='none';this.parentNode.textContent='${escHtml(avatarLetter)}';">`
      : escHtml(avatarLetter)}
  </div>
  <div class="tb-info">
    <h1>${escHtml(merchantName)}</h1>
    <p>${escHtml(merchantCategory || 'Business')}</p>
  </div>
</div>

<div class="wrap"><div class="card">
  <div class="card-body">
    <!-- Amount -->
    <label class="field-label" for="amt">Enter Amount</label>
    <div class="amt-wrap">
      <span class="amt-rs">₹</span>
      <input type="number" id="amt" class="amt-input"
        placeholder="0" min="1" step="1"
        inputmode="decimal" autocomplete="off">
    </div>
    <div class="quick-amounts">
      <button class="qa" onclick="setAmt(50)">₹50</button>
      <button class="qa" onclick="setAmt(100)">₹100</button>
      <button class="qa" onclick="setAmt(200)">₹200</button>
      <button class="qa" onclick="setAmt(500)">₹500</button>
    </div>
    <div class="hint">Minimum ₹1</div>
    <div class="div"></div>
    <!-- Phone -->
    <label class="field-label" for="ph">Mobile Number</label>
    <div class="ph-row">
      <span class="ph-pfx">🇮🇳 +91</span>
      <input type="tel" id="ph" class="ph-input"
        placeholder="10-digit number"
        maxlength="10" inputmode="numeric" autocomplete="tel">
    </div>
    <div class="opt-hint">Optional — for payment receipt</div>
    <!-- Pay button -->
    <button id="payBtn" class="pay-btn" onclick="pay()">
      <span class="btn-spinner" id="sp"></span>
      <span id="btxt">Proceed to Pay</span>
    </button>
    <div class="methods">
      <span class="mc">📱 UPI</span>
      <span class="mc">💳 Card</span>
      <span class="mc">🏦 Net Banking</span>
      <span class="mc">👛 Wallet</span>
    </div>
  </div>
  <div class="card-footer">${CSS_LOCK_ICON} Secured by Razorpay</div>
</div></div>
<div class="toast" id="toast"></div>

<script>
var Q="${safeQ}",K="${safeK}",M="${safeM}",L="${safeL}";
/* ── helpers ── */
function toast(msg,dur){
  var t=document.getElementById('toast');
  t.textContent=msg;t.classList.add('show');
  setTimeout(function(){t.classList.remove('show');},dur||3000);}
function setLoading(on){
  var b=document.getElementById('payBtn'),
      s=document.getElementById('sp'),
      x=document.getElementById('btxt');
  b.disabled=on;
  s.style.display=on?'block':'none';
  x.style.display=on?'none':'block';}
function setAmt(v){
  var el=document.getElementById('amt');
  el.value=v;
  document.querySelectorAll('.qa').forEach(function(q){
    q.classList.toggle('active',parseInt(q.textContent.replace('₹',''))===v);});}
/* ── phone filter ── */
document.getElementById('ph').addEventListener('input',function(){
  this.value=this.value.replace(/\\D/g,'').slice(0,10);});
/* ── pay ── */
async function pay(){
  var a=parseFloat(document.getElementById('amt').value)||0;
  if(a<1){toast('Please enter an amount (min ₹1)');
    document.getElementById('amt').focus();return;}
  var ph=document.getElementById('ph').value.trim();
  if(ph&&!/^[6-9]\\d{9}$/.test(ph)){
    toast('Enter a valid 10-digit mobile number');return;}
  if(typeof Razorpay==='undefined'){
    toast('Payment SDK not loaded — please refresh');return;}
  setLoading(true);
  try{
    var r=await fetch('/api/payment/create-order',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({qrId:Q,amount:a,
        customerPhone:ph||undefined})});
    var d=await r.json();
    if(!d.success)throw new Error(d.message||'Order creation failed');
    var oid=d.data.orderId,rid=d.data.rzpOrderId,oa=d.data.amount;
    var rzp=new Razorpay({
      key:K,amount:Math.round(oa*100),currency:'INR',
      name:M,description:L,order_id:rid,
      prefill:{contact:ph?'+91'+ph:''},
      theme:{color:'${BRAND}'},
      handler:function(p){
        setLoading(true);
        var pid=p.razorpay_payment_id||'';
        var sig=p.razorpay_signature||'';
        fetch('/api/payment/verify?order_id='+oid
          +'&razorpay_payment_id='+encodeURIComponent(pid)
          +'&razorpay_signature='+encodeURIComponent(sig))
        .then(function(r){return r.json();})
        .then(function(d){showResult(true,oid,pid,Math.round(oa*100));})
        .catch(function(){showResult(true,oid,pid,Math.round(oa*100));});},
      modal:{
        ondismiss:function(){setLoading(false);toast('Payment cancelled');},
        animation:true,backdropclose:false}
    });
    rzp.on('payment.failed',function(e){
      showResult(false,oid,null,Math.round(oa*100),e.error.description||'Payment failed');});
    rzp.open();
    setLoading(false);
  }catch(e){setLoading(false);toast(e.message||'Something went wrong');}
}
function showResult(ok,orderId,payId,amtPaise,errMsg){
  document.body.innerHTML='';
  var amtRs=(amtPaise/100).toFixed(2);
  var accent=ok?'#16a34a':'#dc2626';
  var bgGrad=ok?'linear-gradient(160deg,#dcfce7,#bbf7d0)':'linear-gradient(160deg,#fee2e2,#fecaca)';
  var icon=ok
    ?'<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
    :'<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  var sub=ok?'Your payment was completed successfully':(errMsg||'Payment could not be processed');
  document.body.style.cssText='display:flex;align-items:center;justify-content:center;padding:20px;background:#f0f4ff;min-height:100vh;font-family:Inter,sans-serif;';
  document.body.innerHTML='<div style="background:#fff;border-radius:24px;box-shadow:0 4px 32px rgba(0,0,0,.10);width:100%;max-width:400px;overflow:hidden;">'
    +'<div style="padding:40px 24px 32px;text-align:center;background:'+bgGrad+'">'
    +'<div style="width:80px;height:80px;border-radius:50%;background:'+accent+';display:flex;align-items:center;justify-content:center;margin:0 auto 18px;animation:pop .45s cubic-bezier(.34,1.56,.64,1) both;">'+icon+'</div>'
    +'<div style="font-size:22px;font-weight:800;color:'+accent+';margin-bottom:6px;">'+(ok?'Payment Successful':'Payment Failed')+'</div>'
    +'<div style="font-size:13px;color:'+(ok?'#166534':'#991b1b')+';font-weight:500;">'+sub+'</div>'
    +'</div>'
    +'<div style="padding:8px 24px 4px;">'
    +(ok?'<div style="display:flex;justify-content:space-between;padding:13px 0;border-bottom:1px solid #f3f4f6;"><span style="font-size:13px;color:#6b7280;">Pay To</span><span style="font-size:13px;font-weight:700;color:#111827;">'+M+'</span></div>':'')
    +'<div style="display:flex;justify-content:space-between;padding:13px 0;border-bottom:1px solid #f3f4f6;"><span style="font-size:13px;color:#6b7280;">Amount</span><span style="font-size:20px;font-weight:700;color:#528FF0;">₹'+amtRs+'</span></div>'
    +'<div style="display:flex;justify-content:space-between;padding:13px 0;border-bottom:1px solid #f3f4f6;"><span style="font-size:13px;color:#6b7280;">Order ID</span><span style="font-size:12px;font-weight:700;color:#111827;word-break:break-all;max-width:55%;text-align:right;">'+orderId+'</span></div>'
    +(ok&&payId?'<div style="display:flex;justify-content:space-between;padding:13px 0;border-bottom:1px solid #f3f4f6;"><span style="font-size:13px;color:#6b7280;">Payment ID</span><span style="font-size:12px;font-weight:700;color:#111827;word-break:break-all;max-width:55%;text-align:right;">'+payId+'</span></div>':'')
    +'<div style="display:flex;justify-content:space-between;padding:13px 0;"><span style="font-size:13px;color:#6b7280;">Status</span><span style="font-size:13px;font-weight:700;color:'+accent+';">'+(ok?'SUCCESS':'FAILED')+'</span></div>'
    +'</div>'
    +'<div style="padding:20px 24px 24px;display:flex;flex-direction:column;gap:10px;">'
    +'<button onclick="try{window.close();}catch(e){} this.textContent=\'You may close this tab\';this.disabled=true;" style="width:100%;height:52px;background:#111827;color:#fff;border:none;border-radius:14px;font-size:16px;font-weight:700;cursor:pointer;">Done</button>'
    +(!ok?'<button onclick="history.back()" style="width:100%;height:44px;background:transparent;color:#6b7280;border:1.5px solid #e5e7eb;border-radius:14px;font-size:14px;font-weight:600;cursor:pointer;">Try Again</button>':'')
    +'</div>'
    +'</div>';
  var s=document.createElement('style');
  s.textContent='@keyframes pop{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}';
  document.head.appendChild(s);
  if(ok) setTimeout(function(){try{window.close();}catch(e){}},8000);
}
document.getElementById('amt').addEventListener('keydown',function(e){
  if(e.key==='Enter'){e.preventDefault();pay();}});
</script>
</body></html>`;
}

// ─── Result Page (success / failure) ─────────────────────────────────────────
function buildResultPage({ isSuccess, merchantName, amount, orderId, paymentId, referenceId, errorMsg }) {
  const title   = isSuccess ? 'Payment Successful' : 'Payment Failed';
  const accent  = isSuccess ? '#16a34a' : '#dc2626';
  const bgGrad  = isSuccess
    ? 'linear-gradient(160deg,#dcfce7 0%,#bbf7d0 100%)'
    : 'linear-gradient(160deg,#fee2e2 0%,#fecaca 100%)';
  const iconBg  = isSuccess ? '#16a34a' : '#dc2626';
  const iconSvg = isSuccess
    ? `<svg width="34" height="34" viewBox="0 0 24 24" fill="none"
          stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
         <polyline points="20 6 9 17 4 12"/>
       </svg>`
    : `<svg width="34" height="34" viewBox="0 0 24 24" fill="none"
          stroke="#fff" stroke-width="2.8" stroke-linecap="round">
         <line x1="18" y1="6" x2="6" y2="18"/>
         <line x1="6" y1="6" x2="18" y2="18"/>
       </svg>`;
  const subtitle = isSuccess
    ? 'Your payment was completed successfully'
    : escHtml(errorMsg || 'There was an issue processing your payment');

  // Build receipt rows
  const rows = [
    { label: 'Pay To',   value: escHtml(merchantName) },
    { label: 'Amount',   value: `₹${Number(amount).toFixed(2)}`, highlight: true },
    { label: 'Order ID', value: escHtml(orderId) },
  ];
  if (isSuccess && paymentId)   rows.push({ label: 'Payment ID', value: escHtml(paymentId) });
  if (isSuccess && referenceId) rows.push({ label: 'Bank Ref',   value: escHtml(referenceId) });
  rows.push({ label: 'Status', value: isSuccess ? 'SUCCESS' : 'FAILED', statusColor: accent });

  const rowsHtml = rows.map(r => `
    <div class="row">
      <span class="rl">${r.label}</span>
      <span class="rv${r.highlight ? ' amt' : ''}"
        ${r.statusColor ? `style="color:${r.statusColor}"` : ''}>
        ${r.value}
      </span>
    </div>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<meta name="theme-color" content="${accent}">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="${FONTS}" rel="stylesheet">
<style>
${CSS_RESET}
body{display:flex;align-items:center;justify-content:center;
  padding:20px;background:#f0f4ff;min-height:100vh;}
.card{background:#fff;border-radius:24px;
  box-shadow:0 4px 32px rgba(0,0,0,.10);
  width:100%;max-width:400px;overflow:hidden;}
/* ── Animated header ── */
.result-head{
  padding:40px 24px 32px;text-align:center;
  background:${bgGrad};}
.icon-ring{
  width:80px;height:80px;border-radius:50%;
  background:${iconBg};
  display:flex;align-items:center;justify-content:center;
  margin:0 auto 18px;
  animation:pop .45s cubic-bezier(.34,1.56,.64,1) both;}
@keyframes pop{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}
.result-title{font-size:22px;font-weight:800;color:${accent};margin-bottom:6px;}
.result-sub{font-size:13px;color:${isSuccess ? '#166534' : '#991b1b'};
  font-weight:500;line-height:1.5;max-width:260px;margin:0 auto;}
/* ── Receipt ── */
.receipt{padding:8px 24px 4px;}
.row{
  display:flex;justify-content:space-between;align-items:center;
  padding:13px 0;border-bottom:1px solid #f3f4f6;}
.row:last-child{border-bottom:none;}
.rl{font-size:13px;color:#6b7280;font-weight:500;}
.rv{font-size:13px;font-weight:700;color:#111827;
  text-align:right;max-width:58%;word-break:break-all;line-height:1.4;}
.rv.amt{font-size:20px;color:${BRAND};}
/* ── Action buttons ── */
.actions{padding:20px 24px 24px;display:flex;flex-direction:column;gap:10px;}
.btn-primary{
  width:100%;height:52px;background:#111827;color:#fff;
  border:none;border-radius:14px;font-size:16px;font-weight:700;
  cursor:pointer;transition:background .2s;}
.btn-primary:hover{background:#1f2937;}
.btn-secondary{
  width:100%;height:44px;background:transparent;color:#6b7280;
  border:1.5px solid #e5e7eb;border-radius:14px;
  font-size:14px;font-weight:600;cursor:pointer;transition:all .2s;}
.btn-secondary:hover{border-color:#9ca3af;color:#374151;}
/* ── Footer ── */
.foot{
  padding:12px 24px 16px;text-align:center;
  border-top:1px solid #f3f4f6;
  font-size:11px;color:#9ca3af;
  display:flex;align-items:center;justify-content:center;gap:5px;}
</style>
</head>
<body>
<div class="card">
  <div class="result-head">
    <div class="icon-ring">${iconSvg}</div>
    <div class="result-title">${title}</div>
    <div class="result-sub">${subtitle}</div>
  </div>
  <div class="receipt">${rowsHtml}</div>
  <div class="actions">
    <button class="btn-primary" onclick="closeOrHome()">Done</button>
    ${!isSuccess ? `<button class="btn-secondary" onclick="history.back()">Try Again</button>` : ''}
  </div>
  <div class="foot">${CSS_LOCK_ICON} Secured by Razorpay</div>
</div>
<script>
function closeOrHome(){
  /* Try closing the tab (works if opened via window.open or from app) */
  try{window.close();}catch(e){}
  /* Fallback: if window.close() didn't work, show a "you may close" message */
  setTimeout(function(){
    document.querySelector('.btn-primary').textContent='You may close this tab';
    document.querySelector('.btn-primary').disabled=true;
  },400);
}
/* Auto-close after 8 s on success */
${isSuccess ? "setTimeout(closeOrHome, 8000);" : ""}
</script>
</body></html>`;
}

// ─── Error / expired page ─────────────────────────────────────────────────────
function buildErrorPage({ title, message, icon }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(title)}</title>
<link href="${FONTS}" rel="stylesheet">
<style>
${CSS_RESET}
body{font-family:'Inter',sans-serif;background:#f0f4ff;
  display:flex;align-items:center;justify-content:center;
  min-height:100vh;padding:20px;}
.card{background:#fff;border-radius:24px;padding:48px 32px;
  text-align:center;max-width:360px;width:100%;
  box-shadow:0 4px 24px rgba(0,0,0,.08);}
.icon{font-size:52px;margin-bottom:18px;line-height:1;}
h2{font-size:20px;font-weight:800;color:#111827;margin-bottom:10px;}
p{font-size:14px;color:#6b7280;line-height:1.6;}
</style>
</head>
<body>
<div class="card">
  <div class="icon">${icon || '⚠️'}</div>
  <h2>${escHtml(title)}</h2>
  <p>${escHtml(message)}</p>
</div>
</body></html>`;
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────
function buildPayPage(opts) {
  return opts.fixedAmount > 0 ? buildDynamicPage(opts) : buildStaticPage(opts);
}

module.exports = { buildPayPage, buildResultPage, buildErrorPage };
