'use strict';
/**
 * Payment page HTML builder
 * - Dynamic QR (fixed amount): loading screen → auto Razorpay modal, zero clicks
 * - Static QR (any amount):    minimal form (amount + optional phone) → Razorpay modal
 */

const CSS_COMMON = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Inter',sans-serif;min-height:100vh;background:#f0f4ff;}
`;

function buildDynamicPage({ merchantName, label, fixedAmount, rzpKeyId, qrId, avatarLetter, safeMerchant, safeLabel }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Pay ${merchantName}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<style>
${CSS_COMMON}
body{display:flex;align-items:center;justify-content:center;}
.wrap{text-align:center;padding:40px 24px;max-width:360px;width:100%;}
.av{width:72px;height:72px;border-radius:20px;background:linear-gradient(135deg,#528FF0,#3b6fd4);color:#fff;font-size:30px;font-weight:800;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;}
.mname{font-size:19px;font-weight:800;color:#111827;margin-bottom:4px;}
.mlabel{font-size:13px;color:#6b7280;margin-bottom:20px;}
.amount{font-size:46px;font-weight:800;color:#528FF0;margin-bottom:28px;letter-spacing:-1px;}
.spin{width:38px;height:38px;border:4px solid #e5e7eb;border-top-color:#528FF0;border-radius:50%;animation:sp .8s linear infinite;margin:0 auto 14px;}
@keyframes sp{to{transform:rotate(360deg);}}
.hint{font-size:13px;color:#6b7280;font-weight:500;min-height:20px;}
.retry{margin-top:20px;padding:12px 32px;background:#528FF0;color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;display:none;}
.foot{margin-top:36px;font-size:11px;color:#9ca3af;display:flex;align-items:center;justify-content:center;gap:4px;}
</style>
</head>
<body>
<div class="wrap">
  <div class="av">${avatarLetter}</div>
  <div class="mname">${merchantName}</div>
  <div class="mlabel">${label}</div>
  <div class="amount">&#8377;${fixedAmount.toFixed(2)}</div>
  <div class="spin" id="spin"></div>
  <div class="hint" id="hint">Opening payment...</div>
  <button class="retry" id="retry" onclick="go()">Try Again</button>
  <div class="foot">
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
    Secured by Razorpay
  </div>
</div>
<script>
var Q="${qrId}",A=${fixedAmount},K="${rzpKeyId}",M="${safeMerchant}",L="${safeLabel}",oid=null;
function showRetry(m){document.getElementById('spin').style.display='none';document.getElementById('hint').textContent=m||'Something went wrong.';document.getElementById('retry').style.display='inline-block';}
async function go(){
  document.getElementById('spin').style.display='block';
  document.getElementById('hint').textContent='Opening payment...';
  document.getElementById('retry').style.display='none';
  if(typeof Razorpay==='undefined'){showRetry('SDK not loaded. Please refresh.');return;}
  try{
    var r=await fetch('/api/payment/create-order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({qrId:Q,amount:A})});
    var d=await r.json();
    if(!d.success)throw new Error(d.message||'Order failed');
    oid=d.data.orderId;
    var rzp=new Razorpay({key:K,amount:Math.round(A*100),currency:'INR',name:M,description:L,order_id:d.data.rzpOrderId,theme:{color:'#528FF0'},
      handler:function(p){location.replace('/api/payment/return?order_id='+oid+'&razorpay_payment_id='+p.razorpay_payment_id+'&razorpay_order_id='+p.razorpay_order_id+'&razorpay_signature='+p.razorpay_signature);},
      modal:{ondismiss:function(){document.getElementById('spin').style.display='none';document.getElementById('hint').textContent='Payment cancelled.';document.getElementById('retry').style.display='inline-block';},animation:true}
    });
    rzp.on('payment.failed',function(e){location.replace('/api/payment/return?order_id='+oid+'&error='+encodeURIComponent(e.error.description||'Payment failed'));});
    rzp.open();
    document.getElementById('spin').style.display='none';
    document.getElementById('hint').textContent='Complete payment in the popup above';
  }catch(e){showRetry(e.message||'Something went wrong.');}
}
window.addEventListener('load',function(){setTimeout(go,400);});
</script>
</body></html>`;
}

