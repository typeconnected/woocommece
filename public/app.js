const $=s=>document.querySelector(s),money=n=>'৳'+Number(n).toLocaleString('en-IN');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const eff=p=>p.sale_price>0?p.sale_price:p.price,stars=n=>'★'.repeat(Math.round(n))+'☆'.repeat(5-Math.round(n));
const vars=p=>(p.variants||'').split(',').filter(Boolean);
let CFG={},P=[],ME=null,cart={},F={q:'',cat:''},CP=null,PAY='cod',VAR='';
try{cart=JSON.parse(localStorage.tc_cart||'{}')}catch{}
const api=async(u,o)=>{const r=await fetch(u,o);const d=await r.json();if(!r.ok)throw new Error(d.error||'Error');return d};
const post=(u,b)=>api(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
const img=p=>p.image?`<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">`:`<div class="ph">${esc(p.name[0])}</div>`;
const card=p=>`<a class="card" href="#/p/${p.id}">${p.sale_price>0?`<span class="tag">-${Math.round(100-eff(p)/p.price*100)}%</span>`:''}${p.stock<1?'<span class="tag out">Sold out</span>':''}
<div class="im">${img(p)}${p.stock>0&&!vars(p).length?`<button class="qa" onclick="event.preventDefault();add(${p.id},1)">+ Add to cart</button>`:''}</div><div class="in"><small>${esc(p.category)}</small><h3>${esc(p.name)}</h3>
${p.reviews?`<div class="star">${stars(p.rating)} <small>(${p.reviews})</small></div>`:''}
<div class="pr">${money(eff(p))}${p.sale_price>0?`<s>${money(p.price)}</s>`:''}</div></div></a>`;
const kp=k=>{const i=k.indexOf('|');return{p:P.find(x=>x.id==k.slice(0,i)),v:k.slice(i+1)}};

let SITE={banners:[],pages:[]},SL=null;
async function init(){
  [CFG,P,ME,SITE]=await Promise.all([api('/api/config'),api('/api/products'),api('/api/me'),api('/api/site')]);
  document.title=CFG.store_name+' – '+CFG.tagline;chrome();hdr();cleanCart();route();
}
function chrome(){
  $('#ann').textContent=CFG.announcement||'';$('#ann').style.display=CFG.announcement?'block':'none';$('#logo').textContent=CFG.store_name;
  const cats=[...new Set(P.map(p=>p.category))];
  $('#ft').innerHTML=`<div class="wrap fg"><div><div class="logo" style="color:#fff">${esc(CFG.store_name)}</div><p>${esc(CFG.tagline)}</p></div>
  <div><h4>Shop</h4>${cats.slice(0,5).map(c=>`<a data-c="${esc(c)}" onclick="pickCat(this.dataset.c)">${esc(c)}</a>`).join('')}</div>
  <div><h4>Help</h4>${SITE.pages.map(p=>`<a href="#/page/${esc(p.slug)}">${esc(p.title)}</a>`).join('')}<a href="#/track">Track order</a><a href="#/contact">Contact us</a></div>
  <div><h4>Contact</h4><p>📞 ${esc(CFG.phone)}<br>✉️ ${esc(CFG.email)}<br>📍 ${esc(CFG.address)}</p></div></div>
  <div class="wrap copy">© ${new Date().getFullYear()} ${esc(CFG.store_name)} · typeconnected.com</div>`;
  const wa=(CFG.whatsapp||'').replace(/\D/g,'');$('#wa').style.display=wa?'flex':'none';if(wa)$('#wa').href='https://wa.me/'+(wa.startsWith('88')?wa:'88'+wa);
}
const hdr=()=>$('#acc').textContent=ME?'👤 '+ME.name.split(' ')[0]:'Login';
addEventListener('hashchange',route);
function route(){const h=location.hash.slice(1)||'/';scrollTo(0,0);clearInterval(SL);
  if(h.startsWith('/p/')){VAR='';product(+h.slice(3))}else if(h==='/checkout')checkout();else if(h==='/track')track();else if(h==='/contact')contact();
  else if(h.startsWith('/page/'))pageView(h.slice(6));else if(h==='/account')account();else if(h.startsWith('/paid/'))done(h.slice(6),true);else if(h==='/pay-failed')done('',false);else home();}
function cleanCart(){for(const k in cart){const{p}=kp(k);if(!p||p.stock<1)delete cart[k];else cart[k]=Math.min(cart[k],p.stock)}saveCart()}

const goShop=()=>document.getElementById('all')?.scrollIntoView({behavior:'smooth'});
const onHome=()=>['','#/'].includes(location.hash);
function pickCat(c){F.cat=c;F.q='';if(onHome()){grid();goShop()}else{location.hash='/';setTimeout(goShop,120)}}
const safeLink=l=>/^(#|\/|https?:)/.test(l||'');
function hero(){const B=SITE.banners.length?SITE.banners:[{title:CFG.store_name,subtitle:CFG.tagline,btn:'Shop now'}];
  return `<section class="hero">${B.map((b,i)=>`<div class="slide g${i%3} ${i?'':'on'}" ${b.image?`style="background-image:linear-gradient(90deg,#0b1020cc,#0b102033),url('${esc(b.image)}')"`:''}>
  <div class="wrap"><h1>${esc(b.title)}</h1><p>${esc(b.subtitle)}</p>${safeLink(b.link)?`<a class="btn" href="${esc(b.link)}">${esc(b.btn||'Shop now')}</a>`:`<a class="btn" onclick="goShop()">${esc(b.btn||'Shop now')}</a>`}</div></div>`).join('')}
  ${B.length>1?`<div class="dots">${B.map((_,i)=>`<i class="${i?'':'on'}"></i>`).join('')}</div>`:''}</section>`}
function slider(){const s=document.querySelectorAll('.slide'),d=document.querySelectorAll('.dots i');if(s.length<2)return;let i=0;
  const show=n=>{i=(n+s.length)%s.length;s.forEach((e,k)=>e.classList.toggle('on',k===i));d.forEach((e,k)=>e.classList.toggle('on',k===i))};
  d.forEach((e,k)=>e.onclick=()=>show(k));SL=setInterval(()=>show(i+1),5500)}
function home(){
  const sale=P.filter(p=>p.sale_price>0&&p.stock>0).slice(0,4),cats=[...new Set(P.map(p=>p.category))],cnt=c=>P.filter(p=>p.category===c).length;
  $('#app').innerHTML=hero()+`<div class="wrap"><div class="feat"><div><b>🚚 Fast delivery</b><span>All over Bangladesh</span></div><div><b>💵 Cash on delivery</b><span>Pay when you receive</span></div>
  <div><b>🔒 Secure payment</b><span>bKash · Nagad · Cards</span></div><div><b>💬 Friendly support</b><span>We reply quickly</span></div></div>
  <div class="sec"><h2>Shop by category</h2></div><div class="cats">${cats.map((c,i)=>`<a class="cat c${i%4}" data-c="${esc(c)}" onclick="pickCat(this.dataset.c)"><b>${esc(c)}</b><span>${cnt(c)} items</span></a>`).join('')}</div>
  ${sale.length?`<div class="sec"><h2>🔥 On sale</h2></div><div class="grid">${sale.map(card).join('')}</div>`:''}
  <div class="sec" id="all"><h2>All products</h2></div><div class="chips" id="chips"></div><div class="grid" id="grid"></div>
  <div class="news"><div><h3>Get offers &amp; new arrivals</h3><p>Join our newsletter. No spam, promise.</p></div><div class="nf"><input id="nl" type="email" placeholder="Your email"><button class="btn" onclick="subscribe()">Subscribe</button></div><div id="nm"></div></div></div>`;
  grid();slider();
}
async function subscribe(){try{await post('/api/subscribe',{email:$('#nl').value});$('#nm').textContent='✅ Thanks for subscribing!';$('#nl').value=''}catch(e){$('#nm').textContent='❌ '+e.message}}
async function pageView(slug){try{const p=await api('/api/pages/'+encodeURIComponent(slug));
  $('#app').innerHTML=`<div class="wrap"><div class="box doc"><h1>${esc(p.title)}</h1>${esc(p.body).split(/\n\n+/).map(x=>`<p>${x.replace(/\n/g,'<br>')}</p>`).join('')}</div></div>`}catch{location.hash='/'}}
function contact(){$('#app').innerHTML=`<div class="wrap"><div class="cw"><div class="box"><h2 style="margin-top:0">Contact us</h2><label>Name *</label><input id="c_n" value="${esc(ME?.name)}">
  <label>Phone</label><input id="c_p" value="${esc(ME?.phone)}"><label>Email</label><input id="c_e" value="${esc(ME?.email)}"><label>Message *</label><textarea id="c_m" rows="4"></textarea>
  <button class="btn w" onclick="sendMsg()">Send message</button><div id="cm"></div></div>
  <div class="box"><h3 style="margin-top:0">Get in touch</h3><p>📞 ${esc(CFG.phone)}</p><p>✉️ ${esc(CFG.email)}</p><p>📍 ${esc(CFG.address)}</p></div></div></div>`}
async function sendMsg(){try{await post('/api/contact',{name:$('#c_n').value,phone:$('#c_p').value,email:$('#c_e').value,message:$('#c_m').value});
  $('#cm').innerHTML='<div class="msg s">Message sent! We will contact you soon.</div>';$('#c_m').value=''}catch(e){$('#cm').innerHTML=`<div class="msg e">${esc(e.message)}</div>`}}
function grid(){
  const chips=$('#chips');if(!chips)return;
  chips.innerHTML=['',...new Set(P.map(p=>p.category))].map(c=>`<span class="chip ${F.cat===c?'on':''}" data-c="${esc(c)}">${c?esc(c):'All'}</span>`).join('');
  chips.querySelectorAll('.chip').forEach(e=>e.onclick=()=>{F.cat=e.dataset.c;grid()});
  const q=F.q.toLowerCase(),list=P.filter(p=>(!F.cat||p.category===F.cat)&&(!q||(p.name+p.category+p.description).toLowerCase().includes(q)));
  $('#grid').innerHTML=list.map(card).join('')||'<p>No products found.</p>';
}
function doSearch(v){F.q=v;if(onHome()){grid();if(v.length===1)goShop()}else{location.hash='/';setTimeout(goShop,120)}}

async function product(id){
  const p=P.find(x=>x.id===id);if(!p){location.hash='/';return}
  const R=await api(`/api/products/${id}/reviews`),vs=vars(p);
  $('#app').innerHTML=`<div class="wrap"><div class="pd"><div class="im">${img(p)}</div><div>
  <small style="color:var(--mut)">${esc(p.category)}</small><h1>${esc(p.name)}</h1>
  ${p.reviews?`<div class="star">${stars(p.rating)} <small>${p.rating} (${p.reviews} reviews)</small></div>`:''}
  <div class="pr">${money(eff(p))}${p.sale_price>0?`<s>${money(p.price)}</s>`:''}</div>
  <p style="color:var(--mut);line-height:1.6">${esc(p.description)}</p>
  ${vs.length?`<label>Choose option</label><div class="chips" style="margin:6px 0 12px">${vs.map(v=>`<span class="chip ${VAR===v?'on':''}" onclick="VAR='${esc(v)}';product(${id})">${esc(v)}</span>`).join('')}</div>`:''}
  <p>${p.stock>0?`<b style="color:var(--ok)">In stock</b> (${p.stock} available)`:'<b style="color:var(--bad)">Out of stock</b>'}</p>
  ${p.stock>0?`<div class="qty"><button onclick="pq(-1)">−</button><span id="pq">1</span><button onclick="pq(1,${p.stock})">+</button></div>
  <p><button class="btn" onclick="add(${p.id},+$('#pq').textContent)">Add to cart</button>
  <button class="btn o" onclick="add(${p.id},+$('#pq').textContent,true)">Buy now</button></p>`:''}</div></div>
  <div class="box" style="margin-bottom:30px"><h3 style="margin-top:0">Reviews (${R.length})</h3>
  ${R.map(r=>`<div class="rev"><span class="star">${stars(r.rating)}</span> <b>${esc(r.name)}</b><br>${esc(r.body)}</div>`).join('')||'<p style="color:var(--mut)">No reviews yet.</p>'}
  ${ME?`<label>Your rating</label><select id="rr">${[5,4,3,2,1].map(n=>`<option value="${n}">${stars(n)}</option>`).join('')}</select>
  <textarea id="rb" rows="2" placeholder="Write your review"></textarea><button class="btn" onclick="review(${id})">Submit review</button><span id="re" style="color:var(--bad)"></span>`
  :'<p><a href="#/account" style="color:var(--brand);font-weight:700">Login</a> to write a review.</p>'}</div></div>`;
}
async function review(id){try{await post(`/api/products/${id}/reviews`,{rating:$('#rr').value,body:$('#rb').value});P=await api('/api/products');product(id)}catch(e){$('#re').textContent=' '+e.message}}
function pq(d,max=99){const e=$('#pq');e.textContent=Math.max(1,Math.min(max,+e.textContent+d))}
function add(id,q=1,go){const p=P.find(x=>x.id===id);if(vars(p).length&&!VAR){alert('Please choose an option first');return}
  const k=id+'|'+(vars(p).length?VAR:'');cart[k]=Math.min((cart[k]||0)+q,p.stock);saveCart();go?location.hash='/checkout':openCart()}
function chg(k,d){const{p}=kp(k);cart[k]=Math.min((cart[k]||0)+d,p.stock);if(cart[k]<=0)delete cart[k];saveCart();if(location.hash==='#/checkout')checkout()}
const keys=()=>Object.keys(cart),sub=()=>keys().reduce((s,k)=>s+eff(kp(k).p)*cart[k],0);
function saveCart(){localStorage.tc_cart=JSON.stringify(cart);$('#cnt').textContent=Object.values(cart).reduce((a,b)=>a+b,0);
  const h=keys().map(k=>{const{p,v}=kp(k);return `<div class="ci"><div class="im">${img(p)}</div><div style="flex:1"><b>${esc(p.name)}</b>${v?` <span class="pill">${esc(v)}</span>`:''}<br><small>${money(eff(p))}</small></div>
  <div class="qty"><button onclick="chg('${k}',-1)">−</button><span>${cart[k]}</span><button onclick="chg('${k}',1)">+</button></div></div>`}).join('');
  $('#ci').innerHTML=(h||'<p>Your cart is empty.</p>')+(h?`<div class="row t"><span>Subtotal</span><span>${money(sub())}</span></div><a class="btn w" href="#/checkout" onclick="closeCart()">Checkout</a>`:'')}
function openCart(){$('#drawer').classList.add('open');$('#ov').classList.add('on')}
function closeCart(){$('#drawer').classList.remove('open');$('#ov').classList.remove('on')}

function checkout(){
  if(!keys().length){$('#app').innerHTML='<div class="wrap"><div class="box" style="margin:40px 0">Your cart is empty. <a href="#/" style="color:var(--brand)">Continue shopping</a></div></div>';return}
  const m=ME||{};
  $('#app').innerHTML=`<div class="wrap"><div class="co"><div class="box"><h2 style="margin-top:0">Delivery details</h2>
  ${ME?'':'<div class="msg s">Have an account? <a href="#/account" style="font-weight:700">Login</a> to track orders easily.</div>'}
  <label>Full name *</label><input id="f_name" value="${esc(m.name)}"><label>Mobile number *</label><input id="f_phone" value="${esc(m.phone)}" placeholder="01XXXXXXXXX">
  <label>Email (optional)</label><input id="f_email" value="${esc(m.email)}"><label>Delivery area *</label>
  <select id="f_zone" onchange="sum()"><option value="dhaka">Inside Dhaka</option><option value="outside">Outside Dhaka</option></select>
  <label>Full address *</label><textarea id="f_addr" rows="2"></textarea><label>Order note (optional)</label><input id="f_note">
  <label>Payment method</label><div class="pay" id="pay"></div><div id="payinfo"></div><div id="err"></div></div>
  <div class="box" style="align-self:start"><h2 style="margin-top:0">Order summary</h2>${keys().map(k=>{const{p,v}=kp(k);
  return `<div class="row"><span>${esc(p.name)}${v?' ('+esc(v)+')':''} × ${cart[k]}</span><span>${money(eff(p)*cart[k])}</span></div>`}).join('')}
  <div style="display:flex;gap:8px"><input id="f_cp" placeholder="Coupon code" style="margin:6px 0"><button class="btn o" onclick="coupon()">Apply</button></div>
  <div id="sum"></div><button class="btn w" id="pb" onclick="place()" style="margin-top:12px">Place order</button></div></div></div>`;
  PAY='cod';setPay('cod');sum();
}
function setPay(m){PAY=m;const opts=[['cod','💵 Cash on delivery'],['bkash','bKash'],['nagad','Nagad'],...(CFG.online?[['online','💳 Pay online']]:[])];
  $('#pay').innerHTML=opts.map(([k,l])=>`<label class="${PAY===k?'on':''}" onclick="setPay('${k}')">${l}</label>`).join('');
  $('#payinfo').innerHTML=(m==='bkash'||m==='nagad')?`<div class="msg s"></div><label>Transaction ID *</label><input id="f_trx">`:m==='online'?'<div class="msg s">You will be redirected to a secure payment page (card, bKash, Nagad, banking).</div>':'';sum()}
function ship(){const s=sub();return +CFG.free_ship_over>0&&s>=+CFG.free_ship_over?0:+($('#f_zone')?.value==='outside'?CFG.ship_outside:CFG.ship_dhaka)}
const disc=()=>CP?CP.discount:0,total=()=>sub()-disc()+ship();
function sum(){$('#sum').innerHTML=`<div class="row"><span>Subtotal</span><span>${money(sub())}</span></div>${CP?`<div class="row"><span>Discount (${esc(CP.code)})</span><span>−${money(CP.discount)}</span></div>`:''}
  <div class="row"><span>Shipping</span><span>${ship()?money(ship()):'Free'}</span></div><div class="row t"><span>Total</span><span>${money(total())}</span></div>`;
  const i=$('#payinfo .msg');if(i&&(PAY==='bkash'||PAY==='nagad'))i.innerHTML=`Send <b>${money(total())}</b> to <b>${esc(CFG[PAY])}</b> (Send Money), then enter the Transaction ID.`}
async function coupon(){try{CP=await api(`/api/coupon?code=${encodeURIComponent($('#f_cp').value)}&subtotal=${sub()}`);$('#err').innerHTML='<div class="msg s">Coupon applied 🎉</div>'}
  catch(e){CP=null;$('#err').innerHTML=`<div class="msg e">${esc(e.message)}</div>`}sum()}
async function place(){
  const b=$('#pb');b.disabled=true;
  try{const d=await post('/api/orders',{name:$('#f_name').value,phone:$('#f_phone').value,email:$('#f_email').value,address:$('#f_addr').value,zone:$('#f_zone').value,
    note:$('#f_note').value,payment:PAY,trx:$('#f_trx')?.value,coupon:CP?.code,items:keys().map(k=>{const{p,v}=kp(k);return{id:p.id,variant:v,qty:cart[k]}})});
    cart={};CP=null;saveCart();P=await api('/api/products');
    if(d.gatewayUrl){location.href=d.gatewayUrl;return}
    $('#app').innerHTML=`<div class="wrap"><div class="box" style="margin:40px auto;max-width:520px;text-align:center"><div style="font-size:54px">🎉</div>
    <h2>Thank you for your order!</h2><p>Order number: <b style="font-size:20px">${esc(d.orderNo)}</b><br>Total: <b>${money(d.total)}</b></p>${d.warn?`<div class="msg e">${esc(d.warn)}</div>`:''}
    <p style="color:var(--mut)">${ME?'See it in <a href="#/account" style="color:var(--brand)">My account</a>.':'Save this number to <a href="#/track" style="color:var(--brand)">track your order</a>.'}</p><a class="btn" href="#/">Continue shopping</a></div></div>`;
  }catch(e){$('#err').innerHTML=`<div class="msg e">${esc(e.message)}</div>`;b.disabled=false}
}
function done(no,ok){$('#app').innerHTML=`<div class="wrap"><div class="box" style="margin:40px auto;max-width:520px;text-align:center"><div style="font-size:54px">${ok?'✅':'⚠️'}</div>
  <h2>${ok?'Payment successful!':'Payment not completed'}</h2><p>${ok?`Order <b>${esc(no)}</b> is confirmed.`:'Your order may be saved as unpaid. Contact us or place a new order.'}</p><a class="btn" href="#/">Continue shopping</a></div></div>`;
  if(ok){cart={};saveCart()}}

function track(){
  $('#app').innerHTML=`<div class="wrap"><div class="box" style="margin:40px auto;max-width:560px"><h2 style="margin-top:0">Track your order</h2>
  <label>Order number</label><input id="t_no" placeholder="TC1001"><label>Phone number</label><input id="t_ph" placeholder="01XXXXXXXXX">
  <button class="btn w" onclick="doTrack()">Track</button><div id="tr"></div></div></div>`}
const timeline=o=>{const S=['pending','confirmed','shipped','delivered'],i=S.indexOf(o.status);
  return o.status==='cancelled'?'<div class="msg e">This order was cancelled.</div>':`<div class="steps">${S.map((s,k)=>`<div class="st ${k<=i?'on':''}"><i>${k<=i?'✓':k+1}</i>${s[0].toUpperCase()+s.slice(1)}</div>`).join('')}</div>`};
async function doTrack(){
  try{const o=await api(`/api/track?order_no=${encodeURIComponent($('#t_no').value)}&phone=${encodeURIComponent($('#t_ph').value)}`);
    $('#tr').innerHTML=timeline(o)+`<p>${o.items.map(x=>esc(x.name)+' × '+x.qty).join('<br>')}</p><div class="row t"><span>Total</span><span>${money(o.total)}</span></div>`;
  }catch(e){$('#tr').innerHTML=`<div class="msg e">${esc(e.message)}</div>`}
}

let AM='login';
async function account(){
  if(ME){const O=await api('/api/my-orders');
    $('#app').innerHTML=`<div class="wrap"><div class="box" style="margin:30px 0"><h2 style="margin-top:0">Hello, ${esc(ME.name)}</h2><p style="color:var(--mut)">${esc(ME.email)}</p>
    <button class="btn g2" onclick="logout()">Logout</button></div><h3>My orders</h3>${O.map(o=>`<div class="ord"><b>${esc(o.order_no)}</b> · ${esc(o.created_at)} · <span class="pill">${esc(o.pay_status)}</span>
    ${timeline(o)}${o.items.map(x=>esc(x.name)+' × '+x.qty).join('<br>')}<div class="row t"><span>Total</span><span>${money(o.total)}</span></div></div>`).join('')||'<p>No orders yet.</p>'}</div>`;return}
  $('#app').innerHTML=`<div class="wrap"><div class="box" style="margin:40px auto;max-width:420px"><div class="tabs"><button class="btn ${AM==='login'?'':'g2'}" onclick="AM='login';account()">Login</button>
  <button class="btn ${AM==='reg'?'':'g2'}" onclick="AM='reg';account()">Register</button></div>
  ${AM==='reg'?'<label>Name</label><input id="a_name"><label>Phone</label><input id="a_phone" placeholder="01XXXXXXXXX">':''}
  <label>Email</label><input id="a_email" type="email"><label>Password ${AM==='reg'?'(6+ characters)':''}</label><input id="a_pw" type="password">
  <button class="btn w" onclick="doAuth()">${AM==='reg'?'Create account':'Login'}</button><div id="ae"></div></div></div>`}
async function doAuth(){try{ME=await post(AM==='reg'?'/api/register':'/api/login',{name:$('#a_name')?.value,phone:$('#a_phone')?.value,email:$('#a_email').value,password:$('#a_pw').value});hdr();account()}
  catch(e){$('#ae').innerHTML=`<div class="msg e">${esc(e.message)}</div>`}}
async function logout(){await post('/api/logout',{});ME=null;hdr();account()}
init();