function buildStaticPage({ merchantName, label, rzpKeyId, qrId, avatarLetter, safeMerchant, safeLabel }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Pay ${merchantName}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<style>
${CSS_COMMON}
:root{--p:#528FF0;--pd:#3b6fd4;--s:#fff;--t:#111827;--m:#6b7280;--b:#e5e7eb;}
body{display:flex;flex-direction:column;align-items:center;}
.top{width:100%;background:var(--s);border-bottom:1px solid var(--b);padding:15px 20px;display:flex;align-items:center;gap:12px;position:sticky;top:0;z-index:10;}
.av{width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,var(--p),var(--pd));color:#fff;font-size:19px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.ai h1{font-size:15px;font-weight:700;color:var(--t);} .ai p{font-size:11px;color:var(--m);}
.wrap{width:100%;max-width:420px;padding:16px 16px 40px;}
.card{background:var(--s);border-radius:18px;box-shadow:0 2px 20px rgba(0,0,0,.07);padding:24px;}
.lbl{font-size:11px;font-weight:700;color:var(--m);letter-spacing:.8px;text-transform:uppercase;display:block;margin-bottom:8px;}
.amt-box{position:relative;margin-bottom:22px;}
.rs{position:absolute;left:14px;top:50%;transform:translateY(-50%);font-size:22px;font-weight:700;color:#9ca3af;}
.amt{width:100%;height:62px;border:2px solid var(--b);border-radius:14px;font-size:30px;font-weight:800;color:var(--t);padding:0 16px 0 40px;background:#f9fafb;outline:none;transition:border-color .2s;}
.amt:focus{border-color:var(--p);background:var(--s);}
.div{height:1px;background:var(--b);margin:20px 0;}
.ph-row{display:flex;align-items:center;border:2px solid var(--b);border-radius:14px;background:#f9fafb;overflow:hidden;transition:border-color .2s;margin-bottom:6px;}
.ph-row:focus-within{border-color:var(--p);background:var(--s);}
.pfx{padding:0 12px;height:52px;display:flex;align-items:center;font-size:14px;font-weight:600;color:var(--t);border-right:1.5px solid var(--b);white-space:nowrap;}
.ph{flex:1;height:52px;border:none;outline:none;font-size:16px;font-weight:600;color:var(--t);padding:0 14px;background:transparent;letter-spacing:1.5px;}
.opt{font-size:11px;color:var(--m);margin-bottom:20px;}
.btn{width:100%;height:58px;background:linear-gradient(135deg,var(--p),var(--pd));border:none;border-radius:14px;color:#fff;font-size:17px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 14px rgba(82,143,240,.35);transition:opacity .15s,transform .1s;}
.btn:active{transform:scale(.98);} .btn:disabled{opacity:.6;cursor:not-allowed;transform:none;}
.sp{width:20px;height:20px;border:2.5px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:sp .7s linear infinite;display:none;}
@keyframes sp{to{transform:rotate(360deg);}}
.methods{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin-top:16px;}
.mc{background:#f3f4f6;border-radius:8px;padding:4px 10px;font-size:11px;font-weight:600;color:var(--m);}
.foot{text-align:center;margin-top:14px;font-size:11px;color:#9ca3af;display:flex;align-items:center;justify-content:center;gap:4px;}
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(80px);background:#1f2937;color:#fff;padding:12px 20px;border-radius:12px;font-size:14px;font-weight:500;transition:transform .3s;z-index:9999;}
.toast.show{transform:translateX(-50%) translateY(0);}
</style>
</head>
<body>
<div class="top"><div class="av">${avatarLetter}</div><div class="ai"><h1>${merchantName}</h1><p>${label}</p></div></div>
<div class="wrap"><div class="card">
  <label class="lbl">Amount</label>
  <div class="amt-box"><span class="rs">&#8377;</span><input type="number" id="amt" class="amt" placeholder="0" min="1" step="1" inputmode="decimal" autofocus></div>
  <div class="div"></div>
  <label class="lbl">Mobile <span style="font-weight:400;text-transform:none;letter-spacing:0;font-size:10px;">(optional)</span></label>
  <div class="ph-row"><span class="pfx">&#127470;&#127475; +91</span><input type="tel" id="ph" class="ph" placeholder="10-digit number" maxlength="10" inputmode="numeric"></div>
  <div class="opt">For payment confirmation</div>
  <button id="btn" class="btn" onclick="pay()"><span class="sp" id="sp"></span><span id="btxt">Proceed to Pay</span></button>
  <div class="methods"><span class="mc">&#128241; UPI</span><span class="mc">&#128179; Card</span><span class="mc">&#127981; Net Banking</span><span class="mc">&#128652; Wallet</span></div>
  <div class="foot"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>Secured by Razorpay &middot; ISS</div>
</div></div>
<div class="toast" id="toast"></div>
<script>
var Q="${qrId}",K="${rzpKeyId}",M="${safeMerchant}",L="${safeLabel}";
function toast(m){var t=document.getElementById('toast');t.textContent=m;t.classList.add('show');setTimeout(function(){t.classList.remove('show');},3000);}
function load(on){var b=document.getElementById('btn'),s=document.getElementById('sp'),t=document.getElementById('btxt');b.disabled=on;s.style.display=on?'block':'none';t.style.display=on?'none':'block';}
document.getElementById('ph').addEventListener('input',function(){this.value=this.value.replace(/\\D/g,'').slice(0,10);});
async function pay(){
  var a=parseFloat(document.getElementById('amt').value)||0;
  if(a<1){toast('Please enter amount (min \u20b91)');document.getElementById('amt').focus();return;}
  var ph=document.getElementById('ph').value.trim();
  if(ph&&!/^[6-9]\\d{9}$/.test(ph)){toast('Enter valid 10-digit mobile number');return;}
  if(typeof Razorpay==='undefined'){toast('Payment SDK not loaded. Refresh page.');return;}
  load(true);
  try{
    var r=await fetch('/api/payment/create-order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({qrId:Q,amount:a,customerPhone:ph||undefined})});
    var d=await r.json();
    if(!d.success)throw new Error(d.message||'Order failed');
    var oid=d.data.orderId,rid=d.data.rzpOrderId,oa=d.data.amount;
    var rzp=new Razorpay({key:K,amount:Math.round(oa*100),currency:'INR',name:M,description:L,order_id:rid,
      prefill:{contact:ph?'+91'+ph:undefined},theme:{color:'#528FF0'},
      handler:function(p){location.replace('/api/payment/return?order_id='+oid+'&razorpay_payment_id='+p.razorpay_payment_id+'&razorpay_order_id='+p.razorpay_order_id+'&razorpay_signature='+p.razorpay_signature);},
      modal:{ondismiss:function(){load(false);},animation:true}
    });
    rzp.on('payment.failed',function(e){location.replace('/api/payment/return?order_id='+oid+'&error='+encodeURIComponent(e.error.description||'Payment failed'));});
    rzp.open();
  }catch(e){load(false);toast(e.message||'Something went wrong.');}
}
document.getElementById('amt').addEventListener('keydown',function(e){if(e.key==='Enter')pay();});
</script>
</body></html>`;
}

function buildPayPage(opts) {
  return opts.fixedAmount > 0 ? buildDynamicPage(opts) : buildStaticPage(opts);
}

module.exports = { buildPayPage };
